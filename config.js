require('dotenv').config();

const config = {
    // WhatsApp configuration
    whatsapp: {
        sessionPath: process.env.WHATSAPP_SESSION_PATH || './.wwebjs_auth',
        chromePath: process.env.CHROME_PATH || null,
        headless: process.env.HEADLESS === 'true' || true
    },
    
    // AI Provider configuration
    ai: {
        provider: process.env.AI_PROVIDER || 'gemini', // 'gemini' or 'ollama'
        gemini: {
            apiKey: process.env.GEMINI_API_KEY,
            models: (process.env.GEMINI_MODELS || 'gemini-2.0-flash,gemini-1.5-flash').split(',')
        },
        ollama: {
            url: process.env.OLLAMA_URL || 'http://localhost:11434/api/chat',
            model: process.env.OLLAMA_MODEL || 'llama3'
        }
    },
    
    // ERP / Webhook configuration
    erp: {
        webhookUrl: process.env.WEBHOOK_URL,
        webhookSecret: process.env.WEBHOOK_SECRET,
        timeout: parseInt(process.env.ERP_TIMEOUT) || 15000
    },
    
    // Application settings
    app: {
        env: process.env.NODE_ENV || 'development',
        logLevel: process.env.LOG_LEVEL || 'info'
    },
    // Configuración para Multi-Instancia (Reparto de Chats)
    multiInstance: {
        instanceId: process.env.INSTANCE_ID || `BOT-${Math.floor(Math.random() * 1000)}`,
        instanceRank: parseInt(process.env.INSTANCE_RANK || "0"), // 0, 1, 2, 3...
        totalInstances: parseInt(process.env.TOTAL_INSTANCES || "1")
    }
};

// Simple validation
if (config.ai.provider === 'gemini' && !config.ai.gemini.apiKey) {
    console.warn('⚠️ WARNING: GEMINI_API_KEY is not set. Gemini provider will not work.');
}

if (!config.erp.webhookUrl) {
    console.warn('⚠️ WARNING: WEBHOOK_URL is not set. Order integration will not work.');
}

module.exports = config;
