import React, { useState, useEffect } from 'react';

const TABS = ['📊 Auditoría', '🚩 Reportados', '🔨 Miembros'];

function AdminDashboard({ user }) {
    const [activeTab, setActiveTab] = useState(0);

    // === TAB 1: Audit Logs ===
    const [logs, setLogs] = useState([]);
    const [logsLoading, setLogsLoading] = useState(true);
    const [logsHasMore, setLogsHasMore] = useState(true);
    const [logsLoadingMore, setLogsLoadingMore] = useState(false);

    const fetchLogs = (before = null) => {
        const url = `${import.meta.env.VITE_API_URL || ''}/api/admin/audit-logs?communityId=${user.communityId}${before ? `&before=${before}` : ''}`;
        return fetch(url, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } }).then(r => r.json());
    };

    useEffect(() => {
        fetchLogs().then(data => {
            if (data.success) { setLogs(data.logs); if (data.logs.length < 50) setLogsHasMore(false); }
            setLogsLoading(false);
        }).catch(() => setLogsLoading(false));
    }, [user.communityId]);

    const loadMoreLogs = async () => {
        if (logsLoadingMore || !logsHasMore || !logs.length) return;
        setLogsLoadingMore(true);
        const data = await fetchLogs(logs[logs.length - 1].timestamp);
        if (data.success) { if (data.logs.length < 50) setLogsHasMore(false); setLogs(p => [...p, ...data.logs]); }
        setLogsLoadingMore(false);
    };

    // === TAB 2: Reported Messages ===
    const [reported, setReported] = useState([]);
    const [reportedLoading, setReportedLoading] = useState(false);

    const fetchReported = async () => {
        reportedLoading || setReportedLoading(true);
        const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/admin/reported-messages?communityId=${user.communityId}`,
            { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
        const data = await res.json();
        if (data.success) setReported(data.messages);
        setReportedLoading(false);
    };

    useEffect(() => { if (activeTab === 1) fetchReported(); }, [activeTab]);

    const deleteReported = async (msgId) => {
        if (!window.confirm('¿Borrar este mensaje?')) return;
        await fetch(`${import.meta.env.VITE_API_URL || ''}/api/forum/${msgId}?communityId=${user.communityId}`,
            { method: 'DELETE', headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
        setReported(p => p.filter(m => m._id !== msgId));
    };

    const clearReports = async (msgId) => {
        await fetch(`${import.meta.env.VITE_API_URL || ''}/api/forum/${msgId}/clear-reports`,
            { method: 'POST', headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ communityId: user.communityId }) });
        setReported(p => p.filter(m => m._id !== msgId));
    };

    // === TAB 3: Members ===
    const [members, setMembers] = useState([]);
    const [membersLoading, setMembersLoading] = useState(false);
    const [banModal, setBanModal] = useState(null); // { userId, name }
    const [banDays, setBanDays] = useState('');
    const [banReason, setBanReason] = useState('');

    const fetchMembers = async () => {
        setMembersLoading(true);
        const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/users?communityId=${user.communityId}`,
            { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
        const data = await res.json();
        if (data.success) setMembers(data.users);
        setMembersLoading(false);
    };

    useEffect(() => { if (activeTab === 2) fetchMembers(); }, [activeTab]);

    const banUser = async () => {
        if (!banModal) return;
        await fetch(`${import.meta.env.VITE_API_URL || ''}/api/users/${banModal.userId}/ban`,
            {
                method: 'POST', headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ communityId: user.communityId, days: banDays ? parseInt(banDays) : null, reason: banReason })
            });
        setBanModal(null); setBanDays(''); setBanReason('');
        fetchMembers();
    };

    const unbanUser = async (userId) => {
        await fetch(`${import.meta.env.VITE_API_URL || ''}/api/users/${userId}/unban`,
            {
                method: 'POST', headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ communityId: user.communityId })
            });
        fetchMembers();
    };

    const styles = {
        card: { background: '#1e293b', padding: '14px', borderRadius: '10px', borderLeft: '4px solid #fbbf24', marginBottom: '10px' },
        btn: (color) => ({ background: color, border: 'none', color: 'white', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8em', marginLeft: '6px' }),
        ghost: { background: 'none', border: '1px solid #64748b', color: '#94a3b8', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8em', marginLeft: '6px' },
        input: { background: '#0f172a', color: 'white', border: '1px solid #334155', borderRadius: '6px', padding: '8px', width: '100%', marginBottom: '10px' },
        label: { color: '#94a3b8', fontSize: '0.85em', display: 'block', marginBottom: '4px' },
    };

    return (
        <div className="admin-dashboard-container">
            <div className="section-header">
                <h2 style={{ color: '#fbbf24', margin: 0, fontFamily: 'Cinzel, serif', letterSpacing: '1px' }}>🛡️ PANEL DE ADMINISTRACIÓN</h2>
                <p style={{ color: '#64748b', fontSize: '0.8rem', margin: '4px 0 10px 0' }}>{user.communityName}</p>

                {/* Tabs */}
                <div className="dashboard-tabs">
                    {TABS.map((t, i) => (
                        <button key={i} onClick={() => setActiveTab(i)}
                            className={`dashboard-tab ${activeTab === i ? 'active' : ''}`}>
                            {t}
                        </button>
                    ))}
                </div>
            </div>

            <div className="dashboard-content-scroll">
                <div className="dashboard-content">
                    {/* === AUDIT LOGS === */}
                    {activeTab === 0 && (
                        logsLoading ? <p>Cargando...</p> :
                            <div>
                                {logs.length === 0 ? <p style={{ color: '#64748b' }}>Sin actividad registrada.</p> :
                                    logs.map(log => (
                                        <div key={log._id} style={{ ...styles.card, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div>
                                                <div style={{ fontWeight: 'bold' }}>{log.action.replace(/_/g, ' ')}</div>
                                                <div style={{ fontSize: '0.85em', color: '#94a3b8' }}>Por: <strong>{log.adminName}</strong></div>
                                                {log.details && <div style={{ fontSize: '0.78em', background: '#0f172a', padding: '6px', borderRadius: '4px', marginTop: '6px', color: '#cbd5e1' }}>{JSON.stringify(log.details)}</div>}
                                            </div>
                                            <div style={{ fontSize: '0.75em', color: '#64748b', textAlign: 'right', whiteSpace: 'nowrap' }}>{new Date(log.timestamp).toLocaleString()}</div>
                                        </div>
                                    ))
                                }
                                {logsHasMore && <button onClick={loadMoreLogs} disabled={logsLoadingMore}
                                    style={{ marginTop: '10px', padding: '12px', width: '100%', background: 'transparent', border: '1px dashed #fbbf24', color: '#fbbf24', borderRadius: '8px', cursor: 'pointer' }}>
                                    {logsLoadingMore ? 'Cargando...' : '📜 Cargar historial más antiguo'}
                                </button>}
                            </div>
                    )}

                    {/* === REPORTED MESSAGES === */}
                    {activeTab === 1 && (
                        reportedLoading ? <p>Cargando...</p> :
                            <div>
                                {reported.length === 0
                                    ? <div style={{ textAlign: 'center', padding: '40px', background: '#1e293b', borderRadius: '12px', color: '#64748b' }}>✅ No hay mensajes reportados.</div>
                                    : reported.map(msg => (
                                        <div key={msg._id} style={styles.card}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                <div>
                                                    <span style={{ color: '#fbbf24', fontWeight: 'bold' }}>{msg.user}</span>
                                                    <span style={{ color: '#64748b', fontSize: '0.8em', marginLeft: '8px' }}>#{msg.channel}</span>
                                                    <span style={{ color: '#ef4444', fontSize: '0.8em', marginLeft: '8px' }}>⚠️ {msg.reports.length} reportes</span>
                                                </div>
                                                <div>
                                                    <button style={styles.btn('#ef4444')} onClick={() => deleteReported(msg._id)}>🗑️ Borrar</button>
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

                    {/* === MEMBERS === */}
                    {activeTab === 2 && (
                        membersLoading ? <p>Cargando...</p> :
                            <div>
                                {members.filter(m => m.id !== user.id).map(m => (
                                    <div key={m.id} style={{ ...styles.card, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ fontWeight: 'bold' }}>{m.name} {m.surname}
                                                {m.banned && <span style={{ marginLeft: '8px', fontSize: '0.75em', background: '#ef4444', color: 'white', padding: '2px 6px', borderRadius: '4px' }}>SUSPENDIDO</span>}
                                                {m.role === 'admin' && <span style={{ marginLeft: '8px', fontSize: '0.75em', background: '#fbbf24', color: '#000', padding: '2px 6px', borderRadius: '4px' }}>ADMIN</span>}
                                            </div>
                                            <div style={{ fontSize: '0.82em', color: '#94a3b8' }}>{m.phone} · {m.address}</div>
                                            {m.bannedUntil && <div style={{ fontSize: '0.78em', color: '#f87171' }}>Hasta: {new Date(m.bannedUntil).toLocaleDateString('es-ES')}{m.banReason ? ` · ${m.banReason}` : ''}</div>}
                                        </div>
                                        <div>
                                            {m.banned
                                                ? <button style={styles.btn('#22c55e')} onClick={() => unbanUser(m.id)}>✅ Desbanear</button>
                                                : <button style={styles.btn('#ef4444')} onClick={() => setBanModal({ userId: m.id, name: `${m.name} ${m.surname}` })}>🔨 Banear</button>
                                            }
                                        </div>
                                    </div>
                                ))}
                            </div>
                    )}
                </div>
            </div>

            {/* BAN MODAL */}
            {banModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setBanModal(null)}>
                    <div style={{ background: '#1e293b', padding: '28px', borderRadius: '14px', maxWidth: '380px', width: '90%' }} onClick={e => e.stopPropagation()}>
                        <h3 style={{ color: '#fbbf24', margin: '0 0 16px' }}>🔨 Suspender a {banModal.name}</h3>
                        <label style={styles.label}>Duración (días, dejar vacío = permanente)</label>
                        <input style={styles.input} type="number" min="1" placeholder="Ej: 7 (o vacío para permanente)" value={banDays} onChange={e => setBanDays(e.target.value)} />
                        <label style={styles.label}>Motivo</label>
                        <input style={styles.input} placeholder="Ej: Spam, lenguaje ofensivo..." value={banReason} onChange={e => setBanReason(e.target.value)} />
                        <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                            <button style={{ ...styles.btn('#64748b'), flex: 1, marginLeft: 0 }} onClick={() => setBanModal(null)}>Cancelar</button>
                            <button style={{ ...styles.btn('#ef4444'), flex: 1, marginLeft: 0 }} onClick={banUser}>Confirmar Suspensión</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default AdminDashboard;
