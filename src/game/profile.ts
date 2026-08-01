import type { ClassId, Item, Profile, RaidJournalEntry, RaidResult, ThreatKind } from "./types";
import { craftingRecipeUnlocked, type CraftingRecipe } from "./data";
import { raidRules } from "./raid";
import { depthXpBonus } from "./depth";
import { treasureGoldTotal } from "./haul";
import { merchantCommission, validUtcDayKey } from "./commission";
import { validRaidVariationSeed } from "./contract";

const PROFILE_KEY = "darkpix-profile-v1";
const RAID_ESCROW_KEY = "darkpix-active-raid-v1";
export const MAX_GOLD = 9_999_999;
export const MAX_ITEM_POWER = 100;
export const MAX_ITEM_VALUE = 99_999;
const MAX_CLASS_XP = 99_999_999;
const MAX_OUTCOME_COUNT = 9_999_999;
export const RAID_HISTORY_LIMIT = 10;
export const BONE_BOUNTY_TARGET = 12;
export const RIVAL_BOUNTY_TARGET = 3;
const THREAT_KINDS: ThreatKind[] = ["skeleton", "crawler", "mimic", "warden", "rival", "boss"];

const STARTER_STASH: Item[] = [
  {
    id: "starter-blade",
    name: "Guildless blade",
    kind: "weapon",
    rarity: "Worn",
    power: 2,
    value: 4,
  },
  {
    id: "starter-jack",
    name: "Quilted corpse-jack",
    kind: "armor",
    rarity: "Worn",
    power: 2,
    value: 4,
  },
];

export function createProfile(): Profile {
  return {
    version: 13,
    gold: 75,
    xp: { vanguard: 0, cutpurse: 0, hexbound: 0, reaver: 0, ranger: 0, cleric: 0, shapeshifter: 0, minstrel: 0 },
    stash: STARTER_STASH.map((item) => ({ ...item })),
    extracts: 0,
    deaths: 0,
    bossVictories: 0,
    highTollExtracts: 0,
    ashenExtracts: 0,
    threatKills: { skeleton: 0, crawler: 0, mimic: 0, warden: 0, rival: 0, boss: 0 },
    boneBountyPaid: false,
    rivalBountyPaid: false,
    streakBountyPaid: false,
    lastCommissionDay: "",
    preferredClass: "vanguard",
    raidHistory: [],
  };
}

function validClass(value: unknown): value is ClassId {
  return value === "vanguard" || value === "cutpurse" || value === "hexbound" || value === "reaver" || value === "ranger" || value === "cleric" || value === "shapeshifter" || value === "minstrel";
}

function validRaidMode(value: unknown): value is NonNullable<RaidResult["raidMode"]> {
  return value === "standard" || value === "high_toll" || value === "iron_soul";
}

function validRaidReason(value: unknown): value is RaidResult["reason"] {
  return value === "extracted" || value === "slain" || value === "darkness" || value === "abandoned";
}

function nonnegativeInteger(value: unknown, maximum = Number.MAX_SAFE_INTEGER): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(maximum, Math.max(0, Math.floor(numeric)));
}

function signedInteger(value: unknown, magnitude = Number.MAX_SAFE_INTEGER): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(magnitude, Math.max(-magnitude, Math.trunc(numeric)));
}

function boundedItemIds(value: unknown, limit = 2): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  const known = new Set<string>();
  for (const id of value) {
    if (typeof id !== "string" || id.length === 0 || id.length > 160 || known.has(id)) continue;
    known.add(id);
    ids.push(id);
    if (ids.length >= limit) break;
  }
  return ids;
}

function normalizeRaidJournalEntry(value: unknown): RaidJournalEntry | undefined {
  if (!value || typeof value !== "object") return undefined;
  const entry = value as Partial<RaidJournalEntry>;
  if (!validClass(entry.classId) || !validRaidMode(entry.raidMode) || !validRaidReason(entry.reason)) return undefined;
  const normalized: RaidJournalEntry = {
    completedAt: nonnegativeInteger(entry.completedAt),
    classId: entry.classId,
    raidMode: entry.raidMode,
    reason: entry.reason,
    depthReached: entry.depthReached === 2 ? 2 : 1,
    kills: nonnegativeInteger(entry.kills, 1_000),
    elapsed: nonnegativeInteger(entry.elapsed, 86_400),
    goldDelta: nonnegativeInteger(entry.goldDelta, MAX_GOLD),
    xpDelta: signedInteger(entry.xpDelta, MAX_CLASS_XP),
    gearLost: nonnegativeInteger(entry.gearLost, 24),
    bossKilled: entry.bossKilled === true,
  };
  if (validRaidVariationSeed(entry.variationSeed)) normalized.variationSeed = entry.variationSeed;
  return normalized;
}

