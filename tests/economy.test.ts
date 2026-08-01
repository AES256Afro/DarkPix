import { describe, expect, it } from "vitest";
import { itemValueTotal, raidValueSummary } from "../src/game/economy";
import type { Item } from "../src/game/types";

const item = (id: string, value: number): Item => ({ id, name: id, kind: "treasure", rarity: "Common", power: 0, value });

describe("raid value ledger", () => {
  it("reports actual extracted wealth after consumed supplies and entry fee", () => {
    expect(raidValueSummary({
      extracted: true,
      banked: [item("ruby", 40), item("seal", 20)],
      lost: [],
      consumed: [item("bandage", 10)],
      goldGained: 30,
      entryFee: 50,
    })).toEqual({ bankedItemValue: 60, lostGearValue: 0, consumedValue: 10, grossReturn: 90, netValue: 30 });
  });

  it("counts failed contract fees, used supplies, and lost equipment", () => {
    expect(raidValueSummary({
      extracted: false,
      banked: [],
      lost: [item("sword", 70)],
      consumed: [item("draught", 10)],
      goldGained: 999,
      entryFee: 100,
    }).netValue).toBe(-180);
  });

  it("bounds malformed value inputs instead of poisoning the ledger", () => {
    expect(itemValueTotal([item("bad", Number.NaN), item("negative", -8), item("good", 4.9)])).toBe(4);
    expect(raidValueSummary({ extracted: true, banked: [], lost: [], consumed: [], goldGained: Number.NaN, entryFee: -5 }).netValue).toBe(0);
  });
});
