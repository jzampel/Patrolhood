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

// In background, FCM SDK automatically handles the notification if 'notification' is in the payload.
// Do not manually call showNotification or notificationclick, as it causes fatal promise crashes on iOS Safari Web Push.
