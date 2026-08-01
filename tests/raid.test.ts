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
  });

  it("makes High Toll threats stronger and its loot rolls deeper", () => {
    const rules = raidRules("high_toll");
    expect(rules.enemyHealthMultiplier).toBeGreaterThan(1);
    expect(rules.enemyDamageMultiplier).toBeGreaterThan(1);
    expect(rules.lootDepthBonus).toBe(0.12);
    expect(createBossLoot(() => 0.75).rarity).toBe("Epic");
    expect(createBossLoot(() => 0.75, rules.lootDepthBonus).rarity).toBe("Legendary");
  });
});
