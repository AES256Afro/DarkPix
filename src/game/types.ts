export type ClassId = "vanguard" | "cutpurse" | "hexbound" | "reaver";

export type Rarity = "Worn" | "Common" | "Uncommon" | "Rare" | "Epic" | "Legendary";

export type ItemKind = "weapon" | "armor" | "treasure" | "consumable" | "sigil";

export type StashSort = "recent" | "rarity" | "value" | "kind";

export type RaidMode = "standard" | "high_toll";

export type DungeonDepth = 1 | 2;

export interface Item {
  id: string;
  name: string;
  kind: ItemKind;
  rarity: Rarity;
  power: number;
  value: number;
  modifier?: string;
}

export interface ClassDefinition {
  id: ClassId;
  name: string;
  title: string;
  summary: string;
  maxHealth: number;
  maxStamina: number;
  speed: number;
  damage: number;
  reach: number;
  attackDelay: number;
  accent: string;
  ability: string;
  weapon: string;
}

export interface Profile {
  version: 4;
  gold: number;
  xp: Record<ClassId, number>;
  stash: Item[];
  extracts: number;
  deaths: number;
  bossVictories: number;
  highTollExtracts: number;
  preferredClass: ClassId;
}

export interface GamePreferences {
  mouseSensitivity: number;
  brightness: number;
  fieldOfView: number;
  muted: boolean;
  reducedMotion: boolean;
  stashSort: StashSort;
}

export type RaidEndReason = "extracted" | "slain" | "darkness";

export interface RaidResult {
  reason: RaidEndReason;
  raidMode?: RaidMode;
  depthReached?: DungeonDepth;
  classId: ClassId;
  loot: Item[];
  equippedIds: string[];
  consumedIds?: string[];
  kills: number;
  elapsed: number;
  goldFound: number;
  bossKilled?: boolean;
}

export interface Vec2 {
  x: number;
  z: number;
}
