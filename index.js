require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const { systemInstruction } = require('./sytemPrompt');
const aiProvider = require('./aiProvider');
const config = require('./config');

const erpErrorLogPath = path.join(__dirname, 'erp-errors.log');
const sessionDataDir = config.whatsapp.sessionPath;

// Mantener historial básico en memoria
const chatHistories = {}; 

// Inicializar cliente de WhatsApp
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: sessionDataDir
    }),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        executablePath: config.whatsapp.chromePath || undefined,
        headless: config.whatsapp.headless
    }
});

client.on('qr', (qr) => {
    console.log('📱 Escanea este QR con tu WhatsApp para iniciar sesión:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('✅ ¡Bot de Big Jack conectado y listo!');
    console.log(`🤖 Proveedor de IA activo: ${config.ai.provider}`);
});

client.on('message', async (message) => {
    if (message.from.includes('@g.us') || message.from === 'status@broadcast') return;

    const chatId = message.from;
    console.log(`📩 [${new Date().toLocaleTimeString()}] Mensaje de ${chatId}: ${message.body}`);

    if (!chatHistories[chatId]) {
        chatHistories[chatId] = [];
    }

    try {
        const chat = await message.getChat();
        await chat.sendStateTyping();

        const aiResponse = await aiProvider.sendMessage(chatHistories[chatId], message.body, systemInstruction);

        chatHistories[chatId].push({ role: "user", parts: [{ text: message.body }] });

        const orderMatch = aiResponse.match(/<ORDER_JSON>([\s\S]*?)<\/ORDER_JSON>/);
        let replyText = aiResponse;

        if (orderMatch) {
            replyText = aiResponse.replace(/<ORDER_JSON>[\s\S]*?<\/ORDER_JSON>/, '').trim();
            
            try {
                const rawOrderData = JSON.parse(orderMatch[1]);
                const orderData = buildErpPayload(rawOrderData, message);

                console.log('🛒 ¡Pedido detectado! Enviando al ERP...');
                await triggerWebhook(orderData);
            } catch (jsonErr) {
                console.error('❌ Error parseando JSON de la orden:', jsonErr.message);
            }
        }

        chatHistories[chatId].push({ role: "model", parts: [{ text: aiResponse }] });

        if (chatHistories[chatId].length > 20) {
            chatHistories[chatId] = chatHistories[chatId].slice(-20);
        }

        await client.sendMessage(chatId, replyText || "¡Entendido! ¿En qué más puedo ayudarte?");

    } catch (error) {
        console.error('❌ Error procesando el mensaje:', error.message);
        await client.sendMessage(chatId, "Ups, tuve un pequeño problema técnico 🍔🔥. ¿Podrías repetirme eso?");
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

        if (response.status === 200) {
            console.log('✅ ERP respondió con éxito');
            return;
        }

        console.error(`❌ ERP Error (${response.status}):`, response.data);
        appendErpErrorLog({
            type: 'ERP_RESPONSE_ERROR',
            status: response.status,
            details: response.data,
            order: orderData
        });

    } catch (error) {
        console.error('❌ Error en el Webhook:', error.message);
        appendErpErrorLog({
            type: 'NETWORK_ERROR',
            details: error.message,
            order: orderData
        });
    }
}

function appendErpErrorLog(entry) {
    const line = JSON.stringify({ timestamp: new Date().toISOString(), ...entry });
    try {
        fs.appendFileSync(erpErrorLogPath, `${line}\n`, 'utf8');
    } catch (e) {
        console.error('No se pudo escribir en el log:', e.message);
    }
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

    if (!items.length) throw new Error('Pedido sin items válidos');

    return {
        eventId: rawOrderData.eventId || message.id?._serialized || `bot-${Date.now()}`,
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
        if (fs.existsSync(p)) {
            try { fs.unlinkSync(p); } catch (e) {}
        }
    });
}

function initializeClientWithRetry(maxRetries = 5, attempt = 1) {
    client.initialize().catch((error) => {
        console.error(`❌ Error iniciando WhatsApp (intento ${attempt}/${maxRetries}):`, error.message);
        if (attempt < maxRetries) {
            clearSessionLockFiles();
            setTimeout(() => initializeClientWithRetry(maxRetries, attempt + 1), 3000 * attempt);
        }
    });
}

initializeClientWithRetry();
