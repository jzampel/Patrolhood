const { createClient } = require('redis');
const Redis = require('ioredis');

const redisUrl = process.env.REDIS_URL;
let isRedisAvailable = false;
let pubClient = null;
let subClient = null;
let queueConnection = null;

if (redisUrl) {
    console.log('📡 [Redis] Attempting connection to:', redisUrl);
    pubClient = createClient({ url: redisUrl });
    subClient = pubClient.duplicate();

    pubClient.connect()
        .then(() => {
            isRedisAvailable = true;
            console.log('✅ [Redis] Pub Client Connected');
        })
        .catch(err => console.warn('⚠️ [Redis] Pub Error (continuing without Redis):', err.message));

    subClient.connect()
        .catch(err => console.warn('⚠️ [Redis] Sub Error:', err.message));

    queueConnection = new Redis(redisUrl, {
        maxRetriesPerRequest: null,
        lazyConnect: true // Don't crash at startup if it fails
    });
    queueConnection.on('error', (err) => {
        console.warn('⚠️ [Redis] Queue Connection Error:', err.message);
    });
} else {
    console.log('ℹ️ [Redis] No REDIS_URL found. Running in local memory mode (Single Instance).');
}

const acquireLock = async (key, ttl = 5000) => {
    if (!isRedisAvailable || !pubClient) return true; // Fail-safe: allow operation if no redis
    try {
        const lockKey = `lock:${key}`;
        const acquired = await pubClient.set(lockKey, 'locked', { NX: true, PX: ttl });
        return acquired === 'OK';
    } catch (e) {
        return true; // Fail-safe
    }
};

const releaseLock = async (key) => {
    if (!isRedisAvailable || !pubClient) return;
    try {
        await pubClient.del(`lock:${key}`);
    } catch (e) { }
};

module.exports = {
    pubClient,
    subClient,
    queueConnection,
    isRedisAvailable,
    acquireLock,
    releaseLock
};
