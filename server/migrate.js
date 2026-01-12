require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Models
const User = require('./models/User');
const House = require('./models/House');
const ForumMessage = require('./models/ForumMessage');
const Invite = require('./models/Invite');
const Subscription = require('./models/Subscription');

const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/neighbourhood-patrol';
const DATA_FILE = path.join(__dirname, 'data.json');

async function migrate() {
    console.log('🔗 Connecting to MongoDB...');
    try {
        await mongoose.connect(mongoUri);
        console.log('✅ Connected.');
    } catch (err) {
        console.error('❌ Connection Error. Check your MONGO_URI in .env', err);
        process.exit(1);
    }

    if (!fs.existsSync(DATA_FILE)) {
        console.error('❌ data.json not found!');
        process.exit(1);
    }

    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

    console.log('📦 Starting Migration...');

    // USERS
    if (data.users && data.users.length > 0) {
        console.log(`Migrating ${data.users.length} users...`);
        for (const u of data.users) {
            // Check existence to prevent dupes if ran twice
            const exists = await User.findOne({ id: u.id });
            if (!exists) await User.create(u);
        }
    }

    // HOUSES
    if (data.houses && data.houses.length > 0) {
        console.log(`Migrating ${data.houses.length} houses...`);
        for (const h of data.houses) {
            const exists = await House.findOne({ id: h.id });
            if (!exists) await House.create(h);
        }
    }

    // MESSAGES
    if (data.forum_messages && data.forum_messages.length > 0) {
        console.log(`Migrating ${data.forum_messages.length} messages...`);
        for (const m of data.forum_messages) {
            const exists = await ForumMessage.findOne({ id: m.id });
            if (!exists) await ForumMessage.create(m);
        }
    }

    // INVITES
    if (data.invites && data.invites.length > 0) {
        console.log(`Migrating ${data.invites.length} invites...`);
        for (const i of data.invites) {
            const exists = await Invite.findOne({ code: i.code });
            if (!exists) await Invite.create(i);
        }
    }

    // SUBSCRIPTIONS
    if (data.subscriptions && data.subscriptions.length > 0) {
        console.log(`Migrating ${data.subscriptions.length} subscriptions...`);
        for (const s of data.subscriptions) {
            const exists = await Subscription.findOne({ endpoint: s.endpoint });
            if (!exists) await Subscription.create(s);
        }
    }

    console.log('✅ MIGRATION COMPLETE!');
    console.log('You can now use the app with MongoDB.');
    process.exit(0);
}

migrate();
