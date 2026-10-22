self.addEventListener('push', function(event) {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'منصة صدارة';
  const options = {
    body: data.body || 'يوجد تحديث أو وظيفة جديدة متاحة الآن في منصة صدارة!',
    icon: '/images/logo.png',
    badge: '/images/badge.png'
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('https://sadarah.top')
  );
});