function normalizeItem(value: unknown): Item | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Partial<Item>;
  if (!(
    typeof item.id === "string" && item.id.length > 0 && item.id.length <= 160 &&
    typeof item.name === "string" && item.name.length > 0 && item.name.length <= 120 &&
    typeof item.power === "number" && Number.isFinite(item.power) && item.power >= 0 &&
    typeof item.value === "number" && Number.isFinite(item.value) && item.value >= 0 &&
    (item.modifier === undefined || (typeof item.modifier === "string" && item.modifier.length <= 160)) &&
    ["weapon", "armor", "treasure", "consumable", "throwable", "sigil"].includes(item.kind ?? "") &&
    ["Worn", "Common", "Uncommon", "Rare", "Epic", "Legendary"].includes(item.rarity ?? "")
  )) return undefined;
  return {
    id: item.id,
    name: item.name,
    kind: item.kind as Item["kind"],
    rarity: item.rarity as Item["rarity"],
    power: Math.min(MAX_ITEM_POWER, Math.floor(item.power)),
    value: Math.min(MAX_ITEM_VALUE, Math.floor(item.value)),
    modifier: item.modifier,
  };
}

export function normalizeProfile(value: unknown): Profile {
  const fallback = createProfile();
  if (!value || typeof value !== "object") return fallback;
  const candidate = value as Partial<Profile>;
  const xp = candidate.xp && typeof candidate.xp === "object" ? candidate.xp : fallback.xp;
  const threatKills = candidate.threatKills && typeof candidate.threatKills === "object" ? candidate.threatKills : fallback.threatKills;
  const stash: Item[] = [];
  const itemIds = new Set<string>();
  if (Array.isArray(candidate.stash)) {
    for (const item of candidate.stash) {
      const normalized = normalizeItem(item);
      if (!normalized || itemIds.has(normalized.id) || stash.length >= 24) continue;
      itemIds.add(normalized.id);
      stash.push(normalized);
    }
  }
  const raidHistory = Array.isArray(candidate.raidHistory)
    ? candidate.raidHistory.map(normalizeRaidJournalEntry).filter((entry): entry is RaidJournalEntry => Boolean(entry)).slice(0, RAID_HISTORY_LIMIT)
    : [];
  return {
    version: 13,
    gold: nonnegativeInteger(candidate.gold, MAX_GOLD),
    xp: {
      vanguard: nonnegativeInteger(xp.vanguard, MAX_CLASS_XP),
      cutpurse: nonnegativeInteger(xp.cutpurse, MAX_CLASS_XP),
      hexbound: nonnegativeInteger(xp.hexbound, MAX_CLASS_XP),
      reaver: nonnegativeInteger(xp.reaver, MAX_CLASS_XP),
      ranger: nonnegativeInteger(xp.ranger, MAX_CLASS_XP),
      cleric: nonnegativeInteger(xp.cleric, MAX_CLASS_XP),
      shapeshifter: nonnegativeInteger(xp.shapeshifter, MAX_CLASS_XP),
      minstrel: nonnegativeInteger(xp.minstrel, MAX_CLASS_XP),
    },
    stash: Array.isArray(candidate.stash) ? stash : fallback.stash,
    extracts: nonnegativeInteger(candidate.extracts, MAX_OUTCOME_COUNT),
    deaths: nonnegativeInteger(candidate.deaths, MAX_OUTCOME_COUNT),
    bossVictories: nonnegativeInteger(candidate.bossVictories, MAX_OUTCOME_COUNT),
    highTollExtracts: nonnegativeInteger(candidate.highTollExtracts, MAX_OUTCOME_COUNT),
    ashenExtracts: nonnegativeInteger(candidate.ashenExtracts, MAX_OUTCOME_COUNT),
    threatKills: {
      skeleton: nonnegativeInteger(threatKills.skeleton, MAX_OUTCOME_COUNT),
      crawler: nonnegativeInteger(threatKills.crawler, MAX_OUTCOME_COUNT),
      mimic: nonnegativeInteger(threatKills.mimic, MAX_OUTCOME_COUNT),
      warden: nonnegativeInteger(threatKills.warden, MAX_OUTCOME_COUNT),
      rival: nonnegativeInteger(threatKills.rival, MAX_OUTCOME_COUNT),
      boss: nonnegativeInteger(threatKills.boss, MAX_OUTCOME_COUNT),
    },
    boneBountyPaid: typeof candidate.boneBountyPaid === "boolean" ? candidate.boneBountyPaid : false,
    rivalBountyPaid: typeof candidate.rivalBountyPaid === "boolean" ? candidate.rivalBountyPaid : false,
    streakBountyPaid: typeof candidate.streakBountyPaid === "boolean" ? candidate.streakBountyPaid : false,
    lastCommissionDay: validUtcDayKey(candidate.lastCommissionDay) ? candidate.lastCommissionDay : "",
    preferredClass: validClass(candidate.preferredClass) ? candidate.preferredClass : fallback.preferredClass,
    raidHistory,
  };
}

