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
const Community = require('./models/Community');
const EmergencyContact = require('./models/EmergencyContact');

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
        try {
            serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString());
        } catch (e) {
            serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        }
    } else {
        serviceAccount = require('./serviceAccountKey.json');
    }

    if (!admin.apps.length) {
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

// --- TELEGRAM MULTI-BOT MANAGER ---
const TelegramBot = require('node-telegram-bot-api');
const communityBots = new Map(); // communityName -> bot instance

function startCommunityBot(communityName, token) {
    if (!token) return;
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

    bot.on('polling_error', (error) => {
        console.error(`Telegram Polling Error (${communityName}):`, error.code);
    });
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

// --- ROUTES ---

// Auth
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
            const community = await Community.findOne({ name: user.communityName });
            res.json({
                success: true,
                user: {
                    id: user.id,
                    name: user.name,
                    role: user.role,
                    communityName: user.communityName,
                    telegramBotUsername: community?.telegramBotUsername, // Pass dynamic bot username
                    communityCenter: community?.center, // Pass community map center
                    email: user.email,
                    address: user.address,
                    phone: user.phone,
                    telegramChatId: user.telegramChatId
                }
            });
        } else {
            res.status(401).json({ success: false, message: 'Credenciales incorrectas' });
        }
    } catch (error) { res.status(500).json({ success: false }); }
});

