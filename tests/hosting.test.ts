import { describe, expect, it } from "vitest";
import nginx from "../deploy/nginx.conf?raw";
import deployScript from "../scripts/deploy-bigbox.sh?raw";
import dockerfile from "../Dockerfile?raw";
import compose from "../compose.yml?raw";

describe("production asset routing", () => {
  it("returns a real 404 for missing hashed assets instead of the HTML shell", () => {
    expect(nginx).toMatch(/location \^~ \/assets\/\s*\{\s*try_files \$uri =404;\s*\}/);
    expect(nginx).toMatch(/healthz\|version\\\.txt\|sw\\\.js\|manifest\\\.webmanifest/);
  });

  it("rejects a public rollout whose missing release chunk does not return 404", () => {
    expect(deployScript).toContain('"$public_url/assets/missing-$darkpix_release.js"');
    expect(deployScript).toContain('[[ "$missing_asset_status" == "404" ]] || return 1');
    expect(deployScript).toContain("grep -Eq 'HTTP/[0-9.]+ 404'");
  });

  it("restores the prior image when a rollout gate fails", () => {
    expect(deployScript).toContain("rollback_previous_release()");
    expect(deployScript).toContain("docker image tag darkpix-web:rollback darkpix-web:local");
    expect(deployScript).toContain("docker compose up -d --no-build --force-recreate darkpix");
    expect(deployScript.match(/docker image rm darkpix-web:rollback/g)?.length).toBe(2);
    expect(deployScript.match(/rollback_previous_release \|\| true/g)?.length).toBeGreaterThanOrEqual(4);
    expect(deployScript).toContain("check_restored_public_routes()");
    expect(deployScript).toContain('"$public_url/version.txt?rollback=$previous_release"');
    expect(deployScript).toContain("Automatic rollback restored loopback and public release");
    expect(deployScript).toContain("public route recovery was not verified");
  });

  it("refuses to attach a clean commit identity to modified source", () => {
    expect(deployScript).toContain('git status --porcelain --untracked-files=normal');
    expect(deployScript).toContain("Refusing to deploy a dirty DarkPix worktree because its release identity would be false.");
    expect(deployScript.indexOf("git status --porcelain")).toBeLessThan(deployScript.indexOf('darkpix_release="${DARKPIX_RELEASE'));
  });

  it("pins both production image stages to immutable registry digests", () => {
    const stages = dockerfile.match(/^FROM .+$/gm) ?? [];
    expect(stages).toHaveLength(2);
    expect(stages.every((stage) => /@sha256:[a-f0-9]{64}(?: AS build)?$/.test(stage))).toBe(true);
  });

  it("bounds public access-log growth inside the DarkPix service", () => {
    expect(compose).toMatch(/logging:\s+driver: json-file\s+options:\s+max-size: "10m"\s+max-file: "3"/);
  });
});
