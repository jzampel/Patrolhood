const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

async function repair() {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to DB');

    const User = mongoose.model('User', new mongoose.Schema({
        id: String,
        role: String,
        communityName: String
    }));

    const Community = mongoose.model('Community', new mongoose.Schema({
        name: String,
        adminId: String,
        telegramBotToken: String
    }));

    // 1. Find all admins
    const admins = await User.find({ role: 'admin' });
    console.log(`Found ${admins.length} admins.`);

    for (const admin of admins) {
        if (!admin.communityName) {
            console.log(`Admin ${admin.id} has no communityName, skipping.`);
            continue;
        }

        const existingComm = await Community.findOne({ name: admin.communityName });
        if (!existingComm) {
            console.log(`Creating missing community: ${admin.communityName} for admin ${admin.id}`);
            await Community.create({
                name: admin.communityName,
                adminId: admin.id
            });
        } else if (existingComm.adminId !== admin.id) {
            console.log(`Updating adminId for community ${admin.communityName} to ${admin.id}`);
            existingComm.adminId = admin.id;
            await existingComm.save();
        } else {
            console.log(`Community ${admin.communityName} already correctly associated with admin ${admin.id}`);
        }
    }

    process.exit(0);
}

repair().catch(console.error);
