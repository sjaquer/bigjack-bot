const SERVER_URL = 'http://localhost:3000';
const socket = io(SERVER_URL);
const notifSound = document.getElementById('notif-sound');

// --- STATE ---
window.currentSettings = { provider: '', model: '', botEnabled: true };
window.activeChatId = null;
window.chatsData = {}; // { chatId: { messages: [], phone, botPaused } }

// Initialize
fetchStatus();
fetchOrders();
fetchChats();
fetchModels();
fetchInventory();

// --- SOCKET LISTENERS ---
socket.on('status', (status) => updateStatusBadge(status));
socket.on('qr', (qr) => { updateStatusBadge('qr_required'); showQR(qr); });
socket.on('new-order', (order) => { addOrderToList(order); playNotification(); updateOrderCount(); });

socket.on('chat-update', (chat) => {
    if (!window.chatsData[chat.id]) window.chatsData[chat.id] = { ...chat, messages: [] };
    else window.chatsData[chat.id] = { ...window.chatsData[chat.id], ...chat };
    updateChatInList(chat);
});

socket.on('new-message', (msg) => {
    if (!window.chatsData[msg.chatId]) window.chatsData[msg.chatId] = { messages: [] };
    window.chatsData[msg.chatId].messages.push(msg);
    
    if (window.activeChatId === msg.chatId) {
        renderMessage(msg);
        scrollToBottom();
    } else {
        const item = document.getElementById(`chat-${msg.chatId.replace(/[^a-zA-Z0-9]/g, '')}`);
        if (item) item.classList.add('has-new');
    }
});

socket.on('stats-update', (stats) => {
    document.getElementById('stat-orders').innerText = stats.ordersToday;
    document.getElementById('stat-msgs').innerText = stats.messagesProcessed;
});

// --- UI LOGIC ---
function showView(viewId) {
    document.querySelectorAll('.content-viewport').forEach(v => v.style.display = 'none');
    document.querySelectorAll('.nav-icon').forEach(i => i.classList.remove('active'));
    
    document.getElementById(viewId).style.display = 'flex';
    document.querySelector(`[onclick="showView('${viewId}')"]`).classList.add('active');
}

function openChat(chatId) {
    window.activeChatId = chatId;
    const chat = window.chatsData[chatId];
    
    showView('view-chats');
    document.getElementById('active-chat-name').innerText = chat.phone;
    document.getElementById('active-chat-sub').innerText = chat.botPaused ? '🤖 Bot Pausado' : '⚡ IA Asistiendo';
    document.getElementById('input-area').style.display = 'block';
    document.getElementById('btn-pause-chat').style.display = 'block';
    
    updatePauseButton(chat.botPaused);

    const container = document.getElementById('messages-container');
    container.innerHTML = '';
    chat.messages.forEach(renderMessage);
    scrollToBottom();

    document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
    const item = document.getElementById(`chat-${chatId.replace(/[^a-zA-Z0-9]/g, '')}`);
    if (item) {
        item.classList.add('active');
        item.classList.remove('has-new');
    }
}

function renderMessage(msg) {
    const container = document.getElementById('messages-container');
    const div = document.createElement('div');
    div.className = `msg ${msg.fromMe ? 'out' : 'in'}`;
    div.innerText = msg.body || "📎 Archivo/Ubicación";
    container.appendChild(div);
}

function updateChatInList(chat) {
    const list = document.getElementById('chats-list');
    let idSafe = chat.id.replace(/[^a-zA-Z0-9]/g, '');
    let item = document.getElementById(`chat-${idSafe}`);
    
    if (!item) {
        const empty = list.querySelector('.empty-state');
        if (empty) empty.remove();
        item = document.createElement('div');
        item.id = `chat-${idSafe}`;
        item.className = 'chat-item';
        item.onclick = () => openChat(chat.id);
        list.prepend(item);
    }

    item.innerHTML = `
        <div class="top">
            <span class="phone">${chat.phone}</span>
            <span class="time">${new Date(chat.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
        </div>
        <div class="preview">${chat.lastMessage}</div>
    `;
    
    if (window.activeChatId === chat.id) item.classList.add('active');
}

// --- API ACTIONS ---
async function fetchStatus() {
    try {
        const res = await fetch(`${SERVER_URL}/api/status`);
        const data = await res.json();
        window.currentSettings = data;
        updateStatusBadge(data.status);
        document.getElementById('global-bot-toggle').checked = data.botEnabled;
        document.getElementById('stat-orders').innerText = data.stats.ordersToday;
        document.getElementById('stat-msgs').innerText = data.stats.messagesProcessed;
        syncSelector();
    } catch (e) { console.error(e); }
}

