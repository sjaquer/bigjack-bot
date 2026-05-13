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
const { systemInstruction: baseInstruction } = require('./sytemPrompt');
const menuData = require('./menuData');
const aiProvider = require('./aiProvider');
const config = require('./config');

// Generar prompt dinámico según disponibilidad actual
function getDynamicPrompt() {
    const activeMenu = menuData.map(item => {
        const options = item.options.map(opt => `${opt.label} (Ref: ${opt.sku})`).join(', ');
        const availability = item.available === false ? '(AGOTADO)' : '';
        return `- ${item.name} ${availability}: [${options}]`;
    }).join('\n');

    return baseInstruction.replace('${menuList}', activeMenu);
}

// --- EXPRESS & SOCKET.IO SETUP ---
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;
let erpErrorLogPath, sessionDataDir;

try {
    const { app: electronApp } = require('electron');
    // Si estamos en Electron, usar la carpeta de datos de usuario nativa
    erpErrorLogPath = path.join(electronApp.getPath('userData'), 'erp-errors.log');
    sessionDataDir = path.join(electronApp.getPath('userData'), '.wwebjs_auth');
} catch (e) {
    // Fallback para ejecución fuera de Electron (terminal)
    erpErrorLogPath = path.join(__dirname, 'erp-errors.log');
    sessionDataDir = config.whatsapp.sessionPath || path.join(__dirname, '.wwebjs_auth');
}

// Estado global empresarial
let botEnabled = true;
const chatHistories = {}; 
const ordersHistory = [];
const activeChats = {}; // { chatId: { phone, lastMessage, status, timestamp, botPaused } }
const stats = { ordersToday: 0, messagesProcessed: 0, erpSuccess: 0 };
let botStatus = 'starting';

// API Endpoints
app.get('/api/status', (req, res) => {
    res.json({
        status: botStatus,
        botEnabled,
        provider: aiProvider.provider,
        model: aiProvider.activeModel,
        stats
    });
});

app.get('/api/menu', (req, res) => {
    res.json(menuData);
});

app.post('/api/inventory', (req, res) => {
    const { sku, available } = req.body;
    
    // 1. Actualizar en memoria
    const item = menuData.find(i => i.options.some(o => o.sku === sku) || i.name === sku);
    if (item) {
        item.available = available;
        
        // 2. Persistir en el archivo menuData.js para que no se pierda al reiniciar
        try {
            const filePath = path.join(__dirname, 'menuData.js');
            const fileContent = `const menuData = ${JSON.stringify(menuData, null, 4)};\n\nmodule.exports = menuData;`;
            fs.writeFileSync(filePath, fileContent, 'utf8');
            res.json({ success: true, item });
        } catch (err) {
            console.error('Error guardando inventario:', err);
            res.status(500).json({ error: 'No se pudo guardar en disco' });
        }
    } else {
        res.status(404).json({ error: 'Producto no encontrado' });
    }
});

app.post('/api/control', (req, res) => {
    const { action, chatId, value } = req.body;
    if (action === 'toggle-global') {
        botEnabled = value;
        io.emit('status-update', { botEnabled });
    } else if (action === 'toggle-chat' && chatId) {
        if (activeChats[chatId]) {
            activeChats[chatId].botPaused = value;
            io.emit('chat-update', activeChats[chatId]);
        }
    }
    res.json({ success: true });
});

