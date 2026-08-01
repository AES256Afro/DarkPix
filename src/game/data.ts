import type { ClassDefinition, ClassId, Item, Rarity } from "./types";

export const CLASSES: Record<ClassId, ClassDefinition> = {
  vanguard: {
    id: "vanguard",
    name: "Vanguard",
    title: "The Iron Oath",
    summary: "Sword, shield, and the nerve to hold a doorway. A precise block can stagger an attacker.",
    maxHealth: 125,
    maxStamina: 110,
    speed: 4.45,
    damage: 29,
    reach: 2.55,
    attackDelay: 0.72,
    accent: "#d6a659",
    ability: "Brace: hold right mouse to block. A fresh guard parries.",
    weapon: "Notched arming sword",
  },
  cutpurse: {
    id: "cutpurse",
    name: "Cutpurse",
    title: "The Quiet Knife",
    summary: "Fast, fragile, and lethal from the edge of the torchlight. Sprinting costs less stamina.",
    maxHealth: 86,
    maxStamina: 145,
    speed: 5.25,
    damage: 21,
    reach: 1.95,
    attackDelay: 0.43,
    accent: "#9bb17e",
    ability: "Backstab: strikes from behind deal double damage.",
    weapon: "Hooked misericorde",
  },
  hexbound: {
    id: "hexbound",
    name: "Hexbound",
    title: "The Ash Scholar",
    summary: "A brittle occultist with six ruinous spell charges. Recover spent memory at the campfire.",
    maxHealth: 76,
    maxStamina: 95,
    speed: 4.25,
    damage: 37,
    reach: 15,
    attackDelay: 0.88,
    accent: "#67d4ce",
    ability: "Ash bolt: ranged magic. Right mouse raises a weak ward.",
    weapon: "Cinderbound spellbook",
  },
};

export const RARITIES: Rarity[] = ["Worn", "Common", "Uncommon", "Rare", "Epic", "Legendary"];

export const RARITY_COLOR: Record<Rarity, string> = {
  Worn: "#78736d",
  Common: "#c9c2b3",
  Uncommon: "#73ad68",
  Rare: "#5f8fcf",
  Epic: "#9b6bd1",
  Legendary: "#e19b43",
};

const LOOT_NAMES = {
  weapon: ["Riveted falchion", "Bone-handled dirk", "Crypt maul", "Ashwood longbow", "Grave cantor"],
  armor: ["Blackguard jack", "Mildewed brigandine", "Rat-catcher gloves", "Hollow helm", "Pilgrim boots"],
  treasure: ["Saint's broken seal", "Moon-silver goblet", "Ossuary idol", "Heretic's chain", "Sepulcher ruby"],
  consumable: ["Coagulation draught", "Pitch bandage", "Smoked root", "Bluewax candle", "Camp ember"],
} as const;

const MODIFIERS = [
  "+3 edge damage",
  "+7 armor",
  "+5% interaction speed",
  "+8 maximum health",
  "+6% movement speed",
  "+12% undead damage",
];

export function rarityFromRoll(roll: number, depthBonus = 0): Rarity {
  const adjusted = Math.min(0.999, roll + depthBonus);
  if (adjusted > 0.992) return "Legendary";
  if (adjusted > 0.95) return "Epic";
  if (adjusted > 0.83) return "Rare";
  if (adjusted > 0.58) return "Uncommon";
  if (adjusted > 0.2) return "Common";
  return "Worn";
}

export function createLoot(random = Math.random, depthBonus = 0): Item {
  const kindRoll = random();
  const kind = kindRoll < 0.26 ? "weapon" : kindRoll < 0.49 ? "armor" : kindRoll < 0.82 ? "treasure" : "consumable";
  const rarity = rarityFromRoll(random(), depthBonus);
  const rarityIndex = RARITIES.indexOf(rarity);
  const names = LOOT_NAMES[kind];
  const name = names[Math.floor(random() * names.length)] ?? names[0];
  return {
    id: `${Date.now().toString(36)}-${Math.floor(random() * 1_000_000).toString(36)}`,
    name,
    kind,
    rarity,
    power: 1 + rarityIndex * 3 + Math.floor(random() * 3),
    value: 8 + rarityIndex * rarityIndex * 13 + Math.floor(random() * 12),
    modifier: rarityIndex >= 2 ? MODIFIERS[Math.floor(random() * MODIFIERS.length)] : undefined,
  };
}

export function createSigil(): Item {
  return {
    id: `sigil-${Date.now().toString(36)}-${Math.floor(Math.random() * 9999)}`,
    name: "Warden sigil",
    kind: "sigil",
    rarity: "Rare",
    power: 0,
    value: 45,
    modifier: "Unseals a blue passage",
  };
}

export function levelForXp(xp: number): number {
  return 1 + Math.floor(Math.max(0, xp) / 350);
}

export function formatTime(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}
