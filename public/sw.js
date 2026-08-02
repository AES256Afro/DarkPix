const CACHE_PREFIX = "darkpix-runtime-";
const RELEASE_ID = (new URL(self.location.href).searchParams.get("v") ?? "dev")
  .replace(/[^a-zA-Z0-9._-]/g, "")
  .slice(0, 64) || "dev";
const CACHE_NAME = `${CACHE_PREFIX}${RELEASE_ID}`;
const RELEASE_ASSET_PATHS = ["/manifest.webmanifest", "/darkpix-icon.svg", "/assets/darkpix-title.jpg"];
const SHELL_URLS = ["/", ...RELEASE_ASSET_PATHS.map((path) => `${path}?v=${encodeURIComponent(RELEASE_ID)}`)];
const SHELL_PATHS = new Set(["/", ...RELEASE_ASSET_PATHS]);
const QUOTED_ASSET_REFERENCE = /["']((?:\/assets\/|\.\/)[^"'\s)]+\.(?:js|css|jpg|png|svg|woff2?))["']/g;
const CSS_ASSET_REFERENCE = /url\(\s*["']?((?:\/assets\/|\.\/)[^"'\s)]+\.(?:jpg|png|svg|woff2?))["']?\s*\)/g;

function assetReferences(source, baseUrl) {
  const references = new Set();
  for (const pattern of [QUOTED_ASSET_REFERENCE, CSS_ASSET_REFERENCE]) {
    for (const match of source.matchAll(pattern)) {
      if (match[1]) references.add(new URL(match[1], baseUrl).href);
    }
  }
  return [...references];
}

async function matchCurrentCache(request) {
  try {
    return await (await caches.open(CACHE_NAME)).match(request);
  } catch {
    return undefined;
  }
}

async function updateCurrentCache(request, response) {
  try {
    await (await caches.open(CACHE_NAME)).put(request, response);
  } catch {
    // A full or unavailable cache must never replace a valid network response.
  }
}

function runtimeCacheKey(request, url) {
  if (request.mode === "navigate") return "/";
  if (SHELL_PATHS.has(url.pathname)) return url.pathname === "/"
    ? "/"
    : `${url.pathname}?v=${encodeURIComponent(RELEASE_ID)}`;
  if (url.pathname.startsWith("/assets/")) return url.pathname;
  return undefined;
}

function responseMatchesCacheKey(cacheKey, response) {
  const pathname = new URL(cacheKey, self.location.origin).pathname;
  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  if (pathname === "/") return contentType.includes("text/html");
  if (pathname === "/manifest.webmanifest") return contentType.includes("json");
  if (pathname.endsWith(".js")) return contentType.includes("javascript");
  if (pathname.endsWith(".css")) return contentType.includes("text/css");
  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return contentType.includes("image/jpeg");
  if (pathname.endsWith(".png")) return contentType.includes("image/png");
  if (pathname.endsWith(".svg")) return contentType.includes("image/svg+xml");
  if (pathname.endsWith(".woff") || pathname.endsWith(".woff2")) return contentType.includes("woff");
  return false;
}

async function responseMatchesCurrentReleaseShell(response) {
  if (!responseMatchesCacheKey("/", response)) return false;
  try {
    const html = await response.clone().text();
    return html.includes(`<meta name="darkpix-release" content="${RELEASE_ID}"`);
  } catch {
    return false;
  }
}

async function cacheBuildAssets() {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(SHELL_URLS);
  const shell = await cache.match("/");
  if (!shell) throw new Error("Release shell is missing from its offline cache");
  if (!responseMatchesCacheKey("/", shell)) throw new Error("Release shell has an invalid content type");
  if (!(await responseMatchesCurrentReleaseShell(shell))) throw new Error("Release shell belongs to another release");
  for (const shellUrl of SHELL_URLS) {
    const response = shellUrl === "/" ? shell : await cache.match(shellUrl);
    if (!response) throw new Error(`Release shell asset is missing: ${shellUrl}`);
    if (!responseMatchesCacheKey(shellUrl, response)) {
      throw new Error(`Release shell asset has an invalid content type: ${shellUrl}`);
    }
  }
  const queue = assetReferences(await shell.clone().text(), shell.url);
  if (queue.length === 0) throw new Error("Release shell exposed no cacheable build assets");
  const visited = new Set();
  while (queue.length > 0 && visited.size < 24) {
    const assetUrl = queue.shift();
    if (!assetUrl || visited.has(assetUrl)) continue;
    visited.add(assetUrl);
    const response = await fetch(assetUrl);
    if (!response.ok) throw new Error(`Could not cache ${assetUrl}`);
    if (!responseMatchesCacheKey(assetUrl, response)) throw new Error(`Refused invalid content type for ${assetUrl}`);
    await cache.put(assetUrl, response.clone());
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("javascript") || contentType.includes("text/css")) {
      for (const reference of assetReferences(await response.text(), assetUrl)) {
        if (!visited.has(reference)) queue.push(reference);
      }
    }
  }
  if (queue.some((assetUrl) => assetUrl && !visited.has(assetUrl))) {
    throw new Error("Release asset graph exceeds the offline cache limit");
  }
}

async function installCurrentRelease() {
  try {
    await cacheBuildAssets();
  } catch (error) {
    try {
      await caches.delete(CACHE_NAME);
    } catch {
      // The failed install still rejects even if storage cleanup is unavailable.
    }
    throw error;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(installCurrentRelease());
});

async function activateCurrentRelease() {
  let keys = [];
  try {
    keys = await caches.keys();
  } catch {
    // An intact current release can still activate when old-cache enumeration is unavailable.
  }
  await Promise.allSettled(
    keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)),
  );
  await self.clients.claim();
}

self.addEventListener("activate", (event) => {
  event.waitUntil(activateCurrentRelease());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname === "/sw.js" || url.pathname === "/version.txt" || url.pathname === "/healthz") return;
  const cacheKey = runtimeCacheKey(request, url);
  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);
        if (response.ok && cacheKey) {
          if (!responseMatchesCacheKey(cacheKey, response)) {
            return (await matchCurrentCache(cacheKey)) ?? Response.error();
          }
          if (cacheKey !== "/" || await responseMatchesCurrentReleaseShell(response)) {
            await updateCurrentCache(cacheKey, response.clone());
          }
          return response;
        }
        const cached = cacheKey ? await matchCurrentCache(cacheKey) : undefined;
        return cached ?? response;
      } catch {
        const cached = cacheKey ? await matchCurrentCache(cacheKey) : undefined;
        if (cached) return cached;
        if (request.mode === "navigate") return (await matchCurrentCache("/")) ?? Response.error();
        return Response.error();
      }
    })(),
  );
});
