const mongoose = require('mongoose');

const CommunitySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    telegramBotToken: { type: String }, // Each community can have its own bot
    telegramBotUsername: { type: String }, // Automatically fetched from token
    center: { type: [Number], default: [40.4168, -3.7038] }, // Default starting position for the map
    adminId: { type: String, required: true } // Reference to the creator
});

module.exports = mongoose.model('Community', CommunitySchema);
