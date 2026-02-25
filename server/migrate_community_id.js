require('dotenv').config();
const mongoose = require('mongoose');
const crypto = require('crypto');

// Models
const User = require('./models/User');
const House = require('./models/House');
const ForumMessage = require('./models/ForumMessage');
const Invite = require('./models/Invite');
const Subscription = require('./models/Subscription');
const Community = require('./models/Community');
const EmergencyContact = require('./models/EmergencyContact');

const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/neighbourhood-patrol';

async function migrate() {
    try {
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB');

        const communities = await Community.find({});
        console.log(`Found ${communities.length} communities to migrate.`);

        for (const community of communities) {
            let communityId = community.id;
            if (!communityId) {
                communityId = crypto.randomUUID();
                community.id = communityId;
                await community.save();
                console.log(`Generated ID ${communityId} for community ${community.name}`);
            }

            console.log(`Propagating ID to related documents for ${community.name}...`);

            const filter = { communityName: community.name };
            const update = { $set: { communityId: communityId } };

            const results = await Promise.all([
                User.updateMany(filter, update),
                House.updateMany(filter, update),
                ForumMessage.updateMany(filter, update),
                Invite.updateMany(filter, update),
                EmergencyContact.updateMany(filter, update),
                Subscription.updateMany(filter, update)
            ]);

            console.log(`  - Users: ${results[0].modifiedCount}`);
            console.log(`  - Houses: ${results[1].modifiedCount}`);
            console.log(`  - ForumMessages: ${results[2].modifiedCount}`);
            console.log(`  - Invites: ${results[3].modifiedCount}`);
            console.log(`  - EmergencyContacts: ${results[4].modifiedCount}`);
            console.log(`  - Subscriptions: ${results[5].modifiedCount}`);
        }

        console.log('✅ Migration completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

migrate();
