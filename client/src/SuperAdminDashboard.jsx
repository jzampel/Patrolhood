import React, { useState, useEffect } from 'react';
import { safeFetch } from './api';

const TABS = ['🏘️ Comunidades', '👥 Usuarios', '🏠 Casas', '🚨 Alertas Activas', '📊 Auditoría', '🚩 Reportados'];

function SuperAdminDashboard({ user, onSwitchCommunity }) {
    const [activeTab, setActiveTab] = useState(0);
    const [communities, setCommunities] = useState([]);
    const [users, setUsers] = useState([]);
    const [houses, setHouses] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // --- Audit Logs state ---
    const [logs, setLogs] = useState([]);
    const [logsLoading, setLogsLoading] = useState(false);
    const [logsHasMore, setLogsHasMore] = useState(true);

    // --- Reported Messages state ---
    const [reported, setReported] = useState([]);
    const [reportedLoading, setReportedLoading] = useState(false);

    // Selected items for context
    const [selectedCommunityId, setSelectedCommunityId] = useState('');

    // Modal state
    const [showUserModal, setShowUserModal] = useState(false);
    const [showCommModal, setShowCommModal] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [editingComm, setEditingComm] = useState(null);

    // Form states
    const [userForm, setUserForm] = useState({ name: '', surname: '', phone: '', email: '', password: '', role: 'user', communityId: '', mapLabel: '', address: '' });
    const [commForm, setCommForm] = useState({ name: '', telegramBotToken: '', center: [40.4168, -3.7038] });

    const fetchCommunities = async () => {
        setLoading(true);
        const data = await safeFetch(`${import.meta.env.VITE_API_URL || ''}/api/superadmin/communities`);
        if (data.success) {
            setCommunities(data.communities);
            if (!selectedCommunityId && data.communities.length > 0) setSelectedCommunityId(data.communities[0].id);
        }
        setLoading(false);
    };

    const fetchUsers = async (q = '') => {
        setLoading(true);
        const data = await safeFetch(`${import.meta.env.VITE_API_URL || ''}/api/superadmin/users?q=${q}`);
        if (data.success) setUsers(data.users);
        setLoading(false);
    };

    const fetchAllHouses = async () => {
        setLoading(true);
        const data = await safeFetch(`${import.meta.env.VITE_API_URL || ''}/api/superadmin/all-houses`);
        if (data.success) setHouses(data.houses);
        setLoading(false);
    };

    const loadLogs = async (communityId) => {
        if (!communityId) return;
        setLogsLoading(true);
        const url = `${import.meta.env.VITE_API_URL || ''}/api/admin/audit-logs?communityId=${communityId}`;
        const data = await safeFetch(url);
        if (data.success) { setLogs(data.logs); setLogsHasMore(data.logs.length >= 50); }
        setLogsLoading(false);
    };

    const fetchReported = async (communityId) => {
        if (!communityId) return;
        setReportedLoading(true);
        const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/admin/reported-messages?communityId=${communityId}`,
            { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
        const data = await res.json();
        if (data.success) setReported(data.messages);
        setReportedLoading(false);
    };

    useEffect(() => {
        fetchCommunities();
        fetchAllHouses();
        fetchUsers();
    }, []);

    useEffect(() => {
        if (activeTab === 0) { fetchCommunities(); fetchAllHouses(); fetchUsers(); }
        if (activeTab === 1) fetchUsers();
        if (activeTab === 2) fetchAllHouses();
        if (activeTab === 4) loadLogs(selectedCommunityId);
        if (activeTab === 5) fetchReported(selectedCommunityId);
    }, [activeTab]);

    useEffect(() => {
        if (activeTab === 4) loadLogs(selectedCommunityId);
        if (activeTab === 5) fetchReported(selectedCommunityId);
    }, [selectedCommunityId]);

    const handleUserSubmit = async (e) => {
        e.preventDefault();
        const url = editingUser 
            ? `${import.meta.env.VITE_API_URL || ''}/api/superadmin/users/${editingUser.id}`
            : `${import.meta.env.VITE_API_URL || ''}/api/superadmin/users`;
        
        const comm = communities.find(c => c.id === userForm.communityId);
        const payload = { ...userForm, communityName: comm?.name || '' };

        const data = await safeFetch(url, {
            method: editingUser ? 'PUT' : 'POST',
            body: JSON.stringify(payload)
        });

        if (data.success) {
            setShowUserModal(false);
            setEditingUser(null);
            fetchUsers(searchQuery);
        } else {
            alert(data.message || 'Error al guardar usuario');
        }
    };

    const handleCommSubmit = async (e) => {
        e.preventDefault();
        const url = editingComm 
            ? `${import.meta.env.VITE_API_URL || ''}/api/superadmin/communities/${editingComm.id}`
            : `${import.meta.env.VITE_API_URL || ''}/api/superadmin/communities`;

        const data = await safeFetch(url, {
            method: editingComm ? 'PUT' : 'POST',
            body: JSON.stringify(commForm)
        });

        if (data.success) {
            setShowCommModal(false);
            setEditingComm(null);
            fetchCommunities();
        }
    };

    const deleteUser = async (id) => {
        if (!window.confirm('¿Seguro que quieres eliminar este usuario?')) return;
        const data = await safeFetch(`${import.meta.env.VITE_API_URL || ''}/api/superadmin/users/${id}`, { method: 'DELETE' });
        if (data.success) fetchUsers(searchQuery);
    };

    const deleteComm = async (id) => {
        if (!window.confirm('⚠️ ATENCIÓN: Se eliminará la comunidad y TODOS sus datos (casas, mensajes, usuarios). ¿Continuar?')) return;
        const data = await safeFetch(`${import.meta.env.VITE_API_URL || ''}/api/superadmin/communities/${id}`, { method: 'DELETE' });
        if (data.success) fetchCommunities();
    };

    const deleteHouse = async (id) => {
        if (!window.confirm('¿Seguro que quieres eliminar esta etiqueta de casa?')) return;
        try {
            const data = await safeFetch(`${import.meta.env.VITE_API_URL || ''}/api/superadmin/houses/${id}`, { method: 'DELETE' });
            if (data.success) {
                fetchAllHouses();
            } else {
                alert('No se pudo eliminar: ' + (data.message || 'Error en el servidor'));
            }
        } catch (error) {
            alert('Error de conexión al eliminar.');
        }
    };

    const changeHouseCommunity = async (houseId, targetCommunityId) => {
        if (!targetCommunityId) return;
        const comm = communities.find(c => c.id === targetCommunityId);
        if (!comm) return;
        
        if (!window.confirm(`¿Mover esta casa a la comunidad "${comm.name}"?`)) return;

        try {
            const data = await safeFetch(`${import.meta.env.VITE_API_URL || ''}/api/superadmin/houses/${houseId}`, {
                method: 'PUT',
                body: JSON.stringify({ communityId: targetCommunityId, communityName: comm.name })
            });

            if (data.success) {
                fetchAllHouses();
            } else {
                alert('Error al mover: ' + (data.message || 'Desconocido'));
            }
        } catch (error) {
            alert('Error de conexión.');
        }
    };

    // Collapse state for communities in Tab 0
    const [expandedCommId, setExpandedCommId] = useState(null);

    const styles = {
        card: { background: '#1e293b', padding: '16px', borderRadius: '12px', border: '1px solid #334155', marginBottom: '12px' },
        btn: (color) => ({ background: color, border: 'none', color: 'white', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }),
        smallBtn: (color) => ({ background: color, border: 'none', color: 'white', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8em', marginLeft: '6px' }),
        input: { background: '#0f172a', color: 'white', border: '1px solid #334155', borderRadius: '8px', padding: '10px', width: '100%', marginBottom: '10px' },
        modal: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' },
        modalContent: { background: '#1e293b', padding: '24px', borderRadius: '16px', width: '100%', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto' },
    };

    return (
        <div style={{ padding: '20px', color: 'white' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1 style={{ color: '#fbbf24', margin: 0 }}>💎 DASHBOARD MASTER</h1>
                    <p style={{ color: '#94a3b8' }}>Super Admin: {user.name}</p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button style={styles.btn('#059669')} onClick={() => { 
                        setEditingUser(null); 
                        setUserForm({ name: '', surname: '', phone: '', email: '', password: '', role: 'user', communityId: communities[0]?.id || '', mapLabel: '', address: '' }); 
                        setShowUserModal(true); 
                    }}>+ Nuevo Usuario</button>
                </div>
            </div>

            <div className="dashboard-tabs" style={{ marginTop: '20px', display: 'flex', gap: '10px', borderBottom: '1px solid #334155', paddingBottom: '10px', overflowX: 'auto' }}>
                {TABS.map((t, i) => (
                    <button key={i} onClick={() => setActiveTab(i)}
                        style={{ background: activeTab === i ? '#fbbf24' : 'transparent', color: activeTab === i ? '#000' : '#94a3b8', border: 'none', padding: '10px 15px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                        {t}
                    </button>
                ))}
            </div>

            <div style={{ marginTop: '20px' }}>
                {/* === COMUNIDADES === */}
                {activeTab === 0 && (
                    <div>
                        <p style={{ color: '#94a3b8', fontSize: '0.85em', marginBottom: '15px' }}>Toca en una comunidad para ver y administrar sus casas.</p>
                        {communities.map(c => {
                            const commHouses = houses.filter(h => h.communityId === c.id);
                            const isExpanded = expandedCommId === c.id;

                            return (
                                <div key={c.id} style={styles.card}>
                                    <div 
                                        style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer', paddingBottom: isExpanded ? '10px' : '0', borderBottom: isExpanded ? '1px solid #334155' : 'none', marginBottom: isExpanded ? '10px' : '0' }}
                                        onClick={() => setExpandedCommId(isExpanded ? null : c.id)}
                                    >
                                        <div>
                                            <h3 style={{ margin: 0, color: '#fbbf24' }}>{isExpanded ? '▼' : '▶'} {c.name}</h3>
                                            <p style={{ fontSize: '0.85em', color: '#94a3b8', marginLeft: '20px' }}>ID: {c.id} | Vecinos: {c.memberCount} | Casas: {commHouses.length}</p>
                                        </div>
                                        <div style={{ display: 'flex', gap: '6px' }} onClick={e => e.stopPropagation()}>
                                            <button style={styles.smallBtn('#3b82f6')} onClick={() => onSwitchCommunity(c.id, c.name, c.center)}>🗺️ Ir</button>
                                            <button style={styles.smallBtn('#64748b')} onClick={() => { setEditingComm(c); setCommForm({ name: c.name, telegramBotToken: c.telegramBotToken || '', center: c.center }); setShowCommModal(true); }}>✏️ Editar</button>
                                            <button style={styles.smallBtn('#ef4444')} onClick={() => deleteComm(c.id)}>🗑️</button>
                                        </div>
                                    </div>

                                    {/* EXPANDED HOUSES VIEW */}
                                    {isExpanded && (
                                        <div style={{ paddingLeft: '20px', marginTop: '10px' }}>
                                            {commHouses.length === 0 ? (
                                                <p style={{ fontSize: '0.85em', color: '#64748b' }}>No hay casas en esta comunidad.</p>
                                            ) : (
                                                <div style={{ display: 'grid', gap: '8px' }}>
                                                    {commHouses.sort((a,b) => a.number && b.number ? a.number.localeCompare(b.number, undefined, {numeric:true}) : 0).map(h => {
                                                        const inhabitants = users.filter(u => u.mapLabel === h.number || u.phone === h.owner);
                                                        const statusColor = h.status === 'admin' ? '#22c55e' : (h.status === 'inhabited' ? '#3b82f6' : '#64748b');
                                                        
                                                        return (
                                                            <div key={h.id || h._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0f172a', padding: '10px', borderRadius: '8px', borderLeft: `4px solid ${statusColor}` }}>
                                                                <div>
                                                                    <strong>Casa #{h.number}</strong>
                                                                    {inhabitants.length > 0 ? (
                                                                        <div style={{ fontSize: '0.8em', color: '#cbd5e1', marginTop: '4px' }}>
                                                                            Habitada por: {inhabitants.map(u => `${u.name} ${u.surname}`).join(', ')}
                                                                        </div>
                                                                    ) : (
                                                                        <div style={{ fontSize: '0.8em', color: '#64748b', fontStyle: 'italic', marginTop: '4px' }}>Vacía</div>
                                                                    )}
                                                                </div>
                                                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                                                    <select 
                                                                        style={{ ...styles.input, marginBottom: 0, padding: '4px 8px', width: 'auto', fontSize: '0.8em', height: 'auto' }}
                                                                        value={""}
                                                                        onChange={(e) => changeHouseCommunity(h.id || h._id, e.target.value)}
                                                                    >
                                                                        <option value="" disabled>Mover a...</option>
                                                                        {communities.filter(c2 => c2.id !== c.id).map(c2 => (
                                                                            <option key={c2.id} value={c2.id}>{c2.name}</option>
                                                                        ))}
                                                                    </select>
                                                                    <button style={styles.smallBtn('#ef4444')} onClick={() => deleteHouse(h.id || h._id)}>🗑️</button>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* === USUARIOS === */}
                {activeTab === 1 && (
                    <div>
                        <input style={styles.input} placeholder="Buscar usuarios..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchUsers(searchQuery)} />
                        {users.map(u => (
                            <div key={u.id} style={styles.card}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <div>
                                        <h3 style={{ margin: 0 }}>{u.name} {u.surname} <span style={{ fontSize: '0.6em', background: '#334155', padding: '2px 6px', borderRadius: '4px' }}>{u.role}</span></h3>
                                        <p style={{ fontSize: '0.85em', color: '#94a3b8' }}>{u.phone} | {u.communityName} | Casa: {u.mapLabel || '?'}</p>
                                    </div>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        <button style={styles.smallBtn('#64748b')} onClick={() => { 
                                            setEditingUser(u); 
                                            setUserForm({ name: u.name, surname: u.surname, phone: u.phone, email: u.email, role: u.role, communityId: u.communityId, mapLabel: u.mapLabel || '', address: u.address || '' }); 
                                            setShowUserModal(true); 
                                        }}>✏️</button>
                                        <button style={styles.smallBtn('#ef4444')} onClick={() => deleteUser(u.id)}>🗑️</button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* === CASAS === */}
                {activeTab === 2 && (
                    <div>
                        <p style={{ color: '#94a3b8', fontSize: '0.85em', marginBottom: '15px' }}>Listado global de casas. <br/>💡 <i>Tip: Ahora también puedes administrar las casas desde la pestaña "Comunidades", desplegando la comunidad deseada.</i></p>
                        {loading && <p>Cargando casas...</p>}
                        {houses.map(h => {
                            const houseId = h.id || h._id; // Robust ID handling
                            return (
                                <div key={houseId} style={styles.card}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <h3 style={{ margin: 0 }}>🏠 Casa {h.number}</h3>
                                            <p style={{ fontSize: '0.85em', color: '#94a3b8' }}>{h.communityName} | Pos: {h.position?.[0]?.toFixed(4)}, {h.position?.[1]?.toFixed(4)}</p>
                                        </div>
                                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                            <select 
                                                style={{ ...styles.input, marginBottom: 0, padding: '4px 8px', width: 'auto', fontSize: '0.8em', height: 'auto' }}
                                                value={""}
                                                onChange={(e) => changeHouseCommunity(houseId, e.target.value)}
                                            >
                                                <option value="" disabled>Mover a...</option>
                                                {communities.map(c => (
                                                    <option key={c.id} value={c.id}>{c.name}</option>
                                                ))}
                                            </select>
                                            <button style={styles.smallBtn('#ef4444')} onClick={() => deleteHouse(houseId)}>🗑️ Eliminar</button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* === AUDITORÍA / REPORTADOS === */}
                {(activeTab === 4 || activeTab === 5) && (
                    <div>
                        <select style={styles.input} value={selectedCommunityId} onChange={e => setSelectedCommunityId(e.target.value)}>
                            {communities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <hr style={{ border: '0.5px solid #334155', margin: '15px 0' }} />
                        
                        {activeTab === 4 && (
                            logsLoading ? <p>Cargando registros...</p> : (
                                logs.length === 0 ? <p>Sin registros.</p> :
                                logs.map(l => (
                                    <div key={l._id} style={{ ...styles.card, borderLeft: '4px solid #fbbf24' }}>
                                        <div style={{ fontWeight: 'bold' }}>{l.action}</div>
                                        <div style={{ fontSize: '0.8em', color: '#94a3b8' }}>{l.adminName} - {new Date(l.timestamp).toLocaleString()}</div>
                                        {l.details && <pre style={{ fontSize: '0.7em', background: '#0f172a', padding: '5px', marginTop: '5px' }}>{JSON.stringify(l.details, null, 2)}</pre>}
                                    </div>
                                ))
                            )
                        )}

                        {activeTab === 5 && (
                            reportedLoading ? <p>Cargando reportes...</p> : (
                                reported.length === 0 ? <p>Sin reportes.</p> :
                                reported.map(r => (
                                    <div key={r._id} style={{ ...styles.card, borderLeft: '4px solid #ef4444' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <strong>{r.user}</strong>
                                            <span style={{ color: '#ef4444' }}>⚠️ {r.reports?.length} reportes</span>
                                        </div>
                                        <p style={{ margin: '8px 0' }}>{r.text}</p>
                                        <div style={{ fontSize: '0.8em', color: '#64748b' }}>#{r.channel}</div>
                                    </div>
                                ))
                            )
                        )}
                    </div>
                )}
            </div>

            {/* MODAL USUARIO */}
            {showUserModal && (
                <div style={styles.modal}>
                    <form style={styles.modalContent} onSubmit={handleUserSubmit}>
                        <h2 style={{ color: '#fbbf24' }}>{editingUser ? 'Editar Usuario' : 'Nuevo Usuario'}</h2>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <input style={styles.input} placeholder="Nombre" value={userForm.name} onChange={e => setUserForm({...userForm, name: e.target.value})} required />
                            <input style={styles.input} placeholder="Apellido" value={userForm.surname} onChange={e => setUserForm({...userForm, surname: e.target.value})} />
                        </div>
                        <input style={styles.input} placeholder="Teléfono" value={userForm.phone} onChange={e => setUserForm({...userForm, phone: e.target.value})} required />
                        {!editingUser && <input style={styles.input} type="password" placeholder="Contraseña" value={userForm.password} onChange={e => setUserForm({...userForm, password: e.target.value})} required />}
                        <input style={styles.input} placeholder="Email" value={userForm.email} onChange={e => setUserForm({...userForm, email: e.target.value})} />
                        
                        <label style={{ fontSize: '0.8em', color: '#94a3b8' }}>Comunidad</label>
                        <select style={styles.input} value={userForm.communityId} onChange={e => setUserForm({...userForm, communityId: e.target.value})}>
                            {communities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>

                        <label style={{ fontSize: '0.8em', color: '#94a3b8' }}>Rol</label>
                        <select style={styles.input} value={userForm.role} onChange={e => setUserForm({...userForm, role: e.target.value})}>
                            <option value="user">Vecino</option>
                            <option value="admin">Administrador</option>
                            <option value="moderator">Moderador</option>
                        </select>

                        <input style={styles.input} placeholder="Nº Casa (Label en mapa)" value={userForm.mapLabel} onChange={e => setUserForm({...userForm, mapLabel: e.target.value})} />

                        <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                            <button type="button" style={styles.btn('#475569')} onClick={() => setShowUserModal(false)}>Cancelar</button>
                            <button type="submit" style={styles.btn('#fbbf24')}>{editingUser ? 'Actualizar' : 'Crear Usuario'}</button>
                        </div>
                    </form>
                </div>
            )}

            {/* MODAL COMUNIDAD */}
            {showCommModal && (
                <div style={styles.modal}>
                    <form style={styles.modalContent} onSubmit={handleCommSubmit}>
                        <h2 style={{ color: '#fbbf24' }}>Editar Comunidad</h2>
                        <input style={styles.input} placeholder="Nombre Comunidad" value={commForm.name} onChange={e => setCommForm({...commForm, name: e.target.value})} required />
                        <input style={styles.input} placeholder="Telegram Bot Token" value={commForm.telegramBotToken} onChange={e => setCommForm({...commForm, telegramBotToken: e.target.value})} />
                        
                        <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                            <button type="button" style={styles.btn('#475569')} onClick={() => setShowCommModal(false)}>Cancelar</button>
                            <button type="submit" style={styles.btn('#fbbf24')}>Guardar Cambios</button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}

export default SuperAdminDashboard;
