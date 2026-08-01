import { describe, expect, it } from "vitest";
import { equippedPower, toggleEquippedItem } from "../src/game/loadout";
import type { Item } from "../src/game/types";

const items: Item[] = [
  { id: "blade-1", name: "Blade one", kind: "weapon", rarity: "Worn", power: 2, value: 4 },
  { id: "blade-2", name: "Blade two", kind: "weapon", rarity: "Common", power: 7, value: 14 },
  { id: "jack", name: "Jack", kind: "armor", rarity: "Common", power: 5, value: 12 },
  { id: "draught", name: "Draught", kind: "consumable", rarity: "Common", power: 0, value: 8 },
];

describe("risk loadout", () => {
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

  it("uses only the strongest value if malformed input contains duplicate slots", () => {
    expect(equippedPower(items, "weapon")).toBe(7);
    expect(equippedPower(items, "armor")).toBe(5);
  });
});
