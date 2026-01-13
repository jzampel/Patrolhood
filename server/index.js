require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const webpush = require('web-push');

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

// VAPID Keys
const publicVapidKey = 'BNWjTbapEtyTDCywiM1Qk_kiwRx_DmVrDdt0nwi10bVKYlEXOll-hDyexDEffLu1ejd8Spm_E4CLiAfSE3YcaDA';
const privateVapidKey = 'RSXxpByuc_99ANHY3j4CDIWkKoVUxx79DF683-UsPGo';

webpush.setVapidDetails(
    'mailto:test@test.com',
    publicVapidKey,
    privateVapidKey
);

// --- ROUTES ---

// Subscribe (Push)
app.post('/api/subscribe', async (req, res) => {
    const { subscription, userId, role } = req.body;
    try {
        await Subscription.findOneAndUpdate(
            { endpoint: subscription.endpoint },
            { ...subscription, userId, role },
            { upsert: true, new: true }
        );
        res.status(201).json({});
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

        // NOTIFY ADMINS
        try {
            const adminSubs = await Subscription.find({ role: 'admin' });
            const payload = JSON.stringify({
                title: '👤 Nuevo Vecino Registrado',
                body: `${newUser.name} ${newUser.surname} se ha unido a la comunidad.`
            });
            adminSubs.forEach(sub => {
                webpush.sendNotification(sub, payload).catch(err => console.error('Push Error (Admin):', err));
            });
        } catch (notifyErr) {
            console.error('Error notifying admins:', notifyErr);
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

        // Send Push Notifications (unless channel is ALERTAS, handled by SOS)
        if (channel !== 'ALERTAS') {
            const subs = await Subscription.find({});
            const payload = JSON.stringify({
                title: `💬 Foro: ${channel}`,
                body: `${user}: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`,
                icon: '/logo_bull.png'
            });
            subs.forEach(sub => {
                webpush.sendNotification(sub, payload).catch(err => console.error('Push Error (Forum):', err));
            });
        }

        res.json({ success: true, message: newMessage });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// --- SOCKETS ---

io.on('connection', (socket) => {
    console.log('✅ Socket connected:', socket.id);

    socket.on('emergency_alert', async (data) => {
        console.log('🚨 EMERGENCY:', data);
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

            // Push Notifications
            const subs = await Subscription.find({});
            const payload = JSON.stringify({
                title: '🚨 ALERTA VECINAL',
                body: `¡Atención! ${data.emergencyTypeLabel.toUpperCase()} en Casa #${data.houseNumber}. Vecino: ${data.userName}`
            });
            subs.forEach(sub => {
                webpush.sendNotification(sub, payload).catch(err => console.error('Push Error:', err));
            });

        } catch (err) {
            console.error('Error processing alert:', err);
        }
    });

    socket.on('stop_alert', () => {
        io.emit('stop_alert');
    });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`🚀 Cloud Server running on port ${PORT}`);
});
