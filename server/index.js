require('dotenv').config();
process.env.JWT_SECRET = process.env.JWT_SECRET || 'f98a2c3d5e7b1a4c6e8f0a2d3c4b5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t1u2v3w4x5y6z7'; // Fallback to local default for Render
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');
const crypto = require('crypto');
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');
const { Queue, Worker } = require('bullmq');
const Redis = require('ioredis');

// Models
const User = require('./models/User');
const House = require('./models/House');
const ForumMessage = require('./models/ForumMessage');
const Invite = require('./models/Invite');
const Subscription = require('./models/Subscription');
const Community = require('./models/Community');
const EmergencyContact = require('./models/EmergencyContact');
const ActiveSOS = require('./models/ActiveSOS');
const AuditLog = require('./models/AuditLog');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// --- OBSERVABILITY MIDDLEWARE ---
app.use((req, res, next) => {
    const start = Date.now();
    const timestamp = new Date().toISOString();

    // Log request
    console.log(`[${timestamp}] 📡 ${req.method} ${req.url}`);

    // Track response
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[${timestamp}] ✅ ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
    });
    next();
});

// Serve static files from the client build
app.use(express.static(path.join(__dirname, '../client/dist')));

// --- SHARED MODULES ---
const connectDB = require('./shared/db');
const { pubClient, subClient, queueConnection, acquireLock, releaseLock, isRedisAvailable } = require('./shared/redis');
const admin = require('./shared/firebase');

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

if (isRedisAvailable) {
    io.adapter(createAdapter(pubClient, subClient));
}

const activeAlerts = new Map();
const communityBots = new Map();

connectDB();

const sosQueue = isRedisAvailable ? new Queue('SOS_QUEUE', { connection: queueConnection }) : null;

function startCommunityBot(communityName, token) {
    if (!token) return;
    try {
        if (communityBots.has(communityName)) {
            try { communityBots.get(communityName).stopPolling(); } catch (e) { }
        }

        const bot = new TelegramBot(token, { polling: true });
        communityBots.set(communityName, bot);
        console.log(`🤖 Bot Initialized for community: ${communityName}`);

        // Fetch bot username and store it
        bot.getMe().then(me => {
            Community.updateOne({ name: communityName }, { telegramBotUsername: me.username }).exec();
        }).catch(e => console.error(`Error fetching bot info for ${communityName}:`, e.message));

        bot.onText(/\/start (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const userId = match[1];
            try {
                const user = await User.findOne({ id: userId, communityName });
                if (user) {
                    user.telegramChatId = chatId;
                    await user.save();
                    bot.sendMessage(chatId, `✅ ¡Hola ${user.name}! Tu cuenta ha sido vinculada correctamente a la comunidad ${communityName}.`);
                } else {
                    bot.sendMessage(chatId, '❌ No encontramos tu usuario en esta comunidad.');
                }
            } catch (error) {
                bot.sendMessage(chatId, '❌ Error al vincular cuenta.');
            }
        });

        bot.onText(/\/start$/, (msg) => {
            bot.sendMessage(msg.chat.id, '❌ Usa el botón "Activar Alertas" desde la app para vincular tu cuenta.');
        });

        let consecutiveErrors = 0;
        bot.on('polling_error', (error) => {
            consecutiveErrors++;
            console.error(`Telegram Polling Error (${communityName}) [Try ${consecutiveErrors}/3]:`, error.code);

            // If token is invalid (401/404) OR we reached the strike limit, stop polling
            const isInvalidToken = error.code === 'ETELEGRAM' && (error.message.includes('401') || error.message.includes('404'));

            if (isInvalidToken || consecutiveErrors >= 3) {
                console.warn(`🛑 Stopping polling for ${communityName} after ${consecutiveErrors} errors.`);
                bot.stopPolling();
            }
        });
    } catch (err) {
        console.error(`❌ CRITICAL: Could not start Telegram Bot for ${communityName}:`, err.message);
    }
}

