import { useState, useEffect, useRef } from 'react'
import io from 'socket.io-client'
import { MapContainer, TileLayer, CircleMarker, Popup, Marker, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './App.css'

const socket = io(import.meta.env.VITE_API_URL || '/')

const EMERGENCY_TYPES = [
  { id: 'fire', label: '🔥 Incendio', emoji: '🔥' },
  { id: 'flood', label: '💧 Inundación', emoji: '💧' },
  { id: 'robbery', label: '🦹 Robo', emoji: '🦹' },
  { id: 'occupation', label: '⛔ Ocupación', emoji: '⛔' },
  { id: 'medical', label: '🚑 Urgencia Médica', emoji: '🚑' },
  { id: 'collapse', label: '🏚️ Derrumbamiento', emoji: '🏚️' },
  { id: 'explosion', label: '💥 Explosión', emoji: '💥' },
  { id: 'smoke', label: '🌫️ Humo', emoji: '🌫️' },
  { id: 'suspicious', label: '👁️ Actividad Sospechosa', emoji: '👁️' },
  { id: 'violence', label: '⚠️ Violencia', emoji: '⚠️' },
  { id: 'other', label: '📢 Otra Emergencia', emoji: '📢' }
]

const FORUM_CHANNELS = [
  { id: 'General', label: '💬 General' },
  { id: 'Eventos', label: '📅 Eventos' },
  { id: 'Compra-Venta', label: '🤝 Compra-Venta' },
  { id: 'ALERTAS', label: '🚨 ALERTAS' }
]

function MapClickHandler({ onAddHouse, user }) {
  useMapEvents({
    dblclick(e) {
      if (user.role !== 'admin') {
        alert('Solo el administrador puede añadir nuevas casas.')
        return
      }
      const number = prompt('¿Número/nombre de la casa?')
      if (number) {
        const isMine = window.confirm('¿Es esta tu casa?')
        onAddHouse({
          id: Date.now(),
          number: number,
          position: [e.latlng.lat, e.latlng.lng],
          isMine: isMine,
          owner: isMine ? user.phone : null
        })
      }
    }
  })
  return null
}

function createHouseIcon(number, isMine, sosActive, emergencyType, owner, currentUserPhone) {
  const isActualMine = isMine || (owner === currentUserPhone)
  const shouldHighlight = isActualMine && sosActive
  const emergencyEmoji = sosActive && emergencyType ?
    EMERGENCY_TYPES.find(e => e.id === emergencyType)?.emoji || '' : ''

  return L.divIcon({
    className: `house-marker ${shouldHighlight ? 'sos-active' : ''} ${isMine ? 'my-house' : ''}`,
    html: `<div class="house-label">
      ${number}
      ${emergencyEmoji ? `<span class="emergency-icon">${emergencyEmoji}</span>` : ''}
    </div>`,
    // Size: Square (e.g. 40x40). Anchor: Bottom Center (20, 50 including arrow space)
    // CSS arrow is ~10px high. So height might need to cover that.
    // L.divIcon size is for the div.
    iconSize: shouldHighlight ? [60, 60] : (isMine ? [50, 50] : [40, 40]),
    // Anchor X = width/2. Anchor Y = height + arrow(10px).
    iconAnchor: shouldHighlight ? [30, 70] : (isMine ? [25, 60] : [20, 50])
  })
}

// Auto-center map on my house
function AutoCenter({ houses }) {
  const map = useMapEvents({})

  useEffect(() => {
    const myHouse = houses.find(h => h.isMine)
    if (myHouse) {
      map.flyTo(myHouse.position, 19, { animate: true, duration: 1.5 })
    }
  }, [houses, map])

  return null
}

function AuthOverlay({ onLogin }) {
  const [isRegistering, setIsRegistering] = useState(false)
  const [formData, setFormData] = useState({
    username: '', password: '',
    name: '', surname: '', address: '', phone: '', confirmPassword: '', inviteCode: ''
  })
  const [error, setError] = useState('')

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value })

  const handleLogin = async (e) => {
    e.preventDefault()
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: formData.username, password: formData.password })
      })
      const data = await res.json()
      if (data.success) onLogin(data.user)
      else setError(data.message)
    } catch (err) { setError('Error de conexión') }
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    if (formData.password !== formData.confirmPassword) { setError('Las contraseñas no coinciden'); return; }
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })
      const data = await res.json()
      if (data.success) {
        alert('Registro exitoso'); setIsRegistering(false); setError('');
      } else {
        setError(data.message || 'Error desconocido')
      }
    } catch (err) { setError('Error de conexión') }
  }

  if (isRegistering) {
    return (
      <div className="auth-overlay">
        <div className="auth-box">
          <h2>📝 Registro</h2>
          {error && <p className="error-msg">{error}</p>}
          <form onSubmit={handleRegister}>
            <input name="name" placeholder="Nombre" onChange={handleChange} required />
            <input name="surname" placeholder="Apellidos" onChange={handleChange} required />
            <input name="address" placeholder="Dirección" onChange={handleChange} required />
            <input name="phone" placeholder="Teléfono" onChange={handleChange} required />
            <input name="password" type="password" placeholder="Contraseña" onChange={handleChange} required />
            <input name="confirmPassword" type="password" placeholder="Confirmar" onChange={handleChange} required />
            <input name="inviteCode" placeholder="Código Invitación" onChange={handleChange} required />

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginTop: '10px', fontSize: '0.9em', color: '#ccc' }}>
              <input type="checkbox" required style={{ width: '20px', marginTop: '3px' }} />
              <span>
                Autorizo que mis datos (Nombre, Dirección, Teléfono) sean visibles para otros vecinos registrados en esta aplicación con fines de seguridad vecinal. Estos datos no se usarán para ningún otro fin.
              </span>
            </div>

            <button type="submit" className="login-btn">Registrarse</button>
            <button type="button" className="link-btn" onClick={() => setIsRegistering(false)}>Volver a Login</button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-overlay">
      <div className="auth-box">
        <img src="/logo_bull.png" alt="PatrolHood Logo" className="logo-img" style={{ maxWidth: '180px' }} />
        <h2 style={{ color: '#fbbf24', fontSize: '2.5rem', margin: '10px 0' }}>PATROLHOOD</h2>
        <p style={{ textAlign: 'center', marginBottom: '30px', color: '#94a3b8', fontStyle: 'italic' }}>Seguridad Vecinal Inteligente</p>

        {error && <p className="error-msg">{error}</p>}
        <form onSubmit={handleLogin}>
          <input name="username" placeholder="Teléfono o Nombre" onChange={handleChange} required />
          <input name="password" type="password" placeholder="Contraseña" onChange={handleChange} required />
          <button type="submit" className="login-btn">Entrar</button>
          <button type="button" className="link-btn" onClick={() => setIsRegistering(true)}>Crear cuenta</button>
        </form>
      </div>
    </div>
  )
}

