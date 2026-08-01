import { describe, expect, it } from "vitest";
import { ASHEN_CHESTS, ASHEN_ENEMIES, ASH_VENTS, ASH_VENT_ACTIVE_SECONDS, ASH_VENT_COOLDOWN_SECONDS, ASH_VENT_DAMAGE, ASH_VENT_RADIUS, ASH_VENT_WINDUP_SECONDS, ashVentHits, bossRingActive, bossRingCooldown, depthRules, depthXpBonus } from "../src/game/depth";
import { dungeonCollides } from "../src/game/dungeon";

describe("red-depth continuation", () => {
  it("makes the second floor shorter, stronger, and more rewarding", () => {
    const first = depthRules(1);
    const second = depthRules(2);
    expect(second.duration).toBeLessThan(first.duration);
    expect(second.spawnGrace).toBeLessThan(first.spawnGrace);
    expect(second.enemyHealthMultiplier).toBeGreaterThan(first.enemyHealthMultiplier);
    expect(second.enemyDamageMultiplier).toBeGreaterThan(first.enemyDamageMultiplier);
    expect(second.lootDepthBonus).toBeGreaterThan(first.lootDepthBonus);
  });

  it("awards bounded depth XP while still preserving some progress on death", () => {
    expect(depthXpBonus(1, true)).toBe(0);
    expect(depthXpBonus(2, false)).toBe(60);
    expect(depthXpBonus(2, true)).toBe(180);
  });

  it("starts the Ash Tollkeeper ring phase early and tightens its cadence", () => {
    expect(bossRingActive(1, false)).toBe(false);
    expect(bossRingActive(1, true)).toBe(true);
    expect(bossRingActive(2, false)).toBe(true);
    expect(bossRingCooldown(2, false)).toBeLessThan(bossRingCooldown(1, true));
    expect(bossRingCooldown(2, true)).toBeLessThan(bossRingCooldown(2, false));
  });

  it("repopulates the Ashen floor with safe caches and a full PvPvE wave", () => {
    expect(ASHEN_CHESTS).toHaveLength(3);
    expect(ASHEN_CHESTS.filter((chest) => chest.mimic)).toHaveLength(1);
    expect(ASHEN_CHESTS.every((chest) => chest.depthBonus >= depthRules(2).lootDepthBonus)).toBe(true);
    expect(ASHEN_ENEMIES).toHaveLength(8);
    expect(ASHEN_ENEMIES.filter((enemy) => enemy.kind === "warden")).toHaveLength(2);
    expect(ASHEN_ENEMIES.some((enemy) => enemy.kind === "rival")).toBe(true);
    expect(ASHEN_ENEMIES.some((enemy) => enemy.kind === "boss")).toBe(true);
    expect([...ASHEN_CHESTS, ...ASHEN_ENEMIES].every((entry) => !dungeonCollides(entry))).toBe(true);
  });

  it("places staggered ash vents on open second-floor stone", () => {
    expect(ASH_VENTS).toHaveLength(4);
    expect(ASH_VENTS.every((vent) => vent.delay > 0 && !dungeonCollides(vent, ASH_VENT_RADIUS))).toBe(true);
    expect(new Set(ASH_VENTS.map((vent) => vent.delay)).size).toBe(ASH_VENTS.length);
    expect(ASH_VENT_WINDUP_SECONDS).toBeGreaterThan(ASH_VENT_ACTIVE_SECONDS);
    expect(ASH_VENT_COOLDOWN_SECONDS).toBeGreaterThan(ASH_VENT_WINDUP_SECONDS);
    expect(ASH_VENT_DAMAGE).toBeGreaterThan(0);
  });

  it("bounds ash eruptions to their marked ring", () => {
    const origin = { x: 3, z: -2 };
    expect(ashVentHits(origin, { x: 3 + ASH_VENT_RADIUS, z: -2 })).toBe(true);
    expect(ashVentHits(origin, { x: 3 + ASH_VENT_RADIUS + 0.01, z: -2 })).toBe(false);
    expect(ashVentHits(origin, { x: Number.NaN, z: -2 })).toBe(false);
    expect(ashVentHits(origin, origin, -1)).toBe(false);
  });
});
