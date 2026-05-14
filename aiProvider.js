const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('./config');

class AIProvider {
    constructor() {
        this.provider = config.ai.provider;
        this.geminiApiKey = config.ai.gemini.apiKey;
        this.activeModel = this.provider === 'ollama' ? config.ai.ollama.model : (config.ai.gemini.models[0] || 'gemini-1.5-flash');
        
        if (this.geminiApiKey) {
            this.genAI = new GoogleGenerativeAI(this.geminiApiKey);
        }
    }

    // Método para actualizar la configuración en tiempo real
    setSettings(provider, model) {
        if (provider) this.provider = provider.trim().toLowerCase();
        if (model) this.activeModel = model.trim();
        
        console.log(`[AI-Provider] Switch -> Proveedor: ${this.provider}, Modelo: ${this.activeModel}`);
        
        // Si cambiamos a Gemini y no hay genAI, intentar inicializarlo
        if (this.provider === 'gemini' && !this.genAI && this.geminiApiKey) {
            this.genAI = new GoogleGenerativeAI(this.geminiApiKey);
        }
    }

    async sendMessage(history, systemInstruction) {
        // Clonamos el historial para no modificar el original
        const fullHistory = JSON.parse(JSON.stringify(history));
        
        // Extraemos el último mensaje del usuario para enviarlo como prompt actual
        // y mantenemos el resto como historial
        const lastMsgObj = fullHistory.pop();
        const lastUserMessage = lastMsgObj ? lastMsgObj.parts[0].text : "";

        if (this.provider === 'ollama') {
            return this.sendOllamaMessage(fullHistory, lastUserMessage, systemInstruction);
        } else {
            return this.sendGeminiMessage(fullHistory, lastUserMessage, systemInstruction);
        }
    }

    async sendGeminiMessage(history, userMessage, systemInstruction) {
        try {
            if (!this.genAI) throw new Error("API Key de Gemini no configurada.");

            const model = this.genAI.getGenerativeModel({
                model: this.activeModel,
                systemInstruction: systemInstruction
            });

            const chatSession = model.startChat({ history: history });
            const result = await chatSession.sendMessage(userMessage);
            return result.response.text();
        } catch (error) {
            console.error(`❌ Error con Gemini (${this.activeModel}):`, error.message);
            throw error;
        }
    }

    async sendOllamaMessage(history, userMessage, systemInstruction) {
        try {
            const messages = [
                { role: 'system', content: systemInstruction },
                ...history.map(h => ({
                    role: h.role === 'model' ? 'assistant' : 'user',
                    content: h.parts[0].text
                })),
                { role: 'user', content: userMessage }
            ];

            const response = await axios.post(config.ai.ollama.url, {
                model: this.activeModel,
                messages: messages,
                stream: false,
                options: { temperature: 0.7 }
            });

            return response.data.message.content;
        } catch (error) {
            console.error(`❌ Error con Ollama (${this.activeModel}):`, error.message);
            throw new Error(`Ollama Error: ${error.message}`);
        }
    }
}

module.exports = new AIProvider();
