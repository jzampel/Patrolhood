importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

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

messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Background message received:', payload);
    const notificationTitle = payload.notification.title;
    const notificationOptions = {
        body: payload.notification.body,
        icon: '/logo_bull.png',
        data: payload.data
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});