export function boneKillCount(profile: Pick<Profile, "threatKills">): number {
  return profile.threatKills.skeleton + profile.threatKills.crawler + profile.threatKills.mimic + profile.threatKills.warden;
}

export interface ContractRecordSummary {
  totalContracts: number;
  extractionRate: number;
  currentExtractStreak: number;
  recentBestGold: number;
}

export function contractRecordSummary(profile: Pick<Profile, "extracts" | "deaths" | "raidHistory">): ContractRecordSummary {
  const extracts = nonnegativeInteger(profile.extracts, MAX_OUTCOME_COUNT);
  const deaths = nonnegativeInteger(profile.deaths, MAX_OUTCOME_COUNT);
  const totalContracts = extracts + deaths;
  let currentExtractStreak = 0;
  let recentBestGold = 0;
  let streakOpen = true;
  for (const entry of profile.raidHistory.slice(0, RAID_HISTORY_LIMIT)) {
    if (streakOpen && entry.reason === "extracted") currentExtractStreak += 1;
    else streakOpen = false;
    recentBestGold = Math.max(recentBestGold, nonnegativeInteger(entry.goldDelta, MAX_GOLD));
  }
  return {
    totalContracts,
    extractionRate: totalContracts > 0 ? Math.round((extracts / totalContracts) * 100) : 0,
    currentExtractStreak,
    recentBestGold,
  };
}

function boundedThreatKills(
  kills: number,
  killsByKind?: Partial<Record<ThreatKind, number>>,
): Record<ThreatKind, number> {
  const bounded: Record<ThreatKind, number> = { skeleton: 0, crawler: 0, mimic: 0, warden: 0, rival: 0, boss: 0 };
  let remaining = Math.min(1_000, nonnegativeInteger(kills));
  for (const kind of THREAT_KINDS) {
    const count = Math.min(remaining, nonnegativeInteger(killsByKind?.[kind], 1_000));
    bounded[kind] = count;
    remaining -= count;
  }
  return bounded;
}

export function loadProfile(): Profile {
  try {
    return normalizeProfile(JSON.parse(localStorage.getItem(PROFILE_KEY) ?? "null"));
  } catch {
    return createProfile();
  }
}

export function saveProfile(profile: Profile): boolean {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(normalizeProfile(profile)));
    return true;
  } catch {
    return false;
  }
}

export interface RaidEscrow {
  version: 1;
  classId: ClassId;
  raidMode: NonNullable<RaidResult["raidMode"]>;
  equippedIds: string[];
  startedAt: number;
  depthReached: 1 | 2;
  kills: number;
  killsByKind: Record<ThreatKind, number>;
  entryFee: number;
  goldBeforeEntry?: number;
  goldAfterEntry?: number;
}

export function createRaidEscrow(
  classId: ClassId,
  raidMode: NonNullable<RaidResult["raidMode"]>,
  equippedIds: readonly string[],
  startedAt = Date.now(),
  depthReached: 1 | 2 = 1,
  kills = 0,
  goldBeforeEntry?: number,
  killsByKind: Partial<Record<ThreatKind, number>> = {},
): RaidEscrow {
  const entryFee = raidRules(raidMode).entryFee;
  const safeGoldBeforeEntry = Number.isFinite(goldBeforeEntry) ? nonnegativeInteger(goldBeforeEntry, MAX_GOLD) : undefined;
  return {
    version: 1,
    classId,
    raidMode,
    equippedIds: boundedItemIds(equippedIds),
    startedAt: Number.isFinite(startedAt) ? Math.max(0, Math.floor(startedAt)) : 0,
    depthReached: depthReached === 2 ? 2 : 1,
    kills: Math.min(1_000, nonnegativeInteger(kills)),
    killsByKind: boundedThreatKills(kills, killsByKind),
    entryFee,
    ...(safeGoldBeforeEntry === undefined ? {} : {
      goldBeforeEntry: safeGoldBeforeEntry,
      goldAfterEntry: Math.max(0, safeGoldBeforeEntry - entryFee),
    }),
  };
}

