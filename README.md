# 🍔 Big Jack Bot | Command Center

![Version](https://img.shields.io/badge/version-1.3.0-orange)
![Electron](https://img.shields.io/badge/platform-Windows-blue)
![License](https://img.shields.io/badge/license-MIT-green)

**Big Jack Bot** es una solución híbrida de escritorio diseñada para automatizar la toma de pedidos en hamburgueserías y restaurantes. Combina la estabilidad de una aplicación nativa con la inteligencia de modelos de lenguaje avanzados (LLMs).

---

## 🚀 Características Principales

*   **Aplicación Híbrida de Escritorio:** Desarrollada con Electron para una experiencia "todo-en-uno" sin necesidad de terminales abiertas.
*   **Inteligencia Dual:**
    *   **Local:** Integración total con **Ollama** (Phi-3, Llama 3, Gemma) para máxima privacidad y costo cero.
    *   **Cloud:** Conexión con **Google Gemini API** (2.0 Flash, 1.5 Pro) para alta precisión.
*   **Gestión Multi-Chat en Tiempo Real:** Sidebar de monitoreo que permite ver quién está escribiendo y el estado del pedido (**Pendiente / Confirmado**).
*   **IA de Respuesta Rápida:** Optimizada para ser ultra-concisa (< 200 caracteres) y ocultar detalles técnicos (SKUs) al cliente.
*   **Notificaciones Inteligentes:** Alertas sonoras y visuales inmediatas cuando se detecta un pedido nuevo.
*   **Integración ERP:** Generación automática de JSON y envío directo a sistemas externos mediante Webhooks seguros.

---

## 🛠️ Tecnologías Usadas

*   **Core:** Node.js, Express, Socket.io
*   **Desktop:** Electron (Hybrid Architecture)
*   **WhatsApp:** WhatsApp-web.js (Chromium-based engine)
*   **AI Providers:** Google Generative AI & Ollama API
*   **UI/UX:** Vanilla CSS con estética Premium (Glassmorphism & Dark Mode)

---

## 📦 Instalación y Uso

### Requisitos Previos
*   [Node.js](https://nodejs.org/) (Versión 18 o superior)
*   [Ollama](https://ollama.ai/) (Opcional, para modelos locales)

### Configuración
1.  Clona el repositorio.
2.  Copia el archivo `.env.example` a `.env` y completa tus credenciales (Gemini API Key, Webhook URL).
3.  Instala las dependencias:
    ```bash
    npm install
    ```

### Ejecución
*   **Modo Desarrollo:**
    ```bash
    npm run electron
    ```
*   **Generar Ejecutable (.exe):**
    ```bash
    npm run dist
    ```

---

## 📐 Arquitectura

El bot opera como un puente entre el cliente (WhatsApp) y el negocio (ERP). Utiliza un motor de navegador real para evitar baneos y garantizar la seguridad del número principal del comercio.

1.  **Recepción:** El mensaje llega a través de WhatsApp Web.
2.  **Procesamiento:** La IA (Local o Cloud) analiza el texto según el `systemPrompt` dinámico cargado desde el inventario.
3.  **Confirmación:** Una vez que el cliente confirma el resumen, el bot extrae el JSON.
4.  **Ejecución:** Se notifica al panel de control y se envía la orden al ERP para producción en cocina.

---

## 🛡️ Seguridad y Privacidad
Este proyecto ha sido diseñado siguiendo las mejores prácticas:
*   Las API Keys y secretos se gestionan estrictamente vía variables de entorno.
*   La persistencia de sesión es local y privada.
*   El uso de Ollama permite que los datos de los clientes nunca salgan de tu servidor local.

---
**Desarrollado por [Sebastián Jaque](https://github.com/tu-usuario) para el portfolio de Aplicaciones Empresariales.**
