import { describe, expect, it } from "vitest";
import { equippedPower, loadoutStats, physicalDamageAfterArmor, saleNeedsConfirmation, sortStash, toggleEquippedItem } from "../src/game/loadout";
import type { Item } from "../src/game/types";

const items: Item[] = [
  { id: "blade-1", name: "Blade one", kind: "weapon", rarity: "Worn", power: 2, value: 4 },
  { id: "blade-2", name: "Blade two", kind: "weapon", rarity: "Common", power: 7, value: 14 },
  { id: "jack", name: "Jack", kind: "armor", rarity: "Common", power: 5, value: 12 },
  { id: "draught", name: "Draught", kind: "consumable", rarity: "Common", power: 0, value: 8 },
  { id: "knife", name: "Knife", kind: "throwable", rarity: "Common", power: 5, value: 11 },
];

describe("risk loadout", () => {
  it("sorts a stash without mutating its authoritative acquisition order", () => {
    const stash: Item[] = [
      items[0]!,
      { ...items[2]!, rarity: "Epic", value: 55 },
      { ...items[1]!, rarity: "Rare", value: 90 },
      items[3]!,
    ];
    expect(sortStash(stash, "recent").map((item) => item.id)).toEqual(["draught", "blade-2", "jack", "blade-1"]);
    expect(sortStash(stash, "rarity").map((item) => item.id)).toEqual(["jack", "blade-2", "draught", "blade-1"]);
    expect(sortStash(stash, "value").map((item) => item.id)).toEqual(["blade-2", "jack", "draught", "blade-1"]);
    expect(sortStash(stash, "kind").map((item) => item.id)).toEqual(["blade-2", "blade-1", "jack", "draught"]);
    expect(stash.map((item) => item.id)).toEqual(["blade-1", "jack", "blade-2", "draught"]);
  });

  it("replaces a weapon in the same slot instead of stacking its power", () => {
    const first = toggleEquippedItem(new Set(), items, "blade-1");
    const replacement = toggleEquippedItem(first, items, "blade-2");
    expect([...replacement]).toEqual(["blade-2"]);
    expect(equippedPower(items.filter((item) => replacement.has(item.id)), "weapon")).toBe(7);
  });

  it("allows two different slots but rejects a third packed item", () => {
    const weapon = toggleEquippedItem(new Set(), items, "blade-2");
    const armored = toggleEquippedItem(weapon, items, "jack");
    const full = toggleEquippedItem(armored, items, "draught");
    expect([...armored]).toEqual(["blade-2", "jack"]);
    expect(full).toEqual(armored);
  });

  it("packs a throwing weapon alongside one combat slot", () => {
    const weapon = toggleEquippedItem(new Set(), items, "blade-2");
    const armed = toggleEquippedItem(weapon, items, "knife");
    expect([...armed]).toEqual(["blade-2", "knife"]);
  });

  it("uses only the strongest value if malformed input contains duplicate slots", () => {
    expect(equippedPower(items, "weapon")).toBe(7);
    expect(equippedPower(items, "armor")).toBe(5);
  });

  it("applies every generated gear enchantment to a real raid stat", () => {
    const enchanted: Item[] = [
      { ...items[0]!, modifier: "+3 edge damage" },
      { ...items[2]!, modifier: "+6% movement speed" },
    ];
    expect(loadoutStats(enchanted)).toMatchObject({ damage: 3, movementMultiplier: 1.06 * 0.96 });
    expect(loadoutStats([{ ...items[0]!, modifier: "+5% interaction speed" }]).interactionDurationMultiplier).toBeCloseTo(1 / 1.05);
    expect(loadoutStats([{ ...items[0]!, modifier: "+12% undead damage" }]).undeadDamageMultiplier).toBeCloseTo(1.12);
    expect(loadoutStats([{ ...items[0]!, modifier: "+8 maximum health" }]).health).toBe(8);
    expect(loadoutStats([{ ...items[0]!, modifier: "+7 armor" }]).armor).toBe(7);
  });

  it("applies merchant modifier magnitudes instead of treating their text as cosmetic", () => {
    expect(loadoutStats([{ ...items[0]!, modifier: "+5 edge damage" }]).damage).toBe(5);
    expect(loadoutStats([{ ...items[0]!, modifier: "+15 edge damage" }]).damage).toBe(15);
    expect(loadoutStats([{ ...items[2]!, modifier: "+11 maximum health" }]).health).toBe(11);
    expect(loadoutStats([{ ...items[2]!, modifier: "+999 maximum health" }]).health).toBe(100);
    expect(loadoutStats([{ ...items[0]!, modifier: "gain arbitrary power" }]).damage).toBe(0);
  });

  it("turns armor power into bounded encumbrance while preserving speed rolls", () => {
    expect(loadoutStats([{ ...items[2]!, power: 5 }]).movementMultiplier).toBeCloseTo(0.96);
    expect(loadoutStats([{ ...items[2]!, power: 50 }]).movementMultiplier).toBeCloseTo(0.82);
    expect(loadoutStats([{ ...items[2]!, power: 10, modifier: "+6% movement speed" }]).movementMultiplier).toBeCloseTo(1.06 * 0.92);
  });

  it("turns armor into bounded physical damage mitigation", () => {
    expect(physicalDamageAfterArmor(100, 0)).toBe(100);
    expect(physicalDamageAfterArmor(100, 25)).toBe(80);
    expect(physicalDamageAfterArmor(-5, 25)).toBe(0);
  });

  it("protects valuable, crafted, and packed gear from one-click sales", () => {
    expect(saleNeedsConfirmation(items[0]!, false)).toBe(false);
    expect(saleNeedsConfirmation(items[0]!, true)).toBe(true);
    expect(saleNeedsConfirmation({ ...items[0]!, rarity: "Rare" }, false)).toBe(true);
    expect(saleNeedsConfirmation({ ...items[0]!, id: "crafted-ward", rarity: "Common" }, false)).toBe(true);
  });
});
