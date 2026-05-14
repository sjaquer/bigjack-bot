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

const CONFIG_PATH = path.join(__dirname, 'bot-settings.json');

// --- SISTEMA DE PERSISTENCIA MAESTRO ---
let botSettings = { botDelay: 2000, botEnabled: true, provider: config.ai.provider || 'gemini', model: '', showLogs: false };

// --- LOGGER GLOBAL ---
function appLog(message, type = 'info') {
    const logObj = { timestamp: Date.now(), message, type };
    console.log(`[${type.toUpperCase()}] ${message}`);
    io.emit('app-log', logObj);
}

if (fs.existsSync(CONFIG_PATH)) {
    try { 
        const saved = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); 
        botSettings = { ...botSettings, ...saved };
        aiProvider.setSettings(botSettings.provider, botSettings.model);
    } catch (e) { }
}

function saveSettings() { fs.writeFileSync(CONFIG_PATH, JSON.stringify(botSettings, null, 2)); }

// Generar prompt dinámico en formato TOON (Token-Oriented Object Notation)
function getDynamicPrompt(provider) {
    const header = "id,sku,cat,name,desc,pop,avail,opts(id:label:price)";
    const activeMenu = menuData.map(i => {
        const opts = i.options.map(o => `${o.id}:${o.label}:S/ ${o.price}`).join('|');
        return `${i.id},${i.sku},${i.category},${i.name},${i.description},${i.popular},${i.available!==false},${opts}`;
    }).join('\n');
    
    const toonMenu = `${header}\n${activeMenu}`;
    const { GEMINI_PROMPT, LOCAL_PROMPT } = getPrompts(toonMenu);
    return provider === 'gemini' ? GEMINI_PROMPT : LOCAL_PROMPT;
}

// --- EXPRESS & SOCKET.IO ---
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const chatHistories = {}; 
const ordersHistory = [];
const activeChats = {}; 
const stats = { ordersToday: 0, messagesProcessed: 0, erpSuccess: 0, erpErrors: 0 };
let botStatus = 'starting';

const botTimers = {};
function isInstanceEligible(chatId) {
    const total = config.multiInstance.totalInstances;
    if (total <= 1) return true;
    const phoneNum = parseInt(chatId.replace(/\D/g, '').slice(-4)) || 0;
    return (phoneNum % total) === config.multiInstance.instanceRank;
}

// API Endpoints
app.get('/api/status', (req, res) => res.json({ status: botStatus, botEnabled: botSettings.botEnabled, botDelay: botSettings.botDelay, provider: botSettings.provider, model: botSettings.model || aiProvider.activeModel, showLogs: botSettings.showLogs, stats, instance: config.multiInstance }));

app.post('/api/settings', (req, res) => {
    const { provider, model, delay, enabled, showLogs } = req.body;
    if (provider) botSettings.provider = provider;
    if (model) botSettings.model = model;
    if (delay !== undefined) botSettings.botDelay = parseInt(delay);
    if (enabled !== undefined) botSettings.botEnabled = enabled;
    if (showLogs !== undefined) botSettings.showLogs = showLogs;
    aiProvider.setSettings(botSettings.provider, botSettings.model);
    saveSettings();
    io.emit('settings-updated', botSettings);
    appLog(`Ajustes actualizados: ${JSON.stringify(req.body)}`);
    res.json({ success: true });
});

app.get('/api/menu', (req, res) => res.json(menuData));
app.post('/api/inventory', (req, res) => {
    const { sku, available } = req.body;
    const item = menuData.find(i => i.options?.some(o => o.sku === sku) || i.name === sku);
    if (item) {
        item.available = available;
        appLog(`Inventario actualizado: ${sku} -> ${available ? 'Disponible' : 'Agotado'}`, 'inventory');
        
        // Re-generar contenido TOON para persistencia
        const lines = menuData.map(i => {
            const opts = i.options.map(o => `${o.id}:${o.label}:${o.price}:${o.sku}`).join('|');
            return `${i.id},${i.sku},${i.category},${i.name},${i.description},${i.popular},${i.available!==false},${opts}`;
        }).join('\n');
        
        const fileContent = `/**\n * TOON (Token-Oriented Object Notation) - Optimized for AI Context\n * FIELDS: id, sku, category, name, description, popular, available, options\n * OPTIONS: id:label:price:sku (separated by |)\n */\n\nconst toonData = \`\n${lines}\n\`.trim();\n\nfunction parseTOON(data) {\n    return data.split('\\n').map(line => {\n        const [id, sku, category, name, description, popular, available, optionsStr] = line.split(',');\n        const options = optionsStr.split('|').map(opt => {\n            const [optId, label, price, optSku] = opt.split(':');\n            return { id: optId, sku: optSku || sku, label, price: parseFloat(price) };\n        });\n        return {\n            id: parseInt(id),\n            sku,\n            category,\n            name,\n            description,\n            popular: popular === 'true',\n            available: available !== 'false',\n            options\n        };\n    });\n}\n\nmodule.exports = parseTOON(toonData);\n`;
        
        fs.writeFileSync(path.join(__dirname, 'menuData.js'), fileContent, 'utf8');
        res.json({ success: true, item });
    } else res.status(404).json({ error: 'No encontrado' });
});

