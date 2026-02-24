const mongoose = require('mongoose');

const CommunitySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    telegramBotToken: { type: String }, // Each community can have its own bot
    telegramBotUsername: { type: String }, // Automatically fetched from token
    adminId: { type: String, required: true } // Reference to the creator
});

module.exports = mongoose.model('Community', CommunitySchema);
