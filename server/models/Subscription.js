const mongoose = require('mongoose');

const SubscriptionSchema = new mongoose.Schema({
    token: { type: String, required: true, unique: true },
    userId: { type: String }, // Link to user
    role: { type: String }    // Link to role (admin/user)
});

module.exports = mongoose.model('Subscription', SubscriptionSchema);
