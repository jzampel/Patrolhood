const mongoose = require('mongoose');

const InviteSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true },
    role: { type: String, required: true },
    used: { type: Boolean, default: false }
});

module.exports = mongoose.model('Invite', InviteSchema);
