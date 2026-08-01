import { describe, expect, it } from "vitest";
import { ASHEN_CHESTS, ASHEN_ENEMIES, depthRules, depthXpBonus } from "../src/game/depth";
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
});
