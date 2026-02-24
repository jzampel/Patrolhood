require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const admin = require('firebase-admin');

// Models
const User = require('./models/User');
const House = require('./models/House');
const ForumMessage = require('./models/ForumMessage');
const Invite = require('./models/Invite');
const Subscription = require('./models/Subscription');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve static files from the client build
app.use(express.static(path.join(__dirname, '../client/dist')));

// MongoDB Connection
const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/neighbourhood-patrol';
mongoose.connect(mongoUri)
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// --- FIREBASE ADMIN SDK INITIALIZATION ---
let firebaseInitError = null;
try {
    let serviceAccount;
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        // Render/Heroku typically use environment variables
        // If it's base64 encoded, decode it, otherwise use as is
        try {
            serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString());
        } catch (e) {
            serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        }
    } else {
        // Local development
        serviceAccount = require('./serviceAccountKey.json');
    }

    if (!admin.apps.length) {
        // Repair private key format if it was mangled by env vars
        if (serviceAccount.private_key) {
            serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
        }

        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log('✅ Firebase Admin Initialized');
    }
} catch (error) {
    firebaseInitError = error.message;
    console.error('❌ Firebase Admin Initialization Error:', error.message);
}

// --- DEBUG/STATUS ROUTES ---

app.get('/api/production-status', (req, res) => {
    res.json({
        firebaseInitialized: admin.apps.length > 0,
        firebaseError: firebaseInitError,
        hasEnvVar: !!process.env.FIREBASE_SERVICE_ACCOUNT,
        nodeEnv: process.env.NODE_ENV,
        mongoReady: mongoose.connection.readyState === 1
    });
});

// Test Push Notification (delayed)
app.post('/api/debug/test-push', async (req, res) => {
    const { delaySeconds = 10 } = req.body;

    console.log(`🕒 Scheduling test push in ${delaySeconds} seconds...`);

    setTimeout(async () => {
        try {
            const subs = await Subscription.find({});
            console.log(`[TEST-PUSH] Sending to ${subs.length} devices...`);

            if (subs.length > 0) {
                const tokens = subs.map(s => s.token).filter(t => !!t);

                // Force a very basic notification structure for maximum compatibility
                const response = await admin.messaging().sendEachForMulticast({
                    tokens,
                    notification: {
                        title: '🔔 Test de Notificación',
                        body: 'Si ves esto con la app cerrada, ¡funciona! 🎉'
                    },
                    android: {
                        priority: 'high',
                        notification: {
                            sound: 'default'
                        }
                    },
                    webpush: {
                        headers: {
                            Urgency: 'high'
                        },
                        notification: {
                            icon: '/logo_bull.png',
                            requireInteraction: true
                        }
                    }
                });

                console.log(`[TEST-PUSH] Results: Success: ${response.successCount}, Failure: ${response.failureCount}`);
            }
        } catch (err) {
            console.error('[TEST-PUSH] Error:', err);
        }
    }, delaySeconds * 1000);

    res.json({ success: true, message: `Notification scheduled in ${delaySeconds}s` });
});

