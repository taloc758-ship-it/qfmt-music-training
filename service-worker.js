/* PWA service worker for offline support */

const CACHE_VERSION = 'qfmt-v11';
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const APP_BASE_URL = self.registration.scope;
const appUrl = (path = '') => new URL(path, APP_BASE_URL).toString();

const APP_SHELL_ASSETS = [
  '',
  'index.html',
  'styles.css',
  'script.js',
  'notes.txt',
  'piano-manifest.json',
  'manifest.webmanifest',
  'icon.svg',
  'service-worker.js'
].map(appUrl);

async function precachePianoAudio({ timeBudgetMs } = {}) {
  const deadline = Number.isFinite(timeBudgetMs) ? Date.now() + timeBudgetMs : null;

  try {
    const resp = await fetch(appUrl('piano-manifest.json'), { cache: 'no-store' });
    if (!resp.ok) return;

    const data = await resp.json();
    const files = Array.isArray(data.files) ? data.files : [];
    if (files.length === 0) return;

    const cache = await caches.open(RUNTIME_CACHE);
    for (const file of files) {
      if (deadline && Date.now() > deadline) break;
      const req = new Request(appUrl(String(file).replace(/^\/+/, '')), { cache: 'reload' });

      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) continue;

      try {
        const res = await fetch(req);
        if (res && (res.ok || res.type === 'opaque')) {
          await cache.put(req, res.clone());
        }
      } catch (_) {
        // best-effort; button on UI can complete the rest
      }
    }
  } catch (_) {
    // ignore
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP_SHELL_CACHE);
      await cache.addAll(APP_SHELL_ASSETS);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('qfmt-') && !key.startsWith(CACHE_VERSION))
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();

       // Best-effort: cache some audio shortly after activation so offline works sooner.
       // iOS may kill long-running SW tasks; keep a small budget and allow manual completion in UI.
       await precachePianoAudio({ timeBudgetMs: 8000 });
    })()
  );
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'GET_VERSION') {
    event.ports?.[0]?.postMessage({ version: CACHE_VERSION });
    return;
  }

  if (data.type === 'PRECACHE_AUDIO') {
    event.waitUntil(precachePianoAudio());
  }
});

function isNavigationRequest(request) {
  return request.mode === 'navigate' || (request.method === 'GET' && request.headers.get('accept')?.includes('text/html'));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  event.respondWith(
    (async () => {
      const url = new URL(request.url);

      if (isNavigationRequest(request)) {
        // Cache-first for navigations (stale-while-revalidate).
        // iOS may take a long time to fail network when offline; returning cached HTML immediately avoids the offline error page.
        const shellCache = await caches.open(APP_SHELL_CACHE);
        const cached =
          (await shellCache.match(appUrl('index.html'), { ignoreSearch: true })) ||
          (await caches.match(appUrl('index.html'), { ignoreSearch: true })) ||
          (await caches.match(appUrl(), { ignoreSearch: true }));

        const update = fetch(request)
          .then((fresh) => {
            if (fresh && fresh.ok) {
              shellCache.put(appUrl('index.html'), fresh.clone());
            }
            return fresh;
          })
          .catch(() => null);

        event.waitUntil(update);

        if (cached) return cached;
        const fresh = await update;
        return fresh || Response.error();
      }

      // Cache-first for static assets & audio after first fetch
      const cached = await caches.match(request, { ignoreSearch: true });
      if (cached) return cached;

      try {
        const fresh = await fetch(request);
        // Cache successful responses and opaque (CDN) responses for offline reuse
        if (fresh && (fresh.ok || fresh.type === 'opaque')) {
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(request, fresh.clone());
        }
        return fresh;
      } catch (error) {
        // Fallback to app shell cache for same-origin core assets
        if (url.origin === self.location.origin) {
          const fallback = await caches.match(url.href, { ignoreSearch: true });
          if (fallback) return fallback;
        }
        throw error;
      }
    })()
  );
});
