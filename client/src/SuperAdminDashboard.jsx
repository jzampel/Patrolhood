import React, { useState, useEffect } from 'react';
import { safeFetch } from './api';

// Tabs: Comunidades, Usuarios Globales, Alertas Activas, Auditoría, Reportados
const TABS = ['🏘️ Comunidades', '👥 Usuarios Globales', '🚨 Alertas Activas', '📊 Auditoría', '🚩 Reportados'];

function SuperAdminDashboard({ user, onSwitchCommunity }) {
    const [activeTab, setActiveTab] = useState(0);
    const [communities, setCommunities] = useState([]);
    const [users, setUsers] = useState([]);
    const [alerts, setAlerts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // --- Audit Logs state ---
    const [logs, setLogs] = useState([]);
    const [logsLoading, setLogsLoading] = useState(false);
    const [logsHasMore, setLogsHasMore] = useState(true);
    const [logsLoadingMore, setLogsLoadingMore] = useState(false);

    // --- Reported Messages state ---
    const [reported, setReported] = useState([]);
    const [reportedLoading, setReportedLoading] = useState(false);

    // Selected community for audit/reported context
    const [selectedCommunityId, setSelectedCommunityId] = useState(user.communityId || '');

    const fetchCommunities = async () => {
        setLoading(true);
        const data = await safeFetch(`${import.meta.env.VITE_API_URL || ''}/api/superadmin/communities`);
        if (data.success) setCommunities(data.communities);
        setLoading(false);
    };

    const fetchUsers = async (q = '') => {
        setLoading(true);
        const data = await safeFetch(`${import.meta.env.VITE_API_URL || ''}/api/superadmin/users?q=${q}`);
        if (data.success) setUsers(data.users);
        setLoading(false);
    };

    const fetchAlerts = async () => {
        setLoading(false);
    };

    // Audit logs fetch
    const fetchLogs = (communityId, before = null) => {
        const url = `${import.meta.env.VITE_API_URL || ''}/api/admin/audit-logs?communityId=${communityId}${before ? `&before=${before}` : ''}`;
        return fetch(url, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } }).then(r => r.json());
    };

    const loadLogs = async (communityId) => {
        setLogsLoading(true);
        setLogs([]);
        setLogsHasMore(true);
        const data = await fetchLogs(communityId);
        if (data.success) { setLogs(data.logs); if (data.logs.length < 50) setLogsHasMore(false); }
        setLogsLoading(false);
    };

    const loadMoreLogs = async () => {
        if (logsLoadingMore || !logsHasMore || !logs.length) return;
        setLogsLoadingMore(true);
        const data = await fetchLogs(selectedCommunityId, logs[logs.length - 1].timestamp);
        if (data.success) { if (data.logs.length < 50) setLogsHasMore(false); setLogs(p => [...p, ...data.logs]); }
        setLogsLoadingMore(false);
    };

    // Reported messages fetch
    const fetchReported = async (communityId) => {
        setReportedLoading(true);
        setReported([]);
        const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/admin/reported-messages?communityId=${communityId}`,
            { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
        const data = await res.json();
        if (data.success) setReported(data.messages);
        setReportedLoading(false);
    };

    const deleteReported = async (msgId) => {
        if (!window.confirm('¿Borrar este mensaje?')) return;
        await fetch(`${import.meta.env.VITE_API_URL || ''}/api/forum/${msgId}?communityId=${selectedCommunityId}`,
            { method: 'DELETE', headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
        setReported(p => p.filter(m => m._id !== msgId));
    };

    const clearReports = async (msgId) => {
        await fetch(`${import.meta.env.VITE_API_URL || ''}/api/forum/${msgId}/clear-reports`,
            { method: 'POST', headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ communityId: selectedCommunityId }) });
        setReported(p => p.filter(m => m._id !== msgId));
    };

    const promoteUser = async (userId, role) => {
        if (!window.confirm(`¿Cambiar el rol de este usuario a ${role}?`)) return;
        const data = await safeFetch(`${import.meta.env.VITE_API_URL || ''}/api/superadmin/promote`, {
            method: 'POST',
            body: JSON.stringify({ userId, role })
        });
        if (data.success) fetchUsers(searchQuery);
    };

    useEffect(() => {
        if (activeTab === 0) fetchCommunities();
        if (activeTab === 1) fetchUsers();
        if (activeTab === 2) fetchAlerts();
        if (activeTab === 3 && selectedCommunityId) loadLogs(selectedCommunityId);
        if (activeTab === 4 && selectedCommunityId) fetchReported(selectedCommunityId);
    }, [activeTab]);

    // When community selector changes
    useEffect(() => {
        if (activeTab === 3 && selectedCommunityId) loadLogs(selectedCommunityId);
        if (activeTab === 4 && selectedCommunityId) fetchReported(selectedCommunityId);
    }, [selectedCommunityId]);

    // Make sure communities are loaded when switching to audit/reported tabs
    useEffect(() => {
        if ((activeTab === 3 || activeTab === 4) && communities.length === 0) fetchCommunities();
    }, [activeTab]);

    const handleSearch = (e) => {
        e.preventDefault();
        fetchUsers(searchQuery);
    };

    const styles = {
        card: { background: '#1e293b', padding: '20px', borderRadius: '12px', border: '1px solid #334155', marginBottom: '15px' },
        auditCard: { background: '#1e293b', padding: '14px', borderRadius: '10px', borderLeft: '4px solid #fbbf24', marginBottom: '10px' },
        btn: (color) => ({ background: color, border: 'none', color: 'white', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }),
        smallBtn: (color) => ({ background: color, border: 'none', color: 'white', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8em', marginLeft: '6px' }),
        ghost: { background: 'none', border: '1px solid #64748b', color: '#94a3b8', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8em', marginLeft: '6px' },
        input: { background: '#0f172a', color: 'white', border: '1px solid #334155', borderRadius: '8px', padding: '12px', width: '100%', maxWidth: '400px' },
        select: { background: '#0f172a', color: 'white', border: '1px solid #334155', borderRadius: '8px', padding: '10px', width: '100%', marginBottom: '16px' },
    };

    // Community picker for audit/reported tabs
    const CommunityPicker = () => (
        <div style={{ marginBottom: '16px' }}>
            <label style={{ color: '#94a3b8', fontSize: '0.85em', display: 'block', marginBottom: '6px' }}>
                🏘️ Seleccionar Comunidad:
            </label>
            <select
                value={selectedCommunityId}
                onChange={e => setSelectedCommunityId(e.target.value)}
                style={styles.select}
            >
                <option value="">— Selecciona una comunidad —</option>
                {communities.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                ))}
            </select>
        </div>
    );

    return (
        <div className="admin-dashboard-container" style={{ padding: '20px' }}>
            <div className="section-header">
                <h1 style={{ color: '#fbbf24', margin: 0, fontFamily: 'Cinzel, serif', fontSize: '2rem' }}>💎 GESTIÓN GLOBAL</h1>
                <p style={{ color: '#94a3b8' }}>Super Administrador: {user.name}</p>

                <div className="dashboard-tabs" style={{ marginTop: '20px' }}>
                    {TABS.map((t, i) => (
                        <button key={i} onClick={() => setActiveTab(i)}
                            className={`dashboard-tab ${activeTab === i ? 'active' : ''}`}>
                            {t}
                        </button>
                    ))}
                </div>
            </div>

            <div className="dashboard-content-scroll" style={{ marginTop: '20px' }}>

                {/* === COMUNIDADES === */}
                {activeTab === 0 && (
                    <div className="community-list">
                        {loading ? <p>Cargando comunidades...</p> :
                            communities.map(c => (
                                <div key={c.id} style={styles.card}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <h3 style={{ margin: 0, color: '#fbbf24' }}>{c.name}</h3>
                                            <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: '5px 0' }}>
                                                ID: {c.id} | 👥 {c.memberCount} miembros
                                            </p>
                                            <p style={{ color: '#64748b', fontSize: '0.8rem' }}>
                                                Bot: {c.telegramBotUsername || 'No configurado'}
                                            </p>
                                        </div>
                                        <button
                                            style={styles.btn('#3b82f6')}
                                            onClick={() => onSwitchCommunity(c.id, c.name, c.center)}
                                        >
                                            👁️ Ver Comunidad
                                        </button>
                                    </div>
                                </div>
                            ))
                        }
                    </div>
                )}

                {/* === USUARIOS GLOBALES === */}
                {activeTab === 1 && (
                    <div className="user-management">
                        <form onSubmit={handleSearch} style={{ marginBottom: '20px', display: 'flex', gap: '10px' }}>
                            <input
                                style={styles.input}
                                placeholder="Buscar por nombre, tlf, email o comunidad..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                            <button type="submit" style={styles.btn('#fbbf24')}>Buscar</button>
                        </form>

                        {loading ? <p>Cargando usuarios...</p> :
                            <div className="super-user-list">
                                {users.map(u => (
                                    <div key={u.id} style={{ ...styles.card, borderLeft: u.role === 'global_admin' ? '4px solid #fbbf24' : '1px solid #334155' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <h3 style={{ margin: 0 }}>{u.name} {u.surname}</h3>
                                                <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>{u.phone} | {u.email}</p>
                                                <p style={{ color: '#64748b', fontSize: '0.8rem' }}>
                                                    📍 {u.communityName} | Role: <strong>{u.role}</strong>
                                                </p>
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                {u.role !== 'global_admin' && (
                                                    u.role === 'admin' ? (
                                                        <button style={styles.btn('#64748b')} onClick={() => promoteUser(u.id, 'user')}>🏠 Quitar Admin</button>
                                                    ) : (
                                                        <button style={styles.btn('#059669')} onClick={() => promoteUser(u.id, 'admin')}>🛠️ Hacer Admin</button>
                                                    )
                                                )}
                                                <button style={styles.btn('#3b82f6')} onClick={() => onSwitchCommunity(u.communityId, u.communityName)}>🏘️ Ir a su comunidad</button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        }
                    </div>
                )}

                {/* === ALERTAS ACTIVAS === */}
                {activeTab === 2 && (
                    <div style={{ textAlign: 'center', padding: '40px' }}>
                        <p style={{ color: '#94a3b8' }}>Las alertas activas se muestran en tiempo real en el mapa de cada comunidad.</p>
                        <p>Usa la pestaña <b>Comunidades</b> para monitorizar una zona específica.</p>
                    </div>
                )}

                {/* === AUDITORÍA === */}
                {activeTab === 3 && (
                    <div>
                        <CommunityPicker />
                        {!selectedCommunityId ? (
                            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                                Selecciona una comunidad para ver su auditoría.
                            </div>
                        ) : logsLoading ? <p>Cargando...</p> : (
                            <div>
                                {logs.length === 0
                                    ? <p style={{ color: '#64748b' }}>Sin actividad registrada.</p>
                                    : logs.map(log => (
                                        <div key={log._id} style={{ ...styles.auditCard, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div>
                                                <div style={{ fontWeight: 'bold' }}>{log.action.replace(/_/g, ' ')}</div>
                                                <div style={{ fontSize: '0.85em', color: '#94a3b8' }}>Por: <strong>{log.adminName}</strong></div>
                                                {log.details && <div style={{ fontSize: '0.78em', background: '#0f172a', padding: '6px', borderRadius: '4px', marginTop: '6px', color: '#cbd5e1' }}>{JSON.stringify(log.details)}</div>}
                                            </div>
                                            <div style={{ fontSize: '0.75em', color: '#64748b', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                {new Date(log.timestamp).toLocaleString()}
                                            </div>
                                        </div>
                                    ))
                                }
                                {logsHasMore && (
                                    <button onClick={loadMoreLogs} disabled={logsLoadingMore}
                                        style={{ marginTop: '10px', padding: '12px', width: '100%', background: 'transparent', border: '1px dashed #fbbf24', color: '#fbbf24', borderRadius: '8px', cursor: 'pointer' }}>
                                        {logsLoadingMore ? 'Cargando...' : '📜 Cargar historial más antiguo'}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* === REPORTADOS === */}
                {activeTab === 4 && (
                    <div>
                        <CommunityPicker />
                        {!selectedCommunityId ? (
                            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                                Selecciona una comunidad para ver mensajes reportados.
                            </div>
                        ) : reportedLoading ? <p>Cargando...</p> : (
                            <div>
                                {reported.length === 0
                                    ? <div style={{ textAlign: 'center', padding: '40px', background: '#1e293b', borderRadius: '12px', color: '#64748b' }}>✅ No hay mensajes reportados en esta comunidad.</div>
                                    : reported.map(msg => (
                                        <div key={msg._id} style={styles.auditCard}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                <div>
                                                    <span style={{ color: '#fbbf24', fontWeight: 'bold' }}>{msg.user}</span>
                                                    <span style={{ color: '#64748b', fontSize: '0.8em', marginLeft: '8px' }}>#{msg.channel}</span>
                                                    <span style={{ color: '#ef4444', fontSize: '0.8em', marginLeft: '8px' }}>⚠️ {msg.reports.length} reportes</span>
                                                </div>
                                                <div>
                                                    <button style={styles.smallBtn('#ef4444')} onClick={() => deleteReported(msg._id)}>🗑️ Borrar</button>
                                                    <button style={styles.ghost} onClick={() => clearReports(msg._id)}>✅ Indultar</button>
                                                </div>
                                            </div>
                                            {msg.text && <p style={{ marginTop: '8px', color: '#e2e8f0' }}>{msg.text}</p>}
                                            {msg.image && <img src={msg.image} alt="adjunto" style={{ maxHeight: '80px', borderRadius: '6px', marginTop: '6px' }} />}
                                        </div>
                                    ))
                                }
                            </div>
                        )}
                    </div>
                )}

            </div>
        </div>
    );
}

export default SuperAdminDashboard;
