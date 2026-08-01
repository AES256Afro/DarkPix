import type { RaidMode } from "./types";

export interface RaidRules {
  mode: RaidMode;
  name: string;
  entryFee: number;
  requiredExtracts: number;
  requiredAshenExtracts: number;
  enemyHealthMultiplier: number;
  enemyDamageMultiplier: number;
  enemySpeedMultiplier: number;
  lootDepthBonus: number;
  xpMultiplier: number;
  wipesClassXpOnFailure: boolean;
}

const STANDARD_RULES: RaidRules = {
  mode: "standard",
  name: "Pale Toll",
  entryFee: 0,
  requiredExtracts: 0,
  requiredAshenExtracts: 0,
  enemyHealthMultiplier: 1,
  enemyDamageMultiplier: 1,
  enemySpeedMultiplier: 1,
  lootDepthBonus: 0,
  xpMultiplier: 1,
  wipesClassXpOnFailure: false,
};

const HIGH_TOLL_RULES: RaidRules = {
  mode: "high_toll",
  name: "High Toll",
  entryFee: 50,
  requiredExtracts: 1,
  requiredAshenExtracts: 0,
  enemyHealthMultiplier: 1.28,
  enemyDamageMultiplier: 1.2,
  enemySpeedMultiplier: 1.06,
  lootDepthBonus: 0.12,
  xpMultiplier: 1.35,
  wipesClassXpOnFailure: false,
};

const IRON_SOUL_RULES: RaidRules = {
  mode: "iron_soul",
  name: "Iron Soul",
  entryFee: 100,
  requiredExtracts: 0,
  requiredAshenExtracts: 1,
  enemyHealthMultiplier: 1.48,
  enemyDamageMultiplier: 1.35,
  enemySpeedMultiplier: 1.1,
  lootDepthBonus: 0.2,
  xpMultiplier: 1.75,
  wipesClassXpOnFailure: true,
};

export function raidRules(mode: RaidMode | undefined): RaidRules {
  return mode === "iron_soul" ? IRON_SOUL_RULES : mode === "high_toll" ? HIGH_TOLL_RULES : STANDARD_RULES;
}

export type RaidEntryStatus = "ready" | "extract_required" | "ashen_extract_required" | "insufficient_gold";

export function raidEntryStatus(mode: RaidMode, extracts: number, gold: number, ashenExtracts = 0): RaidEntryStatus {
  const rules = raidRules(mode);
  const safeExtracts = Number.isFinite(extracts) ? Math.max(0, Math.floor(extracts)) : 0;
  const safeGold = Number.isFinite(gold) ? Math.max(0, Math.floor(gold)) : 0;
  const safeAshenExtracts = Number.isFinite(ashenExtracts) ? Math.max(0, Math.floor(ashenExtracts)) : 0;
  if (safeExtracts < rules.requiredExtracts) return "extract_required";
  if (safeAshenExtracts < rules.requiredAshenExtracts) return "ashen_extract_required";
  if (safeGold < rules.entryFee) return "insufficient_gold";
  return "ready";
}