app.post('/api/control', async (req, res) => {
    const { action, chatId, value } = req.body;
    if (action === 'toggle-chat' && chatId && activeChats[chatId]) {
        activeChats[chatId].botPaused = value;
        if (value && botTimers[chatId]) { clearTimeout(botTimers[chatId]); delete botTimers[chatId]; io.emit('timer-update', { chatId, active: false }); }
        io.emit('chat-update', activeChats[chatId]);
    }
    
    // CORRECCIÓN: Lógica de Reinicio y Cancelado
    if (action === 'cancel-timer' && chatId) {
        if (botTimers[chatId]) { clearTimeout(botTimers[chatId]); delete botTimers[chatId]; }
        io.emit('timer-update', { chatId, active: false });
    }
    if (action === 'restart-timer' && chatId) {
        if (botTimers[chatId]) clearTimeout(botTimers[chatId]);
        const delay = botSettings.botDelay;
        io.emit('timer-update', { chatId, active: true, duration: delay, expiresAt: Date.now() + delay });
        botTimers[chatId] = setTimeout(() => processBotResponse(chatId), delay);
    }
    if (action === 'force-response' && chatId) {
        if (botTimers[chatId]) { clearTimeout(botTimers[chatId]); delete botTimers[chatId]; }
        processBotResponse(chatId);
    }
    res.json({ success: true });
});

