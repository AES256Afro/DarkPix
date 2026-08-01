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
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    typeof item.power === "number" &&
    typeof item.value === "number" &&
    ["weapon", "armor", "treasure", "consumable", "sigil"].includes(item.kind ?? "") &&
    ["Worn", "Common", "Uncommon", "Rare", "Epic", "Legendary"].includes(item.rarity ?? "")
  );
}

export function normalizeProfile(value: unknown): Profile {
  const fallback = createProfile();
  if (!value || typeof value !== "object") return fallback;
  const candidate = value as Partial<Profile>;
  const xp = candidate.xp && typeof candidate.xp === "object" ? candidate.xp : fallback.xp;
  return {
    version: 1,
    gold: Math.max(0, Math.floor(Number(candidate.gold) || 0)),
    xp: {
      vanguard: Math.max(0, Math.floor(Number(xp.vanguard) || 0)),
      cutpurse: Math.max(0, Math.floor(Number(xp.cutpurse) || 0)),
      hexbound: Math.max(0, Math.floor(Number(xp.hexbound) || 0)),
    },
    stash: Array.isArray(candidate.stash) ? candidate.stash.filter(validItem).slice(0, 24) : fallback.stash,
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

export function saveProfile(profile: Profile): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(normalizeProfile(profile)));
}

export function applyRaidResult(profile: Profile, result: RaidResult): Profile {
  const next = normalizeProfile(profile);
  const xpGain = 30 + result.kills * 35 + (result.reason === "extracted" ? 140 : 0);
  next.xp[result.classId] += xpGain;
  next.preferredClass = result.classId;

  if (result.reason === "extracted") {
    next.extracts += 1;
    next.gold += result.goldFound;
    const transferable = result.loot.filter((item) => item.kind !== "sigil");
    next.stash = [...next.stash, ...transferable].slice(-24);
  } else {
    next.deaths += 1;
    const risked = new Set(result.equippedIds);
    next.stash = next.stash.filter((item) => !risked.has(item.id));
  }
  return next;
}
