const { createClient } = require('redis');
const Redis = require('ioredis');

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const pubClient = createClient({ url: redisUrl });
const subClient = pubClient.duplicate();

pubClient.connect().catch(err => console.error('❌ Redis Pub Error:', err));
subClient.connect().catch(err => console.error('❌ Redis Sub Error:', err));

const queueConnection = new Redis(redisUrl, {
    maxRetriesPerRequest: null
});

const acquireLock = async (key, ttl = 5000) => {
    const lockKey = `lock:${key}`;
    const acquired = await pubClient.set(lockKey, 'locked', { NX: true, PX: ttl });
    return acquired === 'OK';
};

const releaseLock = async (key) => {
    await pubClient.del(`lock:${key}`);
};

module.exports = { pubClient, subClient, queueConnection, acquireLock, releaseLock };
