# 🍔 Big Jack WhatsApp Bot

¡Bienvenido al asistente virtual oficial de **Big Jack**! Este bot automatiza la toma de pedidos mediante inteligencia artificial (Gemini u Ollama) y los integra directamente con un sistema ERP mediante webhooks.

Este proyecto está diseñado para ser robusto, escalable y fácil de integrar en cualquier flujo de trabajo gastronómico.

## 🚀 Características

- 🤖 **IA Multiproveedor**: Soporte para Google Gemini (Cloud) y Ollama (Local).
- 📲 **WhatsApp Web**: Integración fluida mediante `whatsapp-web.js`.
- 🛒 **Flujo de Pedidos Inteligente**: Capacidad para entender lenguaje natural y convertirlo en JSON estructurado para ERPs.
- 🔐 **Seguridad**: Gestión de secretos mediante variables de entorno y validación de webhooks.
- 📊 **Logs de Error**: Registro detallado de fallos en la comunicación con el ERP para fácil depuración.

## 🛠️ Tecnologías Usadas

- **Node.js**
- **WhatsApp-Web.js** (Cliente de WhatsApp)
- **Google Generative AI** (Gemini)
- **Ollama** (Modelos locales como Llama3)
- **Axios** (Comunicación HTTP)
- **Dotenv** (Gestión de configuración)

## 📋 Requisitos Previos

- Node.js (v16 o superior)
- Una API Key de Google Gemini (opcional)
- Ollama instalado localmente (opcional)

## ⚙️ Instalación

1. Clona el repositorio:
   ```bash
   git clone https://github.com/tu-usuario/bigjack-bot.git
   cd bigjack-bot
   ```

2. Instala las dependencias:
   ```bash
   npm install
   ```

3. Configura las variables de entorno:
   Copia el archivo `.env.example` a `.env` y rellena los datos necesarios.
   ```bash
   cp .env.example .env
   ```

## 🚀 Uso

Inicia el bot con el siguiente comando:
```bash
node index.js
```
Escanea el código QR que aparecerá en la terminal con tu aplicación de WhatsApp.

## 📂 Estructura del Proyecto

- `index.js`: Punto de entrada y lógica principal del bot.
- `aiProvider.js`: Módulo para gestionar diferentes proveedores de IA.
- `config.js`: Centralización de configuraciones y variables de entorno.
- `sytemPrompt.js`: Instrucciones y personalidad del asistente.
- `menuData.js`: Base de datos local de productos y SKUs.

## 🤝 Contribuciones

Las contribuciones son bienvenidas. Si tienes alguna idea para mejorar el bot, no dudes en abrir un Issue o un Pull Request.

---
Desarrollado con ❤️ por [Tu Nombre/Portafolio]