function Forum({ user }) {
  const [activeChannel, setActiveChannel] = useState('General')
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [imagePreview, setImagePreview] = useState(null)
  const [showRules, setShowRules] = useState(false)
  const bottomRef = useRef(null)

  // ... (useEffect for messages - same as before) ...
  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL || ''}/api/forum/${activeChannel}`)
      .then(res => res.json())
      .then(data => setMessages(data.messages))

    const handleMsg = (msg) => {
      if (msg.channel === activeChannel) {
        setMessages(prev => [...prev, msg])
      }
    }
    socket.on('forum_message', handleMsg)
    return () => socket.off('forum_message', handleMsg)
  }, [activeChannel])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleImageSelect = (e) => {
    const file = e.target.files[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setImagePreview(reader.result)
      }
      reader.readAsDataURL(file)
    }
  }

  const sendMessage = async (e) => {
    e.preventDefault()
    if (!newMessage.trim() && !imagePreview) return

    await fetch(`${import.meta.env.VITE_API_URL || ''}/api/forum`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: activeChannel,
        user: user.name,
        text: newMessage,
        image: imagePreview
      })
    })
    setNewMessage('')
    setImagePreview(null)
  }

  const RULES_TEXT = `
  1. **Respeto Mutuo**: Trata a todos los vecinos con cortesía. No se permiten insultos ni lenguaje ofensivo.
  2. **Uso Adecuado**: Este foro es exclusivamente para temas relacionados con la comunidad y la seguridad vecinal.
  3. **No Spam**: Queda prohibida la publicidad no solicitada o el envío masivo de mensajes irrelevantes.
  4. **Veracidad**: Intenta verificar la información antes de lanzar una alerta para no generar pánico innecesario.
  5. **Privacidad**: No compartas datos sensibles de otros vecinos sin su consentimiento explícito.
  `

  return (
    <div className="forum-container">
      <div className="forum-header" style={{ display: 'flex', justifyContent: 'center', padding: '10px' }}>
        <div className="forum-tabs">
          {FORUM_CHANNELS.map(ch => (
            <button
              key={ch.id}
              className={`forum-tab ${activeChannel === ch.id ? 'active' : ''}`}
              onClick={() => setActiveChannel(ch.id)}
            >
              {ch.label}
            </button>
          ))}
        </div>
      </div>

      <div className="forum-messages">
        {activeChannel === 'General' && (
          <div className="message-bubble" style={{ background: '#334155', border: '1px solid #fbbf24', color: '#e2e8f0' }}>
            <div className="msg-header">
              <span className="msg-user" style={{ color: '#fbbf24' }}>👮 Normas de la Comunidad</span>
            </div>
            <div className="msg-text" style={{ whiteSpace: 'pre-wrap', fontSize: '0.9em' }}>{RULES_TEXT}</div>
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`message-bubble ${msg.user === user.name ? 'mine' : ''} ${msg.type === 'alert' ? 'alert-msg' : ''}`}>
            <div className="msg-header">
              <span className="msg-user">{msg.user}</span>
              <span className="msg-time">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            {msg.image && <img src={msg.image} alt="adjunto" className="msg-image" style={{ maxWidth: '100%', borderRadius: '8px', marginTop: '5px' }} />}
            <div className="msg-text">{msg.text}</div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {activeChannel !== 'ALERTAS' && (
        <form className="forum-input" onSubmit={sendMessage} style={{ flexDirection: 'column' }}>
          {imagePreview && (
            <div className="img-preview" style={{ marginBottom: '5px', position: 'relative', width: 'fit-content' }}>
              <img src={imagePreview} alt="preview" style={{ height: '60px', borderRadius: '4px' }} />
              <button type="button" onClick={() => setImagePreview(null)} style={{ position: 'absolute', top: -5, right: -5, background: 'red', color: 'white', border: 'none', borderRadius: '50%', width: '20px', height: '20px', cursor: 'pointer' }}>x</button>
            </div>
          )}
          <div style={{ display: 'flex', width: '100%', gap: '10px' }}>
            <label className="attach-btn" style={{ cursor: 'pointer', fontSize: '1.5em' }}>
              📷
              <input type="file" accept="image/*" onChange={handleImageSelect} style={{ display: 'none' }} />
            </label>
            <input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder={`Escribe en ${activeChannel}...`}
              style={{ flex: 1 }}
            />
            <button type="submit">Enviar</button>
          </div>
        </form>
      )}

      {showRules && (
        <div className="modal-overlay" onClick={() => setShowRules(false)}>
          <div className="auth-box" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px', textAlign: 'left' }}>
            <h2>📜 Normas de Conducta</h2>
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>{RULES_TEXT}</div>
            <button className="login-btn" onClick={() => setShowRules(false)} style={{ marginTop: '20px' }}>Entendido</button>
          </div>
        </div>
      )}
    </div>
  )
}

function UserList({ currentUser, houses }) {
  const [users, setUsers] = useState([])
  const [editingUser, setEditingUser] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', surname: '', phone: '', address: '' })

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL || ''}/api/users`)
      .then(res => res.json())
      .then(data => {
        if (data.success) setUsers(data.users)
      })
      .catch(console.error)
  }, [])

  const startEdit = (user) => {
    setEditingUser(user)
    setEditForm({
      name: user.name,
      surname: user.surname,
      phone: user.phone || '',
      address: user.address
    })
  }

  const saveEdit = async () => {
    if (!editingUser) return

    const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/users/${editingUser.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm)
    })
    const data = await res.json()

    if (data.success) {
      // Update local list
      setUsers(prev => prev.map(u => u.id === editingUser.id ? { ...u, ...editForm } : u))
      setEditingUser(null)
    } else {
      alert('Error al actualizar')
    }
  }

  return (
    <div className="user-list-container">
      <h2>👥 Vecinos Registrados</h2>
      <div className="user-grid">
        {users.map(u => (
          <div key={u.id} className="user-card">
            <div className="user-avatar">{u.name.charAt(0).toUpperCase()}</div>
            <div className="user-info">
              <h3>{u.name} {u.surname}</h3>
              <p className="user-address">🏠 Dirección: {u.address}</p>
              <p className="user-phone">📞 Teléfono: {u.phone}</p>
              <p className="user-tag" style={{ fontSize: '0.8rem', color: '#aaa' }}>
                🏷️ Etiqueta Casa: {houses.find(h => h.owner === u.phone)?.number ? `#${houses.find(h => h.owner === u.phone).number}` : 'Sin asignar'}
              </p>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '5px' }}>
                {u.role === 'admin' && <span className="user-role-badge">Admin</span>}

                {currentUser.role === 'admin' && (
                  <button
                    onClick={() => startEdit(u)}
                    style={{ background: '#3b82f6', border: 'none', color: 'white', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8em' }}
                  >
                    ✏️ Editar
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {editingUser && (
        <div className="modal-overlay" onClick={() => setEditingUser(null)}>
          <div className="auth-box" onClick={e => e.stopPropagation()} style={{ textAlign: 'left' }}>
            <h2>✏️ Editar Vecino</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <label>Nombre:</label>
              <input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />

              <label>Apellidos:</label>
              <input value={editForm.surname} onChange={e => setEditForm({ ...editForm, surname: e.target.value })} />

              <label>Dirección (Casa #):</label>
              <input value={editForm.address} onChange={e => setEditForm({ ...editForm, address: e.target.value })} />

              <label>Teléfono:</label>
              <input value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} />
            </div>
            <div style={{ marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setEditingUser(null)} style={{ background: '#aaa', border: 'none', padding: '10px', borderRadius: '4px', cursor: 'pointer', color: 'white' }}>Cancelar</button>
              <button onClick={saveEdit} className="login-btn" style={{ width: 'auto', marginTop: 0 }}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function App() {
  const [user, setUser] = useState(null)
  const [activeTab, setActiveTab] = useState('map') // 'map' or 'forum' or 'users'

  const [showEmergencyMenu, setShowEmergencyMenu] = useState(false)
  const [sosActive, setSosActive] = useState(false)
  const [sosLocation, setSosLocation] = useState(null)
  const [activeEmergencyType, setActiveEmergencyType] = useState(null)
  const [generatedInvite, setGeneratedInvite] = useState(null)
  const [notificationsEnabled, setNotificationsEnabled] = useState(false) // Track if enabled
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [houses, setHouses] = useState([])

  // Register SW and Logic
  const publicVapidKey = 'BNWjTbapEtyTDCywiM1Qk_kiwRx_DmVrDdt0nwi10bVKYlEXOll-hDyexDEffLu1ejd8Spm_E4CLiAfSE3YcaDA';

  async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const register = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        console.log('Service Worker Registered');
        return register;
      } catch (err) {
        console.error(err);
      }
    }
  }

  async function subscribeToPush() {
    if (!('serviceWorker' in navigator)) return;
    const register = await navigator.serviceWorker.ready; // Wait for it to be ready

    try {
      const subscription = await register.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicVapidKey)
      });

      await fetch(`${import.meta.env.VITE_API_URL || ''}/api/subscribe`, {
        method: 'POST',
        body: JSON.stringify(subscription),
        headers: { 'Content-Type': 'application/json' }
      });
      alert('✅ Notificaciones Activadas en este dispositivo');
      setNotificationsEnabled(true);
    } catch (err) {
      console.error('Failed to subscribe', err);
      alert('Error activando notificaciones. Asegúrate de permitirlas en el navegador.');
    }
  }

  // Helper helper
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  useEffect(() => {
    registerServiceWorker();

    // Fetch houses from server
    fetch(`${import.meta.env.VITE_API_URL || ''}/api/houses`)
      .then(res => res.json())
      .then(data => {
        if (data.success) setHouses(data.houses)
      })

    // Sockets for live updates
    socket.on('house_updated', (newHouse) => {
      setHouses(prev => {
        const index = prev.findIndex(h => h.id === newHouse.id)
        if (index !== -1) {
          const updated = [...prev]
          updated[index] = newHouse
          return updated
        }
        return [...prev, newHouse]
      })
    })

    socket.on('houses_cleared', () => {
      setHouses([])
    })

    socket.on('house_deleted', (id) => {
      setHouses(prev => prev.filter(h => h.id != id))
    })

    return () => {
      socket.off('house_updated')
      socket.off('houses_cleared')
      socket.off('house_deleted')
    }
  }, [])

  // ... rest of effects ...

  // --- SIREN SOUND LOGIC (Web Audio API) ---
  const audioCtxRef = useRef(null)
  const oscillatorRef = useRef(null)
  const gainNodeRef = useRef(null)

  const startSiren = () => {
    if (audioCtxRef.current) return // Already playing

    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext) return

    const ctx = new AudioContext()
    audioCtxRef.current = ctx

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(600, ctx.currentTime)

    // Siren modulation (Make it go wee-woo-wee-woo)
    // We'll use a second oscillator (LFO) to modulate the frequency of the first one
    const lfo = ctx.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.value = 2 // 2Hz = 2 cycles per second (speed of siren)

    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 200 // Range of frequency change (+/- 200Hz)

    lfo.connect(lfoGain)
    lfoGain.connect(osc.frequency)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start()
    lfo.start()

    oscillatorRef.current = { osc, lfo }
    gainNodeRef.current = gain
  }

  const stopSiren = () => {
    if (oscillatorRef.current) {
      try {
        oscillatorRef.current.osc.stop()
        oscillatorRef.current.lfo.stop()
      } catch (e) { /* ignore */ }
      oscillatorRef.current = null
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close()
      audioCtxRef.current = null
    }
  }

  useEffect(() => {
    socket.on('emergency_alert', (data) => {
      setSosActive(true)
      setActiveEmergencyType(data.emergencyType)
      if (data.location) setSosLocation([data.location.lat, data.location.lng])
      // startSiren() // Siren sound disabled per user request
    })

    socket.on('stop_alert', () => {
      setSosActive(false)
      setSosLocation(null)
      setActiveEmergencyType(null)
      // stopSiren() // Siren sound disabled per user request
    })

    return () => stopSiren() // Still stop if playing (legacy) or on cleanup
  }, [])

  const triggerSOS = (type) => {
    const myHouse = houses.find(h => h.isMine)
    if (!myHouse) { alert('Marca tu casa primero'); return; }

    const info = EMERGENCY_TYPES.find(e => e.id === type)
    socket.emit('emergency_alert', {
      emergencyType: type,
      emergencyTypeLabel: info.label,
      emergencyEmoji: info.emoji,
      userName: user.name,
      houseNumber: myHouse.number,
      message: `${info.emoji} ${info.label} en casa de ${user.name} (#${myHouse.number})`,
      location: { lat: myHouse.position[0], lng: myHouse.position[1] }
    })
    setShowEmergencyMenu(false)
    // REMOVED: setActiveTab('forum') -> Now stays on map
  }

  const generateInvite = async () => {
    const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/admin/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'user' })
    })
    const data = await res.json()
    setGeneratedInvite(data.code)
  }

  const onAddHouse = async (houseData) => {
    const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/houses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(houseData)
    })
    const data = await res.json()
    if (data.success) {
      if (houseData.owner === user.phone) {
        setUser(prev => ({ ...prev, houseNumber: houseData.number }))
      }
    }
  }

  const clearHouses = async () => {
    if (!window.confirm('¿Estás seguro de que quieres borrar TODAS las etiquetas?')) return
    await fetch(`${import.meta.env.VITE_API_URL || ''}/api/houses/clear`, { method: 'POST' })
  }

  const onDeleteHouse = async (id) => {
    if (!window.confirm('¿Borrar esta etiqueta?')) return
    await fetch(`${import.meta.env.VITE_API_URL || ''}/api/houses/${id}`, { method: 'DELETE' })
  }

  if (!user) return <AuthOverlay onLogin={setUser} />

  return (
    <div className="app">
      <button className="mobile-menu-toggle" onClick={() => setIsSidebarOpen(true)}>
        ☰
      </button>

      {isSidebarOpen && <div className="sidebar-overlay active" onClick={() => setIsSidebarOpen(false)}></div>}

      <div className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <button className="close-sidebar-btn" onClick={() => setIsSidebarOpen(false)}>✕</button>
        <h1 style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <img src="/logo_bull.png" alt="Logo" style={{ height: '100px', width: 'auto' }} className="logo-img" />
            <span>Hola {user.name}</span>
          </div>
          <span style={{ fontSize: '0.4em', color: '#94a3b8', fontFamily: 'Roboto', fontWeight: 'normal', letterSpacing: '0' }}>Bienvenido a</span>
          <span style={{ fontSize: '1.2em', color: '#fbbf24', textShadow: '2px 2px 4px rgba(0,0,0,0.5)' }}>PATROLHOOD</span>
        </h1>
        {user.role === 'admin' && <span className="admin-badge">Admin</span>}

        <div className="nav-tabs">
          <button className={`nav-btn ${activeTab === 'map' ? 'active' : ''}`} onClick={() => { setActiveTab('map'); setIsSidebarOpen(false); }}>🗺️ Mapa</button>
          <button className={`nav-btn ${activeTab === 'forum' ? 'active' : ''}`} onClick={() => { setActiveTab('forum'); setIsSidebarOpen(false); }}>💬 Foro</button>
          <button className={`nav-btn ${activeTab === 'users' ? 'active' : ''}`} onClick={() => { setActiveTab('users'); setIsSidebarOpen(false); }}>👥 Vecinos</button>
        </div>

        {activeTab === 'map' && (
          <>
            {user.role === 'admin' && (
              <div className="admin-section" style={{ marginTop: '15px' }}>
                <button onClick={generateInvite} className="invite-btn">Generar Invitación</button>
                {generatedInvite && <div className="invite-code">{generatedInvite}</div>}
              </div>
            )}
          </>
        )}

        {activeTab === 'forum' && (
          <div className="forum-sidebar-info">
            <p>Selecciona una sala para chatear con tus vecinos.</p>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="forum-sidebar-info">
            <p>Listado oficial de vecinos registrados.</p>
          </div>
        )}

        <button className="notification-btn" onClick={subscribeToPush}>
          🔔 Activar Notificaciones
        </button>

        <button className="logout-btn" onClick={() => setUser(null)}>Salir</button>
      </div>

      {activeTab === 'map' && (
        <div className="floating-controls">
          {!sosActive ? (
            <button className="sos-button floating" onClick={() => setShowEmergencyMenu(true)}>SOS</button>
          ) : (
            <button className="stop-button floating" onClick={() => socket.emit('stop_alert')}>🔕 PARAR</button>
          )}
        </div>
      )}

      <div className="main-content">
        {activeTab === 'map' ? (
          <div className="map-container">
            <MapContainer center={[40.4168, -3.7038]} zoom={18} zoomControl={false} style={{ height: '100%', width: '100%', background: '#222' }}>
              <TileLayer
                url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
                attribution='&copy; Google'
                maxZoom={22}
              />
              <AutoCenter houses={houses} />
              <MapClickHandler onAddHouse={onAddHouse} user={user} />
              {houses.map(h => {
                // Find owner info if available (simulated join)
                // In a real app we would join with users list
                const ownerName = h.owner || (h.isMine ? user.name : 'Vecino');
                const isUserAdmin = user.role === 'admin';
                const isSos = sosActive && activeEmergencyType;

                return (
                  <Marker
                    key={h.id}
                    position={h.position}
                    icon={createHouseIcon(h.number, h.isMine, isSos, h.emergencyType, h.owner, user.phone)}
                  >
                    <Popup className="house-popup">
                      <div className="popup-content">
                        <strong>🏠 Casa #{h.number}</strong>
                        <p>👤 {ownerName}</p>
                        {activeEmergencyType && sosActive && h.isMine && (
                          <div className="popup-alert">🚨 ¡EMERGENCIA ACTIVA!</div>
                        )}

                        {/* Only Admin can delete houses */}
                        {isUserAdmin && (
                          <button
                            onClick={() => onDeleteHouse(h.id)}
                            style={{ marginTop: '5px', background: '#ef4444', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer' }}
                          >
                            🗑️ Borrar (Admin)
                          </button>
                        )}

                        {/* Users can still mark "Mine" if we keep that feature, or is that strictly admin too?
                            User asked: "users cannot make modifications". I'll hide "Set Mine" too if strict.
                            But user needs to identify their house for SOS.
                            Let's assume "Modifications" means structural changes (adding/removing markers).
                            Identifying one's own house is separate.
                            But for now, I'll follow the instruction "only admin". If user can't pick house, they can't launch SOS correctly?
                            Wait, user said "only admin... Jose Zamora".
                            If users cannot pick their house, how does the app know which house is theirs for SOS?
                            The user registration has "Address". Maybe we should AUTO-LINK?
                            YES. Ideally, we link `user.address` (from DB) to `house.number` (on Map).
                        */}
                      </div>
                    </Popup>
                  </Marker>
                )
              })}
              {sosLocation && sosActive && <CircleMarker center={sosLocation} radius={50} pathOptions={{ color: 'red', fillColor: 'red' }} className="sos-marker" />}
            </MapContainer>
          </div>
        ) : activeTab === 'forum' ? (
          <Forum user={user} />
        ) : (
          <UserList currentUser={user} houses={houses} />
        )}
      </div>

      {showEmergencyMenu && (
        <div className="modal-overlay" onClick={() => setShowEmergencyMenu(false)}>
          <div className="emergency-menu" onClick={e => e.stopPropagation()}>
            <h2>EMERGENCIA</h2>
            <div className="emergency-grid">
              {EMERGENCY_TYPES.map(e => (
                <button key={e.id} className="emergency-option" onClick={() => triggerSOS(e.id)}>
                  <span className="emergency-emoji">{e.emoji}</span>
                  <span>{e.label}</span>
                </button>
              ))}
            </div>
            <button className="cancel-btn" onClick={() => setShowEmergencyMenu(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
