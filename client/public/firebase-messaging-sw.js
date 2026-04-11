/**
 * PatrolHood Service Worker — Push Notification Handler
 *
 * ⚠️ IMPORTANT: We intentionally do NOT use Firebase SDK here.
 *
 * Why: Firebase's firebase-messaging-compat.js intercepts the native 'push' event
 * and routes it through its own internal logic (onBackgroundMessage). On iOS Safari PWA,
 * this internal routing is unreliable and often silently drops notifications.
 *
 * The native Web Push 'push' event listener is guaranteed by the browser spec to fire
 * on every platform: iOS Safari 16.4+, Chrome, Firefox, Edge.
 *
 * The Firebase SDK is still used in the MAIN THREAD (App.jsx) for token generation
 * via getToken(). This SW only needs to handle message delivery.
 */

// --- PUSH EVENT: Show notification on every incoming push ---
self.addEventListener('push', (event) => {
    event.waitUntil(
        (async () => {
            if (!event.data) {
                console.warn('[PatrolHood SW] Push received but event.data is empty.');
                return;
            }

            let payload = {};
            try {
                payload = event.data.json();
            } catch (e) {
                console.error('[PatrolHood SW] Could not parse push payload as JSON:', e);
                // Try reading as plain text as a last resort
                try {
                    payload = { data: { title: '🚨 Alerta PatrolHood', body: event.data.text() } };
                } catch (_) {}
            }

            // Firebase sends notification content in either 'notification' or 'data'
            // We check both to be 100% compatible with all server-side formats.
            const title = payload.data?.title
                       || payload.notification?.title
                       || '🚨 Alerta PatrolHood';
            const body  = payload.data?.body
                       || payload.notification?.body
                       || 'Nueva alerta en tu comunidad.';
            const type  = payload.data?.type || 'patrolhood-alert';

            console.log(`[PatrolHood SW] Showing notification: "${title}" / "${body}"`);

            return self.registration.showNotification(title, {
                body,
                icon:              '/logo_bull.png',
                badge:             '/logo_bull.png',
                tag:               type,
                renotify:          true,
                requireInteraction: true,
                vibrate:           [300, 100, 300, 100, 300],
                data:              { url: '/', ...(payload.data || {}) }
            });
        })()
    );
});

// --- NOTIFICATION CLICK: Open/focus the app ---
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // If a window is already open, focus it
            for (const client of clientList) {
                if (client.url.startsWith(self.location.origin) && 'focus' in client) {
                    return client.focus();
                }
            }
            // Otherwise open a new window
            return clients.openWindow('/');
        })
    );
});
