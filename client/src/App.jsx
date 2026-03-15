import { useState, useEffect, useRef } from 'react'
import AdminDashboard from './AdminDashboard'
import SuperAdminDashboard from './SuperAdminDashboard'
import io from 'socket.io-client'
import { MapContainer, TileLayer, CircleMarker, Popup, Marker, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './App.css'
import { db, addPendingSOS, getPendingSOS, markSOSAsSent, getPendingCount } from './db'
import { safeFetch } from './api'
import { PushNotifications } from '@capacitor/push-notifications'
import { Device } from '@capacitor/device'

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
  { id: 'lost_pet', label: '🐾 Mascota Perdida', emoji: '🐾', isPetAlert: true },
  { id: 'other', label: '📢 Otra Emergencia', emoji: '📢' }
]

const FORUM_CHANNELS = [
  { id: 'General', label: '💬 General' },
  { id: 'Eventos', label: '📅 Eventos' },
  { id: 'Compra-Venta', label: '🤝 Compra-Venta' },
  { id: 'ALERTAS', label: '🚨 ALERTAS' }
]

// Zoom Effect on Alert
function AlertZoom({ sosActive, sosLocation }) {
  const map = useMapEvents({})
  useEffect(() => {
    if (sosActive && sosLocation) {
      map.flyTo(sosLocation, 19, { animate: true, duration: 2.0 })
    }
  }, [sosActive, JSON.stringify(sosLocation), map])
  return null
}

function MapFocusController({ focusLocation }) {
  const map = useMapEvents({})
  useEffect(() => {
    if (focusLocation) {
      map.flyTo(focusLocation, 19, { animate: true, duration: 2.0 })
    }
  }, [focusLocation, map])
  return null
}

function MapClickHandler({ onAddHouse, user }) {
  useMapEvents({
    dblclick(e) {
      console.log('🗺️ Double click detected at:', e.latlng)
      if (!user || (user.role !== 'admin' && user.role !== 'global_admin')) {
        console.warn('❌ dblclick: user is not admin or missing', user)
        alert('Solo el administrador puede añadir nuevas casas.')
        return
      }
      const number = prompt('¿Número/nombre de la casa?')
      if (number) {
        onAddHouse({
          id: String(Date.now()),
          number: number,
          position: [e.latlng.lat, e.latlng.lng],
          owner: null
        })
      }
    }
  })
  return null
}

function createHouseIcon(labelText, status, emergencyType) {
  // Status priority: 'sos' > 'mine' > 'inhabited' > 'empty'
  let className = 'house-marker'
  if (status === 'sos') {
    if (emergencyType === 'lost_pet') className += ' pet-alert'
    else className += ' sos-active'
  }
  else if (status === 'mine') className += ' my-house'
  else if (status === 'inhabited' || status === 'admin') className += ' inhabited'

  const emergencyEmoji = status === 'sos' && emergencyType ?
    EMERGENCY_TYPES.find(e => e.id === emergencyType)?.emoji || '' : ''

  // For pet alerts we use a different visual
  const markerIcon = (status === 'sos' && emergencyType === 'lost_pet') ? '⚠️' : (emergencyEmoji || '')

  return L.divIcon({
    className: className,
    html: `<div class="house-label">
      ${labelText}
      ${markerIcon ? `<span class="emergency-icon">${markerIcon}</span>` : ''}
    </div>`,
    iconSize: status === 'sos' ? [60, 60] : (status === 'mine' || status === 'inhabited' || status === 'admin' ? [50, 50] : [40, 40]),
    iconAnchor: status === 'sos' ? [30, 30] : (status === 'mine' || status === 'inhabited' || status === 'admin' ? [25, 25] : [20, 20])
  })
}

// Auto-center map (Priority: My House > Community Default > Global Default)
function AutoCenter({ houses, userMapLabel, communityCenter, user }) {
  const map = useMapEvents({})
  const hasCentered = useRef(false)

  useEffect(() => {
    if (hasCentered.current) return

    // 1. Try to center on my specific house
    const myHouse = houses.find(h => h.number === userMapLabel)
    if (myHouse) {
      map.flyTo(myHouse.position, 19, { animate: true, duration: 1.5 })
      hasCentered.current = true
      return
    }

    // 2. Otherwise center on community default center
    if (communityCenter && communityCenter[0] !== 40.4168) {
      map.setView(communityCenter, 18)
      hasCentered.current = true
    } else if (user?.role === 'global_admin') {
      // 3. For global admin with no community selected, show Iberia
      map.setView([40.4168, -3.7038], 6)
      hasCentered.current = true
    }
  }, [houses, map, userMapLabel, communityCenter, user?.role])

  return null
}