// Clean subscriptions (POST manual trigger)
app.post('/api/debug/clean-subscriptions', async (req, res) => {
    try {
        const result = await Subscription.deleteMany({});
        console.log(`🧹 Cleared ${result.deletedCount} subscriptions`);
        res.json({ success: true, count: result.deletedCount });
    } catch (err) {
        console.error('❌ Error clearing subscriptions:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET subscriptions count
app.get('/api/debug/subscriptions', async (req, res) => {
    try {
        const count = await Subscription.countDocuments();
        res.json({ success: true, count });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- TELEGRAM BOT SETUP ---
const TelegramBot = require('node-telegram-bot-api');
const token = process.env.TELEGRAM_BOT_TOKEN;
let bot = null;

if (token) {
    bot = new TelegramBot(token, { polling: true });
    console.log('🤖 Telegram Bot Initialized');

    // Handle /start command (Link account)
    bot.onText(/\/start (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const userId = match[1]; // The parameter passed in start=USER_ID

        try {
            const user = await User.findOne({ id: userId });
            if (user) {
                user.telegramChatId = chatId;
                await user.save();
                bot.sendMessage(chatId, `✅ ¡Hola ${user.name}! Tu cuenta ha sido vinculada correctamente. Recibirás las alertas de emergencia aquí.`);
                console.log(`🔗 Linked Telegram ChatId ${chatId} to User ${user.name} (${userId})`);
            } else {
                bot.sendMessage(chatId, '❌ No pudimos encontrar tu usuario. Intenta abrir el enlace desde la app de nuevo.');
            }
        } catch (error) {
            console.error('Telegram Link Error:', error);
            bot.sendMessage(chatId, '❌ Error interno al vincular cuenta.');
        }
    });

    // Handle simple /start without parameters
    bot.onText(/\/start$/, (msg) => {
        bot.sendMessage(msg.chat.id, '❌ Por favor, usa el botón "Activar Alertas" desde la página web de PatrolHood para vincular tu cuenta.');
    });

    // Log polling errors
    bot.on('polling_error', (error) => {
        console.error('Telegram Polling Error:', error.code);  // E.g. ETELEGRAM: 409 Conflict
    });

} else {
    console.log('⚠️ Telegram Bot Token not provided. Skipping Telegram setup.');
}

// --- ROUTES ---

// Subscribe (Push - Now FCM Token)
app.post('/api/subscribe', async (req, res) => {
    console.log('📝 Received subscription request:', JSON.stringify(req.body));
    const { token, userId, role } = req.body;

    if (!token) {
        console.error('❌ Missing token in subscription request');
        return res.status(400).json({ error: 'Token is required' });
    }

    try {
        const result = await Subscription.findOneAndUpdate(
            { token: token },
            {
                token,
                userId: userId || 'unknown',
                communityName: req.body.communityName, // Filter by community
                role: role || 'user'
            },
            { upsert: true, new: true }
        );
        console.log('✅ Subscription saved:', result);
        res.status(201).json({ success: true });
    } catch (error) {
        console.error('❌ Error saving subscription:', error); // Log the actual error
        res.status(500).json({ error: error.message });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await User.findOne({
            $and: [
                { $or: [{ phone: username }, { name: username }] },
                { password: password }
            ]
        });

        if (user) {
            res.json({
                success: true,
                user: {
                    id: user.id,
                    name: user.name,
                    role: user.role,
                    communityName: user.communityName, // Return community
                    email: user.email,
                    mapLabel: user.mapLabel,
                    address: user.address,
                    phone: user.phone,
                    telegramChatId: user.telegramChatId
                }
            });
        } else {
            res.status(401).json({ success: false, message: 'Credenciales incorrectas' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error de servidor' });
    }
});

// Register
app.post('/api/register', async (req, res) => {
    const { name, surname, address, phone, email, password, communityName, inviteCode, role } = req.body;
    try {
        // Check if phone or email already exists
        const existingUser = await User.findOne({ $or: [{ phone }, { email }] });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'El teléfono o email ya está registrado' });
        }

        let finalRole = 'user';

        if (role === 'admin') {
            // Check if community already exists with another admin (optional restriction)
            // For now, let's allow multiple admins if they know the community name, 
            // BUT the user request implies Admin CREATES or Miembro JOINS.
            // Let's check if the community has ANY users.
            const communityExists = await User.findOne({ communityName });
            if (communityExists) {
                // If it exists, maybe we allow joining as admin if they have a special master code?
                // For simplicity as requested: Admin creates, User joins with invite.
                // If an admin tries to create an existing one, we could just let them be another admin of it 
                // but usually the first one is the creator.
                finalRole = 'admin';
            } else {
                finalRole = 'admin';
            }
        } else {
            // Miembro MUST have a valid invite code for THAT community
            const invite = await Invite.findOne({
                code: inviteCode,
                communityName: communityName,
                used: false
            });

            if (!invite) {
                return res.status(400).json({ success: false, message: 'Código de invitación inválido para esta comunidad o ya usado' });
            }
            finalRole = invite.role;

            // Mark invite as used
            invite.used = true;
            await invite.save();
        }

        const newUser = new User({
            id: Date.now().toString(),
            name, surname, address, phone, email, password,
            communityName,
            role: finalRole
        });

        await newUser.save();

        // NOTIFY ADMINS of THIS community (VIA FCM)
        try {
            const adminSubs = await Subscription.find({ role: 'admin', communityName: communityName });
            if (adminSubs.length > 0) {
                const tokens = adminSubs.map(s => s.token);
                await admin.messaging().sendEachForMulticast({
                    tokens,
                    notification: {
                        title: '👤 Nuevo Vecino Registrado',
                        body: `${newUser.name} se ha unido a ${communityName}.`
                    }
                });
            }
        } catch (notifyErr) {
            console.error('Error notifying admins via FCM:', notifyErr);
        }

        res.json({
            success: true,
            user: {
                id: newUser.id,
                name: newUser.name,
                role: newUser.role,
                communityName: newUser.communityName,
                mapLabel: newUser.mapLabel,
                address: newUser.address,
                telegramChatId: newUser.telegramChatId
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Admin: Generate Invite
app.post('/api/admin/invite', async (req, res) => {
    const { role, communityName } = req.body;
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    try {
        await Invite.create({ code, role, communityName });
        res.json({ success: true, code });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Forum: Get Messages
app.get('/api/forum/:channel', async (req, res) => {
    const { communityName } = req.query;
    try {
        // Limit to last 100 messages
        const messages = await ForumMessage.find({
            channel: req.params.channel,
            communityName: communityName
        })
            .sort({ timestamp: 1 })
            .limit(100);
        res.json({ success: true, messages });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Users: Get All
app.get('/api/users', async (req, res) => {
    const { communityName } = req.query;
    try {
        const users = await User.find({ communityName }, 'id name surname address phone role mapLabel');
        res.json({ success: true, users });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Users: Get Single (for profile sync)
app.get('/api/users/:id', async (req, res) => {
    try {
        const user = await User.findOne({ id: req.params.id }, 'id name surname address phone role mapLabel telegramChatId');
        if (user) {
            res.json({ success: true, user });
        } else {
            res.status(404).json({ success: false, message: 'Usuario no encontrado' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});


// Houses: Get All
app.get('/api/houses', async (req, res) => {
    const { communityName } = req.query;
    try {
        const houses = await House.find({ communityName });
        res.json({ success: true, houses });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Houses: Add/Update
app.post('/api/houses', async (req, res) => {
    const { communityName, ...houseData } = req.body;
    try {
        // Upsert based on ID or Number AND community
        let house = await House.findOne({
            $and: [
                { communityName },
                { $or: [{ id: houseData.id }, { number: houseData.number }] }
            ]
        });

        if (house) {
            Object.assign(house, houseData);
        } else {
            house = new House({ ...houseData, communityName });
        }
        await house.save();

        io.to(communityName).emit('house_updated', house);
        res.json({ success: true, house });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Houses: Clear (Admin)
app.post('/api/houses/clear', async (req, res) => {
    const { communityName } = req.body;
    try {
        await House.deleteMany({ communityName });
        io.to(communityName).emit('houses_cleared');
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Houses: Delete
app.delete('/api/houses/:id', async (req, res) => {
    const { communityName } = req.query;
    try {
        const result = await House.deleteOne({ id: req.params.id, communityName });
        if (result.deletedCount > 0) {
            io.to(communityName).emit('house_deleted', req.params.id);
            res.json({ success: true });
        } else {
            res.status(404).json({ success: false, message: 'Casa no encontrada' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Users: Update
app.put('/api/users/:id', async (req, res) => {
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

        if (houseNumber !== undefined) user.mapLabel = houseNumber; // Allow clearing if empty string sent

        await user.save();

        // Assign House if provided (Legacy/Primary owner logic)
        if (houseNumber) {
            // Find house by number AND community
            const house = await House.findOne({ number: houseNumber, communityName: user.communityName });
            if (house) {
                house.owner = user.phone; // Link via phone
                await house.save();
                io.to(user.communityName).emit('house_updated', house); // Update map live
            }
        }

        res.json({ success: true, user });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

// Users: Delete
app.delete('/api/users/:id', async (req, res) => {
    try {
        const result = await User.deleteOne({ id: req.params.id });
        if (result.deletedCount > 0) {
            res.json({ success: true });
        } else {
            res.status(404).json({ success: false, message: 'Usuario no encontrado' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Forum: Post Message
app.post('/api/forum', async (req, res) => {
    const { channel, user, text, type, image, communityName } = req.body;
    try {
        const newMessage = await ForumMessage.create({
            id: Date.now().toString(),
            channel, communityName, user, text, type, image,
            timestamp: new Date()
        });

        // Cleanup old messages if > 100
        const count = await ForumMessage.countDocuments({ channel, communityName });
        if (count > 100) {
            const oldest = await ForumMessage.findOne({ channel, communityName }).sort({ timestamp: 1 });
            if (oldest) await ForumMessage.deleteOne({ _id: oldest._id });
        }

        io.to(communityName).emit('forum_message', newMessage);

        // Send Push Notifications via FCM (unless channel is ALERTAS, handled by SOS)
        if (channel !== 'ALERTAS') {
            try {
                const subs = await Subscription.find({ communityName });
                if (subs.length > 0) {
                    const tokens = subs.map(s => s.token);
                    await admin.messaging().sendEachForMulticast({
                        tokens,
                        notification: {
                            title: `💬 Foro (${communityName}): ${channel}`,
                            body: `${user}: ${text?.substring(0, 50)}${text?.length > 50 ? '...' : ''}`
                        },
                        data: {
                            channel,
                            click_action: '/'
                        }
                    });
                }
            } catch (fcmErr) {
                console.error('FCM Multicast Error (Forum):', fcmErr);
            }

            // --- TELEGRAM FORUM NOTIFICATION --- (Needs community specific bots or logic, keeping for now)
            if (bot) {
                try {
                    const telegramUsers = await User.find({ communityName, telegramChatId: { $exists: true, $ne: null } });
                    const msgText = text ? text : (image ? "📷 [Imagen]" : "");
                    const forumMessage = `💬 *Foro [${communityName}]: ${channel}*\n\n` +
                        `👤 *${user}:* ${msgText}`;

                    telegramUsers.forEach(u => {
                        bot.sendMessage(u.telegramChatId, forumMessage, { parse_mode: 'Markdown' })
                            .catch(err => console.error(`[TELEGRAM] Failed to send forum msg to ${u.name}:`, err.message));
                    });
                } catch (tgErr) {
                    console.error('[TELEGRAM] Forum notification error:', tgErr);
                }
            }
        }

        res.json({ success: true, message: newMessage });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// --- SOCKETS ---

// Store active alert state in memory
let activeAlert = null;

io.on('connection', (socket) => {
    console.log('✅ Socket connected:', socket.id);

    // Join community room
    socket.on('join_community', (communityName) => {
        if (communityName) {
            socket.join(communityName);
            console.log(`🏠 Socket ${socket.id} joined room: ${communityName}`);
        }
    });

    socket.on('emergency_alert', async (data) => {
        const communityName = data.communityName;
        console.log(`🚨 EMERGENCY [${communityName}]:`, data);

        // Store the active alert details (Should be per community, simplifying for now)
        // In a real app, this should be a Map or DB entry
        activeAlert = {
            userId: data.userId,
            communityName: communityName,
            houseNumber: data.houseNumber,
            startTime: Date.now()
        };

        io.to(communityName).emit('emergency_alert', data);

        // Auto-post to forum
        try {
            const alertMsg = await ForumMessage.create({
                id: Date.now().toString(),
                channel: 'ALERTAS',
                communityName: communityName,
                user: data.userName || 'SISTEMA',
                text: `🚨 ${data.emergencyTypeLabel.toUpperCase()} en Casa #${data.houseNumber}`,
                type: 'alert'
            });
            io.to(communityName).emit('forum_message', alertMsg);

            // Push Notifications via FCM
            try {
                const subs = await Subscription.find({ communityName });
                console.log(`[FCM] Found ${subs.length} subscribers for SOS alert in ${communityName}`);
                if (subs.length > 0) {
                    const tokens = subs.map(s => s.token).filter(t => !!t);
                    const response = await admin.messaging().sendEachForMulticast({
                        tokens,
                        notification: {
                            title: `🚨 ALERTA SOS: ${communityName}`,
                            body: `¡Atención! ${data.emergencyTypeLabel.toUpperCase()} en Casa #${data.houseNumber}. Vecino: ${data.userName}`
                        },
                        data: {
                            type: 'SOS',
                            communityName: String(communityName),
                            houseNumber: String(data.houseNumber),
                            location: JSON.stringify(data.location),
                            click_action: '/'
                        },
                        // ... (rest same, except filtered by community subs)
                        android: {
                            priority: 'high',
                            notification: {
                                sound: 'default',
                                clickAction: 'OPEN_ACTIVITY_1'
                            }
                        },
                        webpush: {
                            headers: {
                                Urgency: 'high'
                            },
                            notification: {
                                body: `¡Atención! ${data.emergencyTypeLabel.toUpperCase()} en Casa #${data.houseNumber}. Vecino: ${data.userName}`,
                                icon: '/logo_bull.png',
                                badge: '/logo_bull.png',
                                tag: 'sos-alert',
                                requireInteraction: true,
                                data: {
                                    url: '/'
                                }
                            }
                        }
                    });
                    console.log(`[FCM] SOS sent. Successes: ${response.successCount}, Failures: ${response.failureCount}`);

                    response.responses.forEach((resp, idx) => {
                        if (!resp.success) {
                            console.error(`[FCM] Delivery failed to token ${tokens[idx].substring(0, 15)}... Error:`, resp.error.message);
                            // If token is invalid or not registered, we should ideally remove it
                            if (resp.error.code === 'messaging/invalid-registration-token' ||
                                resp.error.code === 'messaging/registration-token-not-registered') {
                                console.log(`[FCM] Suggestion: Remove stale token ${tokens[idx].substring(0, 15)}...`);
                            }
                        } else {
                            console.log(`[FCM] Delivery success to token ${tokens[idx].substring(0, 15)}... Message ID: ${resp.messageId}`);
                        }
                    });
                }
            } catch (fcmErr) {
                console.error('FCM Multicast Error (SOS):', fcmErr);
            }



            // --- TELEGRAM NOTIFICATION ---
            if (bot) {
                try {
                    // Find all users with a linked Telegram Chat ID
                    const telegramUsers = await User.find({ telegramChatId: { $exists: true, $ne: null } });
                    console.log(`[TELEGRAM] Found ${telegramUsers.length} users to notify.`);

                    const sosMessage = `🚨 *¡ALERTA VECINAL!* 🚨\n\n` +
                        `🔴 *Tipo:* ${data.emergencyTypeLabel.toUpperCase()}\n` +
                        `🏠 *Casa:* #${data.houseNumber}\n` +
                        `👤 *Vecino:* ${data.userName}\n\n` +
                        `⚠️ _Atención inmediata requerida_`;

                    const locationOptions = {
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: "🌍 Ver en Mapa", url: "https://your-app-url.onrender.com" }] // TODO: Replace with env var
                            ]
                        }
                    };

                    telegramUsers.forEach(u => {
                        bot.sendMessage(u.telegramChatId, sosMessage, { parse_mode: 'Markdown' })
                            .then(() => {
                                if (data.location) {
                                    bot.sendLocation(u.telegramChatId, data.location.lat, data.location.lng);
                                }
                            })
                            .catch(err => console.error(`[TELEGRAM] Failed to send to ${u.name}:`, err.message));
                    });

                } catch (tgErr) {
                    console.error('[TELEGRAM] Error sending alerts:', tgErr);
                }
            }

        } catch (err) {
            console.error('Error processing alert:', err);
        }
    });

    // SOS STOP logic
    socket.on('stop_alert', (data) => {
        // data should contain { userId, role, communityName }
        const requesterId = data?.userId;
        const requesterRole = data?.role;
        const communityName = data?.communityName;

        // If no active alert, just emit stop to be safe
        if (!activeAlert) {
            io.to(communityName).emit('stop_alert');
            return;
        }

        // Check permissions: Admin OR the user who started it
        if (requesterRole === 'admin' || (requesterId && requesterId === activeAlert.userId)) {
            console.log(`🔕 Alert stopped in ${communityName} by ${requesterRole === 'admin' ? 'Admin' : 'Owner'}`);
            activeAlert = null; // Clear active alert
            io.to(communityName).emit('stop_alert');
        } else {
            console.log('⛔ Unauthorized attempt to stop alert');
            socket.emit('error', { message: 'No tienes permiso para desactivar esta alerta.' });
        }
    });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`🚀 Cloud Server running on port ${PORT}`);
});
