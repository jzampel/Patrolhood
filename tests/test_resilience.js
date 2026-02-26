const axios = require('axios');

const API_URL = 'http://localhost:3001';
const TEST_TOKEN = 'YOUR_TEST_TOKEN'; // For manual test execution
const COMMUNITY_ID = 'YOUR_TEST_COMMUNITY_ID';

async function testForumResilience() {
    console.log('🧪 Testing Forum Resilience...');
    try {
        const res = await axios.post(`${API_URL}/api/forum`, {
            channel: 'General',
            user: 'TestUser',
            text: 'Test message with Redis simulated failure',
            communityId: COMMUNITY_ID,
            communityName: 'Test Community'
        }, {
            headers: { 'Authorization': `Bearer ${TEST_TOKEN}` }
        });
        console.log('✅ Forum Response:', res.data);
    } catch (err) {
        console.error('❌ Forum Test Failed:', err.response ? err.response.data : err.message);
    }
}

async function testSOSResilience() {
    console.log('🧪 Testing SOS Resilience...');
    try {
        const res = await axios.post(`${API_URL}/api/sos`, {
            communityId: COMMUNITY_ID,
            userId: 'test-user-id',
            userName: 'Test User',
            houseNumber: '99',
            emergencyType: 'fire',
            emergencyTypeLabel: '🔥 Incendio',
            location: { lat: 40, lng: -3 }
        }, {
            headers: { 'Authorization': `Bearer ${TEST_TOKEN}` }
        });
        console.log('✅ SOS Response:', res.data);
    } catch (err) {
        console.error('❌ SOS Test Failed:', err.response ? err.response.data : err.message);
    }
}

// Note: To run this, you'd need a valid token and communityId.
// This is a reference script for manual verification in the environment.
console.log('Test script ready. Run with valid credentials to verify resilience.');
