require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/neighbourhood-patrol';

async function run() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB');

        const phoneToDelete = '680284090';
        const user = await User.findOne({ phone: phoneToDelete });

        if (user) {
            console.log(`👤 Found user: ${user.name} ${user.surname} (ID: ${user.id})`);
            await User.deleteOne({ _id: user._id });
            console.log(`✅ User ${phoneToDelete} successfully deleted.`);
        } else {
            console.log(`🤷 User with phone ${phoneToDelete} not found.`);
        }

        const adminPhone = '609543686';
        const admin = await User.findOne({ phone: adminPhone });
        if (admin) {
            console.log(`👑 Admin info: ${admin.name} ${admin.surname} (ID: ${admin.id}, Role: ${admin.role})`);
        } else {
            console.log(`❓ Admin with phone ${adminPhone} not found.`);
        }

    } catch (err) {
        console.error('❌ Error:', err);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from MongoDB');
    }
}

run();
