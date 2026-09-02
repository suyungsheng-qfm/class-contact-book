const CACHE_NAME = 'class-contact-book-v36';
const APP_SHELL = [
  './',
  './index.html',
  './guardians.html',
  './teacher.html',
  './forms.html',
  './guide.html',
  './manifest.webmanifest',
  './app-icon.svg',
  './app-icon-192.png',
  './app-icon-512.png',
  './apple-touch-icon.png',
  './yssu.png?v=20260801'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match(event.request))
  );
});

// Firebase Cloud Messaging must be initialised in the service worker so that a
// Home Screen app can receive a notification while it is not open.
importScripts('https://www.gstatic.com/firebasejs/11.6.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.6.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyD_IvR1rEMxDSw3Fv_3zkM1mGetMQv8gg8',
  authDomain: 'classcontact-c148d.firebaseapp.com',
  projectId: 'classcontact-c148d',
  storageBucket: 'classcontact-c148d.firebasestorage.app',
  messagingSenderId: '559132828543',
  appId: '1:559132828543:web:a47598010956175eda304a'
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
  const data = payload && payload.data ? payload.data : {};
  const title = data.title || '班級聯絡簿(807)';
  const body = data.body || '您有新的未讀訊息。';
  const url = data.url || './index.html';
  const badgeCount = Math.max(1, Number(data.badgeCount) || 1);
  const options = {
    body,
    icon: './app-icon-192.png',
    badge: './app-icon-192.png',
    data: { url },
    tag: data.tag || 'contact-book-message',
    renotify: true
  };
  const tasks = [self.registration.showNotification(title, options)];
  if (typeof self.navigator.setAppBadge === 'function') tasks.push(self.navigator.setAppBadge(badgeCount));
  return Promise.all(tasks);
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification && event.notification.data && event.notification.data.url || './index.html';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
    const existing = windows.find(client => client.url && client.url.indexOf(url.replace('./', '/')) !== -1);
    if (existing) return existing.focus();
    return clients.openWindow(url);
  }));
});
