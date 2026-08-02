import { describe, expect, it, vi } from "vitest";
import manifestSource from "../public/manifest.webmanifest?raw";
import worker from "../public/sw.js?raw";
import indexSource from "../index.html?raw";

const releaseShellHtml = (release: string, body = ""): string => `<meta name="darkpix-release" content="${release}">${body}`;

describe("installable offline shell", () => {
  it("publishes a scoped standalone game manifest", () => {
    const manifest = JSON.parse(manifestSource) as Record<string, unknown>;
    expect(manifest).toMatchObject({ short_name: "DarkPix", start_url: "/", scope: "/", display: "standalone", orientation: "landscape" });
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(JSON.stringify(manifest.icons)).toContain("/darkpix-icon.svg?v=app");
    expect(indexSource).toContain("/manifest.webmanifest?v=%VITE_DARKPIX_VERSION%");
    expect(indexSource).toContain("/darkpix-icon.svg?v=%VITE_DARKPIX_VERSION%");
    expect(indexSource).toContain('<meta name="darkpix-release" content="%VITE_DARKPIX_VERSION%"');
  });

  it("keeps release identity online while caching the playable shell", () => {
    expect(worker).toContain('url.pathname === "/version.txt"');
    expect(worker).toContain('url.pathname === "/healthz"');
    expect(worker).toContain('url.pathname === "/sw.js"');
    expect(worker).toContain('request.mode === "navigate"');
    expect(worker).toContain('event.data?.type === "SKIP_WAITING"');
    expect(worker).toContain("cacheBuildAssets");
    expect(worker).toContain("encodeURIComponent(RELEASE_ID)");
    expect(worker).toContain('throw new Error("Release shell is missing from its offline cache")');
    expect(worker).toContain('throw new Error("Release shell has an invalid content type")');
    expect(worker).toContain('throw new Error("Release shell belongs to another release")');
    expect(worker).toContain("Release shell asset is missing:");
    expect(worker).toContain("Release shell asset has an invalid content type:");
    expect(worker).toContain("Refused invalid content type");
    expect(worker).toContain("responseMatchesCacheKey(cacheKey, response)");
    expect(worker).toContain('throw new Error("Release shell exposed no cacheable build assets")');
    expect(worker).toContain("visited.size < 24");
    expect(worker).toContain('throw new Error("Release asset graph exceeds the offline cache limit")');
    expect(worker).toContain("await caches.delete(CACHE_NAME)");
    expect(worker).toContain("event.waitUntil(installCurrentRelease())");
    expect(worker).toContain("return cached ?? (await matchPriorReleaseAsset(request)) ?? response");
    expect(worker).toContain("await updateCurrentCache(cacheKey, response.clone())");
    expect(worker).toContain("A full or unavailable cache must never replace a valid network response.");
    expect(worker).not.toContain("await caches.match(request)");
    const installHandler = worker.slice(worker.indexOf('addEventListener("install"'), worker.indexOf('addEventListener("activate"'));
    expect(installHandler).not.toContain("skipWaiting");
  });

  it("stages each release in an isolated cache before activation", () => {
    expect(worker).toContain('const CACHE_PREFIX = "darkpix-runtime-"');
    expect(worker).toContain('new URL(self.location.href).searchParams.get("v")');
    expect(worker).toContain('const CACHE_NAME = `${CACHE_PREFIX}${RELEASE_ID}`');
    expect(worker).toContain("key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME");
    expect(worker).not.toContain('const CACHE_NAME = "darkpix-runtime-v1"');
  });

  it("canonicalizes fixed shell queries to one current-release cache key", () => {
    const runtimeCacheKey = worker.slice(worker.indexOf("function runtimeCacheKey"), worker.indexOf("function responseMatchesCacheKey"));
    expect(runtimeCacheKey).toContain('`${url.pathname}?v=${encodeURIComponent(RELEASE_ID)}`');
    expect(runtimeCacheKey).not.toContain("`${url.pathname}${url.search}`");
    expect(runtimeCacheKey).toContain('if (url.pathname.startsWith("/assets/")) return url.pathname');
  });

  it("bounds discovered install references to canonical same-origin build assets", () => {
    const assetReferenceFunction = worker.slice(worker.indexOf("function assetReferences"), worker.indexOf("async function matchCurrentCache"));
    expect(assetReferenceFunction).toContain("assetUrl.origin !== self.location.origin");
    expect(assetReferenceFunction).toContain('!assetUrl.pathname.startsWith("/assets/")');
    expect(assetReferenceFunction).toContain('assetUrl.search = ""');
    expect(assetReferenceFunction).toContain('assetUrl.hash = ""');
    expect(assetReferenceFunction).toContain("Malformed text references do not belong in the release cache graph.");
  });

  it("claims a complete release even when obsolete cache cleanup fails", async () => {
    const handlers = new Map<string, (event: { waitUntil(promise: Promise<unknown>): void }) => void>();
    const claim = vi.fn(async () => undefined);
    const deleteCache = vi.fn(async (key: string) => {
      if (key.endsWith("stale-b")) throw new Error("cache storage unavailable");
      return true;
    });
    const workerScope = {
      location: { href: "https://darkpix.test/sw.js?v=current-release", origin: "https://darkpix.test" },
      clients: { claim },
      skipWaiting: vi.fn(async () => undefined),
      addEventListener: (name: string, handler: (event: { waitUntil(promise: Promise<unknown>): void }) => void) => handlers.set(name, handler),
    };
    const cacheStorage = {
      open: vi.fn(),
      keys: vi.fn(async () => ["darkpix-runtime-stale-a", "darkpix-runtime-stale-b", "darkpix-runtime-prior-a", "darkpix-runtime-prior-b", "darkpix-runtime-current-release", "unowned-cache"]),
      delete: deleteCache,
    };
    new Function("self", "caches", "fetch", worker)(workerScope, cacheStorage, vi.fn());
    let activation: Promise<unknown> | undefined;
    handlers.get("activate")?.({ waitUntil: (promise) => { activation = promise; } });

    await expect(activation).resolves.toBeUndefined();
    expect(deleteCache).toHaveBeenCalledTimes(2);
    expect(deleteCache).toHaveBeenCalledWith("darkpix-runtime-stale-a");
    expect(deleteCache).toHaveBeenCalledWith("darkpix-runtime-stale-b");
    expect(claim).toHaveBeenCalledOnce();
  });

  it("keeps a complete release active when immediate client claiming fails", async () => {
    const handlers = new Map<string, (event: { waitUntil(promise: Promise<unknown>): void }) => void>();
    const claim = vi.fn(async () => { throw new Error("client control unavailable"); });
    const workerScope = {
      location: { href: "https://darkpix.test/sw.js?v=current-release", origin: "https://darkpix.test" },
      clients: { claim },
      skipWaiting: vi.fn(async () => undefined),
      addEventListener: (name: string, handler: (event: { waitUntil(promise: Promise<unknown>): void }) => void) => handlers.set(name, handler),
    };
    const cacheStorage = { open: vi.fn(), keys: vi.fn(async () => ["darkpix-runtime-current-release"]), delete: vi.fn(async () => true) };
    new Function("self", "caches", "fetch", worker)(workerScope, cacheStorage, vi.fn());
    let activation: Promise<unknown> | undefined;
    handlers.get("activate")?.({ waitUntil: (promise) => { activation = promise; } });

    await expect(activation).resolves.toBeUndefined();
    expect(claim).toHaveBeenCalledOnce();
  });

  it("contains a rejected request to activate a waiting worker", async () => {
    const handlers = new Map<string, (event: { data?: { type?: string } }) => void>();
    const skipWaiting = vi.fn(async () => { throw new Error("activation unavailable"); });
    const workerScope = {
      location: { href: "https://darkpix.test/sw.js?v=current-release", origin: "https://darkpix.test" },
      clients: { claim: vi.fn(async () => undefined) },
      skipWaiting,
      addEventListener: (name: string, handler: (event: { data?: { type?: string } }) => void) => handlers.set(name, handler),
    };
    const cacheStorage = { open: vi.fn(), keys: vi.fn(async () => []), delete: vi.fn(async () => true) };
    new Function("self", "caches", "fetch", worker)(workerScope, cacheStorage, vi.fn());

    handlers.get("message")?.({ data: { type: "SKIP_WAITING" } });
    await Promise.resolve();
    expect(skipWaiting).toHaveBeenCalledOnce();
  });

  it("rejects and cleans an incomplete release cache before activation", () => {
    const installFunction = worker.slice(worker.indexOf("async function installCurrentRelease"), worker.indexOf('self.addEventListener("install"'));
    expect(installFunction).toContain("await cacheBuildAssets()");
    expect(installFunction).toContain("await caches.delete(CACHE_NAME)");
    expect(installFunction).toContain("throw error");
  });

  it("rejects the install event and deletes its partial cache when the shell is absent", async () => {
    const handlers = new Map<string, (event: { waitUntil(promise: Promise<unknown>): void }) => void>();
    const deleteCache = vi.fn(async () => true);
    const cache = { addAll: vi.fn(async () => undefined), match: vi.fn(async () => undefined) };
    const workerScope = {
      location: { href: "https://darkpix.test/sw.js?v=broken-release", origin: "https://darkpix.test" },
      clients: { claim: vi.fn(async () => undefined) },
      skipWaiting: vi.fn(async () => undefined),
      addEventListener: (name: string, handler: (event: { waitUntil(promise: Promise<unknown>): void }) => void) => handlers.set(name, handler),
    };
    const cacheStorage = {
      open: vi.fn(async () => cache),
      keys: vi.fn(async () => []),
      delete: deleteCache,
    };
    new Function("self", "caches", "fetch", worker)(workerScope, cacheStorage, vi.fn());
    let installation: Promise<unknown> | undefined;
    handlers.get("install")?.({ waitUntil: (promise) => { installation = promise; } });

    await expect(installation).rejects.toThrow("Release shell is missing from its offline cache");
    expect(deleteCache).toHaveBeenCalledWith("darkpix-runtime-broken-release");
  });

  it("rejects and cleans an install shell from a different release", async () => {
    const handlers = new Map<string, (event: { waitUntil(promise: Promise<unknown>): void }) => void>();
    const shell = {
      url: "https://darkpix.test/",
      headers: { get: (name: string) => name === "content-type" ? "text/html" : null },
      clone: () => ({ text: async () => releaseShellHtml("newer-release", '<script src="/assets/app.js"></script>') }),
    };
    const fixedAssets = new Map<string, unknown>([
      ["/", shell],
      ["/manifest.webmanifest", { headers: { get: () => "application/manifest+json" } }],
      ["/darkpix-icon.svg", { headers: { get: () => "image/svg+xml" } }],
      ["/assets/darkpix-title.jpg", { headers: { get: () => "image/jpeg" } }],
    ]);
    const cache = {
      addAll: vi.fn(async () => undefined),
      match: vi.fn(async (key: string) => fixedAssets.get(new URL(key, "https://darkpix.test").pathname)),
      put: vi.fn(async () => undefined),
    };
    const deleteCache = vi.fn(async () => true);
    const workerScope = {
      location: { href: "https://darkpix.test/sw.js?v=expected-release", origin: "https://darkpix.test" },
      clients: { claim: vi.fn(async () => undefined) },
      skipWaiting: vi.fn(async () => undefined),
      addEventListener: (name: string, handler: (event: { waitUntil(promise: Promise<unknown>): void }) => void) => handlers.set(name, handler),
    };
    const cacheStorage = { open: vi.fn(async () => cache), keys: vi.fn(async () => []), delete: deleteCache };
    new Function("self", "caches", "fetch", worker)(workerScope, cacheStorage, vi.fn());
    let installation: Promise<unknown> | undefined;
    handlers.get("install")?.({ waitUntil: (promise) => { installation = promise; } });

    await expect(installation).rejects.toThrow("Release shell belongs to another release");
    expect(cache.put).not.toHaveBeenCalled();
    expect(deleteCache).toHaveBeenCalledWith("darkpix-runtime-expected-release");
  });

  it("walks quoted build imports and unquoted CSS asset URLs", async () => {
    const handlers = new Map<string, (event: { waitUntil(promise: Promise<unknown>): void }) => void>();
    const shell = {
      url: "https://darkpix.test/",
      headers: { get: (name: string) => name === "content-type" ? "text/html" : null },
      clone: () => ({ text: async () => releaseShellHtml("complete-release", '<link href="/assets/../outside.css"><link href="/assets/app.css"><script src="/assets/app.js"></script>') }),
    };
    const assetBodies = new Map([
      ["https://darkpix.test/assets/app.css", { type: "text/css", body: ".title{background:url(/assets/title.jpg)}" }],
      ["https://darkpix.test/assets/app.js", { type: "application/javascript", body: 'import("./chunk.js")' }],
      ["https://darkpix.test/assets/title.jpg", { type: "image/jpeg", body: "pixels" }],
      ["https://darkpix.test/assets/chunk.js", { type: "application/javascript", body: "export{}" }],
    ]);
    const put = vi.fn(async (_request: string, _response: unknown) => undefined);
    const fixedAssets = new Map<string, unknown>([
      ["/", shell],
      ["/manifest.webmanifest", { headers: { get: () => "application/manifest+json" } }],
      ["/darkpix-icon.svg", { headers: { get: () => "image/svg+xml" } }],
      ["/assets/darkpix-title.jpg", { headers: { get: () => "image/jpeg" } }],
    ]);
    const cache = { addAll: vi.fn(async () => undefined), match: vi.fn(async (key: string) => fixedAssets.get(new URL(key, "https://darkpix.test").pathname)), put };
    const workerScope = {
      location: { href: "https://darkpix.test/sw.js?v=complete-release", origin: "https://darkpix.test" },
      clients: { claim: vi.fn(async () => undefined) },
      skipWaiting: vi.fn(async () => undefined),
      addEventListener: (name: string, handler: (event: { waitUntil(promise: Promise<unknown>): void }) => void) => handlers.set(name, handler),
    };
    const cacheStorage = { open: vi.fn(async () => cache), keys: vi.fn(async () => []), delete: vi.fn(async () => true) };
    const fetchAsset = vi.fn(async (url: string) => {
      const asset = assetBodies.get(url);
      if (!asset) throw new Error(`Unexpected asset ${url}`);
      const response = {
        ok: true,
        headers: { get: (name: string) => name === "content-type" ? asset.type : null },
        clone: () => response,
        text: async () => asset.body,
      };
      return response;
    });
    new Function("self", "caches", "fetch", worker)(workerScope, cacheStorage, fetchAsset);
    let installation: Promise<unknown> | undefined;
    handlers.get("install")?.({ waitUntil: (promise) => { installation = promise; } });

    await expect(installation).resolves.toBeUndefined();
    expect(cache.addAll).toHaveBeenCalledWith([
      "/",
      "/manifest.webmanifest?v=complete-release",
      "/darkpix-icon.svg?v=complete-release",
      "/assets/darkpix-title.jpg?v=complete-release",
    ]);
    expect(fetchAsset.mock.calls.map(([url]) => url)).toEqual([
      "https://darkpix.test/assets/app.css",
      "https://darkpix.test/assets/app.js",
      "https://darkpix.test/assets/title.jpg",
      "https://darkpix.test/assets/chunk.js",
    ]);
    expect(put).toHaveBeenCalledTimes(4);
  });

  it("rejects a 200 HTML fallback offered for a release JavaScript asset", async () => {
    const handlers = new Map<string, (event: { waitUntil(promise: Promise<unknown>): void }) => void>();
    const shell = {
      url: "https://darkpix.test/",
      headers: { get: (name: string) => name === "content-type" ? "text/html" : null },
      clone: () => ({ text: async () => releaseShellHtml("mime-release", '<script src="/assets/app.js"></script>') }),
    };
    const fixedAssets = new Map<string, unknown>([
      ["/", shell],
      ["/manifest.webmanifest", { headers: { get: () => "application/manifest+json" } }],
      ["/darkpix-icon.svg", { headers: { get: () => "image/svg+xml" } }],
      ["/assets/darkpix-title.jpg", { headers: { get: () => "image/jpeg" } }],
    ]);
    const cache = { addAll: vi.fn(async () => undefined), match: vi.fn(async (key: string) => fixedAssets.get(new URL(key, "https://darkpix.test").pathname)), put: vi.fn(async () => undefined) };
    const deleteCache = vi.fn(async () => true);
    const workerScope = {
      location: { href: "https://darkpix.test/sw.js?v=mime-release", origin: "https://darkpix.test" },
      clients: { claim: vi.fn(async () => undefined) },
      skipWaiting: vi.fn(async () => undefined),
      addEventListener: (name: string, handler: (event: { waitUntil(promise: Promise<unknown>): void }) => void) => handlers.set(name, handler),
    };
    const cacheStorage = { open: vi.fn(async () => cache), keys: vi.fn(async () => []), delete: deleteCache };
    const htmlFallback = {
      ok: true,
      headers: { get: (name: string) => name === "content-type" ? "text/html" : null },
      clone: () => htmlFallback,
      text: async () => "<html>fallback</html>",
    };
    new Function("self", "caches", "fetch", worker)(workerScope, cacheStorage, vi.fn(async () => htmlFallback));
    let installation: Promise<unknown> | undefined;
    handlers.get("install")?.({ waitUntil: (promise) => { installation = promise; } });

    await expect(installation).rejects.toThrow("Refused invalid content type for https://darkpix.test/assets/app.js");
    expect(cache.put).not.toHaveBeenCalled();
    expect(deleteCache).toHaveBeenCalledWith("darkpix-runtime-mime-release");
  });

  it("rejects and cleans a release whose fixed manifest is an HTML fallback", async () => {
    const handlers = new Map<string, (event: { waitUntil(promise: Promise<unknown>): void }) => void>();
    const shell = {
      url: "https://darkpix.test/",
      headers: { get: (name: string) => name === "content-type" ? "text/html" : null },
      clone: () => ({ text: async () => releaseShellHtml("fixed-mime-release", '<script src="/assets/app.js"></script>') }),
    };
    const fixedAssets = new Map<string, unknown>([
      ["/", shell],
      ["/manifest.webmanifest", { headers: { get: () => "text/html" } }],
      ["/darkpix-icon.svg", { headers: { get: () => "image/svg+xml" } }],
      ["/assets/darkpix-title.jpg", { headers: { get: () => "image/jpeg" } }],
    ]);
    const cache = {
      addAll: vi.fn(async () => undefined),
      match: vi.fn(async (key: string) => fixedAssets.get(new URL(key, "https://darkpix.test").pathname)),
      put: vi.fn(async () => undefined),
    };
    const deleteCache = vi.fn(async () => true);
    const workerScope = {
      location: { href: "https://darkpix.test/sw.js?v=fixed-mime-release", origin: "https://darkpix.test" },
      clients: { claim: vi.fn(async () => undefined) },
      skipWaiting: vi.fn(async () => undefined),
      addEventListener: (name: string, handler: (event: { waitUntil(promise: Promise<unknown>): void }) => void) => handlers.set(name, handler),
    };
    const cacheStorage = { open: vi.fn(async () => cache), keys: vi.fn(async () => []), delete: deleteCache };
    new Function("self", "caches", "fetch", worker)(workerScope, cacheStorage, vi.fn());
    let installation: Promise<unknown> | undefined;
    handlers.get("install")?.({ waitUntil: (promise) => { installation = promise; } });

    await expect(installation).rejects.toThrow("Release shell asset has an invalid content type: /manifest.webmanifest?v=fixed-mime-release");
    expect(cache.put).not.toHaveBeenCalled();
    expect(deleteCache).toHaveBeenCalledWith("darkpix-runtime-fixed-mime-release");
  });

  it("bounds runtime writes to owned shell and asset paths", async () => {
    const handlers = new Map<string, (event: any) => void>();
    const put = vi.fn(async (_request: string, _response: unknown) => undefined);
    const cache = { match: vi.fn(async () => undefined), put };
    const workerScope = {
      location: { href: "https://darkpix.test/sw.js?v=bounded-release", origin: "https://darkpix.test" },
      clients: { claim: vi.fn(async () => undefined) },
      skipWaiting: vi.fn(async () => undefined),
      addEventListener: (name: string, handler: (event: any) => void) => handlers.set(name, handler),
    };
    const cacheStorage = { open: vi.fn(async () => cache), keys: vi.fn(async () => []), delete: vi.fn(async () => true) };
    const networkResponse = {
      ok: true,
      headers: { get: (name: string): string | null => name === "content-type" ? "application/javascript" : null },
      clone: () => networkResponse,
    };
    const fetchNetwork = vi.fn(async () => networkResponse);
    new Function("self", "caches", "fetch", worker)(workerScope, cacheStorage, fetchNetwork);
    const fetchHandler = handlers.get("fetch");
    let responsePromise: Promise<unknown> | undefined;

    fetchHandler?.({
      request: { method: "GET", mode: "cors", url: "https://darkpix.test/api/unowned?variant=1" },
      respondWith: (promise: Promise<unknown>) => { responsePromise = promise; },
    });
    await responsePromise;
    expect(put).not.toHaveBeenCalled();

    fetchHandler?.({
      request: { method: "GET", mode: "cors", url: "https://darkpix.test/assets/app.js?variant=1" },
      respondWith: (promise: Promise<unknown>) => { responsePromise = promise; },
    });
    await responsePromise;
    expect(put).toHaveBeenCalledWith("/assets/app.js", networkResponse);

    const htmlFallback = {
      ok: true,
      headers: { get: (name: string) => name === "content-type" ? "text/html" : null },
      clone: () => htmlFallback,
    };
    fetchNetwork.mockResolvedValueOnce(htmlFallback);
    fetchHandler?.({
      request: { method: "GET", mode: "cors", url: "https://darkpix.test/assets/app.js?fallback=1" },
      respondWith: (promise: Promise<unknown>) => { responsePromise = promise; },
    });
    const rejectedRuntimeAsset = await responsePromise as Response;
    expect(rejectedRuntimeAsset.type).toBe("error");
    expect(rejectedRuntimeAsset.status).toBe(0);
    expect(put).toHaveBeenCalledTimes(1);

    const iconResponse = {
      ok: true,
      headers: { get: (name: string) => name === "content-type" ? "image/svg+xml" : null },
      clone: () => iconResponse,
    };
    fetchNetwork.mockResolvedValueOnce(iconResponse);
    fetchHandler?.({
      request: { method: "GET", mode: "cors", url: "https://darkpix.test/darkpix-icon.svg?v=bounded-release" },
      respondWith: (promise: Promise<unknown>) => { responsePromise = promise; },
    });
    await responsePromise;
    expect(put.mock.calls.at(-1)?.[0]).toBe("/darkpix-icon.svg?v=bounded-release");

    fetchNetwork.mockResolvedValueOnce(iconResponse);
    fetchHandler?.({
      request: { method: "GET", mode: "cors", url: "https://darkpix.test/darkpix-icon.svg?v=attacker-variant" },
      respondWith: (promise: Promise<unknown>) => { responsePromise = promise; },
    });
    await responsePromise;
    expect(put.mock.calls.at(-1)?.[0]).toBe("/darkpix-icon.svg?v=bounded-release");

    const writesBeforeNavigation = put.mock.calls.length;
    const newerShell = {
      ok: true,
      headers: { get: (name: string) => name === "content-type" ? "text/html" : null },
      clone: () => newerShell,
      text: async () => releaseShellHtml("newer-release"),
    };
    fetchNetwork.mockResolvedValueOnce(newerShell);
    fetchHandler?.({
      request: { method: "GET", mode: "navigate", url: "https://darkpix.test/" },
      respondWith: (promise: Promise<unknown>) => { responsePromise = promise; },
    });
    await expect(responsePromise).resolves.toBe(newerShell);
    expect(put).toHaveBeenCalledTimes(writesBeforeNavigation);

    const currentShell = {
      ok: true,
      headers: { get: (name: string) => name === "content-type" ? "text/html" : null },
      clone: () => currentShell,
      text: async () => releaseShellHtml("bounded-release"),
    };
    fetchNetwork.mockResolvedValueOnce(currentShell);
    fetchHandler?.({
      request: { method: "GET", mode: "navigate", url: "https://darkpix.test/" },
      respondWith: (promise: Promise<unknown>) => { responsePromise = promise; },
    });
    await expect(responsePromise).resolves.toBe(currentShell);
    expect(put.mock.calls.at(-1)?.[0]).toBe("/");
  });

  it("recovers a valid old hashed chunk from a bounded prior release cache", async () => {
    const handlers = new Map<string, (event: any) => void>();
    const legacyChunk = {
      headers: { get: (name: string): string | null => name === "content-type" ? "application/javascript" : null },
    };
    const invalidLegacyStyle = {
      headers: { get: (name: string): string | null => name === "content-type" ? "text/html" : null },
    };
    const currentCache = { match: vi.fn(async () => undefined) };
    const priorCache = { match: vi.fn(async (key: string) => key === "/assets/game-old.js" ? legacyChunk : key === "/assets/style-old.css" ? invalidLegacyStyle : undefined) };
    const cacheStorage = {
      open: vi.fn(async (key: string) => key === "darkpix-runtime-prior-release" ? priorCache : currentCache),
      keys: vi.fn(async () => ["darkpix-runtime-prior-release", "darkpix-runtime-current-release"]),
      delete: vi.fn(async () => true),
    };
    const workerScope = {
      location: { href: "https://darkpix.test/sw.js?v=current-release", origin: "https://darkpix.test" },
      clients: { claim: vi.fn(async () => undefined) },
      skipWaiting: vi.fn(async () => undefined),
      addEventListener: (name: string, handler: (event: any) => void) => handlers.set(name, handler),
    };
    const notFound = { ok: false, status: 404, headers: { get: () => "text/html" } };
    new Function("self", "caches", "fetch", worker)(workerScope, cacheStorage, vi.fn(async () => notFound));
    let responsePromise: Promise<unknown> | undefined;
    handlers.get("fetch")?.({
      request: { method: "GET", mode: "cors", url: "https://darkpix.test/assets/game-old.js" },
      respondWith: (promise: Promise<unknown>) => { responsePromise = promise; },
    });
    await expect(responsePromise).resolves.toBe(legacyChunk);
    expect(priorCache.match).toHaveBeenCalledWith("/assets/game-old.js");

    handlers.get("fetch")?.({
      request: { method: "GET", mode: "cors", url: "https://darkpix.test/assets/style-old.css" },
      respondWith: (promise: Promise<unknown>) => { responsePromise = promise; },
    });
    await expect(responsePromise).resolves.toBe(notFound);
  });
});
