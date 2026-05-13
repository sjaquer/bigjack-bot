const SERVER_URL = 'http://localhost:3000';
const socket = io(SERVER_URL);
const notifSound = document.getElementById('notif-sound');

// --- STATE ---
window.currentSettings = { provider: '', model: '' };

// Initialize
fetchStatus();
fetchOrders();
fetchChats();
fetchModels();

// --- SOCKET LISTENERS ---
socket.on('status', (status) => {
    updateStatusBadge(status);
});

socket.on('qr', (qr) => {
    updateStatusBadge('qr_required');
    showQR(qr);
});

socket.on('new-order', (order) => {
    addOrderToList(order);
    playNotification();
    updateOrderCount();
});

socket.on('chat-update', (chat) => {
    updateChatInList(chat);
});

socket.on('settings-updated', (settings) => {
    console.log('🔄 Ajustes actualizados vía socket:', settings);
    if (settings.provider && settings.model) {
        window.currentSettings = { ...window.currentSettings, ...settings };
        syncSelector();
    }
});

// --- FUNCTIONS ---
async function fetchStatus() {
    try {
        const res = await fetch(`${SERVER_URL}/api/status`);
        const data = await res.json();
        window.currentSettings = data;
        updateStatusBadge(data.status);
        syncSelector();
    } catch (e) {
        console.error('Error fetching status:', e);
    }
}

async function fetchModels() {
    try {
        const res = await fetch(`${SERVER_URL}/api/models`);
        const models = await res.json();
        const selector = document.getElementById('ai-selector');
        if (!selector) return;

        selector.innerHTML = '';
        models.forEach(m => {
            const opt = document.createElement('option');
            opt.value = `${m.provider}:${m.name}`;
            opt.innerText = `${m.provider === 'ollama' ? '🏠 Local:' : '☁️ Gemini:'} ${m.name}`;
            selector.appendChild(opt);
        });

        syncSelector();
    } catch (e) {
        console.error('Error fetching models:', e);
    }
}

function syncSelector() {
    const selector = document.getElementById('ai-selector');
    if (selector && window.currentSettings && window.currentSettings.model) {
        const targetValue = `${window.currentSettings.provider}:${window.currentSettings.model}`;
        // Solo aplicar si el valor existe en las opciones actuales
        const exists = Array.from(selector.options).some(opt => opt.value === targetValue);
        if (exists) {
            selector.value = targetValue;
        }
    }
}

async function fetchOrders() {
    try {
        const res = await fetch(`${SERVER_URL}/api/orders`);
        const orders = await res.json();
        const list = document.getElementById('orders-list');
        list.innerHTML = '';
        if (orders.length === 0) {
            list.innerHTML = '<div class="empty-state">Sin pedidos.</div>';
        } else {
            orders.forEach(addOrderToList);
        }
        updateOrderCount();
    } catch (e) {
        console.error('Error fetching orders:', e);
    }
}

async function fetchChats() {
    try {
        const res = await fetch(`${SERVER_URL}/api/chats`);
        const chats = await res.json();
        const list = document.getElementById('chats-list');
        list.innerHTML = '';
        if (chats.length === 0) {
            list.innerHTML = '<div class="empty-state">Sin chats.</div>';
        } else {
            chats.forEach(updateChatInList);
        }
    } catch (e) {
        console.error('Error fetching chats:', e);
    }
}

function updateChatInList(chat) {
    const list = document.getElementById('chats-list');
    let item = document.getElementById(`chat-${chat.id.replace(/[^a-zA-Z0-9]/g, '')}`);
    
    if (!item) {
        const empty = list.querySelector('.empty-state');
        if (empty) empty.remove();
        
        item = document.createElement('div');
        item.id = `chat-${chat.id.replace(/[^a-zA-Z0-9]/g, '')}`;
        item.className = 'chat-item';
        list.prepend(item);
    }

    item.innerHTML = `
        <div class="chat-header">
            <span class="chat-phone">${chat.phone}</span>
            <span class="chat-status status-${chat.status}">${chat.status === 'confirmed' ? 'Confirmado' : 'Pendiente'}</span>
        </div>
        <div class="chat-msg">${chat.lastMessage}</div>
    `;
}

function updateStatusBadge(status) {
    const badge = document.getElementById('bot-status-badge');
    const text = badge.querySelector('.text');
    badge.className = `status-badge ${status}`;
    
    const statusMap = {
        'starting': 'Iniciando...',
        'ready': 'En Línea',
        'qr_required': 'Esperando QR',
        'error': 'Error'
    };
    text.innerText = statusMap[status] || status;

    if (status === 'ready') {
        document.getElementById('qr-container').style.display = 'none';
    } else {
        document.getElementById('qr-container').style.display = 'block';
    }
}

function showQR(qr) {
    document.getElementById('qr-placeholder').style.display = 'none';
    document.getElementById('qr-image-container').style.display = 'flex';
    
    new QRious({
        element: document.getElementById('qr-canvas'),
        value: qr,
        size: 200
    });
}

function addOrderToList(order) {
    const list = document.getElementById('orders-list');
    const emptyState = list.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    const div = document.createElement('div');
    div.className = 'order-item';
    
    const itemsText = order.items.map(i => `${i.quantity}x ${i.sku}`).join(', ');
    const time = new Date(order.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    div.innerHTML = `
        <div class="order-info">
            <h4>${order.customer}</h4>
            <p>${itemsText}</p>
        </div>
        <div class="order-meta">
            <span class="order-time">${time}</span>
        </div>
    `;
    
    list.prepend(div);
}

function updateOrderCount() {
    const count = document.querySelectorAll('.order-item').length;
    document.getElementById('order-count').innerText = count;
}

async function setProvider(compositeValue) {
    const [provider, model] = compositeValue.split(':');
    
    // Actualización optimista en la UI
    window.currentSettings = { provider, model };
    
    try {
        await fetch(`${SERVER_URL}/api/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider, model })
        });
    } catch (e) {
        console.error('Error setting provider:', e);
    }
}

function playNotification() {
    notifSound.play().catch(e => console.warn('Audio play failed:', e));
}
