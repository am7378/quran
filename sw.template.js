/*
 * The reader's service worker: the site kept on the device, so it opens at once and reads with no
 * connection (only word audio, from quran.com, needs one). Written into dist/sw.js at build time by
 * vite.config.ts, which fills in FILES: every built file with a hash of its contents.
 *
 * - The app itself (the page, its script and style, the fonts it uses, the small data) is kept when
 *   the worker installs; the 114 surahs and the search index follow quietly when the page asks
 *   ("keep-all"), so the whole Qur'an reads offline after one visit.
 * - Each file is kept under its own hash: a new version of the site fetches only what changed, and
 *   what no longer exists is cleared.
 * - Pages are network-first (a new version shows when there is a connection), everything else is
 *   served from what is kept, fetched and kept when missing.
 */
const FILES = __FILES__; // { "path": "hash" }, paths relative to this worker
const CACHE = "quran-reader";

const scope = new URL(self.registration.scope);
const keyOf = (path) => new URL(`${path}?v=${FILES[path]}`, scope).href;
const isShell = (path) =>
  path === "index.html" ||
  /^assets\/.+\.(js|css)$/.test(path) ||
  // the fonts the page uses (not the other alphabets' subsets, nor the older woff copies)
  (/^assets\/.+\.woff2$/.test(path) && !/(cyrillic|vietnamese|greek|math|symbols)/.test(path)) ||
  /^fonts\//.test(path) ||
  /^data\/(surahs|glossary|summaries|topics|collections|themes)\.json$/.test(path);

async function keep(cache, path) {
  if (await cache.match(keyOf(path))) return;
  const res = await fetch(new URL(path, scope), { cache: "no-cache" });
  if (res.ok) await cache.put(keyOf(path), res);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(Object.keys(FILES).filter(isShell).map((p) => keep(cache, p)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // what this version no longer has (or has under a new hash) is cleared
      const cache = await caches.open(CACHE);
      const current = new Set(Object.keys(FILES).map(keyOf));
      for (const req of await cache.keys()) if (!current.has(req.url)) await cache.delete(req);
      for (const name of await caches.keys()) if (name !== CACHE) await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});

// the rest of the data, a few files at a time, when the page has settled
let keepingAll = null;
self.addEventListener("message", (event) => {
  if (event.data !== "keep-all" || keepingAll) return;
  keepingAll = (async () => {
    const cache = await caches.open(CACHE);
    const rest = Object.keys(FILES).filter((p) => p.startsWith("data/") && !isShell(p));
    for (let i = 0; i < rest.length; i += 3) {
      await Promise.all(rest.slice(i, i + 3).map((p) => keep(cache, p).catch(() => {})));
    }
  })();
  event.waitUntil(keepingAll);
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return; // quran.com audio etc.
  const path = decodeURIComponent(url.pathname.slice(scope.pathname.length)) || "index.html";

  // the page: the newest when online, the kept one when not
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        try {
          const res = await fetch(req);
          if (res.ok && FILES["index.html"]) cache.put(keyOf("index.html"), res.clone());
          return res;
        } catch {
          return (await cache.match(keyOf("index.html"))) ?? (await cache.match(new URL("index.html", scope).href)) ?? Response.error();
        }
      })(),
    );
    return;
  }

  if (!(path in FILES)) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const kept = await cache.match(keyOf(path));
      if (kept) return kept;
      const res = await fetch(req);
      if (res.ok) cache.put(keyOf(path), res.clone());
      return res;
    })(),
  );
});
