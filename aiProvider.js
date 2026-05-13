const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('./config');

class AIProvider {
    constructor() {
        this.provider = config.ai.provider;
        this.geminiApiKey = config.ai.gemini.apiKey;
        this.geminiModels = config.ai.gemini.models;
        this.ollamaUrl = config.ai.ollama.url;
        this.ollamaModel = config.ai.ollama.model;
        
        if (this.geminiApiKey) {
            this.genAI = new GoogleGenerativeAI(this.geminiApiKey);
        }
    }

    async sendMessage(history, userMessage, systemInstruction) {
        if (this.provider === 'ollama') {
            return this.sendOllamaMessage(history, userMessage, systemInstruction);
        } else {
            return this.sendGeminiMessage(history, userMessage, systemInstruction);
        }
    }

    async sendGeminiMessage(history, userMessage, systemInstruction) {
        let lastError;
        for (const modelName of this.geminiModels) {
            try {
                const model = this.genAI.getGenerativeModel({
                    model: modelName.trim(),
                    systemInstruction: systemInstruction
                });

                const chatSession = model.startChat({ history });
                const result = await chatSession.sendMessage(userMessage);
                return result.response.text();
            } catch (error) {
                lastError = error;
                console.warn(`⚠️ Error con Gemini (${modelName}):`, error.message);
                if (error.status === 404) continue;
                throw error;
            }
        }
        throw lastError || new Error('No se pudo obtener respuesta de Gemini');
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

            const response = await axios.post(this.ollamaUrl, {
                model: this.ollamaModel,
                messages: messages,
                stream: false,
                options: { temperature: 0.7 }
            });

            return response.data.message.content;
        } catch (error) {
            console.error('❌ Error con Ollama:', error.message);
            throw new Error('Ollama no está disponible o respondió con error.');
        }
    }
}

module.exports = new AIProvider();

