const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

async function debug() {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to DB');

    const User = mongoose.model('User', new mongoose.Schema({
        phone: String,
        communityName: String,
        id: String
    }));

    const Community = mongoose.model('Community', new mongoose.Schema({
        name: String,
        adminId: String
    }));

    const user = await User.findOne({ phone: '680284090' });
    console.log('User 680284090:', user ? { id: user.id, communityName: user.communityName } : 'Not found');

    const community = await Community.findOne({ name: 'RECREO DE LA CONDESA' });
    console.log('Community RECREO DE LA CONDESA:', community ? { name: community.name, adminId: community.adminId } : 'Not found');

    process.exit(0);
}

debug().catch(console.error);