export function normalizeRaidEscrow(value: unknown): RaidEscrow | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<RaidEscrow>;
  if (candidate.version !== 1 || !validClass(candidate.classId) || !validRaidMode(candidate.raidMode) || !Array.isArray(candidate.equippedIds)) return undefined;
  return createRaidEscrow(
    candidate.classId,
    candidate.raidMode,
    candidate.equippedIds,
    candidate.startedAt,
    candidate.depthReached,
    candidate.kills,
    candidate.goldBeforeEntry,
    candidate.killsByKind,
  );
}

export function beginRaidEscrow(escrow: RaidEscrow): boolean {
  try {
    localStorage.setItem(RAID_ESCROW_KEY, JSON.stringify(escrow));
    return true;
  } catch {
    return false;
  }
}

export function loadRaidEscrow(): RaidEscrow | undefined {
  try {
    const serialized = localStorage.getItem(RAID_ESCROW_KEY);
    if (!serialized) return undefined;
    const escrow = normalizeRaidEscrow(JSON.parse(serialized));
    if (!escrow) localStorage.removeItem(RAID_ESCROW_KEY);
    return escrow;
  } catch {
    return undefined;
  }
}

export function clearRaidEscrow(): void {
  try {
    localStorage.removeItem(RAID_ESCROW_KEY);
  } catch {
    // The normal profile warning already explains unavailable browser storage.
  }
}

export function settleInterruptedRaid(profile: Profile, escrow: RaidEscrow): RaidSettlement {
  const reconciled = normalizeProfile(profile);
  if (escrow.goldAfterEntry !== undefined && Number.isFinite(escrow.goldAfterEntry)) {
    reconciled.gold = Math.min(reconciled.gold, nonnegativeInteger(escrow.goldAfterEntry, MAX_GOLD));
  }
  return settleRaid(reconciled, {
    reason: "abandoned",
    raidMode: escrow.raidMode,
    depthReached: escrow.depthReached,
    classId: escrow.classId,
    loot: [],
    equippedIds: escrow.equippedIds,
    kills: escrow.kills,
    killsByKind: escrow.killsByKind,
    elapsed: 0,
    goldFound: 0,
  });
}

export interface RaidSettlement {
  profile: Profile;
  banked: Item[];
  overflow: Item[];
  lost: Item[];
  firstContractPaid: boolean;
  bossContractPaid: boolean;
  highTollContractPaid: boolean;
  ashenContractPaid: boolean;
  boneBountyPaid: boolean;
  rivalBountyPaid: boolean;
  streakBountyPaid: boolean;
  commissionPaid: boolean;
  commissionReward: number;
  overflowGold: number;
  goldGained: number;
  xpGained: number;
  classXpLost: number;
}

export interface RaidXpBreakdown {
  presence: number;
  kills: number;
  extraction: number;
  depth: number;
  subtotal: number;
  multiplier: number;
  total: number;
  forfeited: boolean;
}

export function raidXpBreakdown(result: RaidResult): RaidXpBreakdown {
  const rules = raidRules(result.raidMode);
  const presence = result.reason === "abandoned" ? 0 : 30;
  const kills = Math.min(1_000, nonnegativeInteger(result.kills)) * 35;
  const extraction = result.reason === "extracted" ? 140 : 0;
  const depth = depthXpBonus(result.depthReached, result.reason === "extracted");
  const subtotal = presence + kills + extraction + depth;
  const forfeited = rules.wipesClassXpOnFailure && result.reason !== "extracted";
  return {
    presence,
    kills,
    extraction,
    depth,
    subtotal,
    multiplier: rules.xpMultiplier,
    total: forfeited ? 0 : Math.round(subtotal * rules.xpMultiplier),
    forfeited,
  };
}

