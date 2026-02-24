const mongoose = require('mongoose');

const InviteSchema = new mongoose.Schema({
    code: { type: String, required: true }, // Not globally unique anymore
    communityName: { type: String, required: true },
    role: { type: String, required: true },
    used: { type: Boolean, default: false }
});

module.exports = mongoose.model('Invite', InviteSchema);
