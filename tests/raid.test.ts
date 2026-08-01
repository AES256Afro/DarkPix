import { describe, expect, it } from "vitest";
import { createBossLoot } from "../src/game/data";
import { raidEntryStatus, raidRules } from "../src/game/raid";

describe("raid contracts", () => {
  it("keeps the normal contract free and bounds High Toll entry", () => {
    expect(raidEntryStatus("standard", 0, 0)).toBe("ready");
    expect(raidEntryStatus("high_toll", 0, 500)).toBe("extract_required");
    expect(raidEntryStatus("high_toll", 1, 49)).toBe("insufficient_gold");
    expect(raidEntryStatus("high_toll", 1, 50)).toBe("ready");
    expect(raidEntryStatus("high_toll", Number.NaN, Number.POSITIVE_INFINITY)).toBe("extract_required");
    expect(raidEntryStatus("iron_soul", 10, 500, 0)).toBe("ashen_extract_required");
    expect(raidEntryStatus("iron_soul", 10, 99, 1)).toBe("insufficient_gold");
    expect(raidEntryStatus("iron_soul", 0, 100, 1)).toBe("ready");
  });

  it("makes High Toll threats stronger and its loot rolls deeper", () => {
    const rules = raidRules("high_toll");
    expect(rules.enemyHealthMultiplier).toBeGreaterThan(1);
    expect(rules.enemyDamageMultiplier).toBeGreaterThan(1);
    expect(rules.lootDepthBonus).toBe(0.12);
    expect(createBossLoot(() => 0.75).rarity).toBe("Epic");
    expect(createBossLoot(() => 0.75, rules.lootDepthBonus).rarity).toBe("Legendary");
  });

  it("makes Iron Soul the strongest contract and marks failure as permanent", () => {
    const highToll = raidRules("high_toll");
    const ironSoul = raidRules("iron_soul");
    expect(ironSoul.enemyHealthMultiplier).toBeGreaterThan(highToll.enemyHealthMultiplier);
    expect(ironSoul.enemyDamageMultiplier).toBeGreaterThan(highToll.enemyDamageMultiplier);
    expect(ironSoul.lootDepthBonus).toBeGreaterThan(highToll.lootDepthBonus);
    expect(ironSoul.xpMultiplier).toBe(1.75);
    expect(ironSoul.wipesClassXpOnFailure).toBe(true);
  });
});
