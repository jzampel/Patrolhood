const mongoose = require('mongoose');

const ForumMessageSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true }, // JS timestamp
    channel: { type: String, required: true },
    user: { type: String, required: true },
    text: { type: String },
    image: { type: String },
    type: { type: String, default: 'text' }, // 'text', 'alert'
    timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ForumMessage', ForumMessageSchema);
