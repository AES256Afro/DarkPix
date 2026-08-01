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
    expect(worker).toContain('request.mode === "navigate"');
    expect(worker).toContain('event.data?.type === "SKIP_WAITING"');
    expect(worker).toContain("cacheBuildAssets");
    expect(worker).toContain("visited.size < 24");
    const installHandler = worker.slice(worker.indexOf('addEventListener("install"'), worker.indexOf('addEventListener("activate"'));
    expect(installHandler).not.toContain("skipWaiting");
  });
});
