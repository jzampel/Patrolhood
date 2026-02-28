import React, { useState, useEffect } from 'react';

function AdminDashboard({ user }) {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);

    const fetchLogs = (before = null) => {
        const url = `${import.meta.env.VITE_API_URL || ''}/api/admin/audit-logs?communityId=${user.communityId}${before ? `&before=${before}` : ''}`;
        return fetch(url, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        }).then(res => res.json());
    }

    useEffect(() => {
        fetchLogs()
            .then(data => {
                if (data.success) {
                    setLogs(data.logs);
                    if (data.logs.length < 50) setHasMore(false);
                }
                setLoading(false);
            })
            .catch(err => {
                console.error('Error fetching logs:', err);
                setLoading(false);
            });
    }, [user.communityId]);

    const loadMore = async () => {
        if (isLoadingMore || !hasMore || logs.length === 0) return;
        setIsLoadingMore(true);
        try {
            const oldestTimestamp = logs[logs.length - 1].timestamp;
            const data = await fetchLogs(oldestTimestamp);
            if (data.success) {
                if (data.logs.length < 50) setHasMore(false);
                setLogs(prev => [...prev, ...data.logs]);
            }
        } catch (e) {
            console.error(e);
        }
        setIsLoadingMore(false);
    }

    if (loading) return <div style={{ padding: '20px', color: 'white' }}>Cargando auditoría...</div>;

    return (
        <div className="admin-dashboard" style={{ padding: '20px', color: 'white', maxWidth: '800px', margin: '0 auto' }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#fbbf24', paddingLeft: '50px' }}>
                📊 Panel de Control & Auditoría
            </h2>
            <p style={{ color: '#94a3b8', marginBottom: '20px' }}>Historial de acciones administrativas en {user.communityName}</p>

            <div className="audit-list" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {logs.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px', background: '#1e293b', borderRadius: '12px', color: '#64748b' }}>
                        No hay actividades registradas todavía.
                    </div>
                ) : (
                    <>
                        {logs.map(log => (
                            <div key={log._id} style={{
                                background: '#1e293b', padding: '15px', borderRadius: '10px',
                                borderLeft: '4px solid #fbbf24', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'
                            }}>
                                <div>
                                    <div style={{ fontWeight: 'bold', fontSize: '1.1em' }}>
                                        {log.action.replace(/_/g, ' ')}
                                    </div>
                                    <div style={{ fontSize: '0.85em', color: '#94a3b8', marginTop: '4px' }}>
                                        Por: <strong>{log.adminName}</strong>
                                    </div>
                                    {log.details && (
                                        <div style={{ fontSize: '0.8em', background: '#0f172a', padding: '8px', borderRadius: '6px', marginTop: '8px', color: '#cbd5e1' }}>
                                            {JSON.stringify(log.details, null, 2)}
                                        </div>
                                    )}
                                </div>
                                <div style={{ fontSize: '0.75em', color: '#64748b', textAlign: 'right' }}>
                                    {new Date(log.timestamp).toLocaleString()}
                                </div>
                            </div>
                        ))}
                        {hasMore && (
                            <button
                                onClick={loadMore}
                                disabled={isLoadingMore}
                                style={{
                                    marginTop: '10px', padding: '12px', background: 'transparent',
                                    border: '1px dashed #fbbf24', color: '#fbbf24', borderRadius: '8px', cursor: 'pointer'
                                }}
                            >
                                {isLoadingMore ? 'Cargando más...' : 'Cargar historial más antiguo'}
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

export default AdminDashboard;
