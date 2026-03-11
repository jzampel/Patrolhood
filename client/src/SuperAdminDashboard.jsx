import React, { useState, useEffect } from 'react';
import { safeFetch } from './api';

const TABS = ['📈 Estadísticas', '🏘️ Comunidades', '👥 Usuarios Globales', '🚨 Alertas Activas'];

function SuperAdminDashboard({ user, onSwitchCommunity }) {
    const [activeTab, setActiveTab] = useState(0);
    const [stats, setStats] = useState(null);
    const [communities, setCommunities] = useState([]);
    const [users, setUsers] = useState([]);
    const [alerts, setAlerts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const fetchStats = async () => {
        const data = await safeFetch(`${import.meta.env.VITE_API_URL || ''}/api/superadmin/stats`);
        if (data.success) setStats(data.stats);
    };

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
        setLoading(true);
        // We can reuse the existing SOS active endpoint if we loop through communities or add a global one
        // For now, let's assume we want a global SOS view. I'll add a backend endpoint for this if needed.
        // For MVP, stats show the count.
        setLoading(false);
    };

    useEffect(() => {
        if (activeTab === 0) fetchStats();
        if (activeTab === 1) fetchCommunities();
        if (activeTab === 2) fetchUsers();
        if (activeTab === 3) fetchAlerts();
    }, [activeTab]);

    const handleSearch = (e) => {
        e.preventDefault();
        fetchUsers(searchQuery);
    };

    const promoteUser = async (userId, role) => {
        if (!window.confirm(`¿Cambiar el rol de este usuario a ${role}?`)) return;
        const data = await safeFetch(`${import.meta.env.VITE_API_URL || ''}/api/superadmin/promote`, {
            method: 'POST',
            body: JSON.stringify({ userId, role })
        });
        if (data.success) fetchUsers(searchQuery);
    };

    const styles = {
        card: { background: '#1e293b', padding: '20px', borderRadius: '12px', border: '1px solid #334155', marginBottom: '15px' },
        statBox: { background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', padding: '20px', borderRadius: '16px', textAlign: 'center', border: '1px solid #fbbf24' },
        btn: (color) => ({ background: color, border: 'none', color: 'white', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }),
        input: { background: '#0f172a', color: 'white', border: '1px solid #334155', borderRadius: '8px', padding: '12px', width: '100%', maxWidth: '400px' }
    };

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
                {activeTab === 0 && stats && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
                        <div style={styles.statBox}>
                            <div style={{ fontSize: '2.5rem' }}>👥</div>
                            <div style={{ fontSize: '1.8rem', fontWeight: 'bold', margin: '10px 0' }}>{stats.userCount}</div>
                            <div style={{ color: '#94a3b8' }}>Usuarios Totales</div>
                        </div>
                        <div style={styles.statBox}>
                            <div style={{ fontSize: '2.5rem' }}>🏘️</div>
                            <div style={{ fontSize: '1.8rem', fontWeight: 'bold', margin: '10px 0' }}>{stats.communityCount}</div>
                            <div style={{ color: '#94a3b8' }}>Comunidades</div>
                        </div>
                        <div style={stats.activeAlertsCount > 0 ? { ...styles.statBox, border: '1px solid #ef4444', animation: 'pulse-red 2s infinite' } : styles.statBox}>
                            <div style={{ fontSize: '2.5rem' }}>🚨</div>
                            <div style={{ fontSize: '1.8rem', fontWeight: 'bold', margin: '10px 0' }}>{stats.activeAlertsCount}</div>
                            <div style={{ color: '#94a3b8' }}>Alertas Activas</div>
                        </div>
                    </div>
                )}

                {activeTab === 1 && (
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
                                            onClick={() => onSwitchCommunity(c.id, c.name)}
                                        >
                                            👁️ Ver Comunidad
                                        </button>
                                    </div>
                                </div>
                            ))
                        }
                    </div>
                )}

                {activeTab === 2 && (
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

                {activeTab === 3 && (
                    <div style={{ textAlign: 'center', padding: '40px' }}>
                        <p style={{ color: '#94a3b8' }}>Las alertas activas se muestran en tiempo real en el mapa de cada comunidad.</p>
                        <p>Usa la pestaña <b>Comunidades</b> para monitorizar una zona específica.</p>
                    </div>
                )}
            </div>
        </div>
    );
}

export default SuperAdminDashboard;
