/* Pitch service worker.
 *
 *  • Navigations      network-first (navigation preload) → cached app shell offline
 *  • /assets/*         cache-first (content-hashed, immutable)
 *  • /api/*            network-first with a timeout → last good response offline
 *                      (never /api/live*, /api/collect, /api/insights, /api/og)
 *  • Remote images     stale-while-revalidate, capped
 *  • Other statics     stale-while-revalidate (icons, manifest, fonts)
 *
 * The page registers /sw.js?v=<build>; the build id names the shell cache so
 * every deploy gets a fresh shell, while hashed assets survive across deploys
 * (tabs still running the previous build can keep lazy-loading their chunks).
 */

const VERSION = (() => {
  const v = new URL(self.location.href).searchParams.get("v") || "0";
  return /^[\w-]{1,40}$/.test(v) ? v : "0";
})();

const SHELL = `pitch-shell-${VERSION}`;
const ASSETS = "pitch-assets-v1";
const API = "pitch-api-v1";
const IMAGES = "pitch-img-v1";
const FONTS = "pitch-fonts-v1";
const KEEP = new Set([SHELL, ASSETS, API, IMAGES, FONTS]);

const SHELL_KEY = "/";
const PRECACHE = ["/", "/manifest.webmanifest", "/favicon.svg", "/icons/icon-192.png", "/apple-touch-icon.png"];

const CAPS = { [ASSETS]: 160, [API]: 120, [IMAGES]: 180, [FONTS]: 30, [SHELL]: 40 };
const API_TIMEOUT = 4500;
const NAV_TIMEOUT = 7000;

const IMAGE_HOSTS = new Set(["a.espncdn.com", "r2.thesportsdb.com", "www.thesportsdb.com", "flagcdn.com", "upload.wikimedia.org"]);
const FONT_HOSTS = new Set(["fonts.googleapis.com", "fonts.gstatic.com"]);
const API_BYPASS = /^\/api\/(live|collect|insights|og)(\/|$)/;

/* ---------------------------------------------------------- lifecycle -- */

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      await Promise.all(
        PRECACHE.map((url) =>
          fetch(new Request(url, { cache: "reload" }))
            .then((res) => (res.ok ? cache.put(url, res) : undefined))
            .catch(() => undefined),
        ),
      );
      // First install: take over straight away. Updates wait for the page to ask.
      if (!self.registration.active) await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith("pitch-") && !KEEP.has(n)).map((n) => caches.delete(n)));
      if (self.registration.navigationPreload) {
        try {
          await self.registration.navigationPreload.enable();
        } catch {
          /* unsupported */
        }
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;
  if (data.type === "SKIP_WAITING") self.skipWaiting();
  else if (data.type === "VERSION" && event.ports && event.ports[0]) event.ports[0].postMessage({ version: VERSION });
});

/* -------------------------------------------------------------- fetch -- */

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }

  if (url.origin === self.location.origin) {
    const path = url.pathname;
    if (path === "/sw.js") return;
    if (path.startsWith("/api/")) {
      if (API_BYPASS.test(path) || req.headers.get("Upgrade")) return;
      event.respondWith(networkFirst(event, API, API_TIMEOUT));
      return;
    }
    if (req.mode === "navigate") {
      event.respondWith(navigate(event));
      return;
    }
    if (path.startsWith("/assets/")) {
      event.respondWith(cacheFirst(event, ASSETS));
      return;
    }
    if (/\.(png|svg|ico|webmanifest|woff2?|json|txt)$/.test(path)) {
      event.respondWith(staleWhileRevalidate(event, SHELL));
    }
    return;
  }

  if (IMAGE_HOSTS.has(url.hostname)) {
    event.respondWith(staleWhileRevalidate(event, IMAGES));
    return;
  }
  if (FONT_HOSTS.has(url.hostname)) {
    event.respondWith(url.hostname === "fonts.gstatic.com" ? cacheFirst(event, FONTS) : staleWhileRevalidate(event, FONTS));
  }
});

/* ---------------------------------------------------------- strategies -- */

function timeout(ms) {
  return new Promise((resolve) => setTimeout(() => resolve(null), ms));
}

function cacheable(res) {
  if (!res) return false;
  if (res.type === "opaque") return true;
  if (!res.ok || res.status !== 200) return false;
  return !/no-store/i.test(res.headers.get("Cache-Control") || "");
}