async function fetchInventory() {
    try {
        const res = await fetch(`${SERVER_URL}/api/menu`);
        const menu = await res.json();
        const list = document.getElementById('inventory-list');
        list.innerHTML = '';
        menu.forEach(item => {
            const div = document.createElement('div');
            div.className = 'mini-card inventory-card';
            div.style.marginBottom = '12px';
            div.innerHTML = `
                <div class="toggle-group">
                    <div>
                        <b style="display:block">${item.name}</b>
                        <small style="color:var(--text-dim)">${item.options[0].sku}</small>
                    </div>
                    <div class="toggle-switch">
                        <input type="checkbox" id="inv-${item.name}" ${item.available !== false ? 'checked' : ''} onchange="toggleInventory('${item.name}', this.checked)">
                        <label for="inv-${item.name}" class="switch-label"></label>
                    </div>
                </div>
            `;
            list.appendChild(div);
        });
    } catch (e) { console.error(e); }
}

async function sendManualMessage() {
    const input = document.getElementById('message-input');
    const message = input.value.trim();
    if (!message || !window.activeChatId) return;
    await fetch(`${SERVER_URL}/api/send-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: window.activeChatId, message })
    });
    input.value = '';
}

async function toggleActiveChatBot() {
    if (!window.activeChatId) return;
    const chat = window.chatsData[window.activeChatId];
    const newState = !chat.botPaused;
    await fetch(`${SERVER_URL}/api/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle-chat', chatId: window.activeChatId, value: newState })
    });
    chat.botPaused = newState;
    updatePauseButton(newState);
    document.getElementById('active-chat-sub').innerText = newState ? '🤖 Bot Pausado' : '⚡ IA Asistiendo';
}

function updatePauseButton(isPaused) {
    const btn = document.getElementById('btn-pause-chat');
    btn.innerText = isPaused ? '▶️ Reanudar Bot' : '⏸️ Pausar Bot';
    btn.className = `mini-btn ${isPaused ? 'active' : 'danger'}`;
}

function updateStatusBadge(status) {
    const badge = document.getElementById('bot-status-badge');
    badge.className = `status-indicator ${status}`;
    badge.innerText = status === 'ready' ? 'En Línea' : status === 'qr_required' ? 'QR Pendiente' : 'Iniciando';
    document.getElementById('qr-container').style.display = status === 'ready' ? 'none' : 'block';
}

function showQR(qr) {
    document.getElementById('qr-placeholder').style.display = 'none';
    document.getElementById('qr-image-container').style.display = 'block';
    new QRious({ element: document.getElementById('qr-canvas'), value: qr, size: 200 });
}

function addOrderToList(order) {
    const list = document.getElementById('orders-list');
    const div = document.createElement('div');
    div.className = 'mini-card';
    div.style.padding = '12px';
    div.style.marginBottom = '8px';
    div.innerHTML = `<small>${new Date(order.timestamp).toLocaleTimeString()}</small><br><b>${order.customer}</b><br><small>${order.items.length} items</small>`;
    list.prepend(div);
}

async function logout() { if (confirm('¿Cerrar sesión?')) { await fetch(`${SERVER_URL}/api/logout`, {method:'POST'}); location.reload(); } }
function handleChatKey(e) { if (e.key === 'Enter') sendManualMessage(); }
function scrollToBottom() { const c = document.getElementById('messages-container'); c.scrollTop = c.scrollHeight; }
function playNotification() { notifSound.play().catch(()=>{}); }
async function fetchOrders() { const r = await fetch(`${SERVER_URL}/api/orders`); (await r.json()).forEach(addOrderToList); }
async function fetchChats() { const r = await fetch(`${SERVER_URL}/api/chats`); (await r.json()).forEach(updateChatInList); }
async function fetchModels() {
    const r = await fetch(`${SERVER_URL}/api/models`);
    const m = await r.json();
    const s = document.getElementById('ai-selector');
    s.innerHTML = '';
    m.forEach(i => { const o = document.createElement('option'); o.value = `${i.provider}:${i.name}`; o.innerText = `${i.provider}: ${i.name}`; s.appendChild(o); });
    syncSelector();
}
function syncSelector() {
    const s = document.getElementById('ai-selector');
    if (s && window.currentSettings.model) {
        const v = `${window.currentSettings.provider}:${window.currentSettings.model}`;
        if (Array.from(s.options).some(o => o.value === v)) s.value = v;
    }
}
async function toggleGlobalBot(v) { await fetch(`${SERVER_URL}/api/control`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ action: 'toggle-global', value: v }) }); }
async function setProvider(v) { const [p, m] = v.split(':'); await fetch(`${SERVER_URL}/api/settings`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ provider: p, model: m }) }); }
async function toggleInventory(sku, available) { await fetch(`${SERVER_URL}/api/inventory`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sku, available }) }); }
