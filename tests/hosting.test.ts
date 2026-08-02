import { describe, expect, it } from "vitest";
import nginx from "../deploy/nginx.conf?raw";
import deployScript from "../scripts/deploy-bigbox.sh?raw";

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
  });
});
