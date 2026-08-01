import { describe, expect, it } from "vitest";
import { shrineOfferingRules } from "../src/game/shrine";

describe("blood reliquary offerings", () => {
  it("makes blood the broader reward and exchange the deeper single roll", () => {
    const blood = shrineOfferingRules("blood");
    const exchange = shrineOfferingRules("exchange");
    expect(blood).toEqual({ healthCost: 18, rewardCount: 2, lootDepthBonus: 0.16, alertRadius: 16 });
    expect(exchange).toEqual({ healthCost: 0, rewardCount: 1, lootDepthBonus: 0.24, alertRadius: 12 });
    expect(exchange.lootDepthBonus).toBeGreaterThan(blood.lootDepthBonus);
    expect(exchange.rewardCount).toBeLessThan(blood.rewardCount);
  });
});
