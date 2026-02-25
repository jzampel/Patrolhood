// Firebase Cloud Messaging Service Worker
console.log('👷 [SW] Service Worker File Loaded');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// These credentials should be consistent with firebase-config.js
// We use the compat version here to avoid complex import mapping in a public static file
firebase.initializeApp({
    apiKey: "AIzaSyDmbhARIT6T5AeIqB15UcYhuyL2ZD8HNuk",
    authDomain: "patrolhood21.firebaseapp.com",
    projectId: "patrolhood21",
    storageBucket: "patrolhood21.firebasestorage.app",
    messagingSenderId: "135233689284",
    appId: "1:135233689284:web:f2b3bcc4fed6436b305b91"
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);
    const notificationTitle = payload.notification.title;
    const notificationOptions = {
        body: payload.notification.body,
        icon: '/logo_bull.png',
        badge: '/logo_bull.png',
        data: payload.data
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});

const CACHE_NAME = 'patrolhood-v1';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/logo_bull.png',
    '/manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
});

self.addEventListener('fetch', (event) => {
    // Skip API calls and socket.io from caching
    if (event.request.url.includes('/api/') || event.request.url.includes('socket.io')) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    event.waitUntil(
        clients.openWindow('/')
    );
});

self.addEventListener('push', function (event) {
    console.log('🔔 [SW] Push Received:', event.data ? event.data.text() : 'no payload');
});
