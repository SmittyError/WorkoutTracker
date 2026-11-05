/* ==========================================================================
   Service worker: makes the app work offline.

   It uses a strategy called "stale while revalidate":
     1. Answer right away from the saved copy, so the app opens fast even
        with no signal at the gym.
     2. Fetch a fresh copy in the background for next time.

   So after you push an update, the app shows the old version on the first
   open and the new version on the one after that.

   Your workout data is in localStorage, not this cache, so clearing or
   changing the cache never touches it.
   ========================================================================== */
const CACHE_NAME = 'workout-tracker-v2';

// Relative paths, so this works under /WorkoutTracker/ on GitHub Pages.
const APP_FILES = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'manifest.webmanifest',
  'fonts/oswald.woff2',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

// First install: save every app file.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

// Remove caches from older versions. This only matters if CACHE_NAME changes.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

// Every request from the app comes through here.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Only handle this site's own GET requests.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  const fresh = fetch(event.request).then(async (response) => {
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(event.request, response.clone());
    }
    return response;
  });

  // Keep the background update alive after the saved copy has been returned.
  event.waitUntil(fresh.catch(() => {}));

  // Use the saved copy if there is one. Otherwise wait for the network.
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((saved) => saved || fresh)
  );
});