let trimming = {};
async function trim(name) {
  const cap = CAPS[name] || 100;
  if (trimming[name]) return;
  trimming[name] = true;
  try {
    const cache = await caches.open(name);
    // Cache.keys() is in insertion order: drop the oldest entries first,
    // but never the precached shell itself.
    const keys = (await cache.keys()).filter((k) => !PRECACHE.includes(new URL(k.url).pathname));
    for (let i = 0; i < keys.length - cap; i++) await cache.delete(keys[i]);
  } finally {
    trimming[name] = false;
  }
}

async function store(name, req, res) {
  try {
    const cache = await caches.open(name);
    await cache.put(req, res);
    await trim(name);
  } catch {
    /* quota exceeded or opaque-response restrictions — skip */
  }
}

async function navigate(event) {
  const network = (async () => {
    const preload = await Promise.resolve(event.preloadResponse).catch(() => null);
    const res = preload || (await fetch(event.request));
    if (res.ok && res.type === "basic" && (res.headers.get("Content-Type") || "").includes("text/html")) {
      // Every SPA route serves the same shell; keep the newest one for offline starts.
      await store(SHELL, SHELL_KEY, res.clone());
    }
    return res;
  })();
  event.waitUntil(network.catch(() => undefined));
  try {
    const res = await Promise.race([network, timeout(NAV_TIMEOUT)]);
    if (res) return res;
  } catch {
    /* offline */
  }
  const cached = (await caches.match(SHELL_KEY, { cacheName: SHELL })) || (await caches.match(SHELL_KEY));
  if (cached) return cached;
  try {
    return await network;
  } catch {
    return offlinePage();
  }
}

async function cacheFirst(event, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(event.request);
  if (hit) return hit;
  const res = await fetch(event.request);
  if (cacheable(res)) event.waitUntil(store(name, event.request, res.clone()));
  return res;
}

async function networkFirst(event, name, ms) {
  const req = event.request;
  const network = fetch(req).then((res) => {
    if (cacheable(res) && res.type === "basic") return store(name, req, res.clone()).then(() => res);
    return res;
  });
  event.waitUntil(network.catch(() => undefined));
  let res = null;
  try {
    res = await Promise.race([network, timeout(ms)]);
    if (res && res.status < 500) return res;
  } catch {
    res = null;
  }
  const cached = await caches.match(req, { cacheName: name });
  if (cached) return cached;
  if (res) return res;
  try {
    return await network;
  } catch {
    return new Response(JSON.stringify({ error: "offline" }), {
      status: 503,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
}

async function staleWhileRevalidate(event, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(event.request);
  const network = fetch(event.request)
    .then((res) => {
      if (cacheable(res)) return store(name, event.request, res.clone()).then(() => res);
      return res;
    })
    .catch(() => null);
  event.waitUntil(network);
  if (hit) return hit;
  const res = await network;
  return res || Response.error();
}

function offlinePage() {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="light dark"><title>Offline · Pitch</title>
<style>:root{--bg:#f2f2f7;--ink:#1d1d1f;--ink-2:#6e6e73;--card:rgba(255,255,255,.7)}@media (prefers-color-scheme:dark){:root{--bg:#000;--ink:#f5f5f7;--ink-2:#a1a1a6;--card:rgba(36,36,38,.78)}}
body{margin:0;min-height:100dvh;display:grid;place-items:center;background:var(--bg);color:var(--ink);font:16px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:16px}
main{max-width:360px;text-align:center;padding:32px 28px;border-radius:28px;background:var(--card);box-shadow:0 30px 60px -12px rgba(0,0,0,.22)}
img{width:64px;height:64px;border-radius:15px;margin:0 auto 16px;display:block}h1{font-size:22px;margin:0 0 6px;letter-spacing:-.02em}p{margin:0 0 20px;color:var(--ink-2)}
button{font:inherit;font-weight:600;color:#fff;background:#0071e3;border:0;border-radius:999px;padding:11px 22px;cursor:pointer}</style></head>
<body><main><img src="/icons/icon-192.png" alt=""><h1>You’re offline</h1><p>Pitch will be back as soon as your connection returns.</p><button onclick="location.reload()">Try again</button></main></body></html>`;
  return new Response(html, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
