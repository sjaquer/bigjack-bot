const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('./config');

class AIProvider {
    constructor() {
        this.provider = config.ai.provider;
        this.geminiApiKey = config.ai.gemini.apiKey;
        this.activeModel = this.provider === 'ollama' ? config.ai.ollama.model : config.ai.gemini.models[0];
        
        if (this.geminiApiKey) {
            this.genAI = new GoogleGenerativeAI(this.geminiApiKey);
        }
    }

    setSettings(provider, model) {
        if (provider) this.provider = provider;
        if (model) this.activeModel = model;
    }

    async sendMessage(history, userMessage, systemInstruction) {
        if (this.provider === 'ollama') {
            return this.sendOllamaMessage(history, userMessage, systemInstruction);
        } else {
            return this.sendGeminiMessage(history, userMessage, systemInstruction);
        }
    }

    async sendGeminiMessage(history, userMessage, systemInstruction) {
        try {
            const model = this.genAI.getGenerativeModel({
                model: this.activeModel.trim(),
                systemInstruction: systemInstruction
            });

            const chatSession = model.startChat({ history });
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
            throw new Error('Ollama no está disponible o el modelo no existe.');
        }
    }
}


module.exports = new AIProvider();

