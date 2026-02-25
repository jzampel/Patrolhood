const mongoose = require('mongoose');

const connectDB = async () => {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/neighbourhood-patrol';
    try {
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB');
    } catch (err) {
        console.error('❌ MongoDB Connection Error:', err);
        process.exit(1);
    }
};

module.exports = connectDB;
