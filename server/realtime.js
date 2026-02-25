require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { pubClient, subClient } = require('./shared/redis');
const connectDB = require('./shared/db');
const ActiveSOS = require('./models/ActiveSOS');

const express = require('express');
const app = express();
app.get('/health', (req, res) => res.json({ status: 'OK', service: 'REALTIME', uptime: process.uptime() }));

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

io.adapter(createAdapter(pubClient, subClient));
connectDB();

const activeAlerts = new Map(); // communityId -> Map(alertId -> alertData)

// --- REDIS BRIDGE ---
// This enables ANY API node to trigger a socket event in ANY Realtime node
subClient.subscribe('SOCKET_UPDATE', (message) => {
    try {
        const { communityId, event, payload } = JSON.parse(message);

        // Internal state management for join-time catchup
        if (!activeAlerts.has(communityId)) activeAlerts.set(communityId, new Map());
        const communityAlerts = activeAlerts.get(communityId);

        if (event === 'emergency_alert') {
            communityAlerts.set(payload.alertId.toString(), payload);
        }
        if (event === 'stop_alert') {
            communityAlerts.delete(payload.alertId.toString());
        }

        // Broadcast to the whole community (across all Socket.io nodes)
        io.to(communityId).emit(event, payload);
        console.log(`📡 [Bridge] Socket Event: ${event} for community ${communityId}`);
    } catch (e) { console.error('Bridge Error:', e); }
});

// Legacy support for API calls (can be removed once API is fully transitioned to Pub/Sub)
subClient.subscribe('SOS_CREATED', (msg) => {
    const data = JSON.parse(msg);
    if (!activeAlerts.has(data.communityId)) activeAlerts.set(data.communityId, new Map());
    activeAlerts.get(data.communityId).set(data.alertId || data._id, data);
    io.to(data.communityId).emit('emergency_alert', data);
});

io.on('connection', (socket) => {
    socket.on('join_community', (communityId) => {
        if (!communityId) return;
        socket.join(communityId);
        if (activeAlerts.has(communityId)) {
            const communityAlerts = activeAlerts.get(communityId);
            communityAlerts.forEach(alert => {
                socket.emit('emergency_alert', alert);
            });
        }
    });
});

const PORT = process.env.REALTIME_PORT || 3002;
server.listen(PORT, () => console.log(`🚀 Realtime Standalone on port ${PORT}`));
