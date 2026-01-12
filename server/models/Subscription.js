const mongoose = require('mongoose');

const SubscriptionSchema = new mongoose.Schema({
    endpoint: { type: String, required: true, unique: true },
    keys: {
        p256dh: { type: String, required: true },
        auth: { type: String, required: true }
    },
    userId: { type: String }, // Link to user
    role: { type: String }    // Link to role (admin/user)
});

module.exports = mongoose.model('Subscription', SubscriptionSchema);
