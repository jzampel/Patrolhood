const mongoose = require('mongoose');
const Subscription = require('./models/Subscription');

const mongoUri = 'mongodb://localhost:27017/neighbourhood-patrol';

mongoose.connect(mongoUri)
    .then(async () => {
        const result = await Subscription.deleteMany({});
        console.log(`✅ Deleted ${result.deletedCount} old subscriptions.`);
        process.exit(0);
    })
    .catch(err => {
        console.error('❌ Error:', err);
        process.exit(1);
    });
