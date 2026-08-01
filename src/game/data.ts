import type { ClassDefinition, ClassId, Item, Rarity } from "./types";

export interface MerchantOffer {
  sku: string;
  price: number;
  requiredExtracts: number;
  item: Omit<Item, "id">;
}

export interface CraftingRecipe {
  id: string;
  name: string;
  ingredientName: string;
  ingredientKind: Item["kind"];
  goldCost: number;
  output: Omit<Item, "id">;
}

export interface ClassPerk {
  level: number;
  name: string;
  description: string;
}

export interface ClassPerkBonuses {
  health: number;
  damage: number;
  guardUpkeepMultiplier: number;
  sprintCostMultiplier: number;
  spellCharges: number;
}

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
    ability: "Ambush: strikes against unaware targets deal double damage.",
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

export const CLASS_PERKS: Record<ClassId, ClassPerk[]> = {
  vanguard: [
    { level: 2, name: "Bulwark", description: "Guard upkeep costs 20% less stamina." },
    { level: 4, name: "Iron Constitution", description: "+8 maximum vigor." },
    { level: 6, name: "Mordhau", description: "+3 strike damage." },
  ],
  cutpurse: [
    { level: 2, name: "Light Feet", description: "Sprinting costs 20% less stamina." },
    { level: 4, name: "Cruel Precision", description: "+3 strike damage." },
    { level: 6, name: "Hard Escape", description: "+8 maximum vigor." },
  ],
  hexbound: [
    { level: 2, name: "Expanded Memory", description: "+1 ash-bolt charge." },
    { level: 4, name: "Ash Covenant", description: "+4 spell damage." },
    { level: 6, name: "Scarred Vessel", description: "+8 maximum vigor." },
  ],
};

export function classPerkBonuses(classId: ClassId, level: number): ClassPerkBonuses {
  const safeLevel = Math.max(1, Math.floor(level));
  return {
    health: safeLevel >= 6 && classId !== "vanguard" ? 8 : safeLevel >= 4 && classId === "vanguard" ? 8 : 0,
    damage: safeLevel >= 4 && classId === "cutpurse" ? 3 : safeLevel >= 4 && classId === "hexbound" ? 4 : safeLevel >= 6 && classId === "vanguard" ? 3 : 0,
    guardUpkeepMultiplier: safeLevel >= 2 && classId === "vanguard" ? 0.8 : 1,
    sprintCostMultiplier: safeLevel >= 2 && classId === "cutpurse" ? 0.8 : 1,
    spellCharges: safeLevel >= 2 && classId === "hexbound" ? 1 : 0,
  };
}

export const RARITIES: Rarity[] = ["Worn", "Common", "Uncommon", "Rare", "Epic", "Legendary"];

export const RARITY_COLOR: Record<Rarity, string> = {
  Worn: "#78736d",
  Common: "#c9c2b3",
  Uncommon: "#73ad68",
  Rare: "#5f8fcf",
  Epic: "#9b6bd1",
  Legendary: "#e19b43",
};

export const MERCHANT_OFFERS: MerchantOffer[] = [
  {
    sku: "draught",
    price: 28,
    requiredExtracts: 0,
    item: { name: "Coagulation draught", kind: "consumable", rarity: "Common", power: 0, value: 12, modifier: "Restores 36 vigor" },
  },
  {
    sku: "falchion",
    price: 46,
    requiredExtracts: 0,
    item: { name: "Riveted falchion", kind: "weapon", rarity: "Common", power: 5, value: 27, modifier: "+5 edge damage" },
  },
  {
    sku: "jack",
    price: 58,
    requiredExtracts: 0,
    item: { name: "Salvager jack", kind: "armor", rarity: "Common", power: 6, value: 34, modifier: "+6 maximum health" },
  },
  {
    sku: "oathblade",
    price: 118,
    requiredExtracts: 1,
    item: { name: "Bluewax oathblade", kind: "weapon", rarity: "Uncommon", power: 9, value: 72, modifier: "+9 edge damage" },
  },
  {
    sku: "tollcoat",
    price: 142,
    requiredExtracts: 1,
    item: { name: "Toll-road coat", kind: "armor", rarity: "Uncommon", power: 11, value: 84, modifier: "+11 maximum health" },
  },
  {
    sku: "reliquary-edge",
    price: 248,
    requiredExtracts: 3,
    item: { name: "Reliquary edge", kind: "weapon", rarity: "Rare", power: 15, value: 156, modifier: "+15 edge damage" },
  },
];

export const CRAFTING_RECIPES: CraftingRecipe[] = [
  {
    id: "chainward",
    name: "Chainbreaker's ward",
    ingredientName: "Tollkeeper's severed chain",
    ingredientKind: "treasure",
    goldCost: 80,
    output: {
      name: "Chainbreaker's ward",
      kind: "armor",
      rarity: "Epic",
      power: 18,
      value: 210,
      modifier: "+7 armor",
    },
  },
];

export function merchantOfferUnlocked(offer: MerchantOffer, extracts: number): boolean {
  const safeExtracts = Number.isFinite(extracts) ? Math.max(0, Math.floor(extracts)) : 0;
  return safeExtracts >= offer.requiredExtracts;
}

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

export function createBossLoot(random = Math.random): Item {
  const base = createLoot(random, 0.22);
  const rarityIndex = Math.max(RARITIES.indexOf("Rare"), RARITIES.indexOf(base.rarity));
  const rarity = RARITIES[rarityIndex] ?? "Rare";
  return {
    ...base,
    id: `toll-${base.id}`,
    name: "Tollkeeper's severed chain",
    kind: "treasure",
    rarity,
    power: Math.max(base.power, 10 + rarityIndex * 2),
    value: Math.max(base.value, 72 + rarityIndex * 18),
    modifier: "Proof that the Pale Toll was paid",
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

export function progressionBonuses(level: number): { health: number; damage: number } {
  const earnedLevels = Math.max(0, Math.min(6, Math.floor(level) - 1));
  return {
    health: earnedLevels * 4,
    damage: Math.floor(earnedLevels / 2),
  };
}

export function formatTime(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}
