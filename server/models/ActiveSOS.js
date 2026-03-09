const mongoose = require('mongoose');

const ActiveSOSSchema = new mongoose.Schema({
    communityId: { type: String, required: true, index: true },
    userId: { type: String, required: true },
    userName: { type: String, required: true },
    houseNumber: { type: String, required: true },
    emergencyType: { type: String, required: true },
    emergencyTypeLabel: { type: String, required: true },
    location: {
        lat: Number,
        lng: Number
    },
    status: {
        type: String,
        enum: ['CREATED', 'DISPATCHED', 'ACKED', 'RESOLVED', 'EXPIRED', 'CANCELLED'],
        default: 'CREATED'
    },
    channels: {
        fcm: {
            status: { type: String, enum: ['PENDING', 'SENT', 'FAILED'], default: 'PENDING' },
            attempts: { type: Number, default: 0 },
            lastError: String,
            lastAt: Date
        },
        telegram: {
            status: { type: String, enum: ['PENDING', 'SENT', 'FAILED'], default: 'PENDING' },
            attempts: { type: Number, default: 0 },
            lastError: String,
            lastAt: Date
        }
    },
    timestamp: { type: Date, default: Date.now, index: { expires: '30d' } }, // Physical deletion after 30 days
    expiresAt: { type: Date, index: true },
    closedAt: { type: Date },
    isActive: { type: Boolean, default: true },
    petInfo: {
        name: String,
        breed: String,
        traits: String,
        photo: String  // base64 data URL
    }
});

// Index for finding active alerts efficiently per community
ActiveSOSSchema.index({ communityId: 1, isActive: 1 });

module.exports = mongoose.model('ActiveSOS', ActiveSOSSchema);
