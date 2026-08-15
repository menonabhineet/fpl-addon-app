// public/sw.js - Service Worker for PPL Push Notifications

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  if (!event.data) return

  try {
    const data = event.data.json()
    const title = data.title || 'Pro Pundits League'
    const options = {
      body: data.body || 'Upcoming Gameweek Deadline Reminder!',
      icon: data.icon || '/icons/icon-192x192.png',
      badge: data.badge || '/icons/icon-192x192.png',
      image: data.image,
      tag: data.tag || 'deadline-alert',
      renotify: true,
      vibrate: [200, 100, 200],
      data: {
        url: data.url || '/dashboard',
        dateOfArrival: Date.now(),
        primaryKey: 1
      },
      actions: [
        { action: 'open', title: 'Open Dashboard' }
      ]
    }

    event.waitUntil(
      self.registration.showNotification(title, options)
    )
  } catch (err) {
    console.error('[sw.js] Error parsing push payload:', err)
    const options = {
      body: event.data.text() || 'Gameweek deadline is approaching!',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      data: { url: '/dashboard' }
    }
    event.waitUntil(
      self.registration.showNotification('Pro Pundits League', options)
    )
  }
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const targetUrl = event.notification.data?.url || '/dashboard'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window is already open, focus it and navigate
      for (const client of clientList) {
        if ('focus' in client) {
          if (client.url.includes(targetUrl)) {
            return client.focus()
          }
          return client.focus().then(() => client.navigate(targetUrl))
        }
      }
      // Otherwise open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
      }
    })
  )
})
