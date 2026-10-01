// сначала сеть (чтобы всегда была свежая версия), без сети — из кэша
const CACHE = 'progress-v1';
const SHELL = [
  './', 'index.html', 'config.js', 'css/style.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png',
  'js/app.js', 'js/store.js', 'js/dates.js', 'js/logic.js', 'js/ui.js', 'js/charts.js', 'js/sync.js', 'js/demo.js',
  'js/views/today.js', 'js/views/habits.js', 'js/views/tasks.js', 'js/views/goals.js', 'js/views/insights.js', 'js/views/settings.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  const cacheable = url.origin === location.origin || url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com') || url.hostname === 'cdn.jsdelivr.net';
  if (e.request.method !== 'GET' || !cacheable) return; // запросы к supabase не трогаем
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});
