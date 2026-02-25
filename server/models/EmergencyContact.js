const mongoose = require('mongoose');

const EmergencyContactSchema = new mongoose.Schema({
    name: { type: String, required: true },
    phone: { type: String, required: true },
    icon: { type: String, default: '📞' },
    communityId: { type: String, required: true },
    communityName: { type: String, required: true }
});

module.exports = mongoose.model('EmergencyContact', EmergencyContactSchema);
