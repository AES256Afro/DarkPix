import type { Rarity } from "./types";

export type RarityShape = "box" | "tetrahedron" | "octahedron" | "dodecahedron" | "icosahedron";

const RARITY_MARKS: Record<Rarity, string> = {
  Worn: "I",
  Common: "II",
  Uncommon: "III",
  Rare: "IV",
  Epic: "V",
  Legendary: "VI",
};

export function rarityMark(rarity: Rarity): string {
  return RARITY_MARKS[rarity];
}

export function rarityShape(rarity: Rarity): RarityShape {
  if (rarity === "Uncommon") return "tetrahedron";
  if (rarity === "Rare") return "octahedron";
  if (rarity === "Epic") return "dodecahedron";
  if (rarity === "Legendary") return "icosahedron";
  return "box";
}
