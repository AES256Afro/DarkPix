import { describe, expect, it } from "vitest";
import { rarityMark, rarityShape } from "../src/game/rarity";
import type { Rarity } from "../src/game/types";

describe("non-color rarity cues", () => {
  it("assigns every tier a unique ordered rank mark", () => {
    const tiers: Rarity[] = ["Worn", "Common", "Uncommon", "Rare", "Epic", "Legendary"];
    expect(tiers.map(rarityMark)).toEqual(["I", "II", "III", "IV", "V", "VI"]);
    expect(new Set(tiers.map(rarityMark))).toHaveLength(tiers.length);
  });

  it("gives higher loose-loot tiers distinct silhouettes", () => {
    expect(rarityShape("Worn")).toBe("box");
    expect(rarityShape("Common")).toBe("box");
    expect(rarityShape("Uncommon")).toBe("tetrahedron");
    expect(rarityShape("Rare")).toBe("octahedron");
    expect(rarityShape("Epic")).toBe("dodecahedron");
    expect(rarityShape("Legendary")).toBe("icosahedron");
  });
});
