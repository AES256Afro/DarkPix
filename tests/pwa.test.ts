import { describe, expect, it, vi } from "vitest";
import manifestSource from "../public/manifest.webmanifest?raw";
import worker from "../public/sw.js?raw";
import indexSource from "../index.html?raw";

describe("installable offline shell", () => {
  it("publishes a scoped standalone game manifest", () => {
    const manifest = JSON.parse(manifestSource) as Record<string, unknown>;
    expect(manifest).toMatchObject({ short_name: "DarkPix", start_url: "/", scope: "/", display: "standalone", orientation: "landscape" });
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(JSON.stringify(manifest.icons)).toContain("/darkpix-icon.svg?v=app");
    expect(indexSource).toContain("/manifest.webmanifest?v=%VITE_DARKPIX_VERSION%");
    expect(indexSource).toContain("/darkpix-icon.svg?v=%VITE_DARKPIX_VERSION%");
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
    expect(worker).toContain("Release shell asset is missing:");
    expect(worker).toContain("Release shell asset has an invalid content type:");
    expect(worker).toContain("Refused invalid content type");
    expect(worker).toContain("responseMatchesCacheKey(cacheKey, response)");
    expect(worker).toContain('throw new Error("Release shell exposed no cacheable build assets")');
    expect(worker).toContain("visited.size < 24");
    expect(worker).toContain('throw new Error("Release asset graph exceeds the offline cache limit")');
    expect(worker).toContain("await caches.delete(CACHE_NAME)");
    expect(worker).toContain("event.waitUntil(installCurrentRelease())");
    expect(worker).toContain("return cached ?? response");
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

  it("walks quoted build imports and unquoted CSS asset URLs", async () => {
    const handlers = new Map<string, (event: { waitUntil(promise: Promise<unknown>): void }) => void>();
    const shell = {
      url: "https://darkpix.test/",
      headers: { get: (name: string) => name === "content-type" ? "text/html" : null },
      clone: () => ({ text: async () => '<link href="/assets/app.css"><script src="/assets/app.js"></script>' }),
    };
    const assetBodies = new Map([
      ["https://darkpix.test/assets/app.css", { type: "text/css", body: ".title{background:url(/assets/title.jpg)}" }],
      ["https://darkpix.test/assets/app.js", { type: "application/javascript", body: 'import("./chunk.js")' }],
      ["https://darkpix.test/assets/title.jpg", { type: "image/jpeg", body: "pixels" }],
      ["https://darkpix.test/assets/chunk.js", { type: "application/javascript", body: "export{}" }],
    ]);
    const put = vi.fn(async () => undefined);
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
      clone: () => ({ text: async () => '<script src="/assets/app.js"></script>' }),
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
      clone: () => ({ text: async () => '<script src="/assets/app.js"></script>' }),
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
    const put = vi.fn(async () => undefined);
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
    await expect(responsePromise).resolves.toBe(htmlFallback);
    expect(put).toHaveBeenCalledTimes(1);
  });
});
