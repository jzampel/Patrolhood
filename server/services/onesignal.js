const api_key = process.env.ONESIGNAL_API_KEY;
const app_id = process.env.ONESIGNAL_APP_ID || "064d0c75-1f00-42ab-955b-c369d44a114e";

/**
 * Sends a push notification using OneSignal REST API
 * @param {Object} options - Notification options
 * @param {string} options.title - Notification title
 * @param {string} options.body - Notification body
 * @param {Array<string>} options.userIds - Array of external user IDs to target
 * @param {Object} options.data - Additional data to send
 */
async function sendNotification({ title, body, userIds, data }) {
    if (!api_key || !app_id) {
        console.warn('⚠️ OneSignal API Key or App ID missing in env variables.');
        return;
    }

    const payload = {
        app_id: app_id,
        contents: { en: body, es: body },
        headings: { en: title, es: title },
        include_external_user_ids: userIds, // Target specific users by their ID
        data: data,
        web_buttons: [
            { id: 'open-app', text: 'Abrir App', icon: 'https://patrolhood.onrender.com/logo_bull.png' }
        ]
    };

    console.log(`📡 [OneSignal] Sending notification to ${userIds.length} users...`);
    try {
        const response = await fetch('https://onesignal.com/api/v1/notifications', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Authorization': `Basic ${api_key}`
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        console.log('✅ OneSignal Response:', result);
        return result;
    } catch (error) {
        console.error('❌ OneSignal Error:', error);
        throw error;
    }
}

module.exports = { sendNotification };
