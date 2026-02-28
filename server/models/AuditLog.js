const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
    communityId: { type: String, required: true, index: true },
    adminId: { type: String, required: true },
    adminName: { type: String, required: true },
    action: { type: String, required: true }, // e.g., 'DELETE_MESSAGE', 'GENERATE_INVITE', 'UPDATE_BOT_TOKEN'
    details: { type: mongoose.Schema.Types.Mixed },
    timestamp: { type: Date, default: Date.now }
});

// Index for performant querying by community and date
AuditLogSchema.index({ communityId: 1, timestamp: -1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
