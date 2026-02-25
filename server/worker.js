const { Worker } = require('bullmq');
const connectDB = require('./shared/db');
const { queueConnection, acquireLock, releaseLock, pubClient } = require('./shared/redis');
const ActiveSOS = require('./models/ActiveSOS');
const Community = require('./models/Community');
const Subscription = require('./models/Subscription');
const ForumMessage = require('./models/ForumMessage');
const admin = require('./shared/firebase');
const { sendAlert } = require('./services/telegram');
const express = require('express');

// Health Check
const app = express();
app.get('/health', (req, res) => res.json({ status: 'OK', service: 'WORKER', uptime: process.uptime() }));
app.listen(process.env.WORKER_HEALTH_PORT || 3003);

connectDB();

const sosWorker = new Worker('SOS_QUEUE', async job => {
    const { alertId, nextStatus } = job.data;

    if (job.name === 'CLEANUP_EXPIRED') {
        const expired = await ActiveSOS.find({ status: { $in: ['CREATED', 'DISPATCHED', 'ACKED'] }, expiresAt: { $lt: new Date() } });
        for (const a of expired) {
            const lock = await acquireLock(`community:${a.communityId}`);
            if (!lock) continue;
            try {
                await ActiveSOS.findByIdAndUpdate(a._id, { status: 'EXPIRED', isActive: false });
                const dedupeKey = `dedupe:sos:${a.communityId}:${a.houseNumber}`;
                await pubClient.del(dedupeKey);
                await pubClient.publish('SOCKET_UPDATE', JSON.stringify({ communityId: a.communityId, event: 'stop_alert', payload: {} }));
                console.log(`⏰ [Worker] Expired: ${a._id}`);
            } finally { await releaseLock(`community:${a.communityId}`); }
        }
        return;
    }

    const alert = await ActiveSOS.findById(alertId);
    if (!alert) return;

    if (job.name === 'STATUS_UPDATE') {
        await ActiveSOS.findByIdAndUpdate(alertId, { status: nextStatus || 'DISPATCHED' });
        if (nextStatus === 'DISPATCHED' || !nextStatus) {
            const community = await Community.findOne({ id: alert.communityId });
            const msg = await ForumMessage.create({
                id: Date.now().toString(), channel: 'ALERTAS', communityId: alert.communityId,
                communityName: community?.name || 'Unknown', user: alert.userName || 'SISTEMA',
                text: `🚨 ${alert.emergencyTypeLabel.toUpperCase()} en Casa #${alert.houseNumber}`, type: 'alert'
            });
            await pubClient.publish('SOCKET_UPDATE', JSON.stringify({ communityId: alert.communityId, event: 'forum_message', payload: msg }));
        }
    }

    if (job.name === 'NOTIFY_FCM') {
        if (alert.channels?.fcm?.status === 'SENT') return;
        const community = await Community.findOne({ id: alert.communityId });
        const subs = await Subscription.find({ communityId: alert.communityId });
        if (subs.length > 0) {
            const tokens = subs.map(s => s.token).filter(t => !!t);
            try {
                await admin.messaging().sendEachForMulticast({
                    tokens,
                    notification: { title: `🚨 SOS: ${community?.name || ''}`, body: `¡Atención! ${alert.emergencyTypeLabel.toUpperCase()} en Casa #${alert.houseNumber}.` },
                    data: { type: 'SOS', communityId: alert.communityId, houseNumber: String(alert.houseNumber), click_action: '/' }
                });
                await ActiveSOS.findByIdAndUpdate(alertId, { 'channels.fcm.status': 'SENT', 'channels.fcm.lastAt': new Date() });
            } catch (e) {
                await ActiveSOS.findByIdAndUpdate(alertId, { 'channels.fcm.status': 'FAILED', 'channels.fcm.lastError': e.message, $inc: { 'channels.fcm.attempts': 1 } });
                throw e;
            }
        }
    }

    if (job.name === 'NOTIFY_TELEGRAM') {
        if (alert.channels?.telegram?.status === 'SENT') return;
        const community = await Community.findOne({ id: alert.communityId });
        if (community?.telegramBotToken) {
            const text = `🚨 *¡ALERTA VECINAL!* 🚨\n\n🔴 *Tipo:* ${alert.emergencyTypeLabel.toUpperCase()}\n🏠 *Casa:* #${alert.houseNumber}\n👤 *Vecino:* ${alert.userName}`;
            try {
                await sendAlert(community.name, text);
                await ActiveSOS.findByIdAndUpdate(alertId, { 'channels.telegram.status': 'SENT', 'channels.telegram.lastAt': new Date() });
            } catch (e) {
                await ActiveSOS.findByIdAndUpdate(alertId, { 'channels.telegram.status': 'FAILED', 'channels.telegram.lastError': e.message, $inc: { 'channels.telegram.attempts': 1 } });
                throw e;
            }
        }
    }
}, { connection: queueConnection });
