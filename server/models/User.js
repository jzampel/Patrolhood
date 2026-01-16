const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true }, // Keeping 'id' for compatibility with frontend which uses Date.now() currently
    name: { type: String, required: true },
    surname: { type: String, required: true },
    address: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['admin', 'user'], default: 'user' },
    mapLabel: { type: String }, // House Number linked to map
    avatar: { type: String }, // For future use
    telegramChatId: { type: String } // Telegram Chat ID for notifications
});

module.exports = mongoose.model('User', UserSchema);