function AuthOverlay({ onLogin, deletedMsg }) {
  const [isRegistering, setIsRegistering] = useState(false)
  const [formData, setFormData] = useState({
    username: '', password: '',
    name: '', surname: '', address: '', phone: '', email: '', confirmPassword: '', inviteCode: '',
    communityName: '', role: 'user', telegramBotToken: '' // Default to member
  })
  const [error, setError] = useState('')
  const [showLegal, setShowLegal] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)

  const [loading, setLoading] = useState(false)

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value })

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const data = await safeFetch(`${import.meta.env.VITE_API_URL || ''}/api/login`, {
      method: 'POST',
      body: JSON.stringify({ username: formData.username, password: formData.password })
    })

    if (data.success) {
      localStorage.setItem('user', JSON.stringify(data.user))
      localStorage.setItem('token', data.token)
      onLogin(data.user)
    } else {
      setError(data.error || 'Error al iniciar sesión.')
    }
    setLoading(false)
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    if (!acceptedTerms) { setError('Debes aceptar los términos y condiciones para registrarte'); return; }
    if (formData.password !== formData.confirmPassword) { setError('Las contraseñas no coinciden'); return; }
    const data = await safeFetch(`${import.meta.env.VITE_API_URL || ''}/api/register`, {
      method: 'POST',
      body: JSON.stringify(formData)
    })
    if (data.success) {
      alert('Registro exitoso'); setIsRegistering(false); setError('');
    } else {
      setError(data.error || 'Error desconocido')
    }
  }

  if (isRegistering) {
    return (
      <div className="auth-overlay">
        <div className="auth-box" style={{ maxWidth: '450px', position: 'relative' }}>
          <button
            onClick={() => setIsRegistering(false)}
            style={{
              position: 'absolute', top: '15px', right: '15px',
              background: 'none', border: 'none', color: '#94a3b8',
              fontSize: '1.5rem', cursor: 'pointer', lineHeight: '1'
            }}
          >
            ✕
          </button>
          <div className="premium-header">
            <span className="welcome-label" style={{ marginBottom: '5px' }}>SOLICITUD DE</span>
            <h2 className="user-display-name" style={{ fontSize: '2rem', marginBottom: '5px' }}>REGISTRO</h2>
            <div className="premium-divider"></div>
          </div>
          {error && <p className="error-msg">{error}</p>}

          <div className="role-selector" style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            <button
              type="button"
              className={`tab-btn ${formData.role === 'admin' ? 'active' : ''}`}
              onClick={() => setFormData({ ...formData, role: 'admin' })}
              style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #fbbf24', background: formData.role === 'admin' ? '#fbbf24' : 'transparent', color: formData.role === 'admin' ? '#000' : '#fbbf24', cursor: 'pointer' }}
            >
              👑 Ser Admin
            </button>
            <button
              type="button"
              className={`tab-btn ${formData.role === 'user' ? 'active' : ''}`}
              onClick={() => setFormData({ ...formData, role: 'user' })}
              style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #fbbf24', background: formData.role === 'user' ? '#fbbf24' : 'transparent', color: formData.role === 'user' ? '#000' : '#fbbf24', cursor: 'pointer' }}
            >
              🏠 Ser Miembro
            </button>
          </div>

          <form onSubmit={handleRegister}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <input name="name" placeholder="Nombre" onChange={handleChange} required />
              <input name="surname" placeholder="Apellidos" onChange={handleChange} required />
            </div>
            <input name="email" type="email" placeholder="Email" onChange={handleChange} required />
            <input name="phone" placeholder="Teléfono" onChange={handleChange} required />
            <input name="address" placeholder="Dirección Personal" onChange={handleChange} required />

            <div style={{ padding: '10px', background: '#1e293b', borderRadius: '8px', margin: '5px 0' }}>
              <label style={{ color: '#fbbf24', fontSize: '0.85em', fontWeight: 'bold' }}>🏙️ COMUNIDAD VECINAL</label>
              <input name="communityName" placeholder="Nombre de tu barrio/comunidad" onChange={handleChange} required style={{ marginTop: '5px' }} />
            </div>

            {formData.role === 'user' && (
              <input name="inviteCode" placeholder="Código de Invitación" onChange={handleChange} required />
            )}

            {formData.role === 'admin' && (
              <div style={{ marginBottom: '10px' }}>
                <input
                  name="telegramBotToken"
                  placeholder="🤖 Token de Bot Telegram (Opcional)"
                  onChange={handleChange}
                  style={{ background: '#1e293b' }}
                />
                <small style={{ color: '#888', display: 'block', fontSize: '0.7em', marginTop: '4px' }}>
                  Pega aquí el token de @BotFather si quieres un bot propio para tu barrio.
                </small>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <input name="password" type="password" placeholder="Contraseña" onChange={handleChange} required />
              <input name="confirmPassword" type="password" placeholder="Confirmar" onChange={handleChange} required />
            </div>

            <div style={{ padding: '10px', background: 'rgba(251, 191, 36, 0.05)', borderRadius: '8px', marginTop: '15px', border: '1px solid rgba(251, 191, 36, 0.2)', maxWidth: 'fit-content' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '0.85em', color: '#cbd5e1' }}>
                <input
                  type="checkbox"
                  id="terms"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  style={{ width: '18px', height: '18px', marginTop: '2px', cursor: 'pointer', flexShrink: 0 }}
                />
                <label htmlFor="terms" style={{ cursor: 'pointer', lineHeight: '1.4' }}>
                  He leído y acepto los <button type="button" onClick={() => setShowLegal(true)} style={{ background: 'none', border: 'none', color: '#fbbf24', textDecoration: 'underline', padding: 0, cursor: 'pointer', fontSize: 'inherit', fontWeight: 'bold' }}>Términos y Condiciones y Política de Privacidad</button>
                </label>
              </div>
            </div>

            {showLegal && (
              <div className="legal-modal-overlay" onClick={() => setShowLegal(false)}>
                <div className="legal-modal-content" onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px' }}>
                    <h3 style={{ margin: 0, color: '#fbbf24' }}>📜 Términos y Condiciones</h3>
                    <button onClick={() => setShowLegal(false)} style={{ background: 'none', border: 'none', color: 'white', fontSize: '1.5rem', cursor: 'pointer' }}>✕</button>
                  </div>
                  <div className="legal-text-scroll">
                    <h4>1. Naturaleza y Limitación del Servicio (LSSI-CE)</h4>
                    <p>De conformidad con la Ley 34/2002 (LSSI-CE), PatrolHood es una plataforma técnica de intermediación social. **USTED RECONOCE QUE ESTA APP NO ES UN SERVICIO DE EMERGENCIA HOMOLOGADO**. El uso de la aplicación no exime de la obligación de contactar con el **112, Policía o Bomberos** a través de sus canales oficiales. Los administradores y desarrolladores no son responsables de la seguridad ciudadana ni de la coordinación de auxilio.</p>

                    <h4>2. Protección de Datos y Privacidad (RGPD y LOPDGDD)</h4>
                    <p>En cumplimiento del Reglamento (UE) 2016/679 (RGPD) y la LO 3/2018 (LOPDGDD):</p>
                    <ul style={{ paddingLeft: '15px', color: '#cbd5e1', fontSize: '0.9em' }}>
                      <li><strong>Responsable:</strong> El Administrador de su comunidad es el Corresponsable del Tratamiento de los datos de su círculo vecinal.</li>
                      <li><strong>Legitimación (Art. 6.1.a):</strong> Consentimiento explícito del interesado al marcar la casilla de aceptación.</li>
                      <li><strong>Finalidad:</strong> Gestión de alertas de seguridad vecinal y comunicación interna.</li>
                      <li><strong>Derechos (Arts. 15-22):</strong> Usted tiene derecho de acceso, rectificación, supresión ("derecho al olvido"), limitación y portabilidad. Puede ejercerlo eliminando su cuenta desde el perfil o contactando con su administrador.</li>
                    </ul>

                    <h4>3. Exención de Responsabilidad Técnica y Civil</h4>
                    <p>Al amparo del Art. 1101 del Código Civil, los prestadores del servicio no responderán por daños y perjuicios derivados de: (a) Fallos de red, latencia en notificaciones push o indisponibilidad del servidor; (b) Acciones u omisiones de los vecinos ante una alerta; (c) Falta de veracidad en el contenido publicado por usuarios. La app se entrega como una herramienta para los vecinos de una comunidad, sin garantía implícita de intervención externa por parte de ellos.</p>

                    <h4>4. Naturaleza y Uso del Sistema SOS</h4>
                    <p>El botón SOS no está conectado a ninguna central de servicios de emergencias públicas. Por ello su uso estará supeditado a la real necesidad de aquel que lo active. Toda activación quedará registrada en un historial de logs de auditoría al que tendrá acceso el administrador de la comunidad en la plataforma y quien regulará y tomará las decisiones pertinentes en caso de emisiones de falsas alarmas mal intencionadas.</p>

                    <h4>5. Retención de Datos y Derecho al Olvido (Art. 5.1.e RGPD)</h4>
                    <p style={{ background: 'rgba(251,191,36,0.08)', padding: '8px', borderRadius: '6px', borderLeft: '3px solid #fbbf24' }}>
                      ⏱️ **Conservación Limitada:** Los mensajes y multimedia se eliminan de forma irreversible a los **30 días** para minimizar riesgos de privacidad. Las alertas SOS se conservan 30 días para trazabilidad de seguridad. Al eliminar su cuenta, sus datos identificativos son borrados de inmediato de los servidores activos.
                    </p>

                    <h4>6. Localización Estática y Privacidad</h4>
                    <p>La plataforma procesa y visualiza la geolocalización estática del inmueble o punto de interés que el usuario proporciona durante el registro. Dicha información se utiliza con el fin legítimo de facilitar el auxilio por parte de la comunidad (Art. 6.1.d RGPD - Interés vital) de forma voluntaria, siempre que el incidente ocurra dentro del entorno de la propia comunidad. **No existe posibilidad de seguimiento en tiempo real ni monitorización dinámica de su dispositivo.** Lo que se muestra es una etiqueta fijada en un mapa del lugar que usted indica y del que se presupone su titularidad o interés legítimo.</p>

                    <p style={{ marginTop: '20px', fontSize: '0.9em', color: '#94a3b8' }}>* Al marcar la casilla de aceptación, confirmas que has leído y comprendido estos términos en su totalidad.</p>
                  </div>
                  <button onClick={() => { setAcceptedTerms(true); setShowLegal(false); }} className="login-btn" style={{ marginTop: '20px' }}>Entendido y Aceptar</button>
                </div>
              </div>
            )}

            <button type="submit" className="login-btn" disabled={!acceptedTerms} style={{ opacity: acceptedTerms ? 1 : 0.5, cursor: acceptedTerms ? 'pointer' : 'not-allowed' }}>
              {formData.role === 'admin' ? 'Crear Comunidad' : 'Unirse a Comunidad'}
            </button>
            <button type="button" className="link-btn" onClick={() => setIsRegistering(false)}>Volver a Login</button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-overlay">
      <div className="auth-box">
        <img src="/logo_bull.png" alt="PatrolHood Logo" className="logo-img" style={{ maxWidth: '160px', marginBottom: '10px' }} />

        <div className="premium-header">
          <span className="welcome-label">BIENVENIDO</span>
          <h1 className="brand-label" style={{ fontSize: '2.5rem', margin: '0 0 5px 0', background: 'var(--gold-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>PATROLHOOD</h1>
          <p style={{ textAlign: 'center', marginBottom: '10px', color: '#94a3b8', fontStyle: 'italic', fontFamily: 'Lora, serif' }}>Seguridad Vecinal Inteligente</p>
          <div className="premium-divider"></div>
        </div>

        {deletedMsg && <div className="error-msg" style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', border: '1px solid #ef4444', marginBottom: '20px', padding: '10px', borderRadius: '8px' }}>⚠️ Usuario eliminado definitivamente</div>}
        {error && <p className="error-msg">{error}</p>}
        <form onSubmit={handleLogin}>
          <input name="username" placeholder="Teléfono o Nombre" onChange={handleChange} required />
          <input name="password" type="password" placeholder="Contraseña" onChange={handleChange} required />
          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
          <button type="button" className="link-btn" onClick={() => setIsRegistering(true)}>Crear cuenta</button>
        </form>
      </div>
    </div>
  )
}

function Forum({ user, allCommunities, onSwitchCommunity }) {
  const [activeChannel, setActiveChannel] = useState('General')
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [imagePreview, setImagePreview] = useState(null)
  const [showRules, setShowRules] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true)
  const bottomRef = useRef(null)

  // Fetch forum messages for current channel and community
  useEffect(() => {
    if (!user?.communityId) return;
    setMessages([])
    setHasMore(true)
    setShouldAutoScroll(true)
    const communityParam = `?communityId=${user.communityId}`
    safeFetch(`${import.meta.env.VITE_API_URL || ''}/api/forum/${activeChannel}${communityParam}`)
      .then(data => {
        if (data.success && data.messages) {
          setMessages(data.messages)
          if (data.messages.length < 30) setHasMore(false)
        }
      })
      .catch(err => console.error('Forum fetch error:', err))

    const handleMsg = (msg) => {
      if (msg.channel === activeChannel) {
        setShouldAutoScroll(true)
        setMessages(prev => [...prev, msg])
      }
    }
    const handleDelete = (msgId) => {
      setMessages(prev => prev.filter(m => m._id !== msgId && m.id !== msgId))
    }
    socket.on('forum_message', handleMsg)
    socket.on('forum_message_deleted', handleDelete)
    return () => {
      socket.off('forum_message', handleMsg)
      socket.off('forum_message_deleted', handleDelete)
    }
  }, [activeChannel, user?.communityId])

  useEffect(() => {
    if (shouldAutoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, shouldAutoScroll])

  const loadMoreMessages = async () => {
    if (!messages.length || isLoadingMore || !hasMore) return
    setIsLoadingMore(true)
    setShouldAutoScroll(false)
    const oldestTimestamp = messages[0].timestamp
    const communityParam = user?.communityId ? `communityId=${user.communityId}&` : ''
    try {
      const data = await safeFetch(`${import.meta.env.VITE_API_URL || ''}/api/forum/${activeChannel}?${communityParam}before=${oldestTimestamp}`)
      if (data.success && data.messages) {
        if (data.messages.length < 30) setHasMore(false)
        setMessages(prev => [...data.messages, ...prev])
      }
    } catch (e) {
      console.error(e)
    }
    setIsLoadingMore(false)
  }

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

    await safeFetch(`${import.meta.env.VITE_API_URL || ''}/api/forum`, {
      method: 'POST',
      body: JSON.stringify({
        channel: activeChannel,
        communityId: user.communityId,
        communityName: user.communityName,
        user: user.name,
        text: newMessage,
        image: imagePreview
      })
    })
    setNewMessage('')
    setImagePreview(null)
  }

  const deleteMessage = async (msgId) => {
    if (!window.confirm('¿Borrar este mensaje para todos?')) return;
    await safeFetch(`${import.meta.env.VITE_API_URL || ''}/api/forum/${msgId}?communityId=${user.communityId}`, {
      method: 'DELETE'
    });
  }

  const reportMessage = async (msgId) => {
    if (!window.confirm('¿Reportar este mensaje por contenido inapropiado?')) return;
    const data = await safeFetch(`${import.meta.env.VITE_API_URL || ''}/api/forum/${msgId}/report`, {
      method: 'POST',
      body: JSON.stringify({ communityId: user.communityId })
    });
    if (data.success) {
      alert('Mensaje reportado. Gracias por tu colaboración.');
    }
  }

  const RULES_TEXT = `
  1. **Respeto Mutuo**: Trata a todos los vecinos con cortesía. No se permiten insultos ni lenguaje ofensivo.
  2. **Uso Adecuado**: Este foro es exclusivamente para temas relacionados con la comunidad y la seguridad vecinal.
  3. **No Spam**: Queda prohibida la publicidad no solicitada o el envío masivo de mensajes irrelevantes.
  4. **Veracidad**: Intenta verificar la información antes de lanzar una alerta para no generar pánico innecesario.
  5. **Privacidad**: No compartas datos sensibles de otros vecinos sin su consentimiento explícito.
  6. **Limpieza Automática**: Los mensajes y archivos multimedia del foro se eliminan automáticamente a los **30 días** por privacidad y optimización.
  `

  return (
    <div className="forum-container">
      <div className="forum-header" style={{ flexDirection: 'column', gap: '15px' }}>
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
        {user.role === 'global_admin' && allCommunities && allCommunities.length > 0 && (
          <select 
            value={user.communityId} 
            onChange={(e) => {
              const comm = allCommunities.find(c => c.id === e.target.value);
              if (comm) onSwitchCommunity(comm.id, comm.name, comm.center);
            }}
            style={{ width: '100%', background: '#0f172a', color: 'white', border: '1px solid #334155', borderRadius: '8px', padding: '10px', fontSize: '0.9em', outline: 'none' }}
          >
            {allCommunities.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
      </div>

      <div className="forum-messages">
        {hasMore && messages.length > 0 && (
          <button
            onClick={loadMoreMessages}
            disabled={isLoadingMore}
            style={{ width: '100%', padding: '10px', background: 'transparent', border: 'none', color: '#fbbf24', cursor: 'pointer', textDecoration: 'underline' }}
          >
            {isLoadingMore ? 'Cargando...' : 'Cargar mensajes antiguos'}
          </button>
        )}
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
            {msg.text && <div className="msg-text">{msg.text}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
              {(user.role === 'admin' || user.role === 'moderator' || user.role === 'global_admin') && (
                <button
                  onClick={() => deleteMessage(msg._id || msg.id)}
                  style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.75em', opacity: 0.7 }}
                >
                  🗑️ Borrar
                </button>
              )}
              {msg.user !== user.name && (
                <button
                  onClick={() => reportMessage(msg._id || msg.id)}
                  style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.75em' }}
                >
                  🚩 Reportar
                </button>
              )}
              {msg.reports && msg.reports.length > 0 && (user.role === 'admin' || user.role === 'moderator' || user.role === 'global_admin') && (
                <span style={{ fontSize: '0.7em', color: '#f59e0b', fontWeight: 'bold' }}>
                  ⚠️ {msg.reports.length} reportes
                </span>
              )}
            </div>
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

function UserList({ currentUser, houses, users, setUsers, onViewOnMap }) {
  // users state is now passed from parent
  const [editingUser, setEditingUser] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', surname: '', phone: '', address: '', houseNumber: '' })

  const startEdit = (user) => {
    setEditingUser(user)
    // Find current assigned house based on mapLabel (preferred) or owner phone (legacy)
    const assignedHouse = houses.find(h => h.number === user.mapLabel || h.owner === user.phone)
    setEditForm({
      name: user.name,
      surname: user.surname,
      phone: user.phone || '',
      address: user.address,
      houseNumber: user.mapLabel || (assignedHouse ? assignedHouse.number : '')
    })
  }

  const saveEdit = async () => {
    if (!editingUser) return

    const data = await safeFetch(`${import.meta.env.VITE_API_URL || ''}/api/users/${editingUser.id}`, {
      method: 'PUT',
      body: JSON.stringify({ ...editForm, communityId: currentUser.communityId })
    })

    if (data.success) {
      // Update local list
      setUsers(prev => prev.map(u => u.id === editingUser.id ? { ...u, ...editForm } : u))
      setEditingUser(null)
    } else {
      alert('Error al actualizar')
    }
  }

  const deleteUser = async (userToDelete) => {
    if (!window.confirm(`¿Estás seguro de que quieres eliminar a ${userToDelete.name} ${userToDelete.surname}? Esta acción no se puede deshacer.`)) {
      return
    }

    const data = await safeFetch(`${import.meta.env.VITE_API_URL || ''}/api/users/${userToDelete.id}?communityId=${currentUser.communityId}`, {
      method: 'DELETE'
    })

    if (data.success) {
      setUsers(prev => prev.filter(u => u.id !== userToDelete.id))
    } else {
      alert(data.error || 'Error al eliminar usuario')
    }
  }

  return (
    <div className="user-list-container">
      <div className="section-header">
        <h2 style={{ color: '#fbbf24', margin: 0, fontFamily: 'Cinzel, serif', letterSpacing: '1px' }}>👥 VECINOS REGISTRADOS</h2>
      </div>
      <div className="user-grid-scroll">
        <div className="user-grid">
          {users.map(u => (
            <div key={u.id} className="user-card">
              <div className="user-avatar">{u.name.charAt(0).toUpperCase()}</div>
              <div className="user-info">
                <h3>{u.name} {u.surname}</h3>
                <p className="user-address">🏠 Dirección: {u.address}</p>
                <p className="user-phone" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  📞 Teléfono: {
                    (u.publicPhone || currentUser.role === 'admin' || u.id === currentUser.id)
                      ? u.phone
                      : (u.phone ? `${u.phone.substring(0, 3)} *** ***` : 'N/A')
                  }
                </p>
                <p className="user-tag" style={{ fontSize: '0.8rem', color: '#aaa' }}>
                  🏷️ Etiqueta Casa: {u.mapLabel ? `#${u.mapLabel}` : 'Sin asignar'}
                </p>
                {u.mapLabel && (
                  <button
                    onClick={() => onViewOnMap(u.mapLabel)}
                    style={{
                      background: 'none', border: 'none', color: '#3b82f6',
                      cursor: 'pointer', fontSize: '0.85em', textDecoration: 'underline',
                      marginTop: '2px', padding: 0
                    }}
                  >
                    📍 Ver en el mapa
                  </button>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '5px' }}>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {u.role === 'admin' && <span className="user-role-badge">Admin</span>}
                    {u.role === 'moderator' && <span className="user-role-badge" style={{ background: '#3b82f6' }}>Moderador</span>}
                  </div>

                  {currentUser.role === 'admin' && (
                    <div style={{ display: 'flex', gap: '5px' }}>
                      <button
                        onClick={() => startEdit(u)}
                        style={{ background: '#3b82f6', border: 'none', color: 'white', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8em' }}
                      >
                        ✏️ Editar
                      </button>
                      {u.id !== currentUser.id && ( // Don't let admin delete themselves easily from here
                        <button
                          onClick={() => deleteUser(u)}
                          style={{ background: '#ef4444', border: 'none', color: 'white', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8em' }}
                        >
                          🗑️ Eliminar
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
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

              <label style={{ color: '#fbbf24', fontWeight: 'bold' }}>📍 Asignar Nº Casa en Mapa:</label>
              <input
                value={editForm.houseNumber}
                onChange={e => setEditForm({ ...editForm, houseNumber: e.target.value })}
                placeholder="Ej: 12"
              />
              <p style={{ fontSize: '0.8em', color: '#888' }}>Escribe el número exacto de la etiqueta del mapa para vincular.</p>
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

const APP_VERSION = '1.2.6'

function App() {
  console.log('🚀 PatrolHood App Booting... v' + APP_VERSION)

  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('user')
      if (!saved) return null
      return JSON.parse(saved)
    } catch (err) {
      console.error('❌ Error parsing saved user:', err)
      localStorage.removeItem('user') // Clear corrupted data
      return null
    }
  })
  const [deletedMsg, setDeletedMsg] = useState(false)
  const [activeTab, setActiveTab] = useState('map') // 'map' or 'forum' or 'users'

  const [showEmergencyMenu, setShowEmergencyMenu] = useState(false)
  const [activeAlerts, setActiveAlerts] = useState([]) // Array of alert objects
  const [pendingSOS, setPendingSOS] = useState(null) // New: For double confirmation
  const [generatedInvite, setGeneratedInvite] = useState(null)
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [showPetForm, setShowPetForm] = useState(false)
  const [petFormData, setPetFormData] = useState({ name: '', breed: '', traits: '', photo: null })
  const [mapFocusPosition, setMapFocusPosition] = useState(null)
  const mapRef = useRef(null)
  const [allCommunitiesHouses, setAllCommunitiesHouses] = useState([]) // global_admin: etiquetas de todas las comunidades
  const [houses, setHouses] = useState([])
  const [users, setUsers] = useState([])
  const [communityContacts, setCommunityContacts] = useState([])
  const [isAddingContact, setIsAddingContact] = useState(false)
  const [newContact, setNewContact] = useState({ name: '', phone: '', icon: '📞' })
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [offlineCount, setOfflineCount] = useState(0)
  const [allCommunities, setAllCommunities] = useState([]) // Listado de comunidades para selectores

  // PWA Install Logic
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showInstallBtn, setShowInstallBtn] = useState(false)
  const [telegramBotTokenInput, setTelegramBotTokenInput] = useState('')
  const [showTelegramHelp, setShowTelegramHelp] = useState(false)

  const handleInstallClick = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      console.log('User accepted the install prompt')
    }
    setDeferredPrompt(null)
    setShowInstallBtn(false)
  }

  useEffect(() => {
    const handleBeforeInstall = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setShowInstallBtn(true)
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
  }, [])

  // Track online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Auto-check notification permission
  useEffect(() => {
    const checkPerm = async () => {
      try {
        const info = await Device.getInfo();
        if (info.platform === 'android' || info.platform === 'ios') {
          const perm = await PushNotifications.checkPermissions();
          if (perm.receive === 'granted') setNotificationsEnabled(true);
        } else if (window.Notification && window.Notification.permission === 'granted') {
          setNotificationsEnabled(true);
        }
      } catch (e) {
        console.warn('Error checking notifications:', e);
      }
    };
    checkPerm();
  }, []);

  // Check pending SOS count periodically
  useEffect(() => {
    const checkPending = async () => {
      const count = await getPendingCount()
      setOfflineCount(count)
    }
    checkPending()
    const interval = setInterval(checkPending, 5000)
    return () => clearInterval(interval)
  }, [])

  // Register SW and Logic
  async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const register = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
        console.log('FCM Service Worker Registered');
        return register;
      } catch (err) {
        console.error('Service Worker registration failed:', err);
      }
    }
  }

  // FCM Register and Logic
  async function subscribeToPush() {
    try {
      // Check platform first
      const info = await Device.getInfo();
      const isNative = info.platform === 'android' || info.platform === 'ios';

      if (isNative) {
        console.log('📱 Running in Native App (Capacitor)');
        let permStatus = await PushNotifications.checkPermissions();
        if (permStatus.receive === 'prompt') {
          permStatus = await PushNotifications.requestPermissions();
        }

        if (permStatus.receive !== 'granted') {
          alert('⚠️ Permiso de notificaciones denegado en el sistema del móvil.');
          return;
        }

        // Register for push notifications
        await PushNotifications.register();

        // One-time listener for registration
        const regListener = await PushNotifications.addListener('registration', async (token) => {
          console.log('✅ Native registration success, token:', token.value);
          const response = await safeFetch(`${import.meta.env.VITE_API_URL || ''}/api/users/me/fcm-token`, {
            method: 'POST',
            body: JSON.stringify({ token: token.value })
          });
          if (response.success) {
            setNotificationsEnabled(true);
            alert('✅ ¡Notificaciones nativas activadas con éxito!');
          }
          regListener.remove();
        });

        PushNotifications.addListener('registrationError', (err) => {
          console.error('❌ Native registration error:', err.error);
          alert('Error al registrar notificaciones: ' + err.error);
        });

        PushNotifications.addListener('pushNotificationReceived', (notification) => {
          console.log('🔔 Push received in foreground:', notification);
        });

        return;
      }

      // Web Push Logic (Existing)
      const { initializeApp } = await import('firebase/app');
      const { getMessaging, getToken, onMessage } = await import('firebase/messaging');
      const { firebaseConfig, vapidKey } = await import('./firebase-config');
      const token_fcm = localStorage.getItem('token'); 

      const app = initializeApp(firebaseConfig);
      const messaging = getMessaging(app);

      if (!window.Notification) {
        alert('⚠️ Tu navegador o dispositivo no soporta el sistema de notificaciones. \n\nNota para iPhone: Debes añadir esta web a tu pantalla de inicio ("Compartir" -> "Añadir a la pantalla de inicio") para poder activar las alertas.');
        return;
      }

      const permission = await window.Notification.requestPermission();
      if (permission !== 'granted') {
        alert(`⚠️ Permiso de notificaciones: ${permission}.\n\nPara activar las alertas:\n1. Pulsa el icono del candado en la barra de direcciones.\n2. Asegúrate de que las "Notificaciones" estén permitidas.\n3. En Brave: Activa "Usar servicios de Google para mensajería push" en Ajustes > Privacidad.`);
        return;
      }

      // Get Service Worker Registration
      const registration = await navigator.serviceWorker.ready;

      // Get token
      const token = await getToken(messaging, {
        vapidKey,
        serviceWorkerRegistration: registration
      });

      if (token) {
        console.log('✅ FCM Token generated (Web):', token);
        const response = await safeFetch(`${import.meta.env.VITE_API_URL || ''}/api/subscribe`, {
          method: 'POST',
          body: JSON.stringify({ token, userId: user.id, role: user.role, communityId: user.communityId })
        });

        if (!response.success) throw new Error(response.error || 'Error al guardar suscripción en el servidor');

        console.log('✅ Subscription saved on server');
        alert('✅ Notificaciones Activadas en este dispositivo');
        setNotificationsEnabled(true);
      } else {
        throw new Error('No se pudo obtener el token de Firebase (vacío)');
      }

      // Handle foreground messages
      onMessage(messaging, (payload) => {
        console.log('Foreground Message received: ', payload);
        if (payload.notification) {
          alert(`🔔 NOTIFICACIÓN: ${payload.notification.title}\n\n${payload.notification.body}`);
        }
      });

    } catch (err) {
      console.error('❌ Push registration failed:', err);
      alert(`Error activando notificaciones: ${err.message}`);
    }
  }

  // Check production status
  const checkStatus = async () => {
    const data = await safeFetch(`${import.meta.env.VITE_API_URL || ''}/api/production-status`);
    if (data.success) {
      let msg = `Estado del Servidor:\n`;
      msg += `- Base de Datos: ${data.mongoReady ? '✅ OK' : '❌ Error'}\n`;
      msg += `- Firebase: ${data.firebaseInitialized ? '✅ OK' : '❌ NO INICIALIZADO'}\n`;
      if (data.firebaseError) msg += `- Error Firebase: ${data.firebaseError}\n`;
      msg += `\nEntorno: ${data.nodeEnv}`;
      alert(msg);
    } else {
      alert('Error al conectar con el servidor para verificar estado: ' + data.error);
    }
  }

  const deactivateTelegram = async () => {
    if (!window.confirm('¿Quieres desactivar las alertas por Telegram?')) return

    const data = await safeFetch(`${import.meta.env.VITE_API_URL || ''}/api/users/${user.id}`, {
      method: 'PUT',
      body: JSON.stringify({ telegramChatId: null })
    })

    if (data.success) {
      setUser(prev => ({ ...prev, telegramChatId: null }))
      alert('Alertas desactivadas correctamente.')
    } else {
      alert('Error al desactivar alertas: ' + data.error)
    }
  }

  const forceHardRefresh = async () => {
    if (!window.confirm('¿Quieres forzar la limpieza de caché? Se cerrará la sesión y se reiniciará la app para cargar las últimas actualizaciones.')) return

    // Clear all persistent storage
    localStorage.clear()

    // Unregister all service workers
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      for (const registration of registrations) {
        await registration.unregister()
      }
    }

    // Clear caches if available
    if ('caches' in window) {
      const cacheNames = await caches.keys()
      for (const name of cacheNames) {
        await caches.delete(name)
      }
    }

    // Force reload bypassing cache
    window.location.reload(true)
  }

  // Fetch all communities for global_admin selectors
  useEffect(() => {
    if (user?.role !== 'global_admin') return;
    safeFetch(`${import.meta.env.VITE_API_URL || ''}/api/superadmin/communities`)
      .then(data => {
        if (data.success && data.communities) {
            setAllCommunities(data.communities);
            window._allCommunities = data.communities; // Legacy support for the inline select
        }
      })
      .catch(err => console.error('Error fetching communities:', err))
  }, [user?.role])

  // Fetch all communities' houses for global_admin map
  useEffect(() => {
    if (user?.role !== 'global_admin') return;
    safeFetch(`${import.meta.env.VITE_API_URL || ''}/api/superadmin/all-houses`)
      .then(data => {
        if (data.success && data.houses) setAllCommunitiesHouses(data.houses)
      })
      .catch(err => console.error('Error fetching all community houses:', err))
  }, [user?.role])

  useEffect(() => {
    registerServiceWorker();

    // Join community socket room
    if (user?.communityId) {
      socket.emit('join_community', user.communityId)
    }
    if (user?.role === 'global_admin') {
      socket.emit('join_community', 'global_admins')
    }

    // Sockets for live updates
    socket.on('house_updated', (newHouse) => {
      console.log('🏠 Socket: house_updated received', newHouse)
      setHouses(prev => {
        const index = prev.findIndex(h => String(h.id) === String(newHouse.id))
        if (index !== -1) {
          const updated = [...prev]
          updated[index] = newHouse
          return updated
        }
        return [...prev, newHouse]
      })
      // Global Admin: Also update the background communities markers
      if (user?.role === 'global_admin') {
        setAllCommunitiesHouses(prev => {
          const index = prev.findIndex(h => String(h.id) === String(newHouse.id))
          if (index !== -1) {
            const updated = [...prev]
            updated[index] = newHouse
            return updated
          }
          return [...prev, newHouse]
        })
      }
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
  }, [user?.id, user?.communityId]) // Re-run when user logs in/out or switches community

  // Data fetching useEffects, dependent on user.communityId
  useEffect(() => {
    if (!user?.communityId) return; // Only fetch if communityId is available

    const communityParam = `?communityId=${user.communityId}`;

    // Fetch houses from server
    safeFetch(`${import.meta.env.VITE_API_URL || ''}/api/houses${communityParam}`)
      .then(data => {
        if (data.success && data.houses) setHouses(data.houses);
      })
      .catch(err => console.error('Error fetching houses:', err));

    // Fetch users for map labels
    safeFetch(`${import.meta.env.VITE_API_URL || ''}/api/users${communityParam}`)
      .then(data => {
        if (data.success && data.users) setUsers(data.users);
      })
      .catch(err => console.error('Error fetching users:', err));

    // Fetch community contacts
    safeFetch(`${import.meta.env.VITE_API_URL || ''}/api/contacts${communityParam}`)
      .then(data => {
        if (data.success && data.contacts) setCommunityContacts(data.contacts);
      })
      .catch(err => console.error('Error fetching contacts:', err));

    // Fetch active SOS alerts
    safeFetch(`${import.meta.env.VITE_API_URL || ''}/api/sos/active${communityParam}`)
      .then(data => {
        if (data.success && data.alerts) setActiveAlerts(data.alerts);
      })
      .catch(err => console.error('Error fetching active SOS:', err));

  }, [user?.communityId]); // Re-fetch all when community changes


  // Auto-sync user profile (to detect Telegram link etc)
  useEffect(() => {
    if (!user?.id) return

    const syncUser = async () => {
      const data = await safeFetch(`${import.meta.env.VITE_API_URL || ''}/api/users/${user.id}?communityId=${user.communityId}`)
      if (data.success && data.user) {
        setUser(prev => {
          if (!prev) return data.user;
          
          // Merging logic
          const updated = { ...prev, ...data.user };

          // If global_admin, preserve the locally selected community override
          if (prev.role === 'global_admin') {
            updated.communityId = prev.communityId;
            updated.communityName = prev.communityName;
            updated.communityCenter = prev.communityCenter;
          }

          if (JSON.stringify(prev) === JSON.stringify(updated)) return prev;

          localStorage.setItem('user', JSON.stringify(updated));
          return updated;
        });
      } else if (data.status === 404 || (data.success === false && data.error?.includes('not found'))) {
        // User was deleted by admin
        localStorage.removeItem('user')
        localStorage.removeItem('token')
        setUser(null)
        setDeletedMsg(true)
        setTimeout(() => setDeletedMsg(false), 8000)
      }
    }

    // Sync on mount
    syncUser()

    // And every 10 seconds while logged in
    const interval = setInterval(syncUser, 10000)
    return () => clearInterval(interval)
  }, [user?.id, user?.communityId])


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
      setActiveAlerts(prev => {
        const exists = prev.find(a => (a._id || a.alertId) === (data._id || data.alertId));
        if (exists) return prev;
        return [...prev, data];
      });
    })

    socket.on('stop_alert', (data) => {
      setActiveAlerts(prev => prev.filter(a => (a._id || a.alertId) !== (data._id || data.alertId)));
    })

    return () => {
      socket.off('emergency_alert');
      socket.off('stop_alert');
    }
  }, [])

  // --- OFFLINE SYNC LOGIC ---
  useEffect(() => {
    const syncOfflineSOS = async () => {
      if (!user) return;
      const pending = await getPendingSOS();
      if (pending.length === 0) return;

      console.log(`🔄 Attempting to sync ${pending.length} offline SOS alerts...`);
      for (const sos of pending) {
        const res = await safeFetch(`${import.meta.env.VITE_API_URL || ''}/api/sos`, {
          method: 'POST',
          body: JSON.stringify(sos)
        });

        if (res.success || res.status === 429) {
          await markSOSAsSent(sos.id);
          console.log(`✅ SOS #${sos.id} handled successfully (or duplicate cleared).`);
        } else {
          console.error(`❌ Failed to sync SOS #${sos.id}:`, res.error);
          break; // Stop if error (e.g., actually offline or server 500)
        }
      }
    };

    const handleOnline = () => syncOfflineSOS();
    window.addEventListener('online', handleOnline);
    const interval = setInterval(syncOfflineSOS, 30000); // Check every 30s as fallback

    return () => {
      window.removeEventListener('online', handleOnline);
      clearInterval(interval);
    };
  }, [user?.id]);

  const triggerSOS = (type) => {
    const info = EMERGENCY_TYPES.find(e => e.id === type)
    if (info.isPetAlert) {
      setPendingSOS(info)
      setShowPetForm(true)
    } else {
      setPendingSOS(info)
    }
    setShowEmergencyMenu(false)
  }

  const confirmSOS = () => {
    if (!pendingSOS) return

    const myHouse = houses.find(h => h.number === user.mapLabel)
    if (!myHouse) { alert('No tienes una casa asignada correctamente en el mapa.'); return; }

    const sosData = {
      emergencyType: pendingSOS.id,
      emergencyTypeLabel: pendingSOS.label,
      houseNumber: myHouse.number,
      communityId: user.communityId,
      communityName: user.communityName,
      userId: user.id,
      userName: user.name,
      location: myHouse.position ? { lat: myHouse.position[0], lng: myHouse.position[1] } : null,
      petInfo: pendingSOS.isPetAlert ? petFormData : null
    };

    // Store in IndexedDB first (Buffer)
    const bufferingToast = async () => {
      const dbId = await addPendingSOS(sosData);
      if (!isOnline) {
        alert('⚠️ Sin conexión. SOS guardado y se enviará automáticamente al reconectar.');
      }

      const data = await safeFetch(`${import.meta.env.VITE_API_URL || ''}/api/sos`, {
        method: 'POST',
        body: JSON.stringify(sosData)
      })
      if (data.success) {
        await markSOSAsSent(dbId);
        if (!isOnline) {
          // This might happen if online event fired just before fetch
          console.log('✅ Buffered SOS synced immediately.');
        }
      } else {
        console.warn('⚠️ Server unreachable or error. SOS buffered in IndexedDB.', data.error);
      }
    };

    bufferingToast();
    setPendingSOS(null)
    setShowPetForm(false)
    setPetFormData({ name: '', breed: '', traits: '', photo: null })
  }

  const generateInvite = async () => {
    const data = await safeFetch(`${import.meta.env.VITE_API_URL || ''}/api/admin/invite`, {
      method: 'POST',
      body: JSON.stringify({ role: 'user', communityId: user.communityId, communityName: user.communityName })
    })
    if (data.success) {
      console.log('✅ Invitación generada:', data.code);
      setGeneratedInvite(data.code)
    } else {
      console.error('❌ Error del servidor:', data.error);
      alert('Error al generar invitación: ' + (data.error || 'Error desconocido'));
    }
  }

  const updateTelegramBotToken = async () => {
    if (!telegramBotTokenInput) return alert('Por favor, introduce un token válido.');
    if (!window.confirm('¿Quieres actualizar el Token del bot de Telegram para esta comunidad?')) return;

    const data = await safeFetch(`${import.meta.env.VITE_API_URL || ''}/api/community/bot-token`, {
      method: 'POST',
      body: JSON.stringify({ communityId: user.communityId, telegramBotToken: telegramBotTokenInput, adminId: user.id })
    });
    if (data.success) {
      alert('✅ Token actualizado correctamente. El bot se está reiniciando.');
      setTelegramBotTokenInput('');
    } else {
      alert('❌ Error al actualizar el token: ' + (data.error || 'Error desconocido'));
    }
  }

  const selfDeleteAccount = async (password) => {
    if (!password) return;
    const res = await safeFetch(`${import.meta.env.VITE_API_URL || ''}/api/users/me/delete`, {
      method: 'DELETE',
      body: JSON.stringify({ password })
    });

    if (res.success) {
      alert('Tu cuenta y todos tus datos han sido eliminados de forma definitiva. Lamentamos verte partir.');
      localStorage.removeItem('user');
      localStorage.removeItem('token');
      // Clean up FCM if possible
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const reg of regs) await reg.unregister();
      }
      setUser(null);
      setDeletedMsg(true);
      setTimeout(() => setDeletedMsg(false), 8000);
    } else {
      alert('Error: ' + (res.message || res.error || 'Error desconocido'));
    }
  };

  const onAddHouse = async (houseData) => {
    const data = await safeFetch(`${import.meta.env.VITE_API_URL || ''}/api/houses`, {
      method: 'POST',
      body: JSON.stringify({ ...houseData, communityId: user.communityId, communityName: user.communityName })
    })
    if (data.success) {
      console.log('✅ Casa guardada en servidor:', data.house)
      if (houseData.owner === user.phone) {
        setUser(prev => ({ ...prev, houseNumber: houseData.number }))
      }
    } else {
      alert('❌ Error al guardar la etiqueta: ' + (data.error || 'Error desconocido'))
    }
  }

  const clearHouses = async () => {
    if (!window.confirm('¿Estás seguro de que quieres borrar TODAS las etiquetas?')) return
    await safeFetch(`${import.meta.env.VITE_API_URL || ''}/api/houses/clear`, {
      method: 'POST',
      body: JSON.stringify({ communityId: user.communityId })
    })
  }

  const onDeleteHouse = async (id) => {
    if (!window.confirm('¿Borrar esta etiqueta?')) return
    await safeFetch(`${import.meta.env.VITE_API_URL || ''}/api/houses/${id}?communityId=${user.communityId}`, {
      method: 'DELETE'
    })
  }

  const onCenterHouse = (position) => {
    if (mapRef.current && position) {
      mapRef.current.flyTo(position, 18)
    }
  }

  const setAsCommunityCenter = async (position) => {
    if (!window.confirm('¿Establecer esta ubicación como el centro inicial para todos los vecinos?')) return
    const data = await safeFetch(`${import.meta.env.VITE_API_URL || ''}/api/community/center`, {
      method: 'POST',
      body: JSON.stringify({ communityId: user.communityId, center: position, adminId: user.id })
    })
    if (data.success) {
      setUser(prev => ({ ...prev, communityCenter: position }))
      alert('Centro de la comunidad actualizado.')
    } else {
      alert('Error al actualizar el centro: ' + data.error)
    }
  }

  if (!user) return <AuthOverlay deletedMsg={deletedMsg} onLogin={(userData) => {
    localStorage.setItem('user', JSON.stringify(userData))
    setUser(userData)
    setDeletedMsg(false)
  }} />

  const handleViewOnMap = (mapLabel) => {
    const targetHouse = houses.find(h => h.number === mapLabel)
    if (targetHouse) {
      setMapFocusPosition(targetHouse.position)
      setActiveTab('map')
      setIsSidebarOpen(false)
    } else {
      alert('Esta casa no está ubicada en el mapa todavía.')
    }
  }

  return (
    <div className="app">
      <button className="mobile-menu-toggle" onClick={() => setIsSidebarOpen(true)}>
        ☰
      </button>

      {/* Offline / Sync Banner */}
      {(!isOnline || offlineCount > 0) && (
        <div className={`status-banner ${!isOnline ? 'offline' : 'syncing'}`} style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 10001,
          background: !isOnline ? '#7f1d1d' : '#1e3a8a', color: 'white',
          padding: '8px', fontSize: '0.85em', textAlign: 'center',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.3)', fontWeight: 'bold'
        }}>
          {!isOnline ? (
            <><span>📡 MODO OFFLINE</span> <small>(Funciona con buffer local)</small></>
          ) : (
            <><span>🔄 Sincronizando...</span> <small>({offlineCount} alertas en cola)</small></>
          )}
        </div>
      )}

      {/* Foreground Notification Toast */}
      {activeAlerts.some(a => a.emergencyType !== 'lost_pet') && activeTab !== 'map' && (
        <div
          className="foreground-toast"
          onClick={() => setActiveTab('map')}
          style={{
            position: 'fixed', top: '10px', left: '50%', transform: 'translateX(-50%)',
            background: '#ef4444', color: 'white', padding: '10px 20px', borderRadius: '20px',
            zIndex: 9999, boxShadow: '0 4px 12px rgba(0,0,0,0.5)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '10px', width: '90%', maxWidth: '400px'
          }}
        >
          <span style={{ fontSize: '1.5em' }}>🚨</span>
          <div style={{ flex: 1 }}>
            <strong>¡ALERTA SOS ACTIVA!</strong>
            <div style={{ fontSize: '0.9em' }}>Pulsa para ver en el mapa</div>
          </div>
        </div>
      )}

      {/* Pet Alert Toast */}
      {activeAlerts.some(a => a.emergencyType === 'lost_pet') && activeTab !== 'map' && (
        <div
          className="foreground-toast pet-toast"
          onClick={() => setActiveTab('map')}
          style={{
            position: 'fixed', top: activeAlerts.some(a => a.emergencyType !== 'lost_pet') ? '80px' : '10px',
            left: '50%', transform: 'translateX(-50%)',
            background: '#fbbf24', color: '#000', padding: '10px 20px', borderRadius: '20px',
            zIndex: 9999, boxShadow: '0 4px 12px rgba(0,0,0,0.5)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '10px', width: '90%', maxWidth: '400px'
          }}
        >
          <span style={{ fontSize: '1.5em' }}>🐾</span>
          <div style={{ flex: 1 }}>
            <strong>¡MASCOTA PERDIDA!</strong>
            <div style={{ fontSize: '0.9em' }}>Pulsa para ver en el mapa</div>
          </div>
        </div>
      )}

      {isSidebarOpen && <div className="sidebar-overlay active" onClick={() => setIsSidebarOpen(false)}></div>}

      <div className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>

        <div className="premium-header">
          <img src="/logo_bull.png" alt="Logo" style={{ height: '160px', width: 'auto', marginBottom: '15px' }} className="logo-img" />
          <span className="welcome-label">BIENVENIDO</span>
          <h2 className="user-display-name">{user.name.toUpperCase()}</h2>
          <div className="premium-divider"></div>
          <span className="brand-label">PATROLHOOD</span>
          <span className="community-name-label">{user.communityName}</span>
          {user.role === 'global_admin' && (
            <div style={{
              background: 'linear-gradient(45deg, #fbbf24 0%, #d97706 100%)',
              color: 'black',
              padding: '4px 12px',
              borderRadius: '20px',
              fontSize: '0.75em',
              fontWeight: 'bold',
              marginTop: '10px',
              boxShadow: '0 0 15px rgba(251, 191, 36, 0.4)',
              display: 'inline-block',
              animation: 'pulse 2s infinite'
            }}>
              💎 MODO SUPER ADMIN
            </div>
          )}
        </div>

        {showInstallBtn && (
          <div className="install-banner-premium" style={{
            margin: '20px 0', padding: '15px', background: 'rgba(251, 191, 36, 0.1)',
            borderRadius: '16px', border: '1px solid #fbbf24', textAlign: 'center'
          }}>
            <div style={{ fontSize: '2em', marginBottom: '10px' }}>📲</div>
            <h4 style={{ margin: '0 0 5px 0', color: '#fbbf24' }}>App Instalable</h4>
            <p style={{ fontSize: '0.75em', color: '#94a3b8', margin: '0 0 15px 0' }}>Instala PatrolHood para recibir alertas instantáneas y acceso rápido.</p>
            <button
              onClick={handleInstallClick}
              style={{
                width: '100%', padding: '12px', background: 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)',
                color: '#000', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer',
                boxShadow: '0 4px 15px rgba(251, 191, 36, 0.3)'
              }}
            >
              Instalar Ahora
            </button>
          </div>
        )}
        {user.role === 'admin' && <span className="admin-badge">Admin</span>}
        {user.role === 'moderator' && <span className="admin-badge" style={{ background: '#3b82f6', color: 'white' }}>Moderador</span>}

        <button
          className="refresh-btn"
          onClick={() => window.location.reload()}
          style={{
            background: 'transparent', border: '1px solid #fbbf24', color: '#fbbf24',
            padding: '5px 10px', borderRadius: '5px', cursor: 'pointer', marginTop: '10px', marginBottom: '10px',
            fontSize: '0.9em', display: 'flex', alignItems: 'center', gap: '5px', alignSelf: 'center'
          }}
        >
          🔄 Refrescar
        </button>

        <div className="nav-tabs">
          <button className={`nav-btn ${activeTab === 'map' ? 'active' : ''}`} onClick={() => { setActiveTab('map'); setIsSidebarOpen(false); }}>
            <span className="nav-icon">🗺️</span>
            <span className="nav-label">Mapa</span>
          </button>
          <button className={`nav-btn ${activeTab === 'forum' ? 'active' : ''}`} onClick={() => { setActiveTab('forum'); setIsSidebarOpen(false); }}>
            <span className="nav-icon">💬</span>
            <span className="nav-label">Foro</span>
          </button>
          {user.role !== 'global_admin' && (
            <button className={`nav-btn ${activeTab === 'users' ? 'active' : ''}`} onClick={() => { setActiveTab('users'); setIsSidebarOpen(false); }}>
              <span className="nav-icon">👥</span>
              <span className="nav-label">Vecinos</span>
            </button>
          )}
          {(user.role === 'admin' || user.role === 'moderator') && (
            <button className={`nav-btn ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => { setActiveTab('dashboard'); setIsSidebarOpen(false); }}>
              <span className="nav-icon">📊</span>
              <span className="nav-label">Dashboard</span>
            </button>
          )}
          <div className="admin-nav-group">
            {user.role === 'global_admin' && (
              <>
                <button className={`nav-btn ${activeTab === 'sa-communities' ? 'active' : ''}`} onClick={() => { setActiveTab('sa-communities'); setIsSidebarOpen(false); }}>
                  <span className="nav-icon">🏘️</span>
                  <span className="nav-label">Comunidades</span>
                </button>
                <button className={`nav-btn ${activeTab === 'sa-users' ? 'active' : ''}`} onClick={() => { setActiveTab('sa-users'); setIsSidebarOpen(false); }}>
                  <span className="nav-icon">👥</span>
                  <span className="nav-label">Usuarios</span>
                </button>
                <button className={`nav-btn ${activeTab === 'sa-alerts' ? 'active' : ''}`} onClick={() => { setActiveTab('sa-alerts'); setIsSidebarOpen(false); }}>
                  <span className="nav-icon">🚨</span>
                  <span className="nav-label">Alertas</span>
                </button>
                <button className={`nav-btn ${activeTab === 'sa-audit' ? 'active' : ''}`} onClick={() => { setActiveTab('sa-audit'); setIsSidebarOpen(false); }}>
                  <span className="nav-icon">📊</span>
                  <span className="nav-label">Auditoría</span>
                </button>
                <button className={`nav-btn ${activeTab === 'sa-reported' ? 'active' : ''}`} onClick={() => { setActiveTab('sa-reported'); setIsSidebarOpen(false); }}>
                  <span className="nav-icon">🚩</span>
                  <span className="nav-label">Reportados</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Telegram Connect Button - Only show if NOT connected and NOT global_admin */}
        {!user.telegramChatId && user.role !== 'global_admin' && (
          <div style={{ padding: '10px 20px' }}>
            {user.telegramBotUsername ? (
              <a
                href={`https://t.me/${user.telegramBotUsername}?start=${user.id}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  background: '#0088cc',
                  color: 'white', padding: '10px', borderRadius: '8px',
                  textDecoration: 'none', fontWeight: 'bold', fontSize: '0.9em'
                }}
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.638z" />
                </svg>
                Activar Alertas (Telegram)
              </a>
            ) : (
              <div style={{ background: '#334155', color: '#94a3b8', padding: '10px', borderRadius: '8px', fontSize: '0.8em', textAlign: 'center' }}>
                🤖 Bot de Telegram no configurado para esta comunidad.
              </div>
            )}
            <p style={{ fontSize: '0.7em', color: '#94a3b8', textAlign: 'center', marginTop: '5px' }}>
              Únete al bot para recibir alertas fiables en tu móvil.
            </p>
          </div>
        )}

        {/* FCM Native Notifications Button */}
        {user.role !== 'global_admin' && !notificationsEnabled && (
          <div style={{ padding: '0 20px 10px 20px' }}>
            <button
              onClick={subscribeToPush}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                background: 'var(--gold-gradient)',
                color: '#000', padding: '10px', borderRadius: '8px',
                border: 'none', width: '100%', fontWeight: 'bold', fontSize: '0.9em',
                cursor: 'pointer'
              }}
            >
              🔔 Activar Notificaciones App
            </button>
            <p style={{ fontSize: '0.7em', color: '#94a3b8', textAlign: 'center', marginTop: '5px' }}>
              Recibe alertas directas sin necesidad de Telegram.
            </p>
          </div>
        )}

        {notificationsEnabled && (
          <div style={{ padding: '0 20px 10px 20px', textAlign: 'center' }}>
            <span style={{ color: '#10b981', fontSize: '0.85em', fontWeight: 'bold' }}>✅ Notificaciones nativas activas</span>
          </div>
        )}


        {/* Quiet Hours - hidden for global_admin */}
        {user.role !== 'global_admin' && <div style={{ padding: '10px 20px', borderTop: '1px solid rgba(255,255,255,0.07)', marginTop: '10px' }}>
          <h4 style={{ color: '#fbbf24', fontSize: '0.85rem', marginBottom: '10px' }}>🌙 Zona de Silencio</h4>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.82em', color: '#cbd5e1' }}>Silenciar notificaciones del foro</span>
            <label style={{ position: 'relative', display: 'inline-block', width: '42px', height: '24px', cursor: 'pointer' }}>
              <input type="checkbox"
                checked={user.quietHours?.enabled || false}
                onChange={async (e) => {
                  const updated = { ...user, quietHours: { ...(user.quietHours || { from: '23:00', to: '07:00' }), enabled: e.target.checked } };
                  setUser(updated);
                  localStorage.setItem('user', JSON.stringify(updated));
                  await safeFetch(`${import.meta.env.VITE_API_URL || ''}/api/users/${user.id}`, {
                    method: 'PUT', body: JSON.stringify({ communityId: user.communityId, quietHours: updated.quietHours })
                  });
                }}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span style={{
                position: 'absolute', inset: 0, background: user.quietHours?.enabled ? '#fbbf24' : '#334155',
                borderRadius: '24px', transition: '0.3s'
              }} />
              <span style={{
                position: 'absolute', top: '2px', left: user.quietHours?.enabled ? '20px' : '2px',
                width: '20px', height: '20px', background: 'white', borderRadius: '50%', transition: '0.3s'
              }} />
            </label>
          </div>
          {user.quietHours?.enabled && (
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '0.75em', color: '#94a3b8', display: 'block', marginBottom: '2px' }}>Desde</label>
                <input type="time" defaultValue={user.quietHours?.from || '23:00'}
                  onBlur={async (e) => {
                    const updated = { ...user, quietHours: { ...(user.quietHours), from: e.target.value } };
                    setUser(updated); localStorage.setItem('user', JSON.stringify(updated));
                    await safeFetch(`${import.meta.env.VITE_API_URL || ''}/api/users/${user.id}`, {
                      method: 'PUT', body: JSON.stringify({ communityId: user.communityId, quietHours: updated.quietHours })
                    });
                  }}
                  style={{ background: '#1e293b', color: 'white', border: '1px solid #334155', borderRadius: '6px', padding: '6px', width: '100%' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '0.75em', color: '#94a3b8', display: 'block', marginBottom: '2px' }}>Hasta</label>
                <input type="time" defaultValue={user.quietHours?.to || '07:00'}
                  onBlur={async (e) => {
                    const updated = { ...user, quietHours: { ...(user.quietHours), to: e.target.value } };
                    setUser(updated); localStorage.setItem('user', JSON.stringify(updated));
                    await safeFetch(`${import.meta.env.VITE_API_URL || ''}/api/users/${user.id}`, {
                      method: 'PUT', body: JSON.stringify({ communityId: user.communityId, quietHours: updated.quietHours })
                    });
                  }}
                  style={{ background: '#1e293b', color: 'white', border: '1px solid #334155', borderRadius: '6px', padding: '6px', width: '100%' }}
                />
              </div>
            </div>
          )}
          <p style={{ fontSize: '0.72em', color: '#64748b', marginTop: '6px' }}>⚠️ Las alertas SOS <strong>siempre</strong> llegarán aunque tengas el silencio activado.</p>
        </div>}

        {/* Public Phone Privacy Toggle - hidden for global_admin */}
        {user.role !== 'global_admin' && <div style={{ padding: '10px 20px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <h4 style={{ color: '#fbbf24', fontSize: '0.85rem', marginBottom: '10px' }}>🔒 Privacidad de Datos</h4>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.82em', color: '#cbd5e1' }}>Mostrar mi teléfono a otros vecinos</span>
            <label style={{ position: 'relative', display: 'inline-block', width: '42px', height: '24px', cursor: 'pointer' }}>
              <input type="checkbox"
                checked={user.publicPhone || false}
                onChange={async (e) => {
                  const updated = { ...user, publicPhone: e.target.checked };
                  setUser(updated);
                  localStorage.setItem('user', JSON.stringify(updated));
                  await safeFetch(`${import.meta.env.VITE_API_URL || ''}/api/users/${user.id}`, {
                    method: 'PUT', body: JSON.stringify({ communityId: user.communityId, publicPhone: e.target.checked })
                  });
                }}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span style={{
                position: 'absolute', inset: 0, background: user.publicPhone ? '#fbbf24' : '#334155',
                borderRadius: '24px', transition: '0.3s'
              }} />
              <span style={{
                position: 'absolute', top: '2px', left: user.publicPhone ? '20px' : '2px',
                width: '20px', height: '20px', background: 'white', borderRadius: '50%', transition: '0.3s'
              }} />
            </label>
          </div>
          <p style={{ fontSize: '0.7em', color: '#64748b', marginTop: '6px' }}>Si activas este botón, los vecinos podrán ver tu numero de telefono (actualmente oculto). El administrador siempre verá tu numero por segurida.</p>
        </div>}

        {activeTab === 'map' && (
          <>
            {user.role === 'admin' && (
              <div className="admin-section" style={{ marginTop: '15px' }}>
                <h4 style={{ color: '#fbbf24', fontSize: '0.85rem', marginBottom: '10px' }}>📦 Gestión de Vecinos</h4>
                <button onClick={generateInvite} className="invite-btn">Generar Código de Invitación (Vecino)</button>
                {generatedInvite && <div className="invite-code">{generatedInvite}</div>}

                {!user.telegramBotUsername && (
                  <div style={{ marginTop: '20px', paddingTop: '15px', borderTop: '1px solid rgba(251, 191, 36, 0.3)' }}>
                    <h4 style={{ color: '#fbbf24', fontSize: '0.85rem', marginBottom: '10px' }}>🤖 Configurar Bot de Telegram</h4>

                    <button
                      onClick={() => setShowTelegramHelp(!showTelegramHelp)}
                      style={{ background: 'transparent', border: '1px solid #94a3b8', color: '#94a3b8', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer', marginBottom: '10px', width: '100%' }}
                    >
                      {showTelegramHelp ? '📖 Ocultar Instrucciones' : '📖 Cómo crear el bot'}
                    </button>

                    {showTelegramHelp && (
                      <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '8px', fontSize: '0.75rem', color: '#cbd5e1', marginBottom: '10px', lineHeight: '1.4' }}>
                        <p><strong>Pasos para crear tu bot:</strong></p>
                        <ol style={{ paddingLeft: '15px', marginTop: '5px' }}>
                          <li>Busca a <strong>@BotFather</strong> en Telegram y pulsa "Iniciar".</li>
                          <li>Envía el comando <code>/newbot</code>.</li>
                          <li>Elige un nombre para tu bot (ej: Patrol Condesa).</li>
                          <li>Elige un usuario que termine en 'bot' (ej: PatrolCondesaBot).</li>
                          <li>BotFather te dará un <strong>Token (API Key)</strong>. Cópialo y pégalo aquí debajo.</li>
                        </ol>
                      </div>
                    )}

                    <input
                      type="text"
                      placeholder="Pega el Token de Telegram aquí"
                      value={telegramBotTokenInput}
                      onChange={(e) => setTelegramBotTokenInput(e.target.value)}
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', marginBottom: '8px', fontSize: '0.8rem' }}
                    />
                    <button onClick={updateTelegramBotToken} className="invite-btn" style={{ background: '#0088cc', color: 'white' }}>Guardar Token de Bot</button>
                  </div>
                )}
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

        {user.role !== 'global_admin' && (
          <div className="contacts-section" style={{ position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h3 style={{ margin: 0 }}>📌 Contactos de interés</h3>
              {(user.role === 'admin') && (
                <button
                  onClick={() => setIsAddingContact(true)}
                  style={{ background: '#333', color: '#fbbf24', border: '1px solid #fbbf24', borderRadius: '50%', width: '24px', height: '24px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}
                >
                  +
                </button>
              )}
            </div>

            <ul className="contacts-list">
              <li><strong>🚨 Emergencia General:</strong> <a href="tel:112">112</a></li>
              <li><strong>👮 Policía Nacional:</strong> <a href="tel:091">091</a></li>
              <li><strong>🚔 Guardia Civil:</strong> <a href="tel:062">062</a></li>
              <li><strong>🚒 Bomberos:</strong> <a href="tel:080">080</a></li>
              <li><strong>🚓 Policía Local:</strong> <a href="tel:092">092</a></li>
              {communityContacts.map(contact => (
                <li key={contact._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong>{contact.icon} {contact.name}:</strong> <a href={`tel:${contact.phone}`}>{contact.phone}</a>
                  </div>
                  {(user.role === 'admin') && (
                    <button
                      onClick={() => {
                        if (window.confirm('¿Borrar contacto?')) {
                          safeFetch(`${import.meta.env.VITE_API_URL || ''}/api/contacts/${contact._id}?communityId=${user.communityId}`, {
                            method: 'DELETE'
                          })
                            .then(data => {
                              if (data.success) setCommunityContacts(prev => prev.filter(c => c._id !== contact._id))
                            })
                        }
                      }}
                      style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '10px' }}
                    >
                      ✖
                    </button>
                  )}
                </li>
              ))}
            </ul>

            {isAddingContact && (
              <div style={{ marginTop: '10px', padding: '10px', background: '#1e293b', borderRadius: '8px', fontSize: '0.85em' }}>
                <input
                  placeholder="Nombre (ej: Local)"
                  value={newContact.name}
                  onChange={e => setNewContact({ ...newContact, name: e.target.value })}
                  style={{ width: '100%', marginBottom: '5px', background: '#0f172a', color: 'white', border: '1px solid #334155', padding: '4px', borderRadius: '4px' }}
                />
                <input
                  placeholder="Teléfono"
                  value={newContact.phone}
                  onChange={e => setNewContact({ ...newContact, phone: e.target.value })}
                  style={{ width: '100%', marginBottom: '5px', background: '#0f172a', color: 'white', border: '1px solid #334155', padding: '4px', borderRadius: '4px' }}
                />
                <div style={{ display: 'flex', gap: '5px' }}>
                  <button
                    onClick={() => setIsAddingContact(false)}
                    style={{ flex: 1, padding: '5px', background: '#475569', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                  >
                    Cerrar
                  </button>
                  <button
                    onClick={() => {
                      if (!newContact.name || !newContact.phone) return;
                      safeFetch(`${import.meta.env.VITE_API_URL || ''}/api/contacts`, {
                        method: 'POST',
                        body: JSON.stringify({ ...newContact, communityId: user.communityId, communityName: user.communityName })
                      })
                        .then(data => {
                          if (data.success) {
                            setCommunityContacts(prev => [...prev, data.contact])
                            setNewContact({ name: '', phone: '', icon: '📞' })
                            setIsAddingContact(false)
                          }
                        })
                    }}
                    style={{ flex: 1, padding: '5px', background: '#fbbf24', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                  >
                    Guardar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {user.telegramChatId && user.role !== 'global_admin' && (
          <div style={{ textAlign: 'center', marginBottom: '15px' }}>
            <button
              onClick={deactivateTelegram}
              style={{
                background: 'none', border: 'none', color: '#64748b',
                textDecoration: 'underline', fontSize: '0.8em', cursor: 'pointer'
              }}
            >
              Desactivar alertas (Telegram)
            </button>
          </div>
        )}

        <button className="logout-btn" onClick={() => {
          localStorage.removeItem('user')
          setUser(null)
        }}>Salir</button>

        <button
          onClick={() => {
            const pass = prompt('⚠️ ATENCIÓN: Esta acción es irreversible.\nSe borrará tu cuenta, tus mensajes y se liberará tu casa en el mapa.\n\nPor seguridad, introduce tu contraseña para confirmar:');
            if (pass) selfDeleteAccount(pass);
          }}
          style={{
            background: 'none', border: 'none', color: '#f87171',
            fontSize: '0.7em', textDecoration: 'underline', cursor: 'pointer',
            marginTop: '20px', opacity: 0.6, width: '100%', textAlign: 'center', marginBottom: '15px'
          }}
        >
          Eliminar mi cuenta definitivamente (RGPD)
        </button>

        <div className="version-info">
          <button onClick={forceHardRefresh} className="hard-refresh-btn">Limpiar Caché (Update)</button>
        </div>
      </div>

      {
        activeTab === 'map' && (
          <div className="floating-controls" style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-end' }}>
            {/* Always allow own SOS if not active, except for global_admin */}
            {!activeAlerts.some(a => a.userId === user.id) && user.role !== 'global_admin' && (
              <button className="sos-button floating" onClick={() => setShowEmergencyMenu(true)}>SOS</button>
            )}

            {/* Show Stop buttons for active alerts I can control */}
            {activeAlerts.map(sosAlert => {
              const canStop = user.role === 'admin' || user.role === 'global_admin' || user.id === sosAlert.userId;
              if (!canStop) return null;
              return (
                <button
                  key={sosAlert._id || sosAlert.alertId}
                  className={sosAlert.emergencyType === 'lost_pet' ? "pet-stop-button floating" : "stop-button floating"}
                  style={{ fontSize: '0.7em', padding: '10px' }}
                  onClick={async () => {
                    const data = await safeFetch(`${import.meta.env.VITE_API_URL || ''}/api/sos/stop`, {
                      method: 'POST',
                      body: JSON.stringify({
                        alertId: sosAlert._id || sosAlert.alertId,
                        communityId: sosAlert.communityId || user.communityId
                      })
                    });
                    if (data.success) {
                      setActiveAlerts(prev => prev.filter(a => (a._id || a.alertId) !== (sosAlert._id || sosAlert.alertId)));
                    } else {
                      alert('Error al parar la alerta: ' + (data.error || 'Error desconocido'));
                    }
                  }}
                >
                  {sosAlert.emergencyType === 'lost_pet' ? `🐾 ENCONTRADA #${sosAlert.houseNumber}` : `🔕 PARAR #${sosAlert.houseNumber}`}
                </button>
              );
            })}

            {/* Banner for other active alerts I can't control */}
            {activeAlerts.some(a => a.userId !== user.id && user.role !== 'admin' && user.role !== 'global_admin') && (
              <div className="sos-active-banner">🚨 ALERTA ACTIVA</div>
            )}
          </div>
        )
      }

      <div className="main-content">
        {activeTab === 'map' && (
          <div className="map-container">
            <MapContainer
              center={user.communityCenter || [40.4168, -3.7038]}
              zoom={18}
              zoomControl={false}
              style={{ height: '100%', width: '100%', background: '#222' }}
              ref={mapRef}
            >
              <TileLayer
                url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
                attribution='&copy; Google'
                maxZoom={22}
              />
              <AutoCenter houses={houses} userMapLabel={user.mapLabel} communityCenter={user.communityCenter} user={user} />
              <MapFocusController focusLocation={mapFocusPosition} />
              {activeAlerts.map(a => (
                <AlertZoom key={a._id || a.alertId} sosActive={true} sosLocation={a.location ? [a.location.lat, a.location.lng] : null} />
              ))}
              <MapClickHandler onAddHouse={onAddHouse} user={user} />
              {/* Global admin: show all communities' markers in a different style */}
              {user.role === 'global_admin' && allCommunitiesHouses
                .filter(h => h.communityId !== user.communityId) // avoid duplicates with current community
                .map(h => {
                  const activeAlert = activeAlerts.find(a => a.houseNumber === h.number && a.communityId === h.communityId);
                  const status = activeAlert ? 'sos' : (h.status || 'empty');
                  return (
                    <Marker
                      key={`all-${h.id}`}
                      position={h.position}
                      icon={createHouseIcon(h.number, status, activeAlert?.emergencyType)}
                    >
                      <Popup className="house-popup">
                        <div className="popup-content">
                          <strong>🏠 #{h.number}</strong>
                          <p style={{ fontSize: '0.8em', color: '#888' }}>📍 {h.communityName}</p>
                          <p style={{ fontSize: '0.8em', color: '#fbbf24' }}>Status: {status}</p>
                          {activeAlert && (
                            <div className={activeAlert.emergencyType === 'lost_pet' ? "popup-alert pet" : "popup-alert"} style={{ marginBottom: '10px' }}>
                              {activeAlert.emergencyType === 'lost_pet' ? '🐾 ¡MASCOTA PERDIDA!' : '🚨 ¡EMERGENCIA ACTIVA!'}
                            </div>
                          )}
                        </div>
                      </Popup>
                    </Marker>
                  );
                })
              }
              {houses.map(h => {
                const inhabitants = users.filter(u => u.mapLabel === h.number || u.phone === h.owner); // Match by label or legacy owner
                const isAssigned = inhabitants.length > 0;

                // Determine Status
                let status = 'empty';
                const isMine = user.mapLabel === h.number;
                const activeAlert = activeAlerts.find(a => a.houseNumber === h.number && (a.communityId === h.communityId || a.communityId === user.communityId));
                const isSos = !!activeAlert;

                if (isSos) status = 'sos';
                else if (isMine) status = 'mine';
                else if (isAssigned) {
                  const hasAdmin = inhabitants.some(i => i.role === 'admin' || i.role === 'global_admin');
                  status = hasAdmin ? 'admin' : 'inhabited';
                }

                // Label is always Number now
                const labelText = h.number;
                const isUserAdmin = user.role === 'admin' || user.role === 'global_admin';

                return (
                  <Marker
                    key={h.id}
                    position={h.position}
                    icon={createHouseIcon(labelText, status, activeAlert?.emergencyType)}
                  >
                    <Popup className="house-popup">
                      <div className="popup-content">
                        <strong>🏠 Casa #{h.number}</strong>

                        {inhabitants.length > 0 ? (
                          <div className="inhabitants-list" style={{ marginTop: '5px' }}>
                            {inhabitants.map(person => (
                              <div key={person.id} style={{ marginBottom: '8px', borderBottom: '1px solid #eee', paddingBottom: '4px' }}>
                                <div style={{ fontWeight: 'bold' }}>👤 {person.name} {person.surname}</div>
                                <div style={{ fontSize: '0.85em', color: '#666' }}>📍 {person.address}</div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p style={{ fontStyle: 'italic', color: '#888' }}>Sin asignar</p>
                        )}
                        {status === 'sos' && (
                          <div className={activeAlert?.emergencyType === 'lost_pet' ? "popup-alert pet" : "popup-alert"} style={{ marginBottom: '10px' }}>
                            {activeAlert?.emergencyType === 'lost_pet' ? '🐾 ¡MASCOTA PERDIDA!' : '🚨 ¡EMERGENCIA ACTIVA!'}
                          </div>
                        )}

                        {activeAlert?.emergencyType === 'lost_pet' && activeAlert.petInfo && (
                          <div className="pet-info-popup" style={{ background: 'rgba(251, 191, 36, 0.1)', padding: '10px', borderRadius: '8px', marginBottom: '10px', border: '1px solid #fbbf24' }}>
                            {activeAlert.petInfo.photo && (
                              <img src={activeAlert.petInfo.photo} alt="Mascota" style={{ width: '100%', borderRadius: '4px', marginBottom: '8px' }} />
                            )}
                            <div style={{ fontSize: '0.9em' }}>
                              <strong>Nombre:</strong> {activeAlert.petInfo.name}<br />
                              <strong>Raza:</strong> {activeAlert.petInfo.breed}<br />
                              <div style={{ marginTop: '5px', fontStyle: 'italic', fontSize: '0.85em' }}>
                                "{activeAlert.petInfo.traits}"
                              </div>
                            </div>
                          </div>
                        )}

                        <button
                          onClick={() => onCenterHouse(h.position)}
                          style={{
                            width: '100%', padding: '8px', background: '#333', color: 'white',
                            border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                            marginBottom: '5px'
                          }}
                        >
                          🎯 Centrar sobre esta casa
                        </button>

                        {isUserAdmin && (
                          <button
                            onClick={() => setAsCommunityCenter(h.position)}
                            style={{
                              width: '100%', padding: '8px', background: '#fbbf24', color: 'black',
                              border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                              marginBottom: '5px', fontWeight: 'bold'
                            }}
                          >
                            📍 Establecer como Centro Inicial
                          </button>
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
                      </div>
                    </Popup>
                  </Marker>
                )
              })}
              {activeAlerts.map(a => a.location && (
                <CircleMarker
                  key={a._id || a.alertId}
                  center={[a.location.lat, a.location.lng]}
                  radius={50}
                  pathOptions={{
                    color: a.emergencyType === 'lost_pet' ? '#fbbf24' : 'red',
                    fillColor: a.emergencyType === 'lost_pet' ? '#fbbf24' : 'red'
                  }}
                  className={a.emergencyType === 'lost_pet' ? "pet-marker-circle" : "sos-marker"}
                />
              ))}

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
            </MapContainer >
          </div>
        )}
        {activeTab === 'forum' && (
          <Forum 
            user={user} 
            allCommunities={allCommunities} 
            onSwitchCommunity={(id, name, center) => {
              setUser(prev => ({ ...prev, communityId: id, communityName: name, communityCenter: center }));
              if (center && center.length === 2 && mapRef.current) {
                  mapRef.current.flyTo(center, 18);
              }
            }}
          />
        )}
        {activeTab === 'users' && <UserList currentUser={user} houses={houses} users={users} setUsers={setUsers} onViewOnMap={handleViewOnMap} />}
        {activeTab === 'dashboard' && (
          <AdminDashboard 
            user={user}
            onGenerateInvite={generateInvite}
            inviteCode={generatedInvite}
            onUpdateBotToken={updateTelegramBotToken}
            telegramBotTokenInput={telegramBotTokenInput}
            setTelegramBotTokenInput={setTelegramBotTokenInput}
            onClearHouses={clearHouses}
            onDeleteHouse={onDeleteHouse}
            onAddHouse={onAddHouse}
            checkStatus={checkStatus}
          />
        )}
        {(activeTab === 'sa-communities' || activeTab === 'sa-users' || activeTab === 'sa-alerts' || activeTab === 'sa-audit' || activeTab === 'sa-reported') && (
          <SuperAdminDashboard 
            user={user} 
            activeAlerts={activeAlerts}
            initialTab={
              activeTab === 'sa-communities' ? 0 :
              activeTab === 'sa-users' ? 1 :
              activeTab === 'sa-alerts' ? 2 :
              activeTab === 'sa-audit' ? 3 : 4
            }
            onSwitchCommunity={(id, name, center) => {
              setUser(prev => ({ ...prev, communityId: id, communityName: name, communityCenter: center }));
              setActiveTab('map');
              setIsSidebarOpen(false);
              if (center && center.length === 2 && mapRef.current) {
                  mapRef.current.flyTo(center, 18);
              }
              setMapFocusPosition(null); 
            }} 
          />
        )}
      </div>

      {
        showEmergencyMenu && (
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
        )
      }

      {
        pendingSOS && !showPetForm && (
          <div className="modal-overlay" onClick={() => setPendingSOS(null)}>
            <div className="auth-box confirmation-modal" onClick={e => e.stopPropagation()} style={{ textAlign: 'center', borderColor: '#ef4444' }}>
              <h2 style={{ color: '#ef4444' }}>⚠️ ¿CONFIRMAR ALERTA?</h2>
              <div style={{ fontSize: '1.2em', margin: '20px 0' }}>
                Has seleccionado:<br />
                <strong style={{ fontSize: '1.5em' }}>{pendingSOS.emoji} {pendingSOS.label.toUpperCase()}</strong>
              </div>
              <p style={{ color: '#94a3b8', marginBottom: '20px' }}>Esta acción notificará a todos tus vecinos de inmediato.</p>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                <button
                  onClick={() => setPendingSOS(null)}
                  style={{ background: '#475569', border: 'none', padding: '15px 25px', borderRadius: '8px', cursor: 'pointer', color: 'white', fontWeight: 'bold' }}
                >
                  CANCELAR
                </button>
                <button
                  onClick={confirmSOS}
                  className="sos-button"
                  style={{ width: 'auto', padding: '15px 25px', fontSize: '1em', marginTop: 0 }}
                >
                  🚨 CONFIRMAR
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* Pet Form Modal */}
      {showPetForm && (
        <div className="modal-overlay" onClick={() => { setShowPetForm(false); setPendingSOS(null); }}>
          <div className="auth-box pet-modal" onClick={e => e.stopPropagation()} style={{ textAlign: 'left', borderColor: '#fbbf24', maxWidth: '400px' }}>
            <h2 style={{ color: '#fbbf24', textAlign: 'center' }}>🐾 DATOS DE LA MASCOTA</h2>
            <p style={{ color: '#94a3b8', fontSize: '0.85em', textAlign: 'center', marginBottom: '20px' }}>
              Ayuda a tus vecinos a identificar a tu mascota rápidamente.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '0.8em', color: '#fbbf24', fontWeight: 'bold' }}>Nombre</label>
                <input
                  placeholder="Ej: Toby"
                  value={petFormData.name}
                  onChange={e => setPetFormData({ ...petFormData, name: e.target.value })}
                  style={{ width: '100%', marginTop: '4px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8em', color: '#fbbf24', fontWeight: 'bold' }}>Raza / Especie</label>
                <input
                  placeholder="Ej: Labrador, Gato siamés..."
                  value={petFormData.breed}
                  onChange={e => setPetFormData({ ...petFormData, breed: e.target.value })}
                  style={{ width: '100%', marginTop: '4px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8em', color: '#fbbf24', fontWeight: 'bold' }}>Características</label>
                <textarea
                  placeholder="Ej: Collar rojo, mancha en ojo derecho, muy asustadizo..."
                  value={petFormData.traits}
                  onChange={e => setPetFormData({ ...petFormData, traits: e.target.value })}
                  style={{ width: '100%', marginTop: '4px', minHeight: '80px', background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: 'white', padding: '10px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8em', color: '#fbbf24', fontWeight: 'bold' }}>Foto (Opcional)</label>
                <div style={{ marginTop: '4px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <label className="attach-btn" style={{ cursor: 'pointer', fontSize: '1.2em', background: '#334155', padding: '10px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    📷 {petFormData.photo ? 'Cambiar' : 'Subir Foto'}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files[0]
                        if (file) {
                          const reader = new FileReader()
                          reader.onloadend = () => setPetFormData({ ...petFormData, photo: reader.result })
                          reader.readAsDataURL(file)
                        }
                      }}
                      style={{ display: 'none' }}
                    />
                  </label>
                  {petFormData.photo && (
                    <div style={{ position: 'relative' }}>
                      <img src={petFormData.photo} alt="Preview" style={{ height: '50px', borderRadius: '4px' }} />
                      <button onClick={() => setPetFormData({ ...petFormData, photo: null })} style={{ position: 'absolute', top: -5, right: -5, background: 'red', color: 'white', border: 'none', borderRadius: '50%', width: '18px', height: '18px', cursor: 'pointer', fontSize: '10px' }}>x</button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '25px' }}>
              <button
                onClick={() => { setShowPetForm(false); setPendingSOS(null); }}
                style={{ flex: 1, background: '#475569', border: 'none', padding: '12px', borderRadius: '8px', cursor: 'pointer', color: 'white', fontWeight: 'bold' }}
              >
                CANCELAR
              </button>
              <button
                onClick={confirmSOS}
                disabled={!petFormData.name}
                className="sos-button"
                style={{ flex: 1, width: 'auto', padding: '12px', fontSize: '0.9em', marginTop: 0, opacity: petFormData.name ? 1 : 0.5 }}
              >
                🐾 LANZAR ALERTA
              </button>
            </div>
          </div>
        </div>
      )}
    </div >
  );
}

export default App;
