import { describe, expect, it } from "vitest";
import { depthRules, depthXpBonus } from "../src/game/depth";

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
});
