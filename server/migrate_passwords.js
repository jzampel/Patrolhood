require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('./models/User');

async function migrate() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to DB.");

        const users = await User.find({});
        let migrated = 0;

        for (const user of users) {
            // Check if password is not already hashed (bcrypt hashes start with $2b$ or $2a$)
            if (!user.password.startsWith('$2')) {
                user.password = await bcrypt.hash(user.password, 10);
                await user.save();
                migrated++;
            }
        }
        console.log(`Migration complete. Migrated ${migrated} users.`);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

migrate();
