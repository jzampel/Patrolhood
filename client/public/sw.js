self.addEventListener('push', function (event) {
    const data = event.data.json();
    const options = {
        body: data.body,
        icon: '/logo_bull.png', // Use our new logo
        badge: '/logo_bull.png',
        vibrate: [200, 100, 200, 100, 200, 100, 200] // SOS Vibration pattern
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    event.waitUntil(
        clients.openWindow('/')
    );
});