export function settleRaid(profile: Profile, result: RaidResult): RaidSettlement {
  const next = normalizeProfile(profile);
  const rules = raidRules(result.raidMode);
  const risked = new Set(boundedItemIds(result.equippedIds));
  const consumed = new Set(boundedItemIds(result.consumedIds, 24).filter((id) => risked.has(id)).slice(0, 2));
  if (consumed.size) next.stash = next.stash.filter((item) => !consumed.has(item.id));
  const xpGain = raidXpBreakdown(result).total;
  next.xp[result.classId] = Math.min(MAX_CLASS_XP, next.xp[result.classId] + xpGain);
  next.preferredClass = result.classId;
  const raidThreatKills = boundedThreatKills(result.kills, result.killsByKind);
  for (const kind of THREAT_KINDS) next.threatKills[kind] = Math.min(MAX_OUTCOME_COUNT, next.threatKills[kind] + raidThreatKills[kind]);
  const settlement: RaidSettlement = {
    profile: next,
    banked: [],
    overflow: [],
    lost: [],
    firstContractPaid: false,
    bossContractPaid: false,
    highTollContractPaid: false,
    ashenContractPaid: false,
    boneBountyPaid: false,
    rivalBountyPaid: false,
    streakBountyPaid: false,
    commissionPaid: false,
    commissionReward: 0,
    overflowGold: 0,
    goldGained: 0,
    xpGained: xpGain,
    classXpLost: 0,
  };

  if (result.reason === "extracted") {
    const firstContractReward = next.extracts === 0 ? 100 : 0;
    const bossContractReward = result.bossKilled && next.bossVictories === 0 ? 150 : 0;
    const highTollContractReward = result.raidMode === "high_toll" && next.highTollExtracts === 0 ? 200 : 0;
    const ashenContractReward = result.depthReached === 2 && next.ashenExtracts === 0 ? 250 : 0;
    const boneBountyReward = !next.boneBountyPaid && boneKillCount(next) >= BONE_BOUNTY_TARGET ? 175 : 0;
    const rivalBountyReward = !next.rivalBountyPaid && next.threatKills.rival >= RIVAL_BOUNTY_TARGET ? 225 : 0;
    const streakBountyReward = !next.streakBountyPaid && contractRecordSummary(next).currentExtractStreak >= 2 ? 300 : 0;
    const commissionTimestamp = Number.isFinite(result.finishedAt) && Number(result.finishedAt) > 0 ? Number(result.finishedAt) : undefined;
    const commission = commissionTimestamp === undefined ? undefined : merchantCommission(commissionTimestamp);
    const commissionReward = commission && next.lastCommissionDay !== commission.day && raidThreatKills[commission.kind] >= commission.target ? commission.reward : 0;
    settlement.firstContractPaid = firstContractReward > 0;
    settlement.bossContractPaid = bossContractReward > 0;
    settlement.highTollContractPaid = highTollContractReward > 0;
    settlement.ashenContractPaid = ashenContractReward > 0;
    settlement.boneBountyPaid = boneBountyReward > 0;
    settlement.rivalBountyPaid = rivalBountyReward > 0;
    settlement.streakBountyPaid = streakBountyReward > 0;
    settlement.commissionPaid = commissionReward > 0;
    settlement.commissionReward = commissionReward;
    if (boneBountyReward) next.boneBountyPaid = true;
    if (rivalBountyReward) next.rivalBountyPaid = true;
    if (streakBountyReward) next.streakBountyPaid = true;
    if (commissionReward && commission) next.lastCommissionDay = commission.day;
    next.extracts = Math.min(MAX_OUTCOME_COUNT, next.extracts + 1);
    if (result.bossKilled) next.bossVictories = Math.min(MAX_OUTCOME_COUNT, next.bossVictories + 1);
    if (result.raidMode === "high_toll") next.highTollExtracts = Math.min(MAX_OUTCOME_COUNT, next.highTollExtracts + 1);
    if (result.depthReached === 2) next.ashenExtracts = Math.min(MAX_OUTCOME_COUNT, next.ashenExtracts + 1);
    const knownIds = new Set(next.stash.map((item) => item.id));
    const transferable: Item[] = [];
    for (const item of result.loot) {
      const normalized = normalizeItem(item);
      if (!normalized || normalized.kind === "sigil" || knownIds.has(normalized.id)) continue;
      knownIds.add(normalized.id);
      transferable.push(normalized);
    }
    const availableSlots = Math.max(0, 24 - next.stash.length);
    settlement.banked = transferable.slice(0, availableSlots);
    settlement.overflow = transferable.slice(availableSlots);
    settlement.overflowGold = settlement.overflow.reduce(
      (sum, item) => Math.min(MAX_GOLD, sum + Math.max(1, Math.floor(item.value * 0.5))),
      0,
    );
    const availableGoldCapacity = Math.max(0, MAX_GOLD - next.gold);
    settlement.goldGained = Math.min(
      availableGoldCapacity,
      treasureGoldTotal(transferable) + firstContractReward + bossContractReward + highTollContractReward + ashenContractReward + boneBountyReward + rivalBountyReward + streakBountyReward + commissionReward + settlement.overflowGold,
    );
    next.stash = [...next.stash, ...settlement.banked];
    next.gold += settlement.goldGained;
  } else {
    next.deaths = Math.min(MAX_OUTCOME_COUNT, next.deaths + 1);
    if (rules.wipesClassXpOnFailure) {
      settlement.classXpLost = next.xp[result.classId];
      next.xp[result.classId] = 0;
    }
    settlement.lost = next.stash.filter((item) => risked.has(item.id));
    next.stash = next.stash.filter((item) => !risked.has(item.id));
  }
  const journalEntry: RaidJournalEntry = {
    completedAt: nonnegativeInteger(result.finishedAt ?? Date.now()),
    classId: result.classId,
    raidMode: rules.mode,
    reason: result.reason,
    depthReached: result.depthReached === 2 ? 2 : 1,
    kills: Math.min(1_000, nonnegativeInteger(result.kills)),
    elapsed: nonnegativeInteger(result.elapsed, 86_400),
    goldDelta: settlement.goldGained,
    xpDelta: settlement.classXpLost > 0 ? -settlement.classXpLost : settlement.xpGained,
    gearLost: settlement.lost.length,
    bossKilled: result.bossKilled === true,
  };
  if (validRaidVariationSeed(result.variationSeed)) journalEntry.variationSeed = result.variationSeed;
  next.raidHistory = [journalEntry, ...next.raidHistory].slice(0, RAID_HISTORY_LIMIT);
  return settlement;
}

