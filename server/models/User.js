const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true }, // Keeping 'id' for compatibility with frontend which uses Date.now() currently
    name: { type: String, required: true },
    surname: { type: String, required: true },
    address: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
    email: { type: String, required: true }, // New required field
    password: { type: String, required: true },
    role: { type: String, enum: ['admin', 'moderator', 'user'], default: 'user' },
    communityId: { type: String, required: true }, // UUID of the community
    communityName: { type: String, required: true }, // Keep for legacy/display
    mapLabel: { type: String }, // House Number linked to map
    avatar: { type: String }, // For future use
    telegramChatId: { type: String }, // Telegram Chat ID for notifications
    // Moderation
    banned: { type: Boolean, default: false },
    bannedUntil: { type: Date, default: null },
    banReason: { type: String, default: null },
    // Smart Notifications
    quietHours: {
        enabled: { type: Boolean, default: false },
        from: { type: String, default: '23:00' }, // HH:MM format
        to: { type: String, default: '07:00' }     // HH:MM format
    }
});

// Indexes for performant querying
UserSchema.index({ communityId: 1 });
UserSchema.index({ phone: 1 });

module.exports = mongoose.model('User', UserSchema);
