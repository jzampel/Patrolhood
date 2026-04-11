importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js');

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

/**
 * BACKGROUND MESSAGE HANDLER
 * CRITICAL FOR iOS PWA: We ALWAYS call showNotification() explicitly.
 * On iOS Safari PWA, Firebase does NOT automatically display notifications from the payload.notification
 * field — we must call showNotification() ourselves or the notification is silently dropped.
 */
messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Background message received:', payload);

    // Extract title/body from notification field (server sends it here) OR from data field (fallback)
    const notificationTitle = payload.notification?.title || payload.data?.title || '🚨 Alerta PatrolHood';
    const notificationBody = payload.notification?.body || payload.data?.body || 'Nueva alerta en tu comunidad.';

    const notificationOptions = {
        body: notificationBody,
        icon: '/logo_bull.png',
        badge: '/logo_bull.png',
        tag: payload.data?.type || payload.notification?.tag || 'patrolhood-alert',
        renotify: true,
        requireInteraction: true,
        vibrate: [300, 100, 300, 100, 300],
        data: { url: '/', ...(payload.data || {}) }
    };

    // Always show explicitly — required for iOS PWA background/closed state
    return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Listener for notification clicks
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.openWindow('/')
    );
});
