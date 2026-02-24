const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

async function repair() {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to DB');

    const db = mongoose.connection.db;

    // 1. Drop problematic indexes for houses
    try {
        await db.collection('houses').dropIndex('number_1');
        console.log('✅ Dropped global unique index: number_1');
    } catch (e) { console.log('Index number_1 not found or already dropped'); }

    try {
        await db.collection('houses').dropIndex('id_1'); // Global ID unique might be trouble too
        console.log('✅ Dropped global unique index: id_1');
    } catch (e) { console.log('Index id_1 not found or already dropped'); }

    // 2. Add community-scoped unique index
    try {
        await db.collection('houses').createIndex({ number: 1, communityName: 1 }, { unique: true });
        console.log('✅ Created community-scoped unique index: { number, communityName }');
    } catch (e) { console.error('Error creating new index:', e.message); }

    // 3. Restore user community name
    const User = mongoose.model('User', new mongoose.Schema({
        phone: String,
        communityName: String
    }));

    const result = await User.updateOne(
        { phone: '680284090' },
        { $set: { communityName: 'RECREO DE LA CONDESA' } }
    );
    console.log('✅ Restored user community name:', result);

    process.exit(0);
}

repair().catch(console.error);
