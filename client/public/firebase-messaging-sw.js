importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// These values must match your firebase-config.js
const firebaseConfig = {
    apiKey: "AIzaSyDmbhARIT6T5AeIqB15UcYhuyL2ZD8HNuk",
    authDomain: "patrolhood21.firebaseapp.com",
    projectId: "patrolhood21",
    storageBucket: "patrolhood21.firebasestorage.app",
    messagingSenderId: "135233689284",
    appId: "1:135233689284:web:f2b3bcc4fed6436b305b91"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Handle background messages (app is in background or closed)
messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Background message received:', payload);

    const notificationTitle = payload.notification?.title || '🚨 Alerta PatrolHood';
    const notificationBody = payload.notification?.body || 'Nueva alerta en tu comunidad.';

    const notificationOptions = {
        body: notificationBody,
        icon: '/logo_bull.png',
        badge: '/logo_bull.png',
        tag: payload.data?.type || 'patrolhood-alert', // Replace old notifications of same type
        renotify: true, // Re-notify even if same tag
        requireInteraction: true, // Keep notification visible until user interacts
        vibrate: [300, 100, 300, 100, 300], // Vibration pattern
        data: {
            url: '/',
            ...payload.data
        },
        actions: [
            { action: 'open', title: '🗺️ Ver en mapa' },
            { action: 'dismiss', title: 'Cerrar' }
        ]
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    if (event.action === 'dismiss') return;

    const urlToOpen = event.notification.data?.url || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // If app is already open, focus it
            for (const client of clientList) {
                if ('focus' in client) {
                    client.focus();
                    return;
                }
            }
            // Otherwise open a new window
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});