app.post('/api/register', async (req, res) => {
    const { name, surname, address, phone, email, password, communityName, inviteCode, role, telegramBotToken } = req.body;
    try {
        const existingUser = await User.findOne({ $or: [{ phone }, { email }] });
        if (existingUser) return res.status(400).json({ success: false, message: 'El teléfono o email ya está registrado' });

        if (role === 'admin') {
            const adminExists = await User.findOne({ communityName, role: 'admin' });
            if (adminExists) return res.status(400).json({ success: false, message: 'Esta comunidad ya tiene un administrador' });

            const newUser = new User({ id: Date.now().toString(), name, surname, address, phone, email, password, communityName, role });
            await newUser.save();

            const newCommunity = new Community({ name: communityName, telegramBotToken, adminId: newUser.id });
            await newCommunity.save();

            if (telegramBotToken) startCommunityBot(communityName, telegramBotToken);
            res.json({ success: true, user: newUser });
        } else {
            const invite = await Invite.findOne({ code: inviteCode, communityName, used: false });
            if (!invite) return res.status(400).json({ success: false, message: 'Código de invitación inválido' });
            invite.used = true;
            await invite.save();

            const newUser = new User({ id: Date.now().toString(), name, surname, address, phone, email, password, communityName, role });
            await newUser.save();
            res.json({ success: true, user: newUser });
        }
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// Admin
app.post('/api/admin/invite', async (req, res) => {
    const { role, communityName } = req.body;
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    try {
        await Invite.create({ code, role, communityName });
        res.json({ success: true, code });
    } catch (error) {
        console.error('Error in /api/admin/invite:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update community map center
app.post('/api/community/center', async (req, res) => {
    const { communityName, center, adminId } = req.body;
    try {
        const community = await Community.findOne({ name: communityName, adminId });
        if (!community) return res.status(403).json({ success: false, message: 'No autorizado' });

        community.center = center;
        await community.save();
        res.json({ success: true, center: community.center });
    } catch (error) { res.status(500).json({ success: false }); }
});

// Database / Core
app.get('/api/users', async (req, res) => {
    const { communityName } = req.query;
    try {
        const users = await User.find({ communityName }, 'id name surname address phone role mapLabel');
        res.json({ success: true, users });
    } catch (error) { res.status(500).json({ success: false }); }
});

app.get('/api/users/:id', async (req, res) => {
    try {
        const user = await User.findOne({ id: req.params.id }, 'id name surname address phone role mapLabel telegramChatId communityName');
        if (user) {
            const community = await Community.findOne({ name: user.communityName });
            res.json({ success: true, user: { ...user.toObject(), telegramBotUsername: community?.telegramBotUsername, communityCenter: community?.center } });
        } else res.status(404).json({ success: false });
    } catch (error) { res.status(500).json({ success: false }); }
});

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
        if (houseNumber !== undefined) user.mapLabel = houseNumber;
        await user.save();

        if (houseNumber) {
            const house = await House.findOne({ number: houseNumber, communityName: user.communityName });
            if (house) {
                house.owner = user.phone;
                await house.save();
                io.to(user.communityName).emit('house_updated', house);
            }
        }
        res.json({ success: true, user });
    } catch (error) { res.status(500).json({ success: false }); }
});

app.get('/api/houses', async (req, res) => {
    const { communityName } = req.query;
    try {
        const houses = await House.find({ communityName });
        res.json({ success: true, houses });
    } catch (error) { res.status(500).json({ success: false }); }
});

app.post('/api/houses', async (req, res) => {
    const { communityName, ...houseData } = req.body;
    if (!communityName) return res.status(400).json({ success: false, message: 'Falta nombre de comunidad' });

    try {
        // Try to find existing house in THIS community by number
        let house = await House.findOne({ communityName, number: houseData.number });

        if (house) {
            // Update existing
            Object.assign(house, houseData);
        } else {
            // Create new. Check if ID conflicts globally (unlikely but possible with unique:true)
            const idConflict = await House.findOne({ id: houseData.id });
            if (idConflict) {
                // If conflict, generate a new ID to satisfy the global unique constraint
                houseData.id = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            }
            house = new House({ ...houseData, communityName });
        }

        await house.save();
        io.to(communityName).emit('house_updated', house);
        res.json({ success: true, house });
    } catch (error) {
        console.error('Error in POST /api/houses:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.delete('/api/houses/:id', async (req, res) => {
    const { communityName } = req.query;
    try {
        const result = await House.deleteOne({ id: req.params.id, communityName });
        if (result.deletedCount > 0) {
            io.to(communityName).emit('house_deleted', req.params.id);
            res.json({ success: true });
        } else res.status(404).json({ success: false });
    } catch (error) { res.status(500).json({ success: false }); }
});

app.post('/api/houses/clear', async (req, res) => {
    const { communityName } = req.body;
    try {
        await House.deleteMany({ communityName });
        io.to(communityName).emit('houses_cleared');
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false }); }
});

// Forum
app.get('/api/forum/:channel', async (req, res) => {
    const { communityName } = req.query;
    try {
        const messages = await ForumMessage.find({ channel: req.params.channel, communityName }).sort({ timestamp: 1 }).limit(100);
        res.json({ success: true, messages });
    } catch (error) { res.status(500).json({ success: false }); }
});

app.post('/api/forum', async (req, res) => {
    const { channel, user, text, type, image, communityName } = req.body;
    try {
        const newMessage = await ForumMessage.create({ id: Date.now().toString(), channel, communityName, user, text, type, image, timestamp: new Date() });
        const count = await ForumMessage.countDocuments({ channel, communityName });
        if (count > 100) {
            const oldest = await ForumMessage.findOne({ channel, communityName }).sort({ timestamp: 1 });
            if (oldest) await ForumMessage.deleteOne({ _id: oldest._id });
        }
        io.to(communityName).emit('forum_message', newMessage);

        if (channel !== 'ALERTAS') {
            const forumMsgText = text ? text : (image ? "📷 [Imagen]" : "");
            sendTelegramAlert(communityName, `💬 *Foro [${channel}]:* ${user}: ${forumMsgText}`);
        }
        res.json({ success: true, message: newMessage });
    } catch (error) { res.status(500).json({ success: false }); }
});

// Contacts
app.get('/api/contacts', async (req, res) => {
    const { communityName } = req.query;
    try {
        const contacts = await EmergencyContact.find({ communityName });
        res.json({ success: true, contacts });
    } catch (error) { res.status(500).json({ success: false }); }
});

app.post('/api/contacts', async (req, res) => {
    const { communityName, name, phone, icon } = req.body;
    try {
        const contact = new EmergencyContact({ communityName, name, phone, icon });
        await contact.save();
        res.json({ success: true, contact });
    } catch (error) { res.status(500).json({ success: false }); }
});

app.delete('/api/contacts/:id', async (req, res) => {
    try {
        await EmergencyContact.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false }); }
});

// Push
app.post('/api/subscribe', async (req, res) => {
    const { token, userId, role, communityName } = req.body;
    try {
        await Subscription.findOneAndUpdate({ token }, { token, userId: userId || 'unknown', communityName, role: role || 'user' }, { upsert: true });
        res.status(201).json({ success: true });
    } catch (error) { res.status(500).json({ success: false }); }
});

// --- SOCKETS ---
const activeAlerts = new Map();

io.on('connection', (socket) => {
    socket.on('join_community', (communityName) => {
        if (communityName) {
            socket.join(communityName);
            if (activeAlerts.has(communityName)) {
                socket.emit('emergency_alert', activeAlerts.get(communityName));
            }
        }
    });

    socket.on('emergency_alert', async (data) => {
        const { communityName } = data;
        activeAlerts.set(communityName, data);
        io.to(communityName).emit('emergency_alert', data);

        // Auto-post to forum
        try {
            const alertMsg = await ForumMessage.create({ id: Date.now().toString(), channel: 'ALERTAS', communityName, user: data.userName || 'SISTEMA', text: `🚨 ${data.emergencyTypeLabel.toUpperCase()} en Casa #${data.houseNumber}`, type: 'alert' });
            io.to(communityName).emit('forum_message', alertMsg);

            // FCM
            const subs = await Subscription.find({ communityName });
            if (subs.length > 0) {
                const tokens = subs.map(s => s.token).filter(t => !!t);
                admin.messaging().sendEachForMulticast({
                    tokens,
                    notification: { title: `🚨 ALERTA SOS: ${communityName}`, body: `¡Atención! ${data.emergencyTypeLabel.toUpperCase()} en Casa #${data.houseNumber}.` },
                    data: { type: 'SOS', communityName, houseNumber: String(data.houseNumber), click_action: '/' }
                }).catch(e => console.error('FCM Error:', e));
            }

            // Telegram
            const sosText = `🚨 *¡ALERTA VECINAL!* 🚨\n\n` +
                `🔴 *Tipo:* ${data.emergencyTypeLabel.toUpperCase()}\n` +
                `🏠 *Casa:* #${data.houseNumber}\n` +
                `👤 *Vecino:* ${data.userName}\n\n` +
                `⚠️ _Atención inmediata requerida_`;
            sendTelegramAlert(communityName, sosText);
        } catch (e) { console.error('Error in emergency_alert:', e); }
    });

    socket.on('stop_alert', (data) => {
        const { communityName, userId, role } = data;
        const current = activeAlerts.get(communityName);
        if (current && (role === 'admin' || userId === current.userId)) {
            activeAlerts.delete(communityName);
            io.to(communityName).emit('stop_alert');
        } else if (!current) {
            io.to(communityName).emit('stop_alert');
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
