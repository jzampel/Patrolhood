const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = 'mongodb+srv://jzampel_db_user:Tuningcroom88@cluster0.dmn2fty.mongodb.net/patrolhood?appName=Cluster0';

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
    console.log('User 680284090:', user);

    // 2. Check indexes for House
    const indexes = await mongoose.connection.db.collection('houses').indexes();
    console.log('House Indexes:', JSON.stringify(indexes, null, 2));

    process.exit(0);
}

debug();
