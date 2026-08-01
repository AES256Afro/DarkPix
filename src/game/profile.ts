import type { ClassId, Item, Profile, RaidResult } from "./types";

const PROFILE_KEY = "darkpix-profile-v1";

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
    version: 1,
    gold: 75,
    xp: { vanguard: 0, cutpurse: 0, hexbound: 0 },
    stash: STARTER_STASH.map((item) => ({ ...item })),
    extracts: 0,
    deaths: 0,
    preferredClass: "vanguard",
  };
}

function validClass(value: unknown): value is ClassId {
  return value === "vanguard" || value === "cutpurse" || value === "hexbound";
}

function validItem(value: unknown): value is Item {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<Item>;
  return (
    typeof item.id === "string" && item.id.length > 0 && item.id.length <= 160 &&
    typeof item.name === "string" && item.name.length > 0 && item.name.length <= 120 &&
    typeof item.power === "number" && Number.isFinite(item.power) && item.power >= 0 &&
    typeof item.value === "number" && Number.isFinite(item.value) && item.value >= 0 &&
    (item.modifier === undefined || typeof item.modifier === "string") &&
    ["weapon", "armor", "treasure", "consumable", "sigil"].includes(item.kind ?? "") &&
    ["Worn", "Common", "Uncommon", "Rare", "Epic", "Legendary"].includes(item.rarity ?? "")
  );
}

export function normalizeProfile(value: unknown): Profile {
  const fallback = createProfile();
  if (!value || typeof value !== "object") return fallback;
  const candidate = value as Partial<Profile>;
  const xp = candidate.xp && typeof candidate.xp === "object" ? candidate.xp : fallback.xp;
  const stash: Item[] = [];
  const itemIds = new Set<string>();
  if (Array.isArray(candidate.stash)) {
    for (const item of candidate.stash) {
      if (!validItem(item) || itemIds.has(item.id) || stash.length >= 24) continue;
      itemIds.add(item.id);
      stash.push({ ...item });
    }
  }
  return {
    version: 1,
    gold: Math.max(0, Math.floor(Number(candidate.gold) || 0)),
    xp: {
      vanguard: Math.max(0, Math.floor(Number(xp.vanguard) || 0)),
      cutpurse: Math.max(0, Math.floor(Number(xp.cutpurse) || 0)),
      hexbound: Math.max(0, Math.floor(Number(xp.hexbound) || 0)),
    },
    stash: Array.isArray(candidate.stash) ? stash : fallback.stash,
    extracts: Math.max(0, Math.floor(Number(candidate.extracts) || 0)),
    deaths: Math.max(0, Math.floor(Number(candidate.deaths) || 0)),
    preferredClass: validClass(candidate.preferredClass) ? candidate.preferredClass : fallback.preferredClass,
  };
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

export function applyRaidResult(profile: Profile, result: RaidResult): Profile {
  const next = normalizeProfile(profile);
  const consumed = new Set(result.consumedIds ?? []);
  if (consumed.size) next.stash = next.stash.filter((item) => !consumed.has(item.id));
  const xpGain = 30 + Math.max(0, Math.floor(result.kills)) * 35 + (result.reason === "extracted" ? 140 : 0);
  next.xp[result.classId] += xpGain;
  next.preferredClass = result.classId;

  if (result.reason === "extracted") {
    const firstContractReward = next.extracts === 0 ? 100 : 0;
    next.extracts += 1;
    next.gold += Math.max(0, Math.floor(result.goldFound)) + firstContractReward;
    const knownIds = new Set(next.stash.map((item) => item.id));
    const transferable = result.loot.filter((item) => {
      if (item.kind === "sigil" || knownIds.has(item.id) || !validItem(item)) return false;
      knownIds.add(item.id);
      return true;
    });
    const availableSlots = Math.max(0, 24 - next.stash.length);
    const banked = transferable.slice(0, availableSlots);
    const overflow = transferable.slice(availableSlots);
    next.stash = [...next.stash, ...banked];
    next.gold += overflow.reduce((sum, item) => sum + Math.max(1, Math.floor(item.value * 0.5)), 0);
  } else {
    next.deaths += 1;
    const risked = new Set(result.equippedIds);
    next.stash = next.stash.filter((item) => !risked.has(item.id));
  }
  return next;
}

export type PurchaseOutcome = "purchased" | "insufficient_gold" | "stash_full";

export function purchaseItem(profile: Profile, item: Item, price: number): { profile: Profile; outcome: PurchaseOutcome } {
  const next = normalizeProfile(profile);
  const safePrice = Math.max(0, Math.floor(price));
  if (next.stash.length >= 24) return { profile: next, outcome: "stash_full" };
  if (next.gold < safePrice) return { profile: next, outcome: "insufficient_gold" };
  next.gold -= safePrice;
  next.stash.push({ ...item });
  return { profile: next, outcome: "purchased" };
}