async function sendTelegramAlert(communityName, message) {
    const bot = communityBots.get(communityName);
    if (!bot) return;
    try {
        const users = await User.find({ communityName, telegramChatId: { $exists: true, $ne: null } });
        for (const user of users) {
            try {
                await bot.sendMessage(user.telegramChatId, message, { parse_mode: 'Markdown' });
            } catch (e) { }
        }
    } catch (err) {
        console.error('Error in sendTelegramAlert:', err);
    }
}

async function initAllBots() {
    const communities = await Community.find({ telegramBotToken: { $exists: true, $ne: null } });
    communities.forEach(c => startCommunityBot(c.name, c.telegramBotToken));
}
initAllBots();

// --- AUTH MIDDLEWARE ---
const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, message: 'No token provided' });

    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ success: false, message: 'Invalid token' });
        req.user = decoded;
        next();
    });
};

const checkCommunity = (req, res, next) => {
    // Priority: Body > Query
    const reqCommunityId = req.body.communityId || req.query.communityId;

    // If communityId is expected but missing, and user is not global admin, block it
    // For now, if missing, we continue (legacy behavior), but we'll add it to more routes
    if (!reqCommunityId) return next();

    if (req.user.role === 'global_admin') return next();

    if (req.user.communityId !== reqCommunityId) {
        return res.status(403).json({ success: false, message: 'Access denied: Community mismatch' });
    }
    next();
};

const logAction = async (communityId, admin, action, details) => {
    try {
        await AuditLog.create({
            communityId,
            adminId: admin.id,
            adminName: admin.name || 'Admin',
            action,
            details
        });
    } catch (error) { console.error('Error logging action:', error); }
};

// --- ROUTES ---

// Auth
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await User.findOne({
            $and: [
                { $or: [{ phone: username }, { name: username }, { email: username }] },
                { password: password }
            ]
        });
        if (user) {
            const community = await Community.findOne({ name: user.communityName });
            const tokenPayload = {
                id: user.id,
                role: user.role,
                communityId: user.communityId
            };
            const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '30d' });

            res.json({
                success: true,
                token,
                user: {
                    id: user.id,
                    name: user.name,
                    surname: user.surname,
                    address: user.address,
                    phone: user.phone,
                    role: user.role,
                    communityId: user.communityId,
                    communityName: user.communityName,
                    telegramBotUsername: community?.telegramBotUsername,
                    communityCenter: community?.center,
                    email: user.email,
                    telegramChatId: user.telegramChatId
                }
            });
        } else {
            res.status(401).json({ success: false, message: 'Credenciales incorrectas' });
        }
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
});

