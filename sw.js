/* ==========================================================================
   Service worker: makes the app work offline and keeps it up to date.

   Opening the app: every file comes straight from the saved copy, so it opens
   fast even with no signal at the gym.

   Updating: the app asks this worker to check for an update whenever you return
   to it. The worker downloads every file and compares each one with its saved
   copy. If anything changed, it replaces them all at once and tells the app, so
   you never run a mix of old and new files. There's no version number to change
   when you push. CACHE_NAME only needs changing if this file's own design changes.

   Your workout data is in localStorage, not this cache, so clearing or
   changing the cache never touches it.
   ========================================================================== */
const CACHE_NAME = 'workout-tracker-v4';

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

// First install: save every app file. cache: 'reload' skips the browser's own
// short-term copies, so all the files come from the same release.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_FILES.map((file) => new Request(file, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

// Remove caches from older versions.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

// Every request from the app comes through here. Use the saved copy if there
// is one, and only go to the network for anything else. This reads from this
// version's cache by name, because caches.match() would search older ones too.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Only handle this site's own GET requests.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE_NAME)
      .then((cache) => cache.match(event.request, { ignoreSearch: true }))
      .then((saved) => saved || fetch(event.request))
  );
});

// A worker being replaced can still finish a download and recreate its old
// cache after this one has cleaned up, so each check clears any leftovers.
async function removeOldCaches() {
  const names = await caches.keys();
  await Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)));
}

// True when two downloaded files have exactly the same bytes.
function sameBytes(first, second) {
  if (first.byteLength !== second.byteLength) return false;
  const a = new Uint8Array(first);
  const b = new Uint8Array(second);
  return a.every((byte, index) => byte === b[index]);
}

async function checkForUpdate() {
  await removeOldCaches();

  // cache: 'no-cache' asks GitHub whether each file changed, instead of trusting
  // a browser copy that could be up to 10 minutes old. Nothing is saved until
  // every download has worked, so bad signal can't leave a half-updated app.
  const downloads = await Promise.all(APP_FILES.map(async (file) => {
    const response = await fetch(file, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Could not download ${file}`);
    return { file, response };
  }));

  const cache = await caches.open(CACHE_NAME);
  let changed = false;
  for (const { file, response } of downloads) {
    const saved = await cache.match(file);
    if (!saved || !sameBytes(await saved.arrayBuffer(), await response.clone().arrayBuffer())) {
      changed = true;
    }
  }
  if (!changed) return;

  await Promise.all(downloads.map(({ file, response }) => cache.put(file, response)));
  const windows = await self.clients.matchAll({ type: 'window' });
  windows.forEach((client) => client.postMessage('update-ready'));
}

// The app sends this message when you open it or return to it.
self.addEventListener('message', (event) => {
  if (event.data === 'check-for-update') {
    // With no signal the check fails, and the app carries on with its saved copy.
    event.waitUntil(checkForUpdate().catch(() => {}));
  }
});
