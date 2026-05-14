require('dotenv').config();
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const cors = require('cors');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const { getPrompts } = require('./sytemPrompt');
const menuData = require('./menuData');
const aiProvider = require('./aiProvider');
const config = require('./config');

// Generar prompt dinámico según disponibilidad actual y proveedor
function getDynamicPrompt(provider) {
    const activeMenu = menuData.map(item => {
        const options = item.options.map(opt => `${opt.label} (Ref: ${opt.sku})`).join(', ');
        const availability = item.available === false ? '(AGOTADO)' : '';
        return `- ${item.name} ${availability}: [${options}]`;
    }).join('\n');

    const { GEMINI_PROMPT, LOCAL_PROMPT } = getPrompts(activeMenu);
    return provider === 'gemini' ? GEMINI_PROMPT : LOCAL_PROMPT;
}

// --- EXPRESS & SOCKET.IO SETUP ---
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Estado global empresarial
let botEnabled = true;
let botDelay = 2000; 
const chatHistories = {}; 
const ordersHistory = [];
const activeChats = {}; 
const stats = { ordersToday: 0, messagesProcessed: 0, erpSuccess: 0, erpErrors: 0 };
let botStatus = 'starting';

// Gestor de temporizadores (Debounce)
const botTimers = {};

// Determinar si esta instancia es la "Elegida" para un chat específico
function isInstanceEligible(chatId) {
    const total = config.multiInstance.totalInstances;
    if (total <= 1) return true;
    const phoneNum = parseInt(chatId.replace(/\D/g, '').slice(-4)) || 0;
    const rank = config.multiInstance.instanceRank;
    return (phoneNum % total) === rank;
}

// API Endpoints
app.get('/api/status', (req, res) => {
    res.json({
        status: botStatus,
        botEnabled,
        botDelay,
        provider: aiProvider.provider,
        model: aiProvider.activeModel,
        stats,
        instance: config.multiInstance
    });
});

app.post('/api/settings', (req, res) => {
    const { provider, model, delay } = req.body;
    if (provider || model) aiProvider.setSettings(provider, model);
    if (delay !== undefined) botDelay = parseInt(delay);
    io.emit('settings-updated', { provider, model, delay: botDelay });
    res.json({ success: true });
});

app.get('/api/menu', (req, res) => res.json(menuData));

app.post('/api/inventory', (req, res) => {
    const { sku, available } = req.body;
    const item = menuData.find(i => i.options?.some(o => o.sku === sku) || i.name === sku);
    if (item) {
        item.available = available;
        try {
            const filePath = path.join(__dirname, 'menuData.js');
            const fileContent = `const menuData = ${JSON.stringify(menuData, null, 4)};\n\nmodule.exports = menuData;`;
            fs.writeFileSync(filePath, fileContent, 'utf8');
            res.json({ success: true, item });
        } catch (err) { res.status(500).json({ error: 'No se pudo guardar' }); }
    } else { res.status(404).json({ error: 'No encontrado' }); }
});

app.post('/api/control', async (req, res) => {
    const { action, chatId, value } = req.body;
    if (action === 'toggle-chat' && chatId && activeChats[chatId]) {
        activeChats[chatId].botPaused = value;
        if (value && botTimers[chatId]) {
            clearTimeout(botTimers[chatId]);
            delete botTimers[chatId];
            io.emit('timer-update', { chatId, active: false });
        }
        io.emit('chat-update', activeChats[chatId]);
    }
    if (action === 'cancel-timer' && chatId) {
        if (botTimers[chatId]) {
            clearTimeout(botTimers[chatId]);
            delete botTimers[chatId];
            io.emit('timer-update', { chatId, active: false });
        }
    }
    if (action === 'force-response' && chatId) {
        if (botTimers[chatId]) {
            clearTimeout(botTimers[chatId]);
            delete botTimers[chatId];
        }
        processBotResponse(chatId);
    }
    res.json({ success: true });
});

