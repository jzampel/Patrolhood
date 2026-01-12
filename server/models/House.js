const mongoose = require('mongoose');

const HouseSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    number: { type: String, required: true, unique: true },
    position: {
        type: [Number], // [lat, lng]
        required: true
    },
    isMine: { type: Boolean, default: false }, // "isMine" is relative to user, but stored for structure. Actually 'owner' is key.
    owner: { type: String }, // Phone number of owner
    emergencyType: { type: String },
    emergencyTypeLabel: { type: String },
    emergencyEmoji: { type: String }
});

module.exports = mongoose.model('House', HouseSchema);
