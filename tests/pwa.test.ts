import { describe, expect, it, vi } from "vitest";
import manifestSource from "../public/manifest.webmanifest?raw";
import worker from "../public/sw.js?raw";

describe("installable offline shell", () => {
  it("publishes a scoped standalone game manifest", () => {
    const manifest = JSON.parse(manifestSource) as Record<string, unknown>;
    expect(manifest).toMatchObject({ short_name: "DarkPix", start_url: "/", scope: "/", display: "standalone", orientation: "landscape" });
    expect(Array.isArray(manifest.icons)).toBe(true);
  });

  it("keeps release identity online while caching the playable shell", () => {
    expect(worker).toContain('url.pathname === "/version.txt"');
    expect(worker).toContain('url.pathname === "/healthz"');
    expect(worker).toContain('url.pathname === "/sw.js"');
    expect(worker).toContain('request.mode === "navigate"');
    expect(worker).toContain('event.data?.type === "SKIP_WAITING"');
    expect(worker).toContain("cacheBuildAssets");
    expect(worker).toContain('throw new Error("Release shell is missing from its offline cache")');
    expect(worker).toContain('throw new Error("Release shell exposed no cacheable build assets")');
    expect(worker).toContain("visited.size < 24");
    expect(worker).toContain('throw new Error("Release asset graph exceeds the offline cache limit")');
    expect(worker).toContain("await caches.delete(CACHE_NAME)");
    expect(worker).toContain("event.waitUntil(installCurrentRelease())");
    expect(worker).toContain("return cached ?? response");
    expect(worker).toContain("await updateCurrentCache(request, response.clone())");
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
      clone: () => ({ text: async () => '<link href="/assets/app.css"><script src="/assets/app.js"></script>' }),
    };
    const assetBodies = new Map([
      ["https://darkpix.test/assets/app.css", { type: "text/css", body: ".title{background:url(/assets/title.jpg)}" }],
      ["https://darkpix.test/assets/app.js", { type: "application/javascript", body: 'import("./chunk.js")' }],
      ["https://darkpix.test/assets/title.jpg", { type: "image/jpeg", body: "pixels" }],
      ["https://darkpix.test/assets/chunk.js", { type: "application/javascript", body: "export{}" }],
    ]);
    const put = vi.fn(async () => undefined);
    const cache = { addAll: vi.fn(async () => undefined), match: vi.fn(async () => shell), put };
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
});
