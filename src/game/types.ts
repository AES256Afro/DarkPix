export type ClassId = "vanguard" | "cutpurse" | "hexbound" | "reaver" | "ranger" | "cleric" | "shapeshifter";

export type Rarity = "Worn" | "Common" | "Uncommon" | "Rare" | "Epic" | "Legendary";

export type ItemKind = "weapon" | "armor" | "treasure" | "consumable" | "throwable" | "sigil";

export type StashSort = "recent" | "rarity" | "value" | "kind";

export type RaidMode = "standard" | "high_toll" | "iron_soul";

export type DungeonDepth = 1 | 2;

export type ThreatKind = "skeleton" | "crawler" | "mimic" | "warden" | "rival" | "boss";

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
  version: 10;
  gold: number;
  xp: Record<ClassId, number>;
  stash: Item[];
  extracts: number;
  deaths: number;
  bossVictories: number;
  highTollExtracts: number;
  ashenExtracts: number;
  threatKills: Record<ThreatKind, number>;
  boneBountyPaid: boolean;
  rivalBountyPaid: boolean;
  preferredClass: ClassId;
  raidHistory: RaidJournalEntry[];
}

export interface RaidJournalEntry {
  completedAt: number;
  classId: ClassId;
  raidMode: RaidMode;
  reason: RaidEndReason;
  depthReached: DungeonDepth;
  kills: number;
  elapsed: number;
  goldDelta: number;
  xpDelta: number;
  gearLost: number;
  bossKilled: boolean;
}

export interface GamePreferences {
  mouseSensitivity: number;
  brightness: number;
  fieldOfView: number;
  crosshairScale: number;
  volume: number;
  muted: boolean;
  reducedMotion: boolean;
  reducedFlashes: boolean;
  highContrastHud: boolean;
  invertY: boolean;
  stashSort: StashSort;
}

export type RaidEndReason = "extracted" | "slain" | "darkness" | "abandoned";

export interface RaidResult {
  reason: RaidEndReason;
  raidMode?: RaidMode;
  depthReached?: DungeonDepth;
  classId: ClassId;
  loot: Item[];
  equippedIds: string[];
  consumedIds?: string[];
  kills: number;
  killsByKind?: Partial<Record<ThreatKind, number>>;
  elapsed: number;
  goldFound: number;
  bossKilled?: boolean;
  finishedAt?: number;
}

export interface Vec2 {
  x: number;
  z: number;
}
