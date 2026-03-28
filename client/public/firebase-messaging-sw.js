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
 * This is crucial for Safari and mobile devices when the PWA is closed or in background.
 */
messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Background message received:', payload);
    
    // If the payload already has the 'notification' property, Firebase usually shows it automatically.
    // However, for maximum reliability on iOS, we provide an explicit fallback if needed.
    if (!payload.notification && payload.data) {
        const notificationTitle = payload.data.title || '🚨 Alerta PatrolHood';
        const notificationOptions = {
            body: payload.data.body || 'Nueva alerta en tu comunidad.',
            icon: '/logo_bull.png',
            badge: '/logo_bull.png',
            tag: payload.data.type || 'patrolhood-alert',
            data: { url: '/', ...payload.data }
        };
        return self.registration.showNotification(notificationTitle, notificationOptions);
    }
});

// Listener for notification clicks
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.openWindow('/')
    );
});
