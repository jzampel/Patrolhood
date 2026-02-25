const admin = require('firebase-admin');

let firebaseInitError = null;
try {
    let serviceAccount;
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        try {
            serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString());
        } catch (e) {
            serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        }
    } else {
        serviceAccount = require('../serviceAccountKey.json');
    }

    if (!admin.apps.length) {
        if (serviceAccount.private_key) {
            serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
        }
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log('✅ Firebase Admin Initialized');
    }
} catch (error) {
    firebaseInitError = error.message;
    console.error('❌ Firebase Admin Initialization Error:', error.message);
}

module.exports = admin;