app.post('/api/register', async (req, res) => {
    const { name, surname, address, phone, email, password, communityName, inviteCode, role, telegramBotToken } = req.body;
    try {
        const existingUser = await User.findOne({ $or: [{ phone }, { email }] });
        if (existingUser) return res.status(400).json({ success: false, message: 'El teléfono o email ya está registrado' });

        if (role === 'admin') {
            const adminExists = await User.findOne({ communityName, role: 'admin' });
            if (adminExists) return res.status(400).json({ success: false, message: 'Esta comunidad ya tiene un administrador' });

            const communityId = crypto.randomUUID();
            const newUser = new User({ id: Date.now().toString(), name, surname, address, phone, email, password, communityName, communityId, role });
            await newUser.save();

            const newCommunity = new Community({ id: communityId, name: communityName, telegramBotToken, adminId: newUser.id });
            await newCommunity.save();

            if (telegramBotToken) startCommunityBot(communityName, telegramBotToken);
            res.json({ success: true, user: newUser });
        } else {
            const invite = await Invite.findOne({ code: inviteCode, used: false });
            if (!invite) return res.status(400).json({ success: false, message: 'Código de invitación inválido' });

            // Check if invite belongs to a community (even if we don't strictly require name, we need its ID)
            const community = await Community.findOne({ name: communityName });
            if (!community || invite.communityName !== communityName) {
                return res.status(400).json({ success: false, message: 'La invitación no corresponde a esta comunidad' });
            }

            invite.used = true;
            await invite.save();

            const newUser = new User({ id: Date.now().toString(), name, surname, address, phone, email, password, communityName, communityId: community.id, role });
            await newUser.save();

            const tokenPayload = {
                id: newUser.id,
                role: newUser.role,
                communityId: newUser.communityId
            };
            const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '30d' });

            res.json({ success: true, user: newUser, token });
        }
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// Admin
app.post('/api/admin/invite', authenticate, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Solo administradores' });
    const { role, communityId, communityName } = req.body;
    if (req.user.communityId !== communityId) return res.status(403).json({ success: false, message: 'Mismatch comunidad' });
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    try {
        await Invite.create({ code, role, communityId, communityName });
        res.json({ success: true, code });
    } catch (error) {
        console.error('Error in /api/admin/invite:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update community map center
app.post('/api/community/center', authenticate, checkCommunity, async (req, res) => {
    const { communityId, center, adminId } = req.body;
    try {
        const community = await Community.findOne({ id: communityId, adminId });
        if (!community) return res.status(403).json({ success: false, message: 'No autorizado' });

        community.center = center;
        await community.save();
        await logAction(communityId, req.user, 'UPDATE_MAP_CENTER', { center });
        res.json({ success: true, center: community.center });
    } catch (error) { res.status(500).json({ success: false }); }
});

// Update community telegram bot token
app.post('/api/community/bot-token', authenticate, checkCommunity, async (req, res) => {
    const { communityId, telegramBotToken, adminId } = req.body;
    try {
        const community = await Community.findOne({ id: communityId, adminId });
        if (!community) return res.status(403).json({ success: false, message: 'No autorizado' });

        community.telegramBotToken = telegramBotToken;
        await community.save();

        await logAction(communityId, req.user, 'UPDATE_BOT_TOKEN', { hasToken: !!telegramBotToken });

        if (telegramBotToken) {
            startCommunityBot(community.name, telegramBotToken);
        }

        res.json({ success: true, message: 'Token de Telegram actualizado' });
    } catch (error) {
        console.error('Error updating bot token:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/admin/audit-logs', authenticate, checkCommunity, async (req, res) => {
    const { communityId } = req.query;
    if (req.user.role !== 'admin') return res.status(403).json({ success: false });

    try {
        const logs = await AuditLog.find({ communityId }).sort({ timestamp: -1 }).limit(100);
        res.json({ success: true, logs });
    } catch (error) { res.status(500).json({ success: false }); }
});

// Database / Core
app.get('/api/users', authenticate, checkCommunity, async (req, res) => {
    const { communityId } = req.query;
    try {
        const users = await User.find({ communityId }, 'id name surname address phone role mapLabel');
        res.json({ success: true, users });
    } catch (error) { res.status(500).json({ success: false }); }
});

app.get('/api/users/:id', authenticate, checkCommunity, async (req, res) => {
    try {
        const user = await User.findOne({ id: req.params.id }, 'id name surname address phone role mapLabel telegramChatId communityId communityName');
        if (user) {
            const community = await Community.findOne({ id: user.communityId });
            res.json({ success: true, user: { ...user.toObject(), telegramBotUsername: community?.telegramBotUsername, communityCenter: community?.center } });
        } else res.status(404).json({ success: false });
    } catch (error) { res.status(500).json({ success: false }); }
});

app.put('/api/users/:id', authenticate, checkCommunity, async (req, res) => {
    const { name, surname, phone, email, address, houseNumber, telegramChatId } = req.body;
    try {
        const user = await User.findOne({ id: req.params.id });
        if (!user) return res.status(404).json({ success: false });
        if (name) user.name = name;
        if (surname) user.surname = surname;
        if (phone) user.phone = phone;
        if (email) user.email = email;
        if (address) user.address = address;
        if (telegramChatId !== undefined) user.telegramChatId = telegramChatId;
        if (houseNumber !== undefined) user.mapLabel = houseNumber;
        await user.save();

        if (houseNumber) {
            const house = await House.findOne({ number: houseNumber, communityId: user.communityId });
            if (house) {
                house.owner = user.phone;
                await house.save();
                io.to(user.communityId).emit('house_updated', house);
            }
        }
        res.json({ success: true, user });
    } catch (error) { res.status(500).json({ success: false }); }
});

app.get('/api/houses', authenticate, checkCommunity, async (req, res) => {
    const { communityId } = req.query;
    try {
        const houses = await House.find({ communityId });
        res.json({ success: true, houses });
    } catch (error) { res.status(500).json({ success: false }); }
});

app.post('/api/houses', authenticate, checkCommunity, async (req, res) => {
    const { communityId, ...houseData } = req.body;
    if (!communityId) return res.status(400).json({ success: false, message: 'Falta ID de comunidad' });

    try {
        // Try to find existing house in THIS community by number
        let house = await House.findOne({ communityId, number: houseData.number });

        if (house) {
            // Update existing
            Object.assign(house, houseData);
        } else {
            // Create new. Check if ID conflicts globally
            const idConflict = await House.findOne({ id: houseData.id });
            if (idConflict) {
                houseData.id = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            }
            house = new House({ ...houseData, communityId });
        }

        await house.save();
        io.to(communityId).emit('house_updated', house);
        res.json({ success: true, house });
    } catch (error) {
        console.error('Error in POST /api/houses:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.delete('/api/houses/:id', authenticate, checkCommunity, async (req, res) => {
    const { communityId } = req.query;
    try {
        const result = await House.deleteOne({ id: req.params.id, communityId });
        if (result.deletedCount > 0) {
            io.to(communityId).emit('house_deleted', req.params.id);
            res.json({ success: true });
        } else res.status(404).json({ success: false });
    } catch (error) { res.status(500).json({ success: false }); }
});

app.post('/api/houses/clear', authenticate, checkCommunity, async (req, res) => {
    const { communityId } = req.body;
    try {
        await House.deleteMany({ communityId });
        io.to(communityId).emit('houses_cleared');
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false }); }
});

// Forum
app.get('/api/forum/:channel', authenticate, checkCommunity, async (req, res) => {
    const { communityId } = req.query;
    try {
        const messages = await ForumMessage.find({ channel: req.params.channel, communityId }).sort({ timestamp: 1 }).limit(100);
        res.json({ success: true, messages });
    } catch (error) { res.status(500).json({ success: false }); }
});

app.post('/api/forum', authenticate, checkCommunity, async (req, res) => {
    const { channel, user, text, type, image, communityId, communityName } = req.body;
    try {
        const newMessage = await ForumMessage.create({
            id: Date.now().toString(),
            channel,
            communityId, // CRITICAL FIX: Add this
            communityName,
            user,
            text,
            type,
            image,
            timestamp: new Date()
        });

        const count = await ForumMessage.countDocuments({ channel, communityId });
        if (count > 100) {
            const oldest = await ForumMessage.findOne({ channel, communityId }).sort({ timestamp: 1 });
            if (oldest) await ForumMessage.deleteOne({ _id: oldest._id });
        }

        // Sockets (Local + Redis Bridge)
        io.to(communityId).emit('forum_message', newMessage);

        // Telegram Notification (Async / Resilient)
        if (channel !== 'ALERTAS') {
            const forumMsgText = text ? text : (image ? "📷 [Imagen]" : "");
            Community.findOne({ id: communityId }).then(community => {
                if (community) sendTelegramAlert(community.name, `💬 *Foro [${channel}]:* ${user}: ${forumMsgText}`);
            }).catch(e => console.error('Telegram notification error:', e));
        }

        res.json({ success: true, message: newMessage });
    } catch (error) {
        console.error('Forum post error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.delete('/api/forum/:id', authenticate, checkCommunity, async (req, res) => {
    const { communityId } = req.query;
    if (req.user.role !== 'admin' && req.user.role !== 'moderator') {
        return res.status(403).json({ success: false, message: 'Modulo de moderación: Solo admin o moderadores' });
    }

    try {
        const msg = await ForumMessage.findOneAndDelete({ _id: req.params.id, communityId });
        if (msg) {
            await logAction(communityId, req.user, 'DELETE_FORUM_MESSAGE', { author: msg.user, text: msg.text });
            io.to(communityId).emit('forum_message_deleted', req.params.id);
        }
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false }); }
});

app.post('/api/forum/:id/report', authenticate, checkCommunity, async (req, res) => {
    const { communityId } = req.body;
    try {
        const msg = await ForumMessage.findOne({ _id: req.params.id, communityId });
        if (!msg) return res.status(404).json({ success: false, message: 'Mensaje no encontrado' });

        if (!msg.reports) msg.reports = [];
        if (!msg.reports.includes(req.user.id)) {
            msg.reports.push(req.user.id);
            await msg.save();
        }
        res.json({ success: true, reportsCount: msg.reports.length });
    } catch (error) { res.status(500).json({ success: false }); }
});

// Contacts
app.get('/api/contacts', authenticate, checkCommunity, async (req, res) => {
    const { communityId } = req.query;
    try {
        const contacts = await EmergencyContact.find({ communityId });
        res.json({ success: true, contacts });
    } catch (error) { res.status(500).json({ success: false }); }
});

app.post('/api/contacts', authenticate, checkCommunity, async (req, res) => {
    const { communityId, communityName, name, phone, icon } = req.body;
    try {
        const contact = new EmergencyContact({ communityName, name, phone, icon });
        await contact.save();
        res.json({ success: true, contact });
    } catch (error) { res.status(500).json({ success: false }); }
});

app.delete('/api/contacts/:id', authenticate, checkCommunity, async (req, res) => {
    try {
        await EmergencyContact.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false }); }
});

// Push
app.post('/api/subscribe', authenticate, checkCommunity, async (req, res) => {
    const { token, userId, role, communityId } = req.body;
    try {
        await Subscription.findOneAndUpdate({ token }, { token, userId: userId || 'unknown', communityId, role: role || 'user' }, { upsert: true });
        res.status(201).json({ success: true });
    } catch (error) { res.status(500).json({ success: false }); }
});

// --- SOS REST API (Robust Flow) ---
app.post('/api/sos', authenticate, checkCommunity, async (req, res) => {
    const { communityId, userId, userName, houseNumber, emergencyType, emergencyTypeLabel, location, communityName } = req.body;
    if (!communityId || !userId) return res.status(400).json({ success: false, message: 'Missing data' });

    // --- ANTI-ABUSE: DEDUPLICATION ---
    const dedupeKey = `dedupe:sos:${communityId}:${houseNumber}`;
    try {
        let isDuplicate = null;
        if (isRedisAvailable) {
            try {
                isDuplicate = await pubClient.get(dedupeKey);
            } catch (redisErr) {
                console.warn('⚠️ Redis GET error (dedupe):', redisErr.message);
            }
        }

        if (isDuplicate) {
            return res.status(429).json({
                success: false,
                message: 'Ya hay una alerta activa para esta casa.',
                existingAlertId: isDuplicate
            });
        }

        // --- TTL CALCULATION ---
        let ttlMinutes = 20; // Default
        const label = (emergencyTypeLabel || '').toLowerCase();
        if (label.includes('robo')) ttlMinutes = 15;
        else if (label.includes('medica')) ttlMinutes = 30;
        else if (label.includes('incendio')) ttlMinutes = 45;
        const expiresAt = new Date(Date.now() + ttlMinutes * 60000);

        // 1. Persist to DB
        const alert = await ActiveSOS.create({
            communityId, userId, userName, houseNumber, emergencyType, emergencyTypeLabel, location,
            status: 'CREATED',
            expiresAt
        });

        if (isRedisAvailable) {
            try {
                await pubClient.set(dedupeKey, alert._id.toString(), { EX: 120 });
            } catch (redisErr) {
                console.warn('⚠️ Redis SET error (dedupe):', redisErr.message);
            }
        }

        // 2. Add to volatile memory (Legacy backcompat / Sockets)
        activeAlerts.set(communityId, { ...req.body, alertId: alert._id });

        // 3. Emit via Sockets (Fast path)
        io.to(communityId).emit('emergency_alert', { ...req.body, alertId: alert._id });

        // 4. DELEGATE Jobs
        if (isRedisAvailable && sosQueue) {
            try {
                const jobOpts = {
                    attempts: 5,
                    backoff: { type: 'exponential', delay: 10000 },
                    removeOnComplete: true
                };
                await sosQueue.add('NOTIFY_FCM', { alertId: alert._id }, { jobId: `fcm:${alert._id}`, ...jobOpts });
                await sosQueue.add('NOTIFY_TELEGRAM', { alertId: alert._id }, { jobId: `tg:${alert._id}`, ...jobOpts });
                await sosQueue.add('STATUS_UPDATE', { alertId: alert._id, nextStatus: 'DISPATCHED' }, { jobId: `status:${alert._id}`, ...jobOpts });
                return res.json({ success: true, alertId: alert._id });
            } catch (queueErr) {
                console.error('⚠️ BullMQ Queue Error:', queueErr.message);
                // Fallback to local mode if queue fails
            }
        }

        // Local fallback for monolithic deployments or Redis/Queue failures
        console.log('ℹ️ Running notifications in local/monolithic mode');
        await ActiveSOS.findByIdAndUpdate(alert._id, { status: 'DISPATCHED' });

        // Final logging to forum (local/fallback)
        ForumMessage.create({
            id: Date.now().toString(),
            channel: 'ALERTAS',
            communityId: alert.communityId,
            communityName: communityName || 'SISTEMA',
            user: alert.userName || 'SISTEMA',
            text: `🚨 ${alert.emergencyTypeLabel.toUpperCase()} en Casa #${alert.houseNumber}`,
            type: 'alert'
        }).then(alertMsg => io.to(alert.communityId).emit('forum_message', alertMsg))
            .catch(e => console.error('Local forum alert error:', e));

        const community = await Community.findOne({ id: communityId });
        if (community && community.telegramBotToken) {
            const sosText = `🚨 *¡ALERTA VECINAL!* 🚨\n\n` +
                `🔴 *Tipo:* ${alert.emergencyTypeLabel.toUpperCase()}\n` +
                `🏠 *Casa:* #${alert.houseNumber}\n` +
                `👤 *Vecino:* ${alert.userName}\n\n` +
                `⚠️ _Atención inmediata requerida_`;
            sendTelegramAlert(community.name, sosText);
        }

        res.json({ success: true, alertId: alert._id });
    } catch (error) {
        console.error('Error in POST /api/sos (Producer):', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/sos/active - Fetch all currently active alerts for a community
app.get('/api/sos/active', authenticate, checkCommunity, async (req, res) => {
    const { communityId } = req.query;
    try {
        const alerts = await ActiveSOS.find({ communityId, isActive: true });
        res.json({ success: true, alerts });
    } catch (error) {
        console.error('Error fetching active SOS:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// --- BULLMQ WORKER (Only if Redis available) ---
let sosWorker = null;
if (isRedisAvailable) {
    sosWorker = new Worker('SOS_QUEUE', async job => {
        const { alertId, nextStatus } = job.data;
        const alert = await ActiveSOS.findById(alertId);
        if (!alert) return;

        console.log(`👷 [Worker] Sub-task ${job.name} for alert ${alertId}`);

        if (job.name === 'STATUS_UPDATE') {
            await ActiveSOS.findByIdAndUpdate(alertId, { status: nextStatus || 'DISPATCHED' });

            // Final logging to forum (only once when dispatched)
            if (nextStatus === 'DISPATCHED' || !nextStatus) {
                const community = await Community.findOne({ id: alert.communityId });
                const alertMsg = await ForumMessage.create({
                    id: Date.now().toString(),
                    channel: 'ALERTAS',
                    communityId: alert.communityId,
                    communityName: community?.name || 'Unknown',
                    user: alert.userName || 'SISTEMA',
                    text: `🚨 ${alert.emergencyTypeLabel.toUpperCase()} en Casa #${alert.houseNumber}`,
                    type: 'alert'
                });
                io.to(alert.communityId).emit('forum_message', alertMsg);
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
                        notification: {
                            title: `🚨 SOS: ${community?.name || ''}`,
                            body: `¡Atención! ${alert.emergencyTypeLabel.toUpperCase()} en Casa #${alert.houseNumber}.`
                        },
                        data: { type: 'SOS', communityId: alert.communityId, houseNumber: String(alert.houseNumber), click_action: '/' }
                    });
                    await ActiveSOS.findByIdAndUpdate(alertId, {
                        'channels.fcm.status': 'SENT',
                        'channels.fcm.lastAt': new Date()
                    });
                } catch (e) {
                    console.error('FCM Error in Worker:', e);
                    await ActiveSOS.findByIdAndUpdate(alertId, {
                        'channels.fcm.status': 'FAILED',
                        'channels.fcm.lastError': e.message,
                        $inc: { 'channels.fcm.attempts': 1 }
                    });
                    throw e; // Rethrow for BullMQ retry
                }
            }
        }

        if (job.name === 'NOTIFY_TELEGRAM') {
            if (alert.channels?.telegram?.status === 'SENT') return;

            const community = await Community.findOne({ id: alert.communityId });
            if (community) {
                const sosText = `🚨 *¡ALERTA VECINAL!* 🚨\n\n` +
                    `🔴 *Tipo:* ${alert.emergencyTypeLabel.toUpperCase()}\n` +
                    `🏠 *Casa:* #${alert.houseNumber}\n` +
                    `👤 *Vecino:* ${alert.userName}\n\n` +
                    `⚠️ _Atención inmediata requerida_`;
                try {
                    await sendTelegramAlert(community.name, sosText);
                    await ActiveSOS.findByIdAndUpdate(alertId, {
                        'channels.telegram.status': 'SENT',
                        'channels.telegram.lastAt': new Date()
                    });
                } catch (e) {
                    console.error('Telegram Worker Error:', e);
                    await ActiveSOS.findByIdAndUpdate(alertId, {
                        'channels.telegram.status': 'FAILED',
                        'channels.telegram.lastError': e.message,
                        $inc: { 'channels.telegram.attempts': 1 }
                    });
                }
            }
        }

        if (job.name === 'CLEANUP_EXPIRED') {
            const expiredAlerts = await ActiveSOS.find({
                status: { $in: ['CREATED', 'DISPATCHED', 'ACKED'] },
                expiresAt: { $lt: new Date() }
            });

            for (const alert of expiredAlerts) {
                const hasLock = await acquireLock(`community:${alert.communityId}`);
                if (!hasLock) continue; // Skip and let next run handle it

                try {
                    await ActiveSOS.findByIdAndUpdate(alert._id, { status: 'EXPIRED', isActive: false });
                    activeAlerts.delete(alert.communityId);
                    const dedupeKey = `dedupe:sos:${alert.communityId}:${alert.houseNumber}`;
                    if (isRedisAvailable) await pubClient.del(dedupeKey);
                    io.to(alert.communityId).emit('stop_alert'); // Or emit specific EXPIRED event
                    console.log(`⏰ [Cleanup] Expired alert ${alert._id}`);
                } finally {
                    await releaseLock(`community:${alert.communityId}`);
                }
            }
        }
    }, { connection: queueConnection });

    sosWorker.on('completed', job => {
        console.log(`✅ Job ${job.id} completed!`);
    });

    sosWorker.on('failed', (job, err) => {
        console.error(`❌ Job ${job.id} failed with error ${err.message}`);
    });
}

app.post('/api/sos/stop', authenticate, checkCommunity, async (req, res) => {
    const { communityId, alertId } = req.body;
    try {
        const query = { communityId, _id: alertId, isActive: true };
        const alert = await ActiveSOS.findOne(query);

        if (!alert) return res.status(404).json({ success: false, message: 'Alerta no encontrada o ya resuelta' });

        // Permission check: Author OR Admin
        if (alert.userId !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'global_admin') {
            return res.status(403).json({ success: false, message: 'No tienes permiso para detener esta alerta' });
        }

        // 1. Update DB (Machine state: RESOLVED)
        await ActiveSOS.updateOne({ _id: alertId }, { isActive: false, status: 'RESOLVED', closedAt: new Date() });

        // 2. Clear Redis Dedupe Key
        const dedupeKey = `dedupe:sos:${communityId}:${alert.houseNumber}`;
        if (isRedisAvailable) await pubClient.del(dedupeKey);

        // 3. Clear memory (Legacy backcompat)
        const current = activeAlerts.get(communityId);
        if (current && (current.alertId || current._id)?.toString() === alertId) {
            activeAlerts.delete(communityId);
        }

        // 4. Notify sockets with specific alertId
        io.to(communityId).emit('stop_alert', { alertId });
        res.json({ success: true });
    } catch (error) {
        console.error('Error in POST /api/sos/stop:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// --- RECOVERY LOGIC ---
async function recoverActiveSOS() {
    try {
        const activeFromDB = await ActiveSOS.find({ isActive: true });
        console.log(`📡 Recovering ${activeFromDB.length} active alerts...`);
        // Note: activeAlerts Map is legacy and might be redundant if we use DB-only lookups,
        // but we keep it updated for socket logic that still refers to it.
        // We ensure it now uses a more robust structure or at least stores the latest per community correctly.
        activeFromDB.forEach(alert => {
            activeAlerts.set(alert.communityId, {
                alertId: alert._id,
                _id: alert._id,
                communityId: alert.communityId,
                userId: alert.userId,
                userName: alert.userName,
                houseNumber: alert.houseNumber,
                emergencyType: alert.emergencyType,
                emergencyTypeLabel: alert.emergencyTypeLabel,
                location: alert.location
            });
        });
    } catch (err) {
        console.error('Error recovering alerts:', err);
    }
}
recoverActiveSOS();

// --- SOCKETS ---

io.on('connection', (socket) => {
    socket.on('join_community', (communityId) => {
        if (communityId) {
            socket.join(communityId);
            if (activeAlerts.has(communityId)) {
                socket.emit('emergency_alert', activeAlerts.get(communityId));
            }
        }
    });

    // Retro-compatibility with older clients (will be phased out)
    socket.on('emergency_alert', async (data) => {
        console.log('⚠️ Legacy socket SOS received. Redirecting to API logic...');
        // We could just call the internal logic here or ignore it. 
        // For survival during migration, let's keep it but ideally clients use POST.
        // Actually, let's just emit it for now but the POST flow is the "new truth".
        activeAlerts.set(data.communityId, data);
        io.to(data.communityId).emit('emergency_alert', data);
    });

    socket.on('stop_alert', (data) => {
        const { communityId, userId, role } = data;
        const current = activeAlerts.get(communityId);
        if (current && (role === 'admin' || userId === current.userId)) {
            activeAlerts.delete(communityId);
            io.to(communityId).emit('stop_alert');
            ActiveSOS.updateMany({ communityId, isActive: true }, { isActive: false }).exec();
        }
    });
});

// Handle API 404s
app.use('/api/*', (req, res) => {
    res.status(404).json({ success: false, message: 'Ruta API no encontrada' });
});

// Catch-all for React app
app.get('*', (req, res) => {
    // Basic protection: if it looks like an API call but reached here, it's a 404
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ success: false, message: 'Ruta API no encontrada' });
    }
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`🚀 Cloud Server running on port ${PORT}`);
});
