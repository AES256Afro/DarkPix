import { describe, expect, it } from "vitest";
import nginx from "../deploy/nginx.conf?raw";
import deployScript from "../scripts/deploy-bigbox.sh?raw";

describe("production asset routing", () => {
  it("returns a real 404 for missing hashed assets instead of the HTML shell", () => {
    expect(nginx).toMatch(/location \^~ \/assets\/\s*\{\s*try_files \$uri =404;\s*\}/);
  });

  it("rejects a public rollout whose missing release chunk does not return 404", () => {
    expect(deployScript).toContain('"$public_url/assets/missing-$darkpix_release.js"');
    expect(deployScript).toContain('[[ "$missing_asset_status" == "404" ]] || return 1');
    expect(deployScript).toContain("grep -Eq 'HTTP/[0-9.]+ 404'");
  });
});
