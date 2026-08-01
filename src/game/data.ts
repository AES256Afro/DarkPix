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

export interface ClassAbilityDefinition {
  name: string;
  cooldown: number;
  description: string;
}

export interface ConsumableEffect {
  health: number;
  stamina: number;
  spellCharges: number;
  rekindleTorch: boolean;
  description: string;
}

export type HexSpellId = "ash_bolt" | "frost_hex";

export interface HexSpellDefinition {
  id: HexSpellId;
  name: string;
  damageMultiplier: number;
  cripples: boolean;
  color: number;
}

export const HEX_SPELLS: Record<HexSpellId, HexSpellDefinition> = {
  ash_bolt: { id: "ash_bolt", name: "Ash bolt", damageMultiplier: 1, cripples: false, color: 0x5ce3d9 },
  frost_hex: { id: "frost_hex", name: "Frost hex", damageMultiplier: 0.72, cripples: true, color: 0x79aee8 },
};

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
  reaver: {
    id: "reaver",
    name: "Reaver",
    title: "The Red Oath",
    summary: "A slow executioner who turns personal wounds into a brief, crushing damage window.",
    maxHealth: 148,
    maxStamina: 100,
    speed: 4.1,
    damage: 35,
    reach: 2.85,
    attackDelay: 0.94,
    accent: "#b45a4d",
    ability: "Blood Rage: trade vigor for six seconds of amplified strikes.",
    weapon: "Notched headsman's axe",
  },
  ranger: {
    id: "ranger",
    name: "Ranger",
    title: "The Thorn Watch",
    summary: "A deliberate marksman who trades protection for range, stamina, and brief bursts of rapid fire.",
    maxHealth: 92,
    maxStamina: 130,
    speed: 4.75,
    damage: 26,
    reach: 14,
    attackDelay: 0.78,
    accent: "#9b8f5a",
    ability: "Quickdraw: loose arrows faster for seven seconds.",
    weapon: "Ashwood recurved bow",
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
  reaver: [
    { level: 2, name: "Red Guard", description: "Guard upkeep costs 10% less stamina." },
    { level: 4, name: "Headsman's Rhythm", description: "+4 strike damage." },
    { level: 6, name: "Carrion Heart", description: "+8 maximum vigor." },
  ],
  ranger: [
    { level: 2, name: "Trail Legs", description: "Sprinting costs 10% less stamina." },
    { level: 4, name: "Broadhead", description: "+4 arrow damage." },
    { level: 6, name: "Weathered", description: "+8 maximum vigor." },
  ],
};

export const CLASS_ABILITIES: Record<ClassId, ClassAbilityDefinition> = {
  vanguard: {
    name: "Iron rally",
    cooldown: 42,
    description: "Recover 18 vigor and 45 stamina.",
  },
  cutpurse: {
    name: "Smoke step",
    cooldown: 36,
    description: "Break distant pursuit and suppress reacquisition for four seconds.",
  },
  hexbound: {
    name: "Blood memory",
    cooldown: 38,
    description: "Trade 12 vigor for two ash-bolt charges.",
  },
  reaver: {
    name: "Blood rage",
    cooldown: 44,
    description: "Trade 12 vigor for six seconds of 25% amplified strike damage.",
  },
  ranger: {
    name: "Quickdraw",
    cooldown: 41,
    description: "Loose arrows 42% faster for seven seconds.",
  },
};

export function classPerkBonuses(classId: ClassId, level: number): ClassPerkBonuses {
  const safeLevel = Math.max(1, Math.floor(level));
  return {
    health: safeLevel >= 6 && classId !== "vanguard" ? 8 : safeLevel >= 4 && classId === "vanguard" ? 8 : 0,
    damage: safeLevel >= 4 && classId === "cutpurse" ? 3 : safeLevel >= 4 && (classId === "hexbound" || classId === "reaver" || classId === "ranger") ? 4 : safeLevel >= 6 && classId === "vanguard" ? 3 : 0,
    guardUpkeepMultiplier: safeLevel >= 2 && classId === "vanguard" ? 0.8 : safeLevel >= 2 && classId === "reaver" ? 0.9 : 1,
    sprintCostMultiplier: safeLevel >= 2 && classId === "cutpurse" ? 0.8 : safeLevel >= 2 && classId === "ranger" ? 0.9 : 1,
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
  {
    id: "saintless-edge",
    name: "Saintless edge",
    ingredientName: "Saint's broken seal",
    ingredientKind: "treasure",
    goldCost: 65,
    output: {
      name: "Saintless edge",
      kind: "weapon",
      rarity: "Rare",
      power: 13,
      value: 148,
      modifier: "+5 edge damage",
    },
  },
  {
    id: "ruby-cantor",
    name: "Ruby cantor",
    ingredientName: "Sepulcher ruby",
    ingredientKind: "treasure",
    goldCost: 120,
    output: {
      name: "Ruby cantor",
      kind: "weapon",
      rarity: "Epic",
      power: 18,
      value: 245,
      modifier: "+12% undead damage",
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

const CONSUMABLE_EFFECTS: Record<string, ConsumableEffect> = {
  "Coagulation draught": { health: 36, stamina: 0, spellCharges: 0, rekindleTorch: false, description: "Restores 36 vigor" },
  "Pitch bandage": { health: 24, stamina: 0, spellCharges: 0, rekindleTorch: false, description: "Restores 24 vigor" },
  "Smoked root": { health: 16, stamina: 38, spellCharges: 0, rekindleTorch: false, description: "Restores 16 vigor and 38 stamina" },
  "Bluewax candle": { health: 12, stamina: 0, spellCharges: 0, rekindleTorch: true, description: "Restores 12 vigor and rekindles the torch" },
  "Camp ember": { health: 20, stamina: 20, spellCharges: 2, rekindleTorch: false, description: "Restores 20 vigor, 20 stamina, and 2 spell charges" },
};

export function consumableEffect(item: Pick<Item, "name" | "kind">): ConsumableEffect | undefined {
  if (item.kind !== "consumable") return undefined;
  return CONSUMABLE_EFFECTS[item.name] ?? {
    health: 18,
    stamina: 0,
    spellCharges: 0,
    rekindleTorch: false,
    description: "Restores 18 vigor",
  };
}

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
  const consumable = kind === "consumable" ? consumableEffect({ name, kind }) : undefined;
  return {
    id: `${Date.now().toString(36)}-${Math.floor(random() * 1_000_000).toString(36)}`,
    name,
    kind,
    rarity,
    power: 1 + rarityIndex * 3 + Math.floor(random() * 3),
    value: 8 + rarityIndex * rarityIndex * 13 + Math.floor(random() * 12),
    modifier: consumable?.description ?? (rarityIndex >= 2 ? MODIFIERS[Math.floor(random() * MODIFIERS.length)] : undefined),
  };
}

export function createBossLoot(random = Math.random, depthBonus = 0): Item {
  const base = createLoot(random, 0.22 + depthBonus);
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