app.post('/api/send-message', async (req, res) => {
    try { await client.sendMessage(req.body.chatId, req.body.message); res.json({ success: true }); } 
    catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/chats', (req, res) => res.json(Object.values(activeChats).sort((a, b) => b.timestamp - a.timestamp)));
app.get('/api/orders', (req, res) => res.json(ordersHistory));
app.get('/api/models', async (req, res) => {
    let ollamaModels = [];
    try {
        const url = new URL(config.ai.ollama.url);
        const tagsRes = await axios.get(`${url.origin}/api/tags`, { timeout: 1500 });
        if (tagsRes.data?.models) ollamaModels = tagsRes.data.models.map(m => ({ name: m.name, provider: 'ollama' }));
    } catch (e) { }
    const geminiModels = config.ai.gemini.models.map(m => ({ name: m, provider: 'gemini' }));
    res.json([...ollamaModels, ...geminiModels]);
});

// --- WHATSAPP BOT ---
const client = new Client({
    authStrategy: new LocalAuth({ dataPath: config.whatsapp.sessionPath }),
    puppeteer: { headless: config.whatsapp.headless, args: ['--no-sandbox'], executablePath: config.whatsapp.chromePath }
});

client.on('qr', (qr) => { botStatus = 'qr_required'; io.emit('qr', qr); });
client.on('ready', () => { botStatus = 'ready'; io.emit('status', 'ready'); });

client.on('message_create', async (message) => {
    if (message.from.includes('@g.us') || message.from === 'status@broadcast') return;
    const chatId = message.fromMe ? message.to : message.from;
    if (!activeChats[chatId]) {
        activeChats[chatId] = { id: chatId, phone: normalizePhone(chatId), status: 'active', timestamp: Date.now(), botPaused: false, messages: [], labels: [] };
    }
    appLog(`Mensaje recibido de ${normalizePhone(chatId)}: ${message.body}`, 'message');
    activeChats[chatId].lastMessage = message.body;
    activeChats[chatId].timestamp = Date.now();
    const msgObj = { body: message.body, fromMe: message.fromMe, timestamp: message.timestamp };
    activeChats[chatId].messages.push(msgObj);
    if (activeChats[chatId].messages.length > 5) activeChats[chatId].messages.shift();
    io.emit('chat-update', activeChats[chatId]);
    io.emit('new-message', { chatId, ...msgObj });

    if (message.fromMe) return;

    message.getChat().then(chat => {
        chat.getLabels().then(rawLabels => {
            activeChats[chatId].labels = rawLabels.map(l => ({ name: l.name, hexColor: l.hexColor }));
            io.emit('chat-update', activeChats[chatId]);
        }).catch(() => {});
    }).catch(() => {});

    if (!chatHistories[chatId]) chatHistories[chatId] = [];
    chatHistories[chatId].push({ role: "user", parts: [{ text: message.body }] });

    if (!botSettings.botEnabled || activeChats[chatId].botPaused) return;
    if (!isInstanceEligible(chatId)) return;

    if (botTimers[chatId]) clearTimeout(botTimers[chatId]);
    const delay = botSettings.botDelay;
    io.emit('timer-update', { chatId, active: true, duration: delay, expiresAt: Date.now() + delay });
    botTimers[chatId] = setTimeout(() => processBotResponse(chatId), delay);
});

async function processBotResponse(chatId) {
    try {
        delete botTimers[chatId];
        io.emit('timer-update', { chatId, active: false });
        io.emit('bot-typing', { chatId, active: true });
        const chat = await client.getChatById(chatId);
        await chat.sendStateTyping();
        const aiResponse = await aiProvider.sendMessage(chatHistories[chatId], getDynamicPrompt(botSettings.provider));
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
                appLog(`Nuevo pedido detectado: ${orderSummary.id}`, 'order');
                if (await triggerWebhook(orderData)) { orderSummary.status = 'synced'; stats.erpSuccess++; appLog(`Pedido ${orderSummary.id} sincronizado con ERP`, 'success'); } 
                else { orderSummary.status = 'failed'; stats.erpErrors++; io.emit('erp-error', { chatId, orderId: orderData.eventId, message: 'Fallo al conectar con el ERP' }); appLog(`Error al sincronizar ${orderSummary.id} con ERP`, 'error'); }
                stats.ordersToday++;
                io.emit('stats-update', stats);
                activeChats[chatId].status = 'confirmed';
                io.emit('chat-update', activeChats[chatId]);
                io.emit('order-update', orderSummary);
            } catch (e) { }
        }
        
        // --- LIMPIEZA AGRESIVA Y CORRECCIÓN DE FORMATO WHATSAPP ---
        replyText = replyText.replace(/<ORDER_JSON>[\s\S]*?<\/ORDER_JSON>/gi, '')
                             .replace(/###DATA###[\s\S]*?###DATA###/gi, '')
                             .replace(/```[\s\S]*?```/g, '')
                             .replace(/\{[\s\S]*?\}/g, '')
                             .replace(/\*\*/g, '*') // Convertir doble asterisco a simple (WhatsApp style)
                             .trim();

        const finalMsg = replyText || "¡Perfecto! Tu pedido ha sido enviado a cocina. 🍔";
        chatHistories[chatId].push({ role: "model", parts: [{ text: aiResponse }] });
        await client.sendMessage(chatId, finalMsg);
        appLog(`Respuesta enviada a ${normalizePhone(chatId)}`, 'bot');
    } catch (e) { 
        console.error('AI Error:', e); 
        appLog(`Error de IA: ${e.message}`, 'error');
    }
    finally { io.emit('bot-typing', { chatId, active: false }); }
}

function normalizePhone(id) { return id.replace('@c.us', ''); }
function buildErpPayload(raw, message) { return { eventId: `BJ-${Date.now()}`, customer: { name: 'Cliente WA', phone: normalizePhone(message.from) }, items: raw.items || [], paymentMethod: raw.paymentMethod || 'Por definir', source: 'bot-whatsapp', timestamp: new Date().toISOString() }; }
async function triggerWebhook(data) { if (!config.erp.webhookUrl) return false; try { await axios.post(config.erp.webhookUrl, data, { timeout: config.erp.timeout }); return true; } catch (e) { return false; } }

client.initialize();
server.listen(3000, () => console.log('🚀 Server running on http://localhost:3000'));