const CACHE_PREFIX = "darkpix-runtime-";
const RELEASE_ID = (new URL(self.location.href).searchParams.get("v") ?? "dev")
  .replace(/[^a-zA-Z0-9._-]/g, "")
  .slice(0, 64) || "dev";
const CACHE_NAME = `${CACHE_PREFIX}${RELEASE_ID}`;
const SHELL_URLS = ["/", "/manifest.webmanifest", "/darkpix-icon.svg", "/assets/darkpix-title.jpg"];
const ASSET_REFERENCE = /["']((?:\/assets\/|\.\/)[^"'\s)]+\.(?:js|css|jpg|png|svg|woff2?))["']/g;

function assetReferences(source, baseUrl) {
  const references = [];
  for (const match of source.matchAll(ASSET_REFERENCE)) {
    if (match[1]) references.push(new URL(match[1], baseUrl).href);
  }
  return references;
}

async function cacheBuildAssets() {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(SHELL_URLS);
  const shell = await cache.match("/");
  if (!shell) return;
  const queue = assetReferences(await shell.clone().text(), shell.url);
  const visited = new Set();
  while (queue.length > 0 && visited.size < 24) {
    const assetUrl = queue.shift();
    if (!assetUrl || visited.has(assetUrl)) continue;
    visited.add(assetUrl);
    const response = await fetch(assetUrl);
    if (!response.ok) throw new Error(`Could not cache ${assetUrl}`);
    await cache.put(assetUrl, response.clone());
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("javascript") || contentType.includes("text/css")) {
      for (const reference of assetReferences(await response.text(), assetUrl)) {
        if (!visited.has(reference)) queue.push(reference);
      }
    }
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheBuildAssets());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname === "/version.txt" || url.pathname === "/healthz") return;
  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      } catch {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === "navigate") return caches.match("/");
        return Response.error();
      }
    })(),
  );
});
