const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

async function debug() {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to DB');

    const User = mongoose.model('User', new mongoose.Schema({
        phone: String,
        communityName: String,
        id: String
    }));

    const House = mongoose.model('House', new mongoose.Schema({
        id: String,
        number: String,
        communityName: String
    }));

    // 1. Check problematic user
    const user = await User.findOne({ phone: '680284090' });
    console.log('User 680284090:', JSON.stringify(user, null, 2));

    // 2. Check indexes for House
    const indexes = await mongoose.connection.db.collection('houses').indexes();
    console.log('House Indexes:', JSON.stringify(indexes, null, 2));

    process.exit(0);
}

debug().catch(console.error);
