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

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log('✅ Firebase Admin Initialized');
} catch (error) {
    console.error('❌ Firebase Admin Initialization Error:', error.message);
}

// --- DEBUG ROUTES ---
app.get('/api/debug/subscriptions', async (req, res) => {
    try {
        const count = await Subscription.countDocuments({});
        const subs = await Subscription.find({});
        res.json({
            success: true,
            count,
            tokens: subs.map(s => (s.token ? s.token.substring(0, 10) + '...' : 'INVALID_TOKEN'))
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/debug/clear-subscriptions', async (req, res) => {
    try {
        const result = await Subscription.deleteMany({});
        res.json({ success: true, message: `Deleted ${result.deletedCount} old subscriptions.` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
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

// --- ROUTES ---

// Subscribe (Push - Now FCM Token)
app.post('/api/subscribe', async (req, res) => {
    const { token, userId, role } = req.body;
    try {
        await Subscription.findOneAndUpdate(
            { token: token },
            { token, userId, role },
            { upsert: true, new: true }
        );
        res.status(201).json({ success: true });
    } catch (error) {
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
            res.json({ success: true, user: { id: user.id, name: user.name, role: user.role, mapLabel: user.mapLabel, address: user.address, phone: user.phone } });
        } else {
            res.status(401).json({ success: false, message: 'Credenciales incorrectas' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error de servidor' });
    }
});

// Register
app.post('/api/register', async (req, res) => {
    const { name, surname, address, phone, password, inviteCode } = req.body;
    try {
        const invite = await Invite.findOne({ code: inviteCode, used: false });
        if (!invite) {
            return res.status(400).json({ success: false, message: 'Código inválido o usado' });
        }

        const existingUser = await User.findOne({ phone });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'El teléfono ya está registrado' });
        }

        const newUser = new User({
            id: Date.now().toString(),
            name, surname, address, phone, password,
            role: invite.role
        });

        await newUser.save();

        invite.used = true;
        await invite.save();

        // NOTIFY ADMINS (VIA FCM)
        try {
            const adminSubs = await Subscription.find({ role: 'admin' });
            if (adminSubs.length > 0) {
                const tokens = adminSubs.map(s => s.token);
                await admin.messaging().sendEachForMulticast({
                    tokens,
                    notification: {
                        title: '👤 Nuevo Vecino Registrado',
                        body: `${newUser.name} ${newUser.surname} se ha unido a la comunidad.`
                    }
                });
            }
        } catch (notifyErr) {
            console.error('Error notifying admins via FCM:', notifyErr);
        }

        res.json({ success: true, user: { id: newUser.id, name: newUser.name, role: newUser.role, mapLabel: newUser.mapLabel, address: newUser.address } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Admin: Generate Invite
app.post('/api/admin/invite', async (req, res) => {
    const { role } = req.body;
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    try {
        await Invite.create({ code, role });
        res.json({ success: true, code });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Forum: Get Messages
app.get('/api/forum/:channel', async (req, res) => {
    try {
        // Limit to last 100 messages
        const messages = await ForumMessage.find({ channel: req.params.channel })
            .sort({ timestamp: 1 })
            .limit(100);
        res.json({ success: true, messages });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Users: Get All
app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find({}, 'id name surname address phone role mapLabel');
        res.json({ success: true, users });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Houses: Get All
app.get('/api/houses', async (req, res) => {
    try {
        const houses = await House.find({});
        res.json({ success: true, houses });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Houses: Add/Update
app.post('/api/houses', async (req, res) => {
    const houseData = req.body;
    try {
        // Upsert based on ID or Number
        let house = await House.findOne({ $or: [{ id: houseData.id }, { number: houseData.number }] });
        if (house) {
            Object.assign(house, houseData);
        } else {
            house = new House(houseData);
        }
        await house.save();

        io.emit('house_updated', house);
        res.json({ success: true, house });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Houses: Clear (Admin)
app.post('/api/houses/clear', async (req, res) => {
    try {
        await House.deleteMany({});
        io.emit('houses_cleared');
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Houses: Delete
app.delete('/api/houses/:id', async (req, res) => {
    try {
        const result = await House.deleteOne({ id: req.params.id });
        if (result.deletedCount > 0) {
            io.emit('house_deleted', req.params.id);
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
    const { name, surname, phone, address, houseNumber } = req.body;
    try {
        const user = await User.findOne({ id: req.params.id });
        if (!user) return res.status(404).json({ success: false });

        if (name) user.name = name;
        if (surname) user.surname = surname;
        if (phone) user.phone = phone;
        if (address) user.address = address;

        if (houseNumber !== undefined) user.mapLabel = houseNumber; // Allow clearing if empty string sent

        await user.save();

        // Assign House if provided (Legacy/Primary owner logic)
        if (houseNumber) {
            // Find house by number (ignore case/spacing ideally, but strict for now)
            const house = await House.findOne({ number: houseNumber });
            if (house) {
                house.owner = user.phone; // Link via phone
                await house.save();
                io.emit('house_updated', house); // Update map live
            }
        }

        res.json({ success: true, user });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

// Forum: Post Message
app.post('/api/forum', async (req, res) => {
    const { channel, user, text, type, image } = req.body;
    try {
        const newMessage = await ForumMessage.create({
            id: Date.now().toString(),
            channel, user, text, type, image,
            timestamp: new Date()
        });

        // Cleanup old messages if > 100
        const count = await ForumMessage.countDocuments({ channel });
        if (count > 100) {
            const oldest = await ForumMessage.findOne({ channel }).sort({ timestamp: 1 });
            if (oldest) await ForumMessage.deleteOne({ _id: oldest._id });
        }

        io.emit('forum_message', newMessage);

        // Send Push Notifications via FCM (unless channel is ALERTAS, handled by SOS)
        if (channel !== 'ALERTAS') {
            try {
                const subs = await Subscription.find({});
                if (subs.length > 0) {
                    const tokens = subs.map(s => s.token);
                    await admin.messaging().sendEachForMulticast({
                        tokens,
                        notification: {
                            title: `💬 Foro: ${channel}`,
                            body: `${user}: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`
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

    socket.on('emergency_alert', async (data) => {
        console.log('🚨 EMERGENCY:', data);

        // Store the active alert details
        activeAlert = {
            userId: data.userId, // We expect userId from client now
            houseNumber: data.houseNumber,
            startTime: Date.now()
        };

        io.emit('emergency_alert', data);

        // Auto-post to forum
        try {
            const alertMsg = await ForumMessage.create({
                id: Date.now().toString(),
                channel: 'ALERTAS',
                user: data.userName || 'SISTEMA',
                text: `🚨 ${data.emergencyTypeLabel.toUpperCase()} en Casa #${data.houseNumber}`,
                type: 'alert'
            });
            io.emit('forum_message', alertMsg);

            // Push Notifications via FCM
            try {
                const subs = await Subscription.find({});
                console.log(`[FCM] Found ${subs.length} subscribers for SOS alert`);
                if (subs.length > 0) {
                    const tokens = subs.map(s => s.token).filter(t => !!t);
                    const response = await admin.messaging().sendEachForMulticast({
                        tokens,
                        notification: {
                            title: '🚨 ALERTA VECINAL',
                            body: `¡Atención! ${data.emergencyTypeLabel.toUpperCase()} en Casa #${data.houseNumber}. Vecino: ${data.userName}`
                        },
                        data: {
                            type: 'SOS',
                            houseNumber: String(data.houseNumber),
                            location: JSON.stringify(data.location),
                            click_action: '/'
                        },
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

        } catch (err) {
            console.error('Error processing alert:', err);
        }
    });

    socket.on('stop_alert', (data) => {
        // data should contain { userId, role }
        const requesterId = data?.userId;
        const requesterRole = data?.role;

        // If no active alert, just emit stop to be safe or ignore
        if (!activeAlert) {
            io.emit('stop_alert');
            return;
        }

        // Check permissions: Admin OR the user who started it
        if (requesterRole === 'admin' || (requesterId && requesterId === activeAlert.userId)) {
            console.log(`🔕 Alert stopped by ${requesterRole === 'admin' ? 'Admin' : 'Owner'}`);
            activeAlert = null; // Clear active alert
            io.emit('stop_alert');
        } else {
            console.log('⛔ Unauthorized attempt to stop alert');
            // Optionally emit an error back to the specific socket
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
