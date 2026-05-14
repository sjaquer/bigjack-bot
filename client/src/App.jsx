import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import axios from 'axios';
import { MessageSquare, Settings, Box, LogOut, Pause, Play, Send, Clock, XCircle, Zap, RefreshCw, Smartphone, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import './index.css';

const SERVER_URL = 'http://localhost:3000';
const socket = io(SERVER_URL);

export default function App() {
  const [view, setView] = useState('chats');
  const [status, setStatus] = useState('starting');
  const [qrCode, setQrCode] = useState(null);
  const [instanceInfo, setInstanceInfo] = useState({ id: '', rank: 0, total: 1 });
  const [stats, setStats] = useState({ ordersToday: 0, messagesProcessed: 0, erpSuccess: 0, erpErrors: 0 });
  const [models, setModels] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [currentProvider, setCurrentProvider] = useState('');
  const [currentModel, setCurrentModel] = useState('');
  const [botDelay, setBotDelay] = useState(2000);

  const [chats, setChats] = useState({});
  const [activeChatId, setActiveChatId] = useState(null);
  const [orders, setOrders] = useState([]);
  const [inputValue, setInputValue] = useState('');
  
  const [activeTimers, setActiveTimers] = useState({}); 
  const [remainingTime, setRemainingTime] = useState(0);
  const [alerts, setAlerts] = useState([]);
  const [botTyping, setBotTyping] = useState({});

  const messagesEndRef = useRef(null);

  useEffect(() => {
    fetchInitialData();

    socket.on('status', (s) => setStatus(s));
    socket.on('qr', (qr) => { setStatus('qr_required'); setQrCode(qr); });
    socket.on('new-order', (order) => setOrders(prev => [order, ...prev]));
    socket.on('order-update', (updated) => {
        setOrders(prev => prev.map(o => o.id === updated.id ? { ...o, ...updated } : o));
    });
    
    socket.on('stats-update', (s) => setStats(s));
    socket.on('settings-updated', (data) => {
      if (data.provider) setCurrentProvider(data.provider);
      if (data.model) setCurrentModel(data.model);
      if (data.delay !== undefined) setBotDelay(data.delay);
    });

    socket.on('timer-update', (data) => {
      setActiveTimers(prev => ({ ...prev, [data.chatId]: { active: data.active, expiresAt: data.expiresAt } }));
    });

    socket.on('bot-typing', (data) => {
        setBotTyping(prev => ({ ...prev, [data.chatId]: data.active }));
    });

    socket.on('erp-error', (err) => {
        const newAlert = { id: Date.now(), ...err };
        setAlerts(prev => [newAlert, ...prev]);
        setTimeout(() => setAlerts(prev => prev.filter(a => a.id !== newAlert.id)), 8000);
    });
    
    socket.on('chat-update', (chat) => {
      setChats(prev => {
        const existing = prev[chat.id] || { messages: [] };
        // Si el chat del servidor trae mensajes (cache), usarlos si no tenemos nada
        const mergedMessages = [...existing.messages];
        if (chat.messages && chat.messages.length > 0) {
            chat.messages.forEach(m => {
                const exists = mergedMessages.some(em => em.timestamp === m.timestamp && em.body === m.body);
                if (!exists) mergedMessages.push(m);
            });
            mergedMessages.sort((a,b) => a.timestamp - b.timestamp);
        }
        return {
          ...prev,
          [chat.id]: { ...existing, ...chat, messages: mergedMessages }
        };
      });
    });

    socket.on('new-message', (msg) => {
      setChats(prev => {
        const chat = prev[msg.chatId] || { messages: [] };
        const alreadyExists = chat.messages.some(m => m.timestamp === msg.timestamp && m.body === msg.body);
        if (alreadyExists) return prev;
        return {
          ...prev,
          [msg.chatId]: { 
            ...chat, 
            messages: [...chat.messages, msg], 
            lastMessage: msg.body, 
            timestamp: Date.now(), 
            hasNew: msg.chatId !== activeChatId 
          }
        };
      });
    });

    return () => { 
      socket.off('status'); socket.off('qr'); socket.off('new-order'); socket.off('order-update');
      socket.off('stats-update'); socket.off('settings-updated'); 
      socket.off('timer-update'); socket.off('erp-error'); socket.off('chat-update'); socket.off('new-message'); 
    };
  }, [activeChatId]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (activeChatId && activeTimers[activeChatId]?.active) {
        const rem = activeTimers[activeChatId].expiresAt - Date.now();
        setRemainingTime(rem > 0 ? rem : 0);
      } else {
        setRemainingTime(0);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [activeChatId, activeTimers]);

  useEffect(() => {
    if (messagesEndRef.current) messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    if (activeChatId && chats[activeChatId]?.hasNew) {
      setChats(prev => ({ ...prev, [activeChatId]: { ...prev[activeChatId], hasNew: false } }));
    }
  }, [chats[activeChatId]?.messages, activeChatId]);

  async function fetchInitialData() {
    fetchStatus(); fetchOrders(); fetchChats(); fetchModels(); fetchInventory();
  }

  const fetchStatus = async () => {
    try {
      const res = await axios.get(`${SERVER_URL}/api/status`);
      setStatus(res.data.status);
      setStats(res.data.stats || { ordersToday: 0, messagesProcessed: 0, erpSuccess: 0, erpErrors: 0 });
      setCurrentProvider(res.data.provider);
      setCurrentModel(res.data.model);
      setBotDelay(res.data.botDelay || 2000);
      if (res.data.instance) setInstanceInfo(res.data.instance);
    } catch (e) { console.error('Status failed'); }
  };

  const fetchOrders = async () => {
    try {
      const res = await axios.get(`${SERVER_URL}/api/orders`);
      setOrders(res.data || []);
    } catch (e) { }
  };

  const fetchChats = async () => {
    try {
      const res = await axios.get(`${SERVER_URL}/api/chats`);
      const chatsMap = {};
      res.data.forEach(c => chatsMap[c.id] = { ...c, messages: c.messages || [] });
      setChats(chatsMap);
    } catch (e) { }
  };

  const fetchModels = async () => {
    try {
      const res = await axios.get(`${SERVER_URL}/api/models`);
      setModels(res.data || []);
    } catch (e) { }
  };

  const fetchInventory = async () => {
    try {
      const res = await axios.get(`${SERVER_URL}/api/menu`);
      setInventory(res.data || []);
    } catch (e) { }
  };

  const sendManualMessage = async () => {
    if (!inputValue.trim() || !activeChatId) return;
    const msgText = inputValue.trim();
    setInputValue('');
    const optimisticMsg = { body: msgText, fromMe: true, timestamp: Math.floor(Date.now()/1000) };
    setChats(prev => {
      const chat = prev[activeChatId];
      return { ...prev, [activeChatId]: { ...chat, messages: [...chat.messages, optimisticMsg], lastMessage: msgText } };
    });
    try { await axios.post(`${SERVER_URL}/api/send-message`, { chatId: activeChatId, message: msgText }); } catch (e) { }
  };

  const toggleChatBot = async (chatId, paused) => {
    await axios.post(`${SERVER_URL}/api/control`, { action: 'toggle-chat', chatId, value: paused });
    setChats(prev => ({ ...prev, [chatId]: { ...prev[chatId], botPaused: paused } }));
  };

  const controlTimer = async (action) => {
    if (!activeChatId) return;
    await axios.post(`${SERVER_URL}/api/control`, { action, chatId: activeChatId });
  };

  const toggleInventoryItem = async (sku, available) => {
    try {
      await axios.post(`${SERVER_URL}/api/inventory`, { sku, available });
      setInventory(prev => prev.map(item => {
        if (item.name === sku || item.options?.some(o => o.sku === sku)) return { ...item, available };
        return item;
      }));
    } catch (e) { }
  };

  const updateSettings = async (p, m, d) => {
    // Usamos los valores actuales si los nuevos son null/undefined
    const finalProvider = p || currentProvider;
    const finalModel = m || currentModel;
    const finalDelay = d !== undefined ? d : botDelay;

    try {
        await axios.post(`${SERVER_URL}/api/settings`, { 
            provider: finalProvider, 
            model: finalModel, 
            delay: finalDelay 
        });
        
        // Actualizamos estado local
        if (p) setCurrentProvider(p);
        if (m) setCurrentModel(m);
        if (d !== undefined) setBotDelay(d);
    } catch (e) {
        console.error('Error actualizando ajustes:', e);
    }
  };

  const handleModelChange = (e) => {
      const val = e.target.value; // Formato: "provider|model"
      const parts = val.split('|');
      if (parts.length >= 2) {
          const provider = parts[0];
          const model = parts.slice(1).join('|'); // En caso de que el modelo tenga | (raro, pero preventivo)
          updateSettings(provider, model);
      }
  };

  const logout = async () => {
    if (window.confirm('¿Cerrar sesión de WhatsApp?')) {
      await axios.post(`${SERVER_URL}/api/logout`);
      window.location.reload();
    }
  };

  const activeChat = activeChatId ? chats[activeChatId] : null;
  const isTimerActive = activeChatId && activeTimers[activeChatId]?.active;

  return (
    <div className="app-container">
      <div className="alerts-container">
        {alerts.map(a => (
            <div key={a.id} className="toast error">
                <AlertTriangle size={20} />
                <div className="content">
                    <b>Error de Integración</b>
                    <p>{a.message}</p>
                </div>
                <button onClick={()=>setAlerts(prev=>prev.filter(x=>x.id!==a.id))}><XCircle size={18}/></button>
            </div>
        ))}
      </div>

      <nav className="nav-sidebar">
        <div className="logo" style={{fontSize:'2.2rem'}}>🍔</div>
        <div className={`nav-icon ${view==='chats'?'active':''}`} onClick={()=>setView('chats')} title="Mensajería"><MessageSquare size={28} /></div>
        <div className={`nav-icon ${view==='inventory'?'active':''}`} onClick={()=>setView('inventory')} title="Inventario"><Box size={28} /></div>
        <div className={`nav-icon ${view==='settings'?'active':''}`} onClick={()=>setView('settings')} title="Ajustes"><Settings size={28} /></div>
        <div style={{flex:1}}></div>
        <div className="nav-icon danger" onClick={logout} title="Cerrar Sesión"><LogOut size={28} /></div>
      </nav>

      <main className="main-wrapper">
        {view === 'chats' && (
          <aside className="list-panel">
            <div className="panel-header">
              <h2>Mensajería</h2>
              <div className="search-box">
                <input type="text" placeholder="Buscar cliente..." />
              </div>
            </div>
            <div className="scroll-area">
              {Object.values(chats).sort((a,b) => b.timestamp - a.timestamp).map(chat => (
                <div key={chat.id} className={`chat-item ${activeChatId === chat.id ? 'active' : ''} ${chat.hasNew ? 'has-new' : ''}`} onClick={() => setActiveChatId(chat.id)}>
                  <div className="top">
                    <span className="phone">{chat.phone}</span>
                    <span className="time">{new Date(chat.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                  </div>
                  <div className="preview">{chat.lastMessage}</div>
                  <div style={{display:'flex', gap:5, marginTop:8, flexWrap:'wrap'}}>
                     {chat.labels?.map((l,idx) => (
                        <span key={idx} style={{fontSize:'0.65rem', padding:'2px 8px', borderRadius:10, background:l.hexColor || '#333', color:'#fff', fontWeight:'bold'}}>
                            {l.name}
                        </span>
                     ))}
                  </div>
                </div>
              ))}
            </div>
          </aside>
        )}

        <section className="content-viewport">
          {status === 'qr_required' && qrCode ? (
             <div className="welcome-screen" style={{textAlign:'center', marginTop:'10%'}}>
                <div className="mini-card" style={{display:'inline-flex', flexDirection:'column', alignItems:'center', padding:40, background:'var(--bg-card)', border:'2px solid var(--accent-orange)'}}>
                    <Smartphone size={48} color="var(--accent-orange)" style={{marginBottom:20}} />
                    <h2>Vincular WhatsApp</h2>
                    <div style={{background:'#fff', padding: 25, borderRadius: 25, margin:'30px 0'}}>
                        <QRCodeSVG value={qrCode} size={280} />
                    </div>
                    <div className="status-indicator starting">ESCANEA PARA COMENZAR</div>
                </div>
             </div>
          ) : (
            <>
                {view === 'chats' ? (
                    <>
                    <div className="viewport-header">
                        <div className="active-user">
                           <div style={{display:'flex', alignItems:'center', gap:15}}>
                                <h3>{activeChat ? activeChat.phone : 'Selecciona un chat'}</h3>
                                {activeChat?.labels?.map((l,idx) => (
                                    <span key={idx} style={{fontSize:'0.7rem', padding:'4px 12px', borderRadius:20, background:l.hexColor || '#333', color:'#fff', fontWeight:'bold'}}>
                                        {l.name}
                                    </span>
                                ))}
                           </div>
                           <span style={{fontSize: '0.85rem', color: 'var(--text-dim)'}}>
                                {activeChat ? (activeChat.botPaused ? '🤖 Modo Humano (Bot Pausado)' : '⚡ IA Jack Asistiendo') : 'Bienvenido'}
                           </span>
                        </div>

                        {isTimerActive && (
                            <div className="timer-control-panel mini-card" style={{padding:'8px 15px', display:'flex', alignItems:'center', gap:15, border:'1px solid var(--accent-orange)'}}>
                                <div style={{display:'flex', alignItems:'center', gap:8}}>
                                    <div className="loader-ring"></div>
                                    <span style={{fontWeight:'bold', color:'var(--accent-orange)'}}>{(remainingTime/1000).toFixed(1)}s</span>
                                </div>
                                <div style={{display:'flex', gap:10}}>
                                    <button className="timer-btn" onClick={()=>controlTimer('force-response')} title="Responder ahora"><Zap size={16} /></button>
                                    <button className="timer-btn" onClick={()=>controlTimer('restart-timer')} title="Reiniciar tiempo"><RefreshCw size={16} /></button>
                                    <button className="timer-btn danger" onClick={()=>controlTimer('cancel-timer')} title="Cancelar bot"><XCircle size={16} /></button>
                                </div>
                            </div>
                        )}

                        <div style={{display:'flex', gap: 15, alignItems:'center'}}>
                           <div className="mini-card" style={{padding:'6px 12px', background:'rgba(255,255,255,0.05)', border:'1px solid var(--glass-border)', fontSize:'0.75rem'}}>
                                <span style={{color:'var(--text-dim)'}}>ID:</span> <b style={{color:'var(--accent-teal)'}}>{instanceInfo.instanceId}</b>
                                <span style={{margin:'0 10px', color:'var(--glass-border)'}}>|</span>
                                <span style={{color:'var(--text-dim)'}}>RANK:</span> <b style={{color:'var(--accent-orange)'}}>{instanceInfo.instanceRank}</b>
                           </div>
                           <div className={`status-indicator ${status==='ready'?'ready':'starting'}`}>{status==='ready'?'En Línea':status}</div>
                           {activeChat && (
                              <button className={`mini-btn ${activeChat.botPaused ? 'active' : 'danger'}`} onClick={() => toggleChatBot(activeChat.id, !activeChat.botPaused)}>
                                 {activeChat.botPaused ? <Play size={16}/> : <Pause size={16}/>}
                              </button>
                           )}
                        </div>
                    </div>

                    <div className="chat-container">
                        <div className="messages-list">
                        {!activeChat && (
                            <div className="welcome-screen" style={{textAlign:'center', marginTop:'15%'}}>
                                <div style={{fontSize:'5rem'}}>🍔</div>
                                <h1 style={{marginTop:25, fontSize:'2.5rem'}}>Big Jack Command Center</h1>
                            </div>
                        )}
                        {activeChat?.messages?.map((msg, i) => (
                            <div key={i} className={`msg ${msg.fromMe ? 'out' : 'in'}`}>{msg.body || "📍 Media"}</div>
                        ))}
                        
                        {botTyping[activeChatId] && (
                            <div className="msg in typing-msg">
                                <div className="typing-dots">
                                    <span></span><span></span><span></span>
                                </div>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                        </div>
                        {activeChat && (
                        <div className="input-bar">
                            <div className="input-container">
                                <input type="text" value={inputValue} onChange={e=>setInputValue(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')sendManualMessage()}} placeholder="Escribe un mensaje..." />
                                <button className="send-btn" onClick={sendManualMessage}><Send size={22} /></button>
                            </div>
                        </div>
                        )}
                    </div>
                    </>
                ) : view === 'inventory' ? (
                    <div className="scroll-area" style={{padding: '35px'}}>
                        <div className="inventory-grid">
                            {inventory.map(item => (
                                <div key={item.name} className="mini-card" style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                                    <div><b>{item.name}</b><br/><small>{item.options?.[0]?.sku}</small></div>
                                    <div className="toggle-switch">
                                        <input type="checkbox" id={`inv-${item.name}`} checked={item.available !== false} onChange={(e) => toggleInventoryItem(item.name, e.target.checked)} />
                                        <label htmlFor={`inv-${item.name}`} className="switch-label"></label>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="scroll-area" style={{padding: '35px'}}>
                        <div className="mini-card" style={{marginBottom: 30, maxWidth: '600px'}}>
                            <label style={{display:'flex', alignItems:'center', gap:10, marginBottom:15, fontWeight:'800'}}><Clock size={20} /> Delay de Respuesta</label>
                            <input 
                                type="range" 
                                min="0" 
                                max="10000" 
                                step="500" 
                                value={botDelay} 
                                onChange={e => {
                                    const val = parseInt(e.target.value);
                                    setBotDelay(val);
                                    updateSettings(null, null, val);
                                }} 
                                style={{width:'100%'}} 
                            />
                            <div style={{textAlign:'right', fontWeight:'bold'}}>{(botDelay/1000).toFixed(1)}s</div>
                        </div>
                        <div className="mini-card" style={{maxWidth: '600px'}}>
                            <label style={{display:'block', marginBottom:15, fontWeight:'800'}}>Modelo IA</label>
                            <select 
                                value={`${currentProvider}|${currentModel}`} 
                                onChange={handleModelChange} 
                                className="custom-select"
                            >
                                {models.map(m => (
                                    <option key={`${m.provider}|${m.name}`} value={`${m.provider}|${m.name}`}>
                                        {m.provider.toUpperCase()}: {m.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                )}
            </>
          )}
        </section>

        <aside className="info-panel">
          <h2>Actividad Hoy</h2>
          <div className="stat-grid">
              <div className="mini-card"><span className="val">{stats.ordersToday}</span><span className="lbl">Pedidos</span></div>
              <div className="mini-card"><span className="val">{stats.erpSuccess} / {stats.erpErrors}</span><span className="lbl">Sync / Fallos</span></div>
          </div>
          <div className="orders-section" style={{marginTop: 40}}>
              <h3>Últimos Pedidos</h3>
              <div className="scroll-area" style={{padding:0, marginTop:15, maxHeight: 'calc(100vh - 450px)'}}>
                {orders.map(order => (
                  <div key={order.id} className="mini-card" style={{padding: 15, marginBottom: 12, borderLeft: `4px solid ${order.status==='synced'?'var(--accent-teal)':(order.status==='failed'?'var(--accent-red)':'var(--accent-orange)')}`}}>
                    <div style={{display:'flex', justifyContent:'space-between', marginBottom:5}}>
                      <small style={{fontWeight:'bold'}}>{new Date(order.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</small>
                      {order.status === 'synced' ? <CheckCircle2 size={14} color="var(--accent-teal)" /> : (order.status === 'failed' ? <AlertTriangle size={14} color="var(--accent-red)" /> : <Clock size={14} />)}
                    </div>
                    <b>{order.customer}</b><br/>
                    <small style={{color:'var(--text-dim)'}}>{order.items.length} productos</small>
                  </div>
                ))}
              </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
