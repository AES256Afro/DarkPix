import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { MIN_RENDER_SCALE, adaptiveRenderScale, initialRenderScale, maximumRenderScale } from "../src/game/resolution";

const gameSource = readFileSync(new URL("../src/game/game.ts", import.meta.url), "utf8");

describe("adaptive raid resolution", () => {
  it("starts mobile and desktop viewports at bounded pixel-art scales", () => {
    expect(initialRenderScale(500)).toBe(0.72);
    expect(initialRenderScale(1200)).toBe(0.82);
    expect(maximumRenderScale(500)).toBe(0.76);
    expect(maximumRenderScale(1200)).toBe(0.9);
  });

  it("responds gradually to sustained frame pressure and recovery", () => {
    expect(adaptiveRenderScale(0.82, 26, 1200)).toBe(0.76);
    expect(adaptiveRenderScale(0.82, 21, 1200)).toBe(0.79);
    expect(adaptiveRenderScale(0.82, 14, 1200)).toBe(0.85);
    expect(adaptiveRenderScale(0.82, 16.7, 1200)).toBe(0.82);
  });

  it("never escapes device caps or accepts non-finite measurements", () => {
    expect(adaptiveRenderScale(0.6, 50, 1200)).toBe(MIN_RENDER_SCALE);
    expect(adaptiveRenderScale(0.76, 10, 500)).toBe(0.76);
    expect(adaptiveRenderScale(Number.NaN, Number.NaN, 1200)).toBe(0.82);
  });

  it("keeps frame-hot darkness updates on cached HUD nodes", () => {
    const updateZone = gameSource.slice(gameSource.indexOf("private updateZone"), gameSource.indexOf("private updateInteraction"));
    expect(updateZone).toContain("setTextIfChanged(this.zoneHud");
    expect(updateZone).toContain('setStylePropertyIfChanged(this.raidShell, "--darkness"');
    expect(updateZone).not.toContain("querySelector");
  });

  it("deduplicates frame-hot HUD text writes", () => {
    const updateHudStart = gameSource.indexOf("private updateHud");
    const updateHud = gameSource.slice(updateHudStart, gameSource.indexOf("private feed(", updateHudStart));
    expect(gameSource).toContain("function setTextIfChanged");
    expect(updateHud).toContain("setTextIfChanged(this.raidClock");
    expect(updateHud).toContain("setTextIfChanged(this.wayfinderHud");
    expect(updateHud).not.toContain(".textContent =");
  });

  it("reuses targeting vectors and scans Wardens without frame allocations", () => {
    const stealthStart = gameSource.indexOf("private updateStealthCue");
    const stealthCue = gameSource.slice(stealthStart, gameSource.indexOf("private updateWayfinder", stealthStart));
    const wayfinderStart = gameSource.indexOf("private updateWayfinder");
    const wayfinder = gameSource.slice(wayfinderStart, gameSource.indexOf("private feed(", wayfinderStart));
    expect(stealthCue).toContain("this.scratchToTarget.copy");
    expect(stealthCue).toContain("toEnemy.lengthSq()");
    expect(stealthCue).not.toContain("toEnemy.length()");
    expect(stealthCue).not.toContain("new THREE.Vector3");
    expect(wayfinder).toContain("for (const enemy of this.enemies)");
    expect(wayfinder).toContain("for (const pickup of this.pickups)");
    expect(wayfinder).not.toContain(".find(");
    expect(wayfinder).not.toContain(".filter(");
    expect(wayfinder).not.toContain(".sort(");
  });

  it("selects rival scavenging targets with squared distance math", () => {
    const scavengingStart = gameSource.indexOf("private updateRivalScavenging");
    const scavenging = gameSource.slice(scavengingStart, gameSource.indexOf("private updateRivalSkirmish", scavengingStart));
    expect(scavenging).toContain("nearestDistanceSquared");
    expect(scavenging).toContain("offsetX * offsetX + offsetZ * offsetZ");
    expect(scavenging).not.toContain("Math.hypot");
  });

  it("scans projectile contacts without frame-hot threat arrays or vectors", () => {
    const playerStart = gameSource.indexOf("private updatePlayerProjectiles");
    const playerProjectiles = gameSource.slice(playerStart, gameSource.indexOf("private resolvePlayerProjectileHit", playerStart));
    const enemyStart = gameSource.indexOf("private updateEnemyProjectiles");
    const enemyProjectiles = gameSource.slice(enemyStart, gameSource.indexOf("private resolveEnemyProjectileHit", enemyStart));
    expect(playerProjectiles).toContain("for (const candidate of this.enemies)");
    expect(playerProjectiles).toContain("this.scratchProjectileBody.copy");
    expect(playerProjectiles).not.toContain(".filter(");
    expect(playerProjectiles).not.toContain(".sort(");
    expect(playerProjectiles).not.toContain("new THREE.Vector3");
    expect(enemyProjectiles).toContain("this.scratchProjectileBody.copy");
    expect(enemyProjectiles).not.toContain("new THREE.Vector3");
  });

  it("tracks enemy footsteps without replacing a position object every frame", () => {
    const footstepsStart = gameSource.indexOf("private updateEnemyFootsteps");
    const footsteps = gameSource.slice(footstepsStart, gameSource.indexOf("private hurt(", footstepsStart));
    expect(footsteps).toContain("enemy.footstepPosition.x = currentX");
    expect(footsteps).toContain("let nearestDistance = Number.POSITIVE_INFINITY");
    expect(footsteps).not.toContain("enemy.footstepPosition =");
    expect(footsteps).not.toContain("let nearest:");
  });
});