export function applyRaidResult(profile: Profile, result: RaidResult): Profile {
  return settleRaid(profile, result).profile;
}

export function sellStashItem(profile: Profile, itemId: string): { profile: Profile; sold?: Item; proceeds: number } {
  const next = normalizeProfile(profile);
  const itemIndex = next.stash.findIndex((item) => item.id === itemId);
  if (itemIndex < 0 || next.gold >= MAX_GOLD) return { profile: next, proceeds: 0 };
  const [sold] = next.stash.splice(itemIndex, 1);
  if (!sold) return { profile: next, proceeds: 0 };
  const proceeds = Math.min(sold.value, MAX_GOLD - next.gold);
  next.gold += proceeds;
  return { profile: next, sold, proceeds };
}

export type PurchaseOutcome = "purchased" | "insufficient_gold" | "stash_full" | "invalid_offer";

export function purchaseItem(profile: Profile, item: Item, price: number): { profile: Profile; outcome: PurchaseOutcome } {
  const next = normalizeProfile(profile);
  const stock = normalizeItem(item);
  if (!stock || !Number.isFinite(price) || price < 0 || next.stash.some((entry) => entry.id === stock.id)) {
    return { profile: next, outcome: "invalid_offer" };
  }
  const safePrice = Math.floor(price);
  if (next.stash.length >= 24) return { profile: next, outcome: "stash_full" };
  if (next.gold < safePrice) return { profile: next, outcome: "insufficient_gold" };
  next.gold -= safePrice;
  next.stash.push(stock);
  return { profile: next, outcome: "purchased" };
}

export type CraftOutcome = "crafted" | "reputation_locked" | "missing_material" | "insufficient_gold" | "duplicate_id";

export function craftItem(
  profile: Profile,
  recipe: CraftingRecipe,
  outputId: string,
): { profile: Profile; outcome: CraftOutcome } {
  const next = normalizeProfile(profile);
  if (!craftingRecipeUnlocked(recipe, next.extracts)) return { profile: next, outcome: "reputation_locked" };
  const ingredientIndex = next.stash.findIndex(
    (item) => item.name === recipe.ingredientName && item.kind === recipe.ingredientKind,
  );
  if (ingredientIndex < 0) return { profile: next, outcome: "missing_material" };
  const safeCost = Number.isFinite(recipe.goldCost) ? Math.max(0, Math.floor(recipe.goldCost)) : Number.MAX_SAFE_INTEGER;
  if (next.gold < safeCost) return { profile: next, outcome: "insufficient_gold" };
  if (!outputId || next.stash.some((item) => item.id === outputId)) return { profile: next, outcome: "duplicate_id" };
  next.gold -= safeCost;
  next.stash.splice(ingredientIndex, 1, { ...recipe.output, id: outputId });
  return { profile: next, outcome: "crafted" };
}
