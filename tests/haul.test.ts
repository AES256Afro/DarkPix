import { describe, expect, it } from "vitest";
import { HAUL_CAPACITY, RIVAL_EXTRACTION_SECONDS, RIVAL_HAUL_CAPACITY, advanceRivalExtraction, canAddToHaul, canRivalScavenge, dropLeastValuable, haulCount, rivalShouldExtract, treasureGold, treasureGoldTotal } from "../src/game/haul";
import type { Item } from "../src/game/types";

const item = (id: string, value: number, kind: Item["kind"] = "treasure", power = 1): Item => ({
  id, name: id, kind, rarity: "Common", power, value,
});

describe("unsecured haul", () => {
  it("bounds ordinary loot while keeping contract sigils outside the slot limit", () => {
    const full = Array.from({ length: HAUL_CAPACITY }, (_, index) => item(`loot-${index}`, index + 1));
    expect(haulCount([...full, item("sigil", 45, "sigil")])).toBe(HAUL_CAPACITY);
    expect(canAddToHaul(full, item("extra", 20))).toBe(false);
    expect(canAddToHaul(full, item("sigil", 45, "sigil"))).toBe(true);
  });

  it("drops the weakest low-value item without mutating or discarding sigils", () => {
    const haul = [item("sigil", 45, "sigil"), item("weak", 5, "weapon", 1), item("weaker", 5, "armor", 0), item("rich", 90)];
    const result = dropLeastValuable(haul);
    expect(result.dropped?.id).toBe("weaker");
    expect(result.kept.map((entry) => entry.id)).toEqual(["sigil", "weak", "rich"]);
    expect(haul).toHaveLength(4);
  });

  it("lets the rival steal a bounded ordinary haul but never contract sigils", () => {
    const treasure = item("idol", 20);
    expect(canRivalScavenge([], treasure)).toBe(true);
    expect(canRivalScavenge([], item("sigil", 45, "sigil"))).toBe(false);
    expect(canRivalScavenge(Array.from({ length: RIVAL_HAUL_CAPACITY }, () => treasure), treasure)).toBe(false);
  });

  it("lets a loaded rival channel an opened passage without carrying sigils", () => {
    const treasure = item("idol", 20);
    expect(rivalShouldExtract(false, [treasure])).toBe(false);
    expect(rivalShouldExtract(true, [])).toBe(false);
    expect(rivalShouldExtract(true, [item("sigil", 45, "sigil")])).toBe(false);
    expect(rivalShouldExtract(true, [treasure])).toBe(true);
    expect(advanceRivalExtraction(0, 0.6, true)).toBe(0.6);
    expect(advanceRivalExtraction(0.6, 9, true)).toBe(RIVAL_EXTRACTION_SECONDS);
    expect(advanceRivalExtraction(1, 0.2, false)).toBe(0);
    expect(advanceRivalExtraction(Number.NaN, Number.NaN, true)).toBe(0);
  });

  it("reverses treasure coin credit when that treasure leaves the haul", () => {
    expect(treasureGold(item("idol", 100))).toBe(35);
    expect(treasureGold(item("blade", 100, "weapon"))).toBe(0);
    expect(treasureGoldTotal([item("idol", 100), item("seal", 20), item("blade", 100, "weapon")])).toBe(42);
    expect(treasureGoldTotal([item("blade", 100, "weapon")])).toBe(0);
  });
});
