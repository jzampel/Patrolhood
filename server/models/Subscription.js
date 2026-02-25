const mongoose = require('mongoose');

const SubscriptionSchema = new mongoose.Schema({
    token: { type: String, required: true, unique: true },
    userId: { type: String }, // Link to user
    communityId: { type: String },
    communityName: { type: String }, // Filter notifications by community
    role: { type: String }    // Link to role (admin/user)
});

module.exports = mongoose.model('Subscription', SubscriptionSchema);
