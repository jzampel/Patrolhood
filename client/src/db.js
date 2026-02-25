import Dexie from 'dexie';

export const db = new Dexie('PatrolHoodDB');

db.version(1).stores({
    pendingSOS: '++id, timestamp, communityId, userId, status'
});

export const addPendingSOS = async (sosData) => {
    return await db.pendingSOS.add({
        ...sosData,
        timestamp: Date.now(),
        status: 'pending'
    });
};

export const getPendingSOS = async () => {
    return await db.pendingSOS.where('status').equals('pending').toArray();
};

export const markSOSAsSent = async (id) => {
    return await db.pendingSOS.update(id, { status: 'sent' });
};

export const clearSentSOS = async () => {
    return await db.pendingSOS.where('status').equals('sent').delete();
};

export const getPendingCount = async () => {
    return await db.pendingSOS.where('status').equals('pending').count();
};

export const getSentCount = async () => {
    return await db.pendingSOS.where('status').equals('sent').count();
};