app.post('/api/send-message', async (req, res) => {
    const { chatId, message } = req.body;
    try {
        await client.sendMessage(chatId, message);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/chats', (req, res) => res.json(Object.values(activeChats).sort((a, b) => b.timestamp - a.timestamp)));
app.get('/api/orders', (req, res) => res.json(ordersHistory));
app.get('/api/models', async (req, res) => {
    let ollamaModels = [];
    try {
        const url = new URL(config.ai.ollama.url);
        const tagsRes = await axios.get(`${url.origin}/api/tags`, { timeout: 1500 });
        if (tagsRes.data && tagsRes.data.models) ollamaModels = tagsRes.data.models.map(m => ({ name: m.name, provider: 'ollama' }));
    } catch (e) { }
    const geminiModels = config.ai.gemini.models.map(m => ({ name: m, provider: 'gemini' }));
    res.json([...ollamaModels, ...geminiModels]);
});

// --- WHATSAPP BOT LOGIC ---
const client = new Client({
    authStrategy: new LocalAuth({ dataPath: config.whatsapp.sessionPath }),
    puppeteer: {
        headless: config.whatsapp.headless,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        executablePath: config.whatsapp.chromePath
    }
});

client.on('qr', (qr) => { botStatus = 'qr_required'; io.emit('qr', qr); });
client.on('ready', () => { botStatus = 'ready'; io.emit('status', 'ready'); });

client.on('message_create', async (message) => {
    if (message.from.includes('@g.us') || message.from === 'status@broadcast') return;
    const chatId = message.fromMe ? message.to : message.from;
    
    // Inicialización INMEDIATA del registro de chat para evitar perder el primer mensaje
    if (!activeChats[chatId]) {
        activeChats[chatId] = { 
            id: chatId, 
            phone: normalizePhone(chatId), 
            status: 'active', 
            timestamp: Date.now(), 
            botPaused: false,
            messages: [],
            labels: []
        };
    }
    activeChats[chatId].lastMessage = message.body;
    activeChats[chatId].timestamp = Date.now();

    // Guardar en pequeña caché local para persistencia al refrescar
    const msgObj = { body: message.body, fromMe: message.fromMe, timestamp: message.timestamp };
    activeChats[chatId].messages.push(msgObj);
    if (activeChats[chatId].messages.length > 5) activeChats[chatId].messages.shift();

    // Notificar UI de inmediato
    io.emit('chat-update', activeChats[chatId]);
    io.emit('new-message', { chatId, ...msgObj });

    if (message.fromMe) return;

    // Obtener etiquetas (Labels) en segundo plano para no bloquear
    message.getChat().then(chat => {
        chat.getLabels().then(rawLabels => {
            const labels = rawLabels.map(l => ({ name: l.name, hexColor: l.hexColor }));
            activeChats[chatId].labels = labels;
            io.emit('chat-update', activeChats[chatId]);
        }).catch(() => {});
    }).catch(() => {});

    if (!chatHistories[chatId]) chatHistories[chatId] = [];
    chatHistories[chatId].push({ role: "user", parts: [{ text: message.body }] });

    if (!botEnabled || activeChats[chatId].botPaused) return;

    // Multi-Instancia: Solo responde el bot idóneo
    if (!isInstanceEligible(chatId)) return;

    if (botTimers[chatId]) clearTimeout(botTimers[chatId]);
    io.emit('timer-update', { chatId, active: true, duration: botDelay, expiresAt: Date.now() + botDelay });
    botTimers[chatId] = setTimeout(() => processBotResponse(chatId), botDelay);
});

async function processBotResponse(chatId) {
    try {
        delete botTimers[chatId];
        io.emit('timer-update', { chatId, active: false });

        const chat = await client.getChatById(chatId);
        await chat.sendStateTyping();

        const prompt = getDynamicPrompt(aiProvider.provider);
        const aiResponse = await aiProvider.sendMessage(chatHistories[chatId], prompt);

        const orderMatchGemini = aiResponse.match(/<ORDER_JSON>([\s\S]*?)<\/ORDER_JSON>/);
        const orderMatchLocal = aiResponse.match(/###DATA###([\s\S]*?)###DATA###/);
        const orderDataRaw = orderMatchGemini ? orderMatchGemini[1] : (orderMatchLocal ? orderMatchLocal[1] : null);

        let replyText = aiResponse;
        if (orderDataRaw) {
            try {
                const rawOrderData = JSON.parse(orderDataRaw.trim());
                const orderData = buildErpPayload(rawOrderData, { from: chatId });
                const orderSummary = { id: orderData.eventId, customer: orderData.customer.name, items: orderData.items, timestamp: new Date().toISOString(), status: 'pending' };
                ordersHistory.push(orderSummary);
                io.emit('new-order', orderSummary);
                const erpSuccess = await triggerWebhook(orderData);
                if (erpSuccess) { orderSummary.status = 'synced'; stats.erpSuccess++; } 
                else { orderSummary.status = 'failed'; stats.erpErrors++; io.emit('erp-error', { chatId, orderId: orderData.eventId, message: 'Fallo al conectar con el ERP' }); }
                stats.ordersToday++;
                io.emit('stats-update', stats);
                activeChats[chatId].status = 'confirmed';
                io.emit('chat-update', activeChats[chatId]);
                io.emit('order-update', orderSummary);
            } catch (e) { }
        }

        replyText = replyText.replace(/<ORDER_JSON>[\s\S]*?<\/ORDER_JSON>/gi, '')
                             .replace(/###DATA###[\s\S]*?###DATA###/gi, '')
                             .replace(/```[\s\S]*?```/g, '')
                             .replace(/\{[\s\S]*?\}/g, '').trim();

        const finalMsg = replyText || "¡Perfecto! Tu pedido ha sido enviado a cocina. 🍔";
        chatHistories[chatId].push({ role: "model", parts: [{ text: aiResponse }] });
        await client.sendMessage(chatId, finalMsg);
    } catch (e) { console.error('AI Error:', e); }
}

function normalizePhone(id) { return id.replace('@c.us', ''); }

function buildErpPayload(raw, message) {
    return {
        eventId: `BJ-${Date.now()}`,
        customer: { name: 'Cliente WA', phone: normalizePhone(message.from) },
        items: raw.items || [],
        paymentMethod: raw.paymentMethod || 'Por definir',
        source: 'bot-whatsapp',
        timestamp: new Date().toISOString()
    };
}

async function triggerWebhook(data) {
    if (!config.erp.webhookUrl) return false;
    try { await axios.post(config.erp.webhookUrl, data, { timeout: config.erp.timeout }); return true; } 
    catch (e) { return false; }
}

client.initialize();
server.listen(3000, () => console.log('🚀 Server running on http://localhost:3000'));