// Enviar mensaje manual (Human Chat)
app.post('/api/send-message', async (req, res) => {
    const { chatId, message } = req.body;
    try {
        await client.sendMessage(chatId, message);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/labels', async (req, res) => {
    try {
        const labels = await client.getLabels();
        res.json(labels);
    } catch (e) {
        res.json([]); // Fallback si no es cuenta Business
    }
});

app.post('/api/logout', async (req, res) => {
    try {
        await client.logout();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});


app.get('/api/chats', (req, res) => {
    res.json(Object.values(activeChats).sort((a, b) => b.timestamp - a.timestamp));
});


app.get('/api/models', async (req, res) => {
    let ollamaModels = [];
    try {
        const url = new URL(config.ai.ollama.url);
        const tagsRes = await axios.get(`${url.origin}/api/tags`);
        ollamaModels = tagsRes.data.models.map(m => ({ name: m.name, provider: 'ollama' }));
    } catch (e) {
        console.warn('⚠️ No se pudo obtener modelos de Ollama');
    }

    const geminiModels = config.ai.gemini.models.map(m => ({ name: m, provider: 'gemini' }));
    res.json([...ollamaModels, ...geminiModels]);
});

app.post('/api/settings', (req, res) => {
    const { provider, model } = req.body;
    if (provider || model) {
        aiProvider.setSettings(provider, model);
        io.emit('settings-updated', { provider, model });
        res.json({ success: true, provider, model });
    } else {
        res.status(400).json({ error: 'Faltan parámetros' });
    }
});


// --- WHATSAPP CLIENT SETUP ---
const client = new Client({
    authStrategy: new LocalAuth({ dataPath: sessionDataDir }),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        executablePath: config.whatsapp.chromePath || undefined,
        headless: config.whatsapp.headless
    }
});

client.on('qr', (qr) => {
    botStatus = 'qr_required';
    io.emit('qr', qr);
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    botStatus = 'ready';
    io.emit('status', 'ready');
});

client.on('message', async (message) => {
    if (message.from.includes('@g.us') || message.from === 'status@broadcast') return;

    const chatId = message.from;
    const isPaused = activeChats[chatId]?.botPaused;
    
    // Stats
    stats.messagesProcessed++;
    io.emit('stats-update', stats);

    // Contenido resumido según el tipo
    let preview = message.body;
    if (message.type === 'location') preview = "📍 Ubicación compartida";
    if (message.type === 'vcard') preview = "👤 Contacto compartido";
    if (message.type === 'order') preview = "🛒 Nuevo pedido de catálogo";

    // Update active chats
    activeChats[chatId] = {
        id: chatId,
        phone: normalizePhone(chatId),
        lastMessage: preview.substring(0, 50),
        status: activeChats[chatId]?.status || 'pending',
        botPaused: isPaused || false,
        timestamp: Date.now()
    };

    // Emit message to Chat UI
    io.emit('new-message', {
        chatId,
        body: message.body,
        fromMe: false,
        type: message.type,
        timestamp: message.timestamp,
        location: message.location || null
    });
    
    io.emit('chat-update', activeChats[chatId]);

    // LÓGICA ESPECIAL PARA PEDIDOS NATIVOS (Carrito de WhatsApp)
    if (message.type === 'order') {
        try {
            const order = await message.getOrder();
            const orderData = {
                eventId: `WACART-${Date.now()}`,
                customer: { name: (await message.getContact()).pushname || 'Cliente WA', phone: normalizePhone(chatId) },
                items: order.products.map(p => ({ sku: p.id, quantity: p.quantity, price: p.price })),
                paymentMethod: 'Por definir (Carrito WA)',
                source: 'wa-native-cart',
                timestamp: new Date().toISOString()
            };
            await triggerWebhook(orderData);
            activeChats[chatId].status = 'confirmed';
            io.emit('chat-update', activeChats[chatId]);
            io.emit('new-order', orderData);
            return; // No procesar con IA si es carrito nativo (ya es un pedido)
        } catch (e) { console.error('Error procesando carrito WA:', e); }
    }

    if (!botEnabled || isPaused) return;

    if (!chatHistories[chatId]) chatHistories[chatId] = [];

    try {
        const chat = await message.getChat();
        await chat.sendStateTyping();

        const prompt = getDynamicPrompt();
        const aiResponse = await aiProvider.sendMessage(chatHistories[chatId], message.body, prompt);

        chatHistories[chatId].push({ role: "user", parts: [{ text: message.body }] });

        // Procesar JSON y limpiar respuesta para el cliente
        const orderMatch = aiResponse.match(/<ORDER_JSON>([\s\S]*?)<\/ORDER_JSON>/);
        let replyText = aiResponse;

        if (orderMatch) {
            try {
                const rawOrderData = JSON.parse(orderMatch[1].trim());
                const orderData = buildErpPayload(rawOrderData, message);
                await triggerWebhook(orderData);
                
                stats.ordersToday++;
                stats.erpSuccess++;
                io.emit('stats-update', stats);

                const orderSummary = {
                    id: orderData.eventId,
                    customer: orderData.customer.name,
                    items: orderData.items,
                    total: orderData.items.length,
                    timestamp: new Date().toISOString()
                };
                ordersHistory.push(orderSummary);
                io.emit('new-order', orderSummary);

                activeChats[chatId].status = 'confirmed';
                io.emit('chat-update', activeChats[chatId]);
            } catch (jsonErr) {
                console.error('❌ Error al procesar JSON de la IA:', jsonErr.message);
            }
        }

        // --- LIMPIEZA AGRESIVA ---
        replyText = replyText.replace(/<ORDER_JSON>[\s\S]*?<\/ORDER_JSON>/gi, '').trim();
        replyText = replyText.replace(/\{[\s\S]*?\}/g, '').trim();
        replyText = replyText.replace(/<\/?[^>]+(>|$)/g, "").trim();

        if (!replyText && orderMatch) {
            replyText = "¡Perfecto! Tu pedido ha sido enviado a cocina. 🍔";
        }

        chatHistories[chatId].push({ role: "model", parts: [{ text: aiResponse }] });
        if (chatHistories[chatId].length > 20) chatHistories[chatId] = chatHistories[chatId].slice(-20);

        const finalMsg = replyText || "Entendido.";

        // Emitir respuesta del bot al Dashboard
        io.emit('new-message', {
            chatId,
            body: finalMsg,
            fromMe: true,
            timestamp: Math.floor(Date.now() / 1000)
        });

        await client.sendMessage(chatId, finalMsg);

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
});


async function triggerWebhook(orderData) {
    try {
        const response = await axios.post(config.erp.webhookUrl, orderData, {
            headers: {
                'Content-Type': 'application/json',
                'x-webhook-secret': config.erp.webhookSecret
            },
            validateStatus: () => true,
            timeout: config.erp.timeout
        });

        if (response.status !== 200) {
            appendErpErrorLog({ type: 'ERP_ERROR', status: response.status, order: orderData });
        }
    } catch (error) {
        appendErpErrorLog({ type: 'NETWORK_ERROR', details: error.message, order: orderData });
    }
}

function appendErpErrorLog(entry) {
    const line = JSON.stringify({ timestamp: new Date().toISOString(), ...entry });
    try { fs.appendFileSync(erpErrorLogPath, `${line}\n`, 'utf8'); } catch (e) {}
}

function normalizePhone(phone) {
    return phone ? phone.replace(/(@c\.us|@lid)$/i, '').trim() : '';
}

function buildErpPayload(rawOrderData, message) {
    const customerPhone = rawOrderData.customer?.phone || normalizePhone(message.from);
    const customerName = rawOrderData.customer?.name || 'Cliente WhatsApp';

    const items = (rawOrderData.items || [])
        .filter(i => i.sku)
        .map(i => ({
            sku: String(i.sku).trim(),
            quantity: parseInt(i.quantity) || 1,
            notes: i.notes || ''
        }));

    return {
        eventId: rawOrderData.eventId || `bot-${Date.now()}`,
        orderDate: new Date().toISOString(),
        source: 'bot-whatsapp',
        customer: { name: customerName, phone: customerPhone },
        paymentMethod: rawOrderData.paymentMethod || 'No especificado',
        notes: rawOrderData.notes || '',
        items
    };
}

function clearSessionLockFiles() {
    const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'DevToolsActivePort'];
    lockFiles.forEach(name => {
        const p = path.join(sessionDataDir, name);
        if (fs.existsSync(p)) try { fs.unlinkSync(p); } catch (e) {}
    });
}

function initializeClientWithRetry(maxRetries = 5, attempt = 1) {
    client.initialize().catch((error) => {
        console.error(`❌ Fallo init (intento ${attempt}):`, error.message);
        if (attempt < maxRetries) {
            clearSessionLockFiles();
            setTimeout(() => initializeClientWithRetry(maxRetries, attempt + 1), 3000 * attempt);
        }
    });
}

// Iniciar servidor y bot
server.listen(PORT, () => {
    console.log(`🌐 Dashboard disponible en http://localhost:${PORT}`);
    initializeClientWithRetry();
});

