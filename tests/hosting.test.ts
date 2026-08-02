import { describe, expect, it } from "vitest";
import nginx from "../deploy/nginx.conf?raw";
import deployScript from "../scripts/deploy-bigbox.sh?raw";
import dockerfile from "../Dockerfile?raw";
import compose from "../compose.yml?raw";
import workflow from "../.github/workflows/ci.yml?raw";

describe("production asset routing", () => {
  it("returns a real 404 for missing hashed assets instead of the HTML shell", () => {
    expect(nginx).toMatch(/location \^~ \/assets\/\s*\{\s*try_files \$uri =404;\s*\}/);
    expect(nginx).toMatch(/healthz\|version\\\.txt\|sw\\\.js\|manifest\\\.webmanifest/);
  });

  it("rejects non-read methods before every static and synthetic route", () => {
    expect(nginx).toMatch(/if \(\$request_method !~ \^\(GET\|HEAD\)\$\)\s*\{\s*return 405;/);
    expect(deployScript).toContain('-X POST "$public_url/healthz"');
    expect(deployScript.match(/--method=POST --body-data='' -O \/dev\/null "\$public_url\/healthz"/g)?.length).toBe(2);
    expect(deployScript).toContain('[[ "$write_method_status" == "405" ]] || return 1');
    expect(deployScript).not.toContain('if command -v curl >/dev/null 2>&1; then [[ "$write_method_status" == "405" ]]');
    expect(workflow).toContain("-X POST http://127.0.0.1:18092/healthz");
  });

  it("serves the install manifest as JSON and keeps unversioned shell art revalidatable", () => {
    expect(nginx).toMatch(/location = \/manifest\.webmanifest\s*\{\s*default_type application\/manifest\+json;/);
    expect(nginx).toMatch(/sw\\\.js\|manifest\\\.webmanifest\|darkpix-icon\\\.svg/);
    expect(nginx).toContain('~^/assets/darkpix-title\\.jpg$ "no-cache";');
    expect(deployScript).toContain('content-type:.*json');
    expect(deployScript).toContain('content-type:.*image/svg+xml');
    expect(deployScript).toContain('content-type:.*image/jpeg');
    expect(deployScript).toContain('"$public_url/manifest.webmanifest?v=$darkpix_release"');
    expect(deployScript).toContain('"$public_url/darkpix-icon.svg?v=$darkpix_release"');
    expect(deployScript).toContain('"$public_url/assets/darkpix-title.jpg?v=$darkpix_release"');
  });

  it("rejects a public rollout whose missing release chunk does not return 404", () => {
    expect(deployScript).toContain('"$public_url/assets/missing-$darkpix_release.js"');
    expect(deployScript).toContain('[[ "$missing_asset_status" == "404" ]] || return 1');
    expect(deployScript).toContain("grep -Eq 'HTTP/[0-9.]+ 404'");
  });

  it("verifies the public HTML points to immutable JavaScript and CSS with executable response types", () => {
    expect(deployScript).toContain("check_public_build_assets()");
    expect(deployScript).toContain("check_public_build_assets \"$public_url\" || return 1");
    expect(deployScript).toContain("content-type:.*javascript");
    expect(deployScript).toContain("content-type:.*text/css");
    expect(deployScript).toContain("cache-control:.*max-age=31536000.*immutable");
    expect(deployScript).toContain('[[ "$verified_assets" -ge 2 ]]');
    expect(deployScript).toContain('<meta name=\\"darkpix-release\\" content=\\"$darkpix_release\\"');
  });

  it("restores the prior image when a rollout gate fails", () => {
    expect(deployScript).toContain("rollback_previous_release()");
    expect(deployScript).toContain("docker image tag darkpix-web:rollback darkpix-web:local");
    expect(deployScript).toContain("docker compose up -d --no-build --force-recreate darkpix");
    expect(deployScript.match(/docker image rm darkpix-web:rollback/g)?.length).toBe(2);
    expect(deployScript.match(/rollback_previous_release \|\| true/g)?.length).toBeGreaterThanOrEqual(4);
    expect(deployScript).toContain("check_restored_public_routes()");
    expect(deployScript).toContain('"$public_url/version.txt?rollback=$previous_release"');
    expect(deployScript).toContain('"$public_url/?rollback=$previous_release"');
    expect(deployScript).toContain('<meta name=\\"darkpix-release\\" content=\\"$previous_release\\"');
    expect(deployScript).toContain('restored_write_method_status="$(curl');
    expect(deployScript).toContain('[[ "$restored_write_method_status" == "405" ]] || return 1');
    expect(deployScript).toContain("Automatic rollback restored loopback and public release");
    expect(deployScript).toContain("public route recovery was not verified");
  });

  it("refuses to attach a clean commit identity to modified source", () => {
    expect(deployScript).toContain('git status --porcelain --untracked-files=normal');
    expect(deployScript).toContain("Refusing to deploy a dirty DarkPix worktree because its release identity would be false.");
    expect(deployScript.indexOf("git status --porcelain")).toBeLessThan(deployScript.indexOf('git_release="$(git rev-parse'));
  });

  it("rejects a release override that differs from the checked-out commit", () => {
    expect(deployScript).toContain('git_release="$(git rev-parse --short HEAD');
    expect(deployScript).toContain('"$DARKPIX_RELEASE" != "$git_release"');
    expect(deployScript).toContain("Refusing release override");
    expect(deployScript).toContain('darkpix_release="$git_release"');
  });

  it("pins both production image stages to immutable registry digests", () => {
    const stages = dockerfile.match(/^FROM .+$/gm) ?? [];
    expect(stages).toHaveLength(2);
    expect(stages.every((stage) => /@sha256:[a-f0-9]{64}(?: AS build)?$/.test(stage))).toBe(true);
  });

  it("pins CI actions to immutable commit identities", () => {
    const actionUses = workflow.match(/uses: actions\/.+/g) ?? [];
    expect(actionUses).toHaveLength(2);
    expect(actionUses.every((entry) => /uses: actions\/[a-z-]+@[a-f0-9]{40} # v\d+$/.test(entry))).toBe(true);
  });

  it("does not run dependency lifecycle scripts in CI or image builds", () => {
    expect(workflow).toContain("npm ci --ignore-scripts");
    expect(dockerfile).toContain("RUN npm ci --ignore-scripts");
    expect(workflow).not.toMatch(/- run: npm ci\s*$/m);
    expect(dockerfile).not.toMatch(/^RUN npm ci\s*$/m);
  });

  it("bounds public access-log growth inside the DarkPix service", () => {
    expect(compose).toMatch(/logging:\s+driver: json-file\s+options:\s+max-size: "10m"\s+max-file: "3"/);
  });

  it("bounds runtime process creation alongside memory and CPU", () => {
    expect(compose).toMatch(/pids_limit: 64/);
    expect(compose).toMatch(/mem_limit: 384m/);
    expect(compose).toMatch(/cpus: 1\.5/);
  });

  it("rejects a rollout when Docker does not apply the required runtime boundaries", () => {
    expect(deployScript).toContain("check_container_hardening()");
    expect(deployScript).toContain('check_container_hardening "$darkpix_container_id"');
    expect(deployScript).toContain('check_container_hardening "$rollback_container_id"');
    expect(deployScript).toContain("nginx|true|false|64|402653184|1500000000");
    expect(deployScript).toContain('"HostIp":"127.0.0.1","HostPort":"8092"');
  });
});
