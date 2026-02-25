const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
    communityId: { type: String, required: true, index: true },
    adminId: { type: String, required: true },
    adminName: { type: String, required: true },
    action: { type: String, required: true }, // e.g., 'DELETE_MESSAGE', 'GENERATE_INVITE', 'UPDATE_BOT_TOKEN'
    details: { type: mongoose.Schema.Types.Mixed },
    timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('AuditLog', AuditLogSchema);
