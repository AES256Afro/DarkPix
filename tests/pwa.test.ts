import { describe, expect, it } from "vitest";
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
    expect(worker).toContain("visited.size < 24");
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
});
