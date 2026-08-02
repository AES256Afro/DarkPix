import { describe, expect, it } from "vitest";
import { BESTIARY, CLASS_ABILITIES, CRAFTING_RECIPES, HEX_SPELLS, MERCHANT_OFFERS, classPerkBonuses, consumableEffect, consumableUseDuration, createBossLoot, createItemId, createLoot, createSigil, craftingRecipeUnlocked, formatTime, levelForXp, merchantOfferUnlocked, merchantStanding, progressionBonuses, rarityFromRoll, throwableDamage } from "../src/game/data";
import { MAX_GOLD, MAX_ITEM_POWER, MAX_ITEM_VALUE, MAX_RAID_LOOT_ITEMS, RAID_ESCROW_LEASE_MS, RAID_HISTORY_LIMIT, applyRaidResult, contractRecordSummary, craftItem, createProfile, createRaidEscrow, loadProfileState, loadRaidEscrowState, nextRaidStartedAt, normalizeProfile, normalizeRaidEscrow, normalizeRaidResult, purchaseItem, raidEscrowAlreadySettled, raidEscrowLeaseHeldByOther, raidThreatKillLedger, raidXpBreakdown, sellStashItem, settleInterruptedRaid, settleRaid } from "../src/game/profile";
import { DEFAULT_PREFERENCES, firstRunPreferences, normalizePreferences } from "../src/game/preferences";
import { RIPOSTE_DURATION_SECONDS, attackDamage, attackStaminaCost, bossTactic, bossTollDamage, bossTollHits, classAbilityDamageMultiplier, classAttackDelay, classMovementMultiplier, damageImpactAccepted, delverActionLock, delverRecoveryActive, dodgeStats, dungeonCrossfireDamage, enemyAttackPattern, enemyStrikeFacesTarget, enemyStrikeMissReason, guardBreakDuration, guardDenialReason, guardDrainPerSecond, guardFacesThreat, healthPercent, minstrelStagger, riposteDamageMultiplier, rivalDungeonTactic, rivalTactic, safeDamageAmount, sanctuaryDamage, staminaRecoveryPerSecond, strikeImpactDelay, trapDamageAgainstThreat } from "../src/game/combat";
import type { RaidResult } from "../src/game/types";

describe("loot generation", () => {
  it("maps rarity thresholds deterministically", () => {
    expect(rarityFromRoll(0.1)).toBe("Worn");
    expect(rarityFromRoll(0.4)).toBe("Common");
    expect(rarityFromRoll(0.7)).toBe("Uncommon");
    expect(rarityFromRoll(0.9)).toBe("Rare");
    expect(rarityFromRoll(0.98)).toBe("Epic");
    expect(rarityFromRoll(0.999)).toBe("Legendary");
  });

  it("uses depth bonus to improve a fixed roll", () => {
    expect(rarityFromRoll(0.8, 0)).toBe("Uncommon");
    expect(rarityFromRoll(0.8, 0.18)).toBe("Epic");
  });

  it("creates stable loot with an injected random source", () => {
    const item = createLoot(() => 0.6);
    expect(item.kind).toBe("treasure");
    expect(item.rarity).toBe("Uncommon");
    expect(item.value).toBeGreaterThan(0);
  });

  it("keeps generated identities unique with identical time and random input", () => {
    const first = createItemId("loot", () => 0.25, 1_700_000_000_000);
    const second = createItemId("loot", () => 0.25, 1_700_000_000_000);
    expect(second).not.toBe(first);
    const loot = [createLoot(() => 0.5), createLoot(() => 0.5)];
    expect(new Set(loot.map((item) => item.id)).size).toBe(2);
    const sigils = [createSigil(() => 0.5), createSigil(() => 0.5)];
    expect(new Set(sigils.map((item) => item.id)).size).toBe(2);
  });

  it("gives recovered consumables explicit utility instead of gear enchantments", () => {
    const rolls = [0.85, 0.7, 0.99, 0.1, 0.1, 0.1];
    const item = createLoot(() => rolls.shift() ?? 0.1);
    expect(item.kind).toBe("consumable");
    expect(item.name).toBe("Camp ember");
    expect(item.modifier).toContain("spell charges");
    expect(consumableEffect(item)).toMatchObject({ health: 20, stamina: 20, spellCharges: 2 });
    expect(consumableEffect({ name: "Bluewax candle", kind: "consumable" })).toMatchObject({ health: 12, torchFuel: 45 });
    expect(consumableEffect({ name: "blade", kind: "weapon" })).toBeUndefined();
  });

  it("gives remedies deliberate item-specific treatment windows", () => {
    expect(consumableUseDuration({ name: "Pitch bandage", kind: "consumable" })).toBe(1.35);
    expect(consumableUseDuration({ name: "Camp ember", kind: "consumable" })).toBe(1.15);
    expect(consumableUseDuration({ name: "Coagulation draught", kind: "consumable" })).toBe(1);
    expect(consumableUseDuration({ name: "Smoked root", kind: "consumable" })).toBe(0.85);
    expect(consumableUseDuration({ name: "Bluewax candle", kind: "consumable" })).toBe(0.75);
    expect(consumableUseDuration({ name: "Unknown tonic", kind: "consumable" })).toBe(1);
    expect(consumableUseDuration({ name: "Riveted falchion", kind: "weapon" })).toBe(0);
  });

  it("generates finite throwing weapons with bounded damage", () => {
    const rolls = [0.95, 0.7, 0.1, 0.1, 0.8, 0.1];
    const item = createLoot(() => rolls.shift() ?? 0.1);
    expect(item.kind).toBe("throwable");
    expect(item.modifier).toBe(`Deals ${throwableDamage(item)} thrown damage`);
    expect(throwableDamage(item)).toBeGreaterThanOrEqual(12);
    expect(throwableDamage({ kind: "weapon", power: 99 })).toBe(0);
    expect(throwableDamage({ kind: "throwable", power: Number.NaN })).toBe(0);
    expect(throwableDamage({ kind: "throwable", power: 999 })).toBe(60);
  });

  it("guarantees a named rare-or-better Tollkeeper trophy", () => {
    const trophy = createBossLoot(() => 0);
    expect(trophy.name).toBe("Tollkeeper's severed chain");
    expect(trophy.kind).toBe("treasure");
    expect(["Rare", "Epic", "Legendary"]).toContain(trophy.rarity);
    expect(trophy.value).toBeGreaterThanOrEqual(126);
  });
});

describe("persistent raid consequences", () => {
  it("keeps class progression but removes risked gear on death", () => {
    const profile = createProfile();
    const result = applyRaidResult(profile, {
      reason: "slain",
      classId: "vanguard",
      loot: [createLoot(() => 0.7)],
      equippedIds: ["starter-blade"],
      kills: 2,
      elapsed: 42,
      goldFound: 18,
    });
    expect(result.xp.vanguard).toBe(100);
    expect(result.deaths).toBe(1);
    expect(result.gold).toBe(75);
    expect(result.stash.some((item) => item.id === "starter-blade")).toBe(false);
    expect(result.stash).toHaveLength(1);
  });

  it("caps a malformed failure verdict to the two-item packed limit", () => {
    const profile = createProfile();
    profile.stash.push(
      { ...profile.stash[0]!, id: "reserve-one" },
      { ...profile.stash[0]!, id: "reserve-two" },
    );
    const settlement = settleRaid(profile, {
      reason: "slain",
      classId: "vanguard",
      loot: [],
      equippedIds: ["starter-blade", "starter-jack", "reserve-one", "reserve-two"],
      kills: 0,
      elapsed: 10,
      goldFound: 0,
    });
    expect(settlement.lost.map((item) => item.id)).toEqual(["starter-blade", "starter-jack"]);
    expect(settlement.profile.stash.map((item) => item.id)).toEqual(["reserve-one", "reserve-two"]);
  });

  it("settles an abandoned raid as gear loss without granting idle XP", () => {
    const profile = createProfile();
    const result = settleRaid(profile, {
      reason: "abandoned",
      classId: "reaver",
      loot: [createLoot(() => 0.7)],
      equippedIds: ["starter-blade"],
      kills: 0,
      elapsed: 4,
      goldFound: 20,
    });
    expect(result.profile.deaths).toBe(1);
    expect(result.profile.xp.reaver).toBe(0);
    expect(result.profile.gold).toBe(75);
    expect(result.profile.stash.some((item) => item.id === "starter-blade")).toBe(false);
    expect(result.banked).toEqual([]);
  });

  it("settles an interrupted Iron Soul raid with its class XP and gear at risk", () => {
    const profile = createProfile();
    profile.xp.ranger = 700;
    const escrow = createRaidEscrow("ranger", "iron_soul", ["starter-blade", "starter-blade", "starter-jack"]);
    const settlement = settleInterruptedRaid(profile, escrow);
    expect(escrow.equippedIds).toEqual(["starter-blade", "starter-jack"]);
    expect(settlement.profile.xp.ranger).toBe(0);
    expect(settlement.classXpLost).toBe(700);
    expect(settlement.xpGained).toBe(0);
    expect(settlement.profile.deaths).toBe(1);
    expect(settlement.lost.map((item) => item.id).sort()).toEqual(["starter-blade", "starter-jack"]);

    const checkpoint = createRaidEscrow("ranger", "standard", [], 123, 2, 3, undefined, { skeleton: 1, rival: 1, boss: 1 }, 31, 2);
    const recoveredCheckpoint = settleInterruptedRaid(createProfile(), checkpoint);
    expect(checkpoint).toMatchObject({ startedAt: 123, depthReached: 2, kills: 3, killsByKind: { skeleton: 1, rival: 1, boss: 1 }, variationSeed: 31, unseenStrikes: 2 });
    expect(recoveredCheckpoint.xpGained).toBe(165);
    expect(recoveredCheckpoint.profile.threatKills).toMatchObject({ skeleton: 1, rival: 1, boss: 1 });
    expect(recoveredCheckpoint.profile.raidHistory[0]?.variationSeed).toBe(31);
    expect(recoveredCheckpoint.profile.raidHistory[0]?.unseenStrikes).toBe(2);

    const standardProfile = createProfile();
    standardProfile.xp.ranger = 700;
    const standard = settleInterruptedRaid(standardProfile, createRaidEscrow("ranger", "standard", []));
    expect(standard.profile.xp.ranger).toBe(700);
    expect(standard.classXpLost).toBe(0);

    const survived = settleRaid(standardProfile, {
      reason: "extracted", raidMode: "iron_soul", classId: "ranger", loot: [], equippedIds: [], kills: 0, elapsed: 90, goldFound: 0,
    });
    expect(survived.classXpLost).toBe(0);
    expect(survived.xpGained).toBe(298);
    expect(survived.profile.xp.ranger).toBe(998);
  });

  it("reconciles an interrupted paid entry from its escrow balance", () => {
    const unpaidProfile = createProfile();
    unpaidProfile.gold = 200;
    const escrow = createRaidEscrow("vanguard", "high_toll", [], 123, 1, 0, unpaidProfile.gold);
    expect(escrow).toMatchObject({ entryFee: 50, goldBeforeEntry: 200, goldAfterEntry: 150 });
    expect(settleInterruptedRaid(unpaidProfile, escrow).profile.gold).toBe(150);

    const chargedProfile = createProfile();
    chargedProfile.gold = 150;
    expect(settleInterruptedRaid(chargedProfile, escrow).profile.gold).toBe(150);

    const legacyEscrow = createRaidEscrow("vanguard", "high_toll", []);
    expect(legacyEscrow.goldAfterEntry).toBeUndefined();
    expect(settleInterruptedRaid(unpaidProfile, legacyEscrow).profile.gold).toBe(200);
  });

  it("rejects malformed raid escrow journals before recovery", () => {
    expect(normalizeRaidEscrow({ version: 2, classId: "ranger", raidMode: "standard", equippedIds: [] })).toBeUndefined();
    expect(normalizeRaidEscrow({ version: 1, classId: "dragon", raidMode: "iron_soul", equippedIds: [] })).toBeUndefined();
    expect(normalizeRaidEscrow({ version: 1, classId: "ranger", raidMode: "unknown", equippedIds: [] })).toBeUndefined();
    expect(normalizeRaidEscrow({ version: 1, classId: "ranger", raidMode: "standard", equippedIds: "blade" })).toBeUndefined();
    expect(normalizeRaidEscrow({ version: 1, classId: "ranger", raidMode: "high_toll", equippedIds: [], startedAt: 1, goldBeforeEntry: 200, entryFee: 0 })).toMatchObject({ entryFee: 50, goldAfterEntry: 150 });
    expect(normalizeRaidEscrow({ version: 1, classId: "ranger", raidMode: "standard", equippedIds: [], startedAt: Number.NaN })).toBeUndefined();
    expect(normalizeRaidEscrow({ version: 1, classId: "ranger", raidMode: "standard", equippedIds: [], startedAt: Number.MAX_VALUE })).toBeUndefined();
    expect(normalizeRaidEscrow({ version: 1, classId: "ranger", raidMode: "standard", equippedIds: [], startedAt: Number.MAX_SAFE_INTEGER })).toBeUndefined();
    expect(normalizeRaidEscrow({ version: 1, classId: "ranger", raidMode: "standard", equippedIds: [], startedAt: 0 })).toBeUndefined();
    expect(normalizeRaidEscrow({ version: 1, classId: "ranger", raidMode: "standard", equippedIds: [] })).toBeUndefined();
    expect(normalizeRaidEscrow({ version: 1, classId: "ranger", raidMode: "standard", equippedIds: [], startedAt: 1, kills: 2, killsByKind: { skeleton: 99, rival: 99 } })?.killsByKind).toEqual({ skeleton: 2, crawler: 0, mimic: 0, warden: 0, rival: 0, boss: 0 });
    expect(normalizeRaidEscrow({ version: 1, classId: "ranger", raidMode: "standard", equippedIds: [], startedAt: 1, kills: 2 })?.killsByKind).toEqual({ skeleton: 0, crawler: 0, mimic: 0, warden: 0, rival: 0, boss: 0 });
    expect(normalizeRaidEscrow({ version: 1, classId: "ranger", raidMode: "standard", equippedIds: [], startedAt: 1, variationSeed: 32 })?.variationSeed).toBeUndefined();
    expect(normalizeRaidEscrow({ version: 1, classId: "ranger", raidMode: "standard", equippedIds: [], startedAt: 1, unseenStrikes: 999 })?.unseenStrikes).toBe(32);
    const now = 1_700_000_000_000;
    const futureStart = { version: 1, classId: "ranger", raidMode: "standard", equippedIds: [], startedAt: now + 300_001 };
    expect(normalizeRaidEscrow(futureStart, now)).toBeUndefined();
  });

  it("quarantines malformed active-raid journals instead of silently deleting their risk", () => {
    const malformed = "{damaged-raid";
    const values = new Map<string, string>([["darkpix-active-raid-v1", malformed]]);
    const storage = { getItem: (key: string) => values.get(key) ?? null };
    expect(loadRaidEscrowState(storage)).toEqual({ status: "corrupt", recovery: malformed });
    expect(values.get("darkpix-active-raid-v1")).toBe(malformed);

    const future = JSON.stringify({ version: 2, classId: "ranger", raidMode: "standard", equippedIds: [] });
    values.set("darkpix-active-raid-v1", future);
    expect(loadRaidEscrowState(storage)).toEqual({ status: "corrupt", recovery: future });
    expect(values.get("darkpix-active-raid-v1")).toBe(future);
  });

  it("distinguishes valid, missing, and unavailable active-raid storage", () => {
    const escrow = createRaidEscrow("cleric", "standard", ["starter-jack"], 123);
    expect(loadRaidEscrowState({ getItem: () => JSON.stringify(escrow) })).toEqual({ status: "loaded", escrow });
    expect(loadRaidEscrowState({ getItem: () => null })).toEqual({ status: "missing" });
    expect(loadRaidEscrowState({ getItem: () => { throw new Error("storage blocked"); } })).toEqual({ status: "unavailable" });
  });

  it("fails closed on malformed runtime identity and inventory fields", () => {
    const profile = createProfile();
    profile.preferredClass = "cleric";
    const malformed = settleRaid(profile, {
      reason: "winner",
      raidMode: "void",
      classId: "dragon",
      loot: null,
      equippedIds: null,
      consumedIds: "starter-blade",
      kills: 0,
      elapsed: 20,
      goldFound: 999,
    } as unknown as RaidResult);
    expect(malformed.profile).toMatchObject({ extracts: 0, deaths: 1, preferredClass: "cleric", gold: 75 });
    expect(malformed.profile.raidHistory[0]).toMatchObject({ classId: "cleric", raidMode: "standard", reason: "abandoned" });
    expect(malformed.banked).toEqual([]);
    expect(malformed.lost).toEqual([]);
  });

  it("bounds and normalizes a runtime loot ledger before settlement or display", () => {
    const profile = createProfile();
    const claims = Array.from({ length: MAX_RAID_LOOT_ITEMS + 2_000 }, (_, index) => ({
      id: `claim-${index}`,
      name: `Recovered claim ${index}`,
      kind: "weapon" as const,
      rarity: "Common" as const,
      power: 4,
      value: 10,
    }));
    const verdict = normalizeRaidResult(profile, {
      reason: "extracted",
      raidMode: "standard",
      depthReached: 2,
      classId: "vanguard",
      loot: claims,
      equippedIds: [],
      kills: 0,
      elapsed: Number.POSITIVE_INFINITY,
      goldFound: MAX_GOLD,
      bossKilled: true,
    });
    expect(verdict.loot).toHaveLength(8);
    expect(verdict.loot.at(-1)?.id).toBe("claim-7");
    expect(verdict.depthReached).toBe(1);
    expect(verdict.elapsed).toBe(0);
    expect(verdict.goldFound).toBe(0);
    const settlement = settleRaid(profile, verdict);
    expect(settlement.banked).toHaveLength(8);
    expect(settlement.overflow).toEqual([]);

    const deepestValidHaul = normalizeRaidResult(profile, {
      ...verdict,
      loot: [
        ...claims.slice(0, 8),
        ...Array.from({ length: 4 }, (_, index) => ({ ...claims[0]!, id: `sigil-${index}`, name: "Warden sigil", kind: "sigil" as const })),
      ],
    });
    expect(deepestValidHaul.loot).toHaveLength(MAX_RAID_LOOT_ITEMS);
  });

  it("banks unsecured loot and gold only after extraction", () => {
    const profile = createProfile();
    const loot = { ...createLoot(() => 0.8), kind: "treasure" as const, value: 60 };
    const result = applyRaidResult(profile, {
      reason: "extracted",
      classId: "hexbound",
      loot: [loot],
      equippedIds: ["starter-jack"],
      kills: 3,
      elapsed: 108,
      goldFound: 21,
    });
    expect(result.extracts).toBe(1);
    expect(result.gold).toBe(196);
    expect(result.xp.hexbound).toBe(275);
    expect(result.stash.some((item) => item.id === loot.id)).toBe(true);
    expect(result.stash.some((item) => item.id === "starter-jack")).toBe(true);
  });

  it("sanitizes a corrupted persisted profile", () => {
    const result = normalizeProfile({ gold: Number.POSITIVE_INFINITY, xp: { vanguard: Number.NaN }, stash: [{ name: "broken" }], extracts: Number.POSITIVE_INFINITY, preferredClass: "dragon" });
    expect(result.gold).toBe(0);
    expect(result.xp.vanguard).toBe(0);
    expect(result.stash).toEqual([]);
    expect(result.extracts).toBe(0);
    expect(result.highTollExtracts).toBe(0);
    expect(result.ashenExtracts).toBe(0);
    expect(result.version).toBe(15);
    expect(result.xp.reaver).toBe(0);
    expect(result.xp.ranger).toBe(0);
    expect(result.xp.cleric).toBe(0);
    expect(result.xp.shapeshifter).toBe(0);
    expect(result.xp.minstrel).toBe(0);
    expect(result.threatKills).toEqual({ skeleton: 0, crawler: 0, mimic: 0, warden: 0, rival: 0, boss: 0 });
    expect(result.boneBountyPaid).toBe(false);
    expect(result.rivalBountyPaid).toBe(false);
    expect(result.streakBountyPaid).toBe(false);
    expect(result.quietKnivesPaid).toBe(false);
    expect(result.lastCommissionDay).toBe("");
    expect(result.lastSettledRaidStartedAt).toBe(0);
    expect(result.preferredClass).toBe("vanguard");
    expect(result.raidHistory).toEqual([]);
  });

  it("quarantines an unreadable stored profile before showing a starter", () => {
    const values = new Map<string, string>([["darkpix-profile-v1", "{broken-json"]]);
    const loaded = loadProfileState({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
    });
    expect(loaded.status).toBe("corrupt");
    expect(loaded.recovery).toBe("{broken-json");
    expect(loaded.profile).toEqual(createProfile());
    expect([...values.values()]).toContain("{broken-json");
  });

  it("preserves a future stored schema instead of downgrading it", () => {
    const future = { ...createProfile(), version: 16, futureLedger: { unknown: true } };
    const serialized = JSON.stringify(future);
    const values = new Map<string, string>([["darkpix-profile-v1", serialized]]);
    const loaded = loadProfileState({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
    });
    expect(loaded.status).toBe("incompatible");
    expect(loaded.profile.version).toBe(15);
    expect(JSON.parse(loaded.recovery ?? "{}")).toMatchObject({ version: 16, futureLedger: { unknown: true } });
    expect(values.get("darkpix-profile-recovery-v1")).toBe(serialized);
  });

  it("distinguishes a missing profile from unavailable storage", () => {
    const missing = loadProfileState({ getItem: () => null, setItem: () => undefined });
    const unavailable = loadProfileState({
      getItem: () => { throw new Error("storage blocked"); },
      setItem: () => undefined,
    });
    expect(missing.status).toBe("missing");
    expect(unavailable.status).toBe("unavailable");
  });

  it("retains even an empty damaged profile as recovery evidence", () => {
    const values = new Map<string, string>([["darkpix-profile-v1", ""]]);
    const loaded = loadProfileState({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
    });
    expect(loaded.status).toBe("corrupt");
    expect(loaded.recovery).toBe("");
  });

  it("migrates pre-Shapeshifter profiles without changing established progression", () => {
    const legacy = createProfile() as unknown as Record<string, unknown>;
    legacy.version = 7;
    legacy.xp = { vanguard: 700, cutpurse: 350, hexbound: 0, reaver: 0, ranger: 0, cleric: 0 };
    const migrated = normalizeProfile(legacy);
    expect(migrated.version).toBe(15);
    expect(migrated.xp.vanguard).toBe(700);
    expect(migrated.xp.cutpurse).toBe(350);
    expect(migrated.xp.shapeshifter).toBe(0);
    expect(migrated.xp.minstrel).toBe(0);
  });

  it("migrates pre-bestiary profiles with empty bounded ledgers", () => {
    const legacy = { ...createProfile(), version: 8, threatKills: undefined, boneBountyPaid: undefined, rivalBountyPaid: undefined };
    const migrated = normalizeProfile(legacy);
    expect(migrated.version).toBe(15);
    expect(migrated.threatKills).toEqual({ skeleton: 0, crawler: 0, mimic: 0, warden: 0, rival: 0, boss: 0 });
    expect(migrated.boneBountyPaid).toBe(false);
    expect(migrated.rivalBountyPaid).toBe(false);
    expect(migrated.streakBountyPaid).toBe(false);
    expect(migrated.raidHistory).toEqual([]);
  });

  it("migrates version 11 profiles into the unpaid survival oath", () => {
    const legacy = { ...createProfile(), version: 11, streakBountyPaid: undefined };
    legacy.raidHistory = [{ completedAt: 1, classId: "vanguard", raidMode: "standard", reason: "extracted", depthReached: 1, kills: 0, elapsed: 40, goldDelta: 10, xpDelta: 170, gearLost: 0, bossKilled: false }];
    const migrated = normalizeProfile(legacy);
    expect(migrated.version).toBe(15);
    expect(migrated.streakBountyPaid).toBe(false);
    expect(migrated.raidHistory).toHaveLength(1);
  });

  it("migrates version 12 profiles into an unclaimed daily commission", () => {
    const legacy = { ...createProfile(), version: 12, lastCommissionDay: undefined };
    const migrated = normalizeProfile(legacy);
    expect(migrated.version).toBe(15);
    expect(migrated.lastCommissionDay).toBe("");
  });

  it("migrates version 13 profiles into an unpaid Quiet Knives contract", () => {
    const legacy = { ...createProfile(), version: 13, quietKnivesPaid: undefined };
    const migrated = normalizeProfile(legacy);
    expect(migrated.version).toBe(15);
    expect(migrated.quietKnivesPaid).toBe(false);
  });

  it("recognizes every raid journal at or below the durable settlement high-water mark", () => {
    const profile = createProfile();
    const escrow = createRaidEscrow("vanguard", "standard", [], 1_700_000_000_000);
    expect(raidEscrowAlreadySettled(profile, escrow)).toBe(false);
    profile.lastSettledRaidStartedAt = escrow.startedAt;
    expect(raidEscrowAlreadySettled(profile, escrow)).toBe(true);
    expect(raidEscrowAlreadySettled(profile, { ...escrow, startedAt: escrow.startedAt - 1 })).toBe(true);
    expect(raidEscrowAlreadySettled(profile, { ...escrow, startedAt: escrow.startedAt + 1 })).toBe(false);
    expect(raidEscrowAlreadySettled(profile, { ...escrow, startedAt: 0 })).toBe(false);
  });

  it("protects a recently heartbeating raid journal from other page owners", () => {
    const now = 1_700_000_000_000;
    const escrow = createRaidEscrow("vanguard", "standard", [], now, 1, 0, 75, {}, 0, 0, "page-a", now - 1_000);
    expect(escrow).toMatchObject({ ownerId: "page-a", heartbeatAt: now - 1_000 });
    expect(normalizeRaidEscrow(escrow)).toMatchObject({ ownerId: "page-a", heartbeatAt: now - 1_000 });
    expect(raidEscrowLeaseHeldByOther(escrow, "page-b", now)).toBe(true);
    expect(raidEscrowLeaseHeldByOther(escrow, "page-a", now)).toBe(false);
    expect(raidEscrowLeaseHeldByOther(escrow, "page-b", now + RAID_ESCROW_LEASE_MS)).toBe(false);
    expect(raidEscrowLeaseHeldByOther({ ownerId: undefined, heartbeatAt: undefined }, "page-b", now)).toBe(false);
    expect(raidEscrowLeaseHeldByOther({ ownerId: "page-a", heartbeatAt: now + 1_000 }, "page-b", now)).toBe(true);
    expect(raidEscrowLeaseHeldByOther({ ownerId: "page-a", heartbeatAt: now + RAID_ESCROW_LEASE_MS }, "page-b", now)).toBe(false);
    expect(raidEscrowLeaseHeldByOther({ ownerId: "page-a", heartbeatAt: now + 86_400_000 }, "page-b", now)).toBe(false);
  });

  it("allocates a raid marker distinct from the last settled journal in the same millisecond", () => {
    expect(nextRaidStartedAt(1_700_000_000_000, 1_700_000_000_000)).toBe(1_700_000_000_001);
    expect(nextRaidStartedAt(1_700_000_000_100, 1_700_000_000_000)).toBe(1_700_000_000_100);
    expect(nextRaidStartedAt(1_699_999_999_999, 1_700_000_000_000)).toBe(1_700_000_000_001);
    expect(nextRaidStartedAt(Number.NaN, 0)).toBe(1);
    expect(nextRaidStartedAt(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER - 1)).toBe(Number.MAX_SAFE_INTEGER);
    expect(nextRaidStartedAt(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)).toBeUndefined();
    expect(nextRaidStartedAt(1_700_000_000_000, 1_700_000_300_001)).toBeUndefined();
  });

  it("records a bounded newest-first contract journal", () => {
    let profile = createProfile();
    for (let index = 0; index < RAID_HISTORY_LIMIT + 2; index += 1) {
      profile = settleRaid(profile, {
        reason: index % 2 === 0 ? "extracted" : "slain",
        raidMode: index === 11 ? "high_toll" : "standard",
        depthReached: index === 11 ? 2 : 1,
        classId: "ranger",
        loot: [],
        equippedIds: [],
        kills: index,
        killsByKind: index === 11 ? { boss: 1 } : undefined,
        elapsed: 60 + index,
        goldFound: index,
        bossKilled: index === 11,
        variationSeed: index % 32,
        finishedAt: 1_000 + index,
      }).profile;
    }
    expect(profile.raidHistory).toHaveLength(RAID_HISTORY_LIMIT);
    expect(profile.raidHistory[0]).toMatchObject({ completedAt: 1_011, raidMode: "high_toll", depthReached: 2, kills: 11, bossKilled: true, variationSeed: 11 });
    expect(profile.raidHistory.at(-1)?.completedAt).toBe(1_002);
    expect(profile.raidHistory.some((entry) => entry.completedAt === 1_000)).toBe(false);
  });

  it("derives lifetime and recent contract records without duplicating save state", () => {
    const profile = createProfile();
    profile.extracts = 7;
    profile.deaths = 3;
    profile.raidHistory = [
      { completedAt: 4, classId: "ranger", raidMode: "standard", reason: "extracted", depthReached: 1, kills: 3, elapsed: 60, goldDelta: 44, xpDelta: 1, gearLost: 0, bossKilled: false },
      { completedAt: 3, classId: "ranger", raidMode: "standard", reason: "extracted", depthReached: 1, kills: 2, elapsed: 70, goldDelta: 91, xpDelta: 1, gearLost: 0, bossKilled: false },
      { completedAt: 2, classId: "ranger", raidMode: "standard", reason: "slain", depthReached: 1, kills: 1, elapsed: 80, goldDelta: 0, xpDelta: 1, gearLost: 1, bossKilled: false },
      { completedAt: 1, classId: "ranger", raidMode: "standard", reason: "extracted", depthReached: 1, kills: 4, elapsed: 90, goldDelta: 60, xpDelta: 1, gearLost: 0, bossKilled: false },
    ];
    expect(contractRecordSummary(profile)).toEqual({ totalContracts: 10, extractionRate: 70, currentExtractStreak: 2, recentBestGold: 91 });
    expect(contractRecordSummary(createProfile())).toEqual({ totalContracts: 0, extractionRate: 0, currentExtractStreak: 0, recentBestGold: 0 });
  });

  it("sanitizes malformed contract journal entries and signed XP", () => {
    const valid = {
      completedAt: 123,
      classId: "vanguard",
      raidMode: "iron_soul",
      reason: "slain",
      depthReached: 2,
      kills: 5,
      elapsed: 300,
      goldDelta: 0,
      xpDelta: -700,
      gearLost: 2,
      bossKilled: true,
      unseenStrikes: 0,
      variationSeed: 31,
    };
    const profile = normalizeProfile({ ...createProfile(), raidHistory: [{ ...valid }, { ...valid, classId: "dragon" }, null] });
    expect(profile.raidHistory).toEqual([valid]);
  });

  it("rejects non-finite items and deduplicates persisted stash IDs", () => {
    const valid = createProfile().stash[0]!;
    const result = normalizeProfile({
      stash: [valid, { ...valid }, { ...valid, id: "infinite", value: Number.POSITIVE_INFINITY }, { ...valid, id: "negative", power: -1 }],
    });
    expect(result.stash).toHaveLength(1);
    expect(result.stash[0]?.id).toBe(valid.id);
  });

  it("caps finite save values before they reach combat or the economy", () => {
    const valid = createProfile().stash[0]!;
    const result = normalizeProfile({
      gold: Number.MAX_SAFE_INTEGER,
      xp: { reaver: Number.MAX_SAFE_INTEGER },
      stash: [{ ...valid, id: "oversized", power: 1_000_000, value: 1_000_000_000 }],
    });
    expect(result.gold).toBe(MAX_GOLD);
    expect(result.xp.reaver).toBeLessThan(Number.MAX_SAFE_INTEGER);
    expect(result.stash[0]).toMatchObject({ power: MAX_ITEM_POWER, value: MAX_ITEM_VALUE });
  });

  it("saturates stash sales without deleting an item at the gold limit", () => {
    const profile = createProfile();
    profile.gold = MAX_GOLD;
    const blocked = sellStashItem(profile, "starter-blade");
    expect(blocked.proceeds).toBe(0);
    expect(blocked.sold).toBeUndefined();
    expect(blocked.profile.stash.some((item) => item.id === "starter-blade")).toBe(true);

    profile.gold = MAX_GOLD - 2;
    const partial = sellStashItem(profile, "starter-blade");
    expect(partial.proceeds).toBe(2);
    expect(partial.profile.gold).toBe(MAX_GOLD);
    expect(partial.profile.stash.some((item) => item.id === "starter-blade")).toBe(false);
  });

  it("pays the first extraction contract once", () => {
    const result = {
      reason: "extracted" as const,
      classId: "vanguard" as const,
      loot: [],
      equippedIds: [],
      kills: 0,
      elapsed: 40,
      goldFound: 10,
    };
    const first = applyRaidResult(createProfile(), result);
    const second = applyRaidResult(first, result);
    expect(first.gold).toBe(175);
    expect(second.gold).toBe(175);
  });

  it("pays the three-return bounty once and lets any failure break the chain", () => {
    const extraction = {
      reason: "extracted" as const,
      classId: "vanguard" as const,
      loot: [],
      equippedIds: [],
      kills: 0,
      elapsed: 40,
      goldFound: 0,
    };
    const first = settleRaid(createProfile(), extraction);
    const second = settleRaid(first.profile, extraction);
    const third = settleRaid(second.profile, extraction);
    expect(first.streakBountyPaid).toBe(false);
    expect(second.streakBountyPaid).toBe(false);
    expect(third.streakBountyPaid).toBe(true);
    expect(third.goldGained).toBe(300);
    expect(third.profile.streakBountyPaid).toBe(true);
    expect(settleRaid(third.profile, extraction).streakBountyPaid).toBe(false);

    const broken = settleRaid(second.profile, { ...extraction, reason: "slain" });
    const restarted = settleRaid(broken.profile, extraction);
    expect(contractRecordSummary(broken.profile).currentExtractStreak).toBe(0);
    expect(restarted.streakBountyPaid).toBe(false);
    expect(contractRecordSummary(restarted.profile).currentExtractStreak).toBe(1);
  });

  it("pays Quiet Knives once for three unseen marks followed by extraction", () => {
    const profile = createProfile();
    profile.extracts = 1;
    const result = {
      reason: "extracted" as const,
      raidMode: "standard" as const,
      depthReached: 1 as const,
      classId: "cutpurse" as const,
      loot: [],
      equippedIds: [],
      kills: 0,
      elapsed: 90,
      goldFound: 0,
      unseenStrikes: 3,
    };
    const first = settleRaid(profile, result);
    expect(first.quietKnivesPaid).toBe(true);
    expect(first.goldGained).toBe(140);
    expect(first.profile.quietKnivesPaid).toBe(true);
    expect(first.profile.raidHistory[0]?.unseenStrikes).toBe(3);
    const repeated = settleRaid(first.profile, result);
    expect(repeated.quietKnivesPaid).toBe(false);
    expect(repeated.goldGained).toBe(0);
    const failed = settleRaid(profile, { ...result, reason: "slain" });
    expect(failed.quietKnivesPaid).toBe(false);
    expect(failed.profile.quietKnivesPaid).toBe(false);
  });

  it("persists bounded bestiary kills and pays guild bounties only on extraction", () => {
    const profile = createProfile();
    profile.extracts = 1;
    const failed = settleRaid(profile, {
      reason: "slain", classId: "vanguard", loot: [], equippedIds: [], kills: 12, killsByKind: { skeleton: 9, warden: 3 }, elapsed: 80, goldFound: 0,
    });
    expect(failed.profile.threatKills).toMatchObject({ skeleton: 9, warden: 3 });
    expect(failed.profile.boneBountyPaid).toBe(false);
    expect(failed.goldGained).toBe(0);

    const claimed = settleRaid(failed.profile, {
      reason: "extracted", classId: "vanguard", loot: [], equippedIds: [], kills: 0, elapsed: 40, goldFound: 0,
    });
    expect(claimed.boneBountyPaid).toBe(true);
    expect(claimed.profile.boneBountyPaid).toBe(true);
    expect(claimed.goldGained).toBe(175);
    const repeated = settleRaid(claimed.profile, {
      reason: "extracted", classId: "vanguard", loot: [], equippedIds: [], kills: 0, elapsed: 40, goldFound: 0,
    });
    expect(repeated.boneBountyPaid).toBe(false);
    expect(repeated.goldGained).toBe(0);

    const rivalProfile = createProfile();
    rivalProfile.extracts = 1;
    const rivals = settleRaid(rivalProfile, {
      reason: "extracted", classId: "cutpurse", loot: [], equippedIds: [], kills: 3, killsByKind: { rival: 3 }, elapsed: 90, goldFound: 0,
    });
    expect(rivals.rivalBountyPaid).toBe(true);
    expect(rivals.profile.threatKills.rival).toBe(3);
    expect(rivals.goldGained).toBe(225);
  });

  it("never credits more typed kills than the raid total", () => {
    const result = settleRaid(createProfile(), {
      reason: "slain", classId: "vanguard", loot: [], equippedIds: [], kills: 1, killsByKind: { skeleton: 999, rival: 999 }, elapsed: 20, goldFound: 0,
    });
    expect(result.profile.threatKills.skeleton).toBe(1);
    expect(result.profile.threatKills.rival).toBe(0);
    expect(raidThreatKillLedger({ kills: 1, killsByKind: { skeleton: 999, rival: 999 } })).toEqual({
      total: 1,
      byKind: { skeleton: 1, crawler: 0, mimic: 0, warden: 0, rival: 0, boss: 0 },
    });
    expect(raidThreatKillLedger({ kills: Number.NaN, killsByKind: { boss: 9 } }).total).toBe(0);
  });

  it("pays the first extracted Tollkeeper victory once and never on death", () => {
    const victory = {
      reason: "extracted" as const,
      classId: "vanguard" as const,
      loot: [],
      equippedIds: [],
      kills: 1,
      killsByKind: { boss: 1 },
      elapsed: 60,
      goldFound: 0,
      bossKilled: true,
    };
    const first = settleRaid(createProfile(), victory);
    expect(first.bossContractPaid).toBe(true);
    expect(first.profile.bossVictories).toBe(1);
    expect(first.goldGained).toBe(250);
    const second = settleRaid(first.profile, victory);
    expect(second.bossContractPaid).toBe(false);
    expect(second.goldGained).toBe(0);
    const failed = settleRaid(createProfile(), { ...victory, reason: "slain" });
    expect(failed.profile.bossVictories).toBe(0);
    expect(failed.goldGained).toBe(0);
  });

  it("requires typed boss evidence for boss and Ashen claims", () => {
    const profile = createProfile();
    profile.extracts = 1;
    const forged = settleRaid(profile, {
      reason: "extracted", depthReached: 2, classId: "vanguard", loot: [], equippedIds: [], kills: 1,
      killsByKind: { skeleton: 1 }, elapsed: 180, goldFound: 0, bossKilled: true,
    });
    expect(forged.bossContractPaid).toBe(false);
    expect(forged.ashenContractPaid).toBe(false);
    expect(forged.profile).toMatchObject({ bossVictories: 0, ashenExtracts: 0 });
    expect(forged.profile.raidHistory[0]).toMatchObject({ depthReached: 1, bossKilled: false });
  });

  it("awards the High Toll XP multiplier without changing death persistence", () => {
    const standard = settleRaid(createProfile(), {
      reason: "slain", classId: "vanguard", loot: [], equippedIds: [], kills: 2, elapsed: 30, goldFound: 0,
    });
    const highToll = settleRaid(createProfile(), {
      reason: "slain", raidMode: "high_toll", classId: "vanguard", loot: [], equippedIds: [], kills: 2, elapsed: 30, goldFound: 0,
    });
    expect(standard.xpGained).toBe(100);
    expect(highToll.xpGained).toBe(135);
    expect(highToll.profile.deaths).toBe(1);
  });

  it("itemizes raid XP before applying contract stakes", () => {
    expect(raidXpBreakdown({
      reason: "extracted", raidMode: "high_toll", depthReached: 2, classId: "vanguard", loot: [], equippedIds: [], kills: 2, elapsed: 180, goldFound: 0,
    })).toEqual({ presence: 30, kills: 70, extraction: 140, depth: 180, subtotal: 420, multiplier: 1.35, total: 567, forfeited: false });
    expect(raidXpBreakdown({
      reason: "slain", raidMode: "iron_soul", depthReached: 2, classId: "vanguard", loot: [], equippedIds: [], kills: 2, elapsed: 180, goldFound: 0,
    })).toMatchObject({ presence: 30, kills: 70, extraction: 0, depth: 60, subtotal: 160, multiplier: 1.75, total: 0, forfeited: true });
    expect(raidXpBreakdown({
      reason: "abandoned", classId: "vanguard", loot: [], equippedIds: [], kills: Number.NaN, elapsed: 0, goldFound: 0,
    })).toMatchObject({ presence: 0, kills: 0, total: 0 });
  });

  it("records red-depth veterancy on both escape and death", () => {
    const base = { classId: "vanguard" as const, loot: [], equippedIds: [], kills: 1, killsByKind: { boss: 1 }, bossKilled: true, elapsed: 220, goldFound: 0, depthReached: 2 as const };
    const escaped = settleRaid(createProfile(), { ...base, reason: "extracted" });
    const fallen = settleRaid(createProfile(), { ...base, reason: "slain" });
    expect(escaped.xpGained).toBe(385);
    expect(fallen.xpGained).toBe(125);
  });

  it("pays the first successful High Toll contract once and never for standard or failed raids", () => {
    const result = {
      reason: "extracted" as const,
      raidMode: "high_toll" as const,
      classId: "vanguard" as const,
      loot: [], equippedIds: [], kills: 0, elapsed: 90, goldFound: 0,
    };
    const first = settleRaid(createProfile(), result);
    expect(first.highTollContractPaid).toBe(true);
    expect(first.profile.highTollExtracts).toBe(1);
    expect(first.goldGained).toBe(300);
    const second = settleRaid(first.profile, result);
    expect(second.highTollContractPaid).toBe(false);
    expect(second.goldGained).toBe(0);
    expect(settleRaid(createProfile(), { ...result, raidMode: "standard" }).profile.highTollExtracts).toBe(0);
    expect(settleRaid(createProfile(), { ...result, reason: "slain" }).profile.highTollExtracts).toBe(0);
  });

  it("records and pays the first successful Ashen Depth return only once", () => {
    const profile = createProfile();
    profile.extracts = 1;
    profile.bossVictories = 1;
    const result = {
      reason: "extracted" as const,
      raidMode: "standard" as const,
      depthReached: 2 as const,
      classId: "ranger" as const,
      loot: [],
      equippedIds: [],
      kills: 1,
      killsByKind: { boss: 1 },
      elapsed: 180,
      goldFound: 0,
      bossKilled: true,
    };
    const first = settleRaid(profile, result);
    const second = settleRaid(first.profile, result);
    expect(first.ashenContractPaid).toBe(true);
    expect(first.profile.ashenExtracts).toBe(1);
    expect(first.goldGained).toBe(250);
    expect(second.ashenContractPaid).toBe(false);
    expect(second.profile.ashenExtracts).toBe(2);
    expect(second.goldGained).toBe(0);
    expect(settleRaid(profile, { ...result, reason: "slain" }).profile.ashenExtracts).toBe(0);
    expect(settleRaid(profile, { ...result, depthReached: 1 }).profile.ashenExtracts).toBe(0);
  });

  it("keeps a full stash intact and liquidates extraction overflow", () => {
    const profile = createProfile();
    const template = profile.stash[0]!;
    profile.stash = Array.from({ length: 24 }, (_, index) => ({ ...template, id: `kept-${index}` }));
    const overflow = { ...createLoot(() => 0.6), id: "overflow", value: 31 };
    const result = applyRaidResult(profile, {
      reason: "extracted",
      classId: "vanguard",
      loot: [overflow],
      equippedIds: [],
      kills: 0,
      elapsed: 40,
      goldFound: 0,
    });
    expect(result.stash).toHaveLength(24);
    expect(result.stash.every((item) => item.id.startsWith("kept-"))).toBe(true);
    expect(result.gold).toBe(200);
  });

  it("banks into a slot freed by a consumed packed item before calculating overflow", () => {
    const profile = createProfile();
    const template = profile.stash[0]!;
    profile.stash = Array.from({ length: 23 }, (_, index) => ({ ...template, id: `kept-${index}` }));
    profile.stash.push({ ...template, id: "consumed-draught", kind: "consumable" });
    const recovered = { ...createLoot(() => 0.6), id: "recovered" };
    const settlement = settleRaid(profile, {
      reason: "extracted",
      classId: "vanguard",
      loot: [recovered],
      equippedIds: ["consumed-draught"],
      consumedIds: ["consumed-draught"],
      kills: 0,
      elapsed: 40,
      goldFound: 0,
    });
    expect(settlement.banked.map((item) => item.id)).toEqual(["recovered"]);
    expect(settlement.overflow).toEqual([]);
    expect(settlement.profile.stash).toHaveLength(24);
    expect(settlement.goldGained).toBe(123);
  });

  it("does not duplicate loot IDs or trust a claimed result reward", () => {
    const profile = createProfile();
    const duplicate = { ...profile.stash[0]! };
    const result = applyRaidResult(profile, {
      reason: "extracted",
      classId: "vanguard",
      loot: [duplicate],
      equippedIds: [],
      kills: -20,
      elapsed: 0,
      goldFound: MAX_GOLD,
    });
    expect(result.stash.filter((item) => item.id === duplicate.id)).toHaveLength(1);
    expect(result.gold).toBe(175);
    expect(result.xp.vanguard).toBe(170);
  });

  it("buys merchant stock only when gold and stash space permit", () => {
    const profile = createProfile();
    const item = { ...profile.stash[0]!, id: "merchant-test" };
    const purchase = purchaseItem(profile, item, 46);
    expect(purchase.outcome).toBe("purchased");
    expect(purchase.profile.gold).toBe(29);
    expect(purchase.profile.stash.some((entry) => entry.id === item.id)).toBe(true);
    expect(purchaseItem(purchase.profile, { ...item, id: "too-costly" }, 999).outcome).toBe("insufficient_gold");
    expect(purchaseItem(profile, { ...item, id: "nan-price" }, Number.NaN).outcome).toBe("invalid_offer");
    expect(purchaseItem(profile, { ...item, id: profile.stash[0]!.id }, 1).outcome).toBe("invalid_offer");
  });

  it("removes packed consumables after they are used in a successful raid", () => {
    const profile = createProfile();
    const potion = { ...profile.stash[0]!, id: "packed-potion", kind: "consumable" as const };
    profile.stash.push(potion);
    const result = applyRaidResult(profile, {
      reason: "extracted",
      classId: "vanguard",
      loot: [],
      equippedIds: [potion.id],
      consumedIds: ["not-packed-one", "not-packed-two", potion.id],
      kills: 0,
      elapsed: 40,
      goldFound: 0,
    });
    expect(result.stash.some((item) => item.id === potion.id)).toBe(false);
  });

  it("refuses to consume a stash item that was not in the packed set", () => {
    const profile = createProfile();
    const potion = { ...profile.stash[0]!, id: "packed-potion", kind: "consumable" as const };
    profile.stash.push(potion);
    const result = applyRaidResult(profile, {
      reason: "extracted",
      classId: "vanguard",
      loot: [],
      equippedIds: [potion.id],
      consumedIds: ["starter-jack"],
      kills: 0,
      elapsed: 40,
      goldFound: 0,
    });
    expect(result.stash.some((item) => item.id === "starter-jack")).toBe(true);
    expect(result.stash.some((item) => item.id === potion.id)).toBe(true);
  });
});

describe("display helpers", () => {
  it("formats raid time and persistent levels", () => {
    expect(formatTime(209.9)).toBe("3:29");
    expect(formatTime(-3)).toBe("0:00");
    expect(levelForXp(699)).toBe(2);
    expect(levelForXp(700)).toBe(3);
    expect(progressionBonuses(1)).toEqual({ health: 0, damage: 0 });
    expect(progressionBonuses(4)).toEqual({ health: 12, damage: 1 });
    expect(progressionBonuses(99)).toEqual({ health: 24, damage: 3 });
  });
});

describe("local game preferences", () => {
  it("adopts system accessibility signals only for a first run", () => {
    expect(firstRunPreferences({ reducedMotion: true, highContrast: true })).toMatchObject({
      reducedMotion: true,
      reducedFlashes: true,
      highContrastHud: true,
    });
    expect(firstRunPreferences()).toEqual(DEFAULT_PREFERENCES);
    expect(normalizePreferences({ reducedMotion: false, reducedFlashes: false, highContrastHud: false })).toMatchObject({
      reducedMotion: false,
      reducedFlashes: false,
      highContrastHud: false,
    });
  });

  it("clamps numeric settings and rejects malformed toggles", () => {
    expect(normalizePreferences({ mouseSensitivity: 20, brightness: 0, fieldOfView: 120, crosshairScale: 5, volume: -5, muted: "yes", reducedMotion: true, reducedFlashes: true, highContrastHud: true, invertY: true })).toEqual({
      mouseSensitivity: 2,
      brightness: 0.75,
      fieldOfView: 95,
      crosshairScale: 1.75,
      volume: 0,
      muted: false,
      reducedMotion: true,
      reducedFlashes: true,
      highContrastHud: true,
      invertY: true,
      stashSort: "recent",
    });
    expect(normalizePreferences({ stashSort: "value" }).stashSort).toBe("value");
    expect(normalizePreferences({ fieldOfView: 40 }).fieldOfView).toBe(60);
    expect(normalizePreferences({ volume: 4 }).volume).toBe(1);
    expect(normalizePreferences({ crosshairScale: 0 }).crosshairScale).toBe(0.75);
    expect(normalizePreferences({ stashSort: "unknown" }).stashSort).toBe("recent");
    expect(normalizePreferences({ invertY: "yes" }).invertY).toBe(false);
    expect(normalizePreferences({ reducedFlashes: "yes", highContrastHud: 1 })).toMatchObject({ reducedFlashes: false, highContrastHud: false });
    expect(normalizePreferences(null)).toEqual(DEFAULT_PREFERENCES);
  });
});

describe("directional combat damage", () => {
  it("stacks equipment, veterancy, direction, ambush, and headshot modifiers deterministically", () => {
    expect(attackDamage({ baseDamage: 20, weaponPower: 5, progressionBonus: 2, direction: "SWEEP", ambush: false, headshot: false })).toBe(27);
    expect(attackDamage({ baseDamage: 20, weaponPower: 5, progressionBonus: 2, direction: "OVERHEAD", ambush: false, headshot: false })).toBe(32);
    expect(attackDamage({ baseDamage: 20, weaponPower: 5, progressionBonus: 2, direction: "THRUST", ambush: true, headshot: true })).toBe(79);
  });

  it("fails malformed damage components closed instead of poisoning threat vigor", () => {
    expect(safeDamageAmount(Number.NaN)).toBe(0);
    expect(safeDamageAmount(-5)).toBe(0);
    expect(safeDamageAmount(Number.POSITIVE_INFINITY)).toBe(0);
    expect(attackDamage({ baseDamage: 20, weaponPower: Number.NaN, progressionBonus: 2, direction: "THRUST", ambush: false, headshot: false })).toBe(24);
    expect(attackDamage({ baseDamage: Number.NaN, weaponPower: Number.NaN, progressionBonus: Number.NaN, direction: "OVERHEAD", ambush: true, headshot: true })).toBe(0);
  });

  it("makes limb strikes weaker than body hits without overriding headshots", () => {
    const body = attackDamage({ baseDamage: 20, weaponPower: 0, progressionBonus: 0, direction: "SWEEP", ambush: false, headshot: false });
    const limb = attackDamage({ baseDamage: 20, weaponPower: 0, progressionBonus: 0, direction: "SWEEP", ambush: false, headshot: false, limb: true });
    const head = attackDamage({ baseDamage: 20, weaponPower: 0, progressionBonus: 0, direction: "SWEEP", ambush: false, headshot: true, limb: true });
    expect(body).toBe(20);
    expect(limb).toBe(16);
    expect(head).toBe(27);
  });

  it("gives every enemy strike a readable windup and recovery", () => {
    expect(enemyAttackPattern("crawler").windup).toBeGreaterThan(0.2);
    expect(enemyAttackPattern("mimic")).toEqual({ windup: 0.32, recovery: 1.4 });
    expect(enemyAttackPattern("warden").windup).toBeGreaterThan(enemyAttackPattern("crawler").windup);
    expect(enemyAttackPattern("boss").windup).toBeGreaterThan(enemyAttackPattern("rival").windup);
    expect(enemyAttackPattern("rival")).toEqual({ windup: 0.5, recovery: 1.8 });
    expect(enemyAttackPattern("boss", true)).toEqual({ windup: 0.34, recovery: 1.2 });
    expect(enemyAttackPattern("boss", false, true)).toEqual({ windup: 0.9, recovery: 3.2 });
    expect(enemyAttackPattern("boss", true, true)).toEqual({ windup: 0.62, recovery: 2.4 });
  });

  it("locks threat strikes to their telegraphed facing", () => {
    expect(enemyStrikeFacesTarget({ x: 1, z: 0 }, { x: 4, z: 0.5 }, false)).toBe(true);
    expect(enemyStrikeFacesTarget({ x: 1, z: 0 }, { x: 0, z: 4 }, false)).toBe(false);
    expect(enemyStrikeFacesTarget({ x: 1, z: 0 }, { x: 4, z: 1.8 }, true)).toBe(false);
    expect(enemyStrikeFacesTarget(undefined, { x: 1, z: 0 }, false)).toBe(false);
    expect(enemyStrikeFacesTarget({ x: Number.NaN, z: 0 }, { x: 1, z: 0 }, false)).toBe(false);
  });

  it("explains why a committed threat strike missed", () => {
    expect(enemyStrikeMissReason(5, 4, true, true)).toBe("out_of_range");
    expect(enemyStrikeMissReason(2, 4, false, true)).toBe("cover");
    expect(enemyStrikeMissReason(2, 4, true, false)).toBe("evaded");
    expect(enemyStrikeMissReason(2, 4, true, true)).toBeUndefined();
    expect(enemyStrikeMissReason(Number.NaN, 4, true, true)).toBe("out_of_range");
  });

  it("gives the rival distinct ranged, retreat, and cornered tactics", () => {
    expect(rivalTactic(8, true)).toBe("approach");
    expect(rivalTactic(4, false)).toBe("approach");
    expect(rivalTactic(6.5, true)).toBe("throw");
    expect(rivalTactic(3.1, true)).toBe("throw");
    expect(rivalTactic(3.09, true)).toBe("retreat");
    expect(rivalTactic(1.76, true)).toBe("retreat");
    expect(rivalTactic(1.75, true)).toBe("melee");
    expect(rivalTactic(Number.NaN, true)).toBe("approach");
  });

  it("makes the rival marauder commit to melee instead of kiting", () => {
    expect(rivalTactic(6, true, "marauder")).toBe("approach");
    expect(rivalTactic(3, true, "marauder")).toBe("approach");
    expect(rivalTactic(1.9, true, "marauder")).toBe("melee");
    expect(rivalTactic(1, false, "marauder")).toBe("approach");
  });

  it("lets unengaged rivals clash with nearby crypt threats but not bosses", () => {
    expect(rivalDungeonTactic("skeleton", 4, true)).toBe("approach");
    expect(rivalDungeonTactic("warden", 1.8, true)).toBe("clash");
    expect(rivalDungeonTactic("boss", 1.8, true)).toBe("ignore");
    expect(rivalDungeonTactic("crawler", 2, false)).toBe("ignore");
    expect(dungeonCrossfireDamage(20, "skeleton")).toBe(13);
    expect(dungeonCrossfireDamage(20, "warden")).toBe(11);
    expect(dungeonCrossfireDamage(20, "rival")).toBe(14);
    expect(dungeonCrossfireDamage(20, "boss")).toBe(0);
  });

  it("makes the Tollkeeper telegraph chain lashes only at counterable range", () => {
    expect(bossTactic(8, true)).toBe("approach");
    expect(bossTactic(5, false)).toBe("approach");
    expect(bossTactic(2.35, true)).toBe("melee");
    expect(bossTactic(3.39, true)).toBe("approach");
    expect(bossTactic(3.4, true)).toBe("chain");
    expect(bossTactic(2.8, true, true)).toBe("chain");
    expect(bossTactic(Number.NaN, true)).toBe("approach");
  });

  it("leaves readable safe ground inside and beyond the enraged chain ring", () => {
    expect(bossTollHits(2.44, true)).toBe(false);
    expect(bossTollHits(2.45, true)).toBe(true);
    expect(bossTollHits(6.35, true)).toBe(true);
    expect(bossTollHits(6.36, true)).toBe(false);
    expect(bossTollHits(4, false)).toBe(false);
    expect(bossTollHits(Number.NaN, true)).toBe(false);
    expect(bossTollDamage(30, false)).toBe(25);
    expect(bossTollDamage(30, true)).toBe(10);
    expect(bossTollDamage(Number.NaN, false)).toBe(0);
  });

  it("makes sustained guards cost class-tuned stamina", () => {
    expect(guardDrainPerSecond("vanguard")).toBe(7);
    expect(guardDrainPerSecond("cutpurse")).toBe(11);
    expect(guardDrainPerSecond("hexbound")).toBe(14);
    expect(guardDrainPerSecond("reaver")).toBe(11);
    expect(guardDrainPerSecond("ranger")).toBe(11);
    expect(guardDrainPerSecond("cleric")).toBe(11);
    expect(guardDrainPerSecond("shapeshifter")).toBe(11);
    expect(guardDrainPerSecond("minstrel")).toBe(11);
  });

  it("prevents guard cancellation during break, action or sidestep recovery, or exhaustion", () => {
    expect(guardDenialReason(50, 0.4, 0)).toBe("guard_broken");
    expect(guardDenialReason(50, 0, 0.3)).toBe("action_recovery");
    expect(guardDenialReason(50, 0, 0, 0.3)).toBe("sidestep_recovery");
    expect(guardDenialReason(0, 0, 0)).toBe("stamina");
    expect(guardDenialReason(Number.NaN, 0, 0)).toBe("stamina");
    expect(guardDenialReason(50, 0, 0)).toBeUndefined();
  });

  it("keeps occupied-hand actions behind one ordered recovery rule", () => {
    expect(delverActionLock(true, 1, 1, 1, 1)).toBe("guard_broken");
    expect(delverActionLock(true, 1, 1, 0, 1)).toBe("guarding");
    expect(delverActionLock(false, 1, 1, 0, 1)).toBe("action_recovery");
    expect(delverActionLock(false, 0, 1, 0, 1)).toBe("sidestep_recovery");
    expect(delverActionLock(false, 0, 0, 0, 1)).toBe("channeling");
    expect(delverActionLock(false, Number.NaN, Number.NaN, Number.NaN, Number.NaN)).toBeUndefined();
  });

  it("treats sidestep recovery as an active ritual interruption", () => {
    expect(delverRecoveryActive(0, 0, 0.4, 0, false)).toBe(true);
    expect(delverRecoveryActive(0, 0, 0, 0, true)).toBe(true);
    expect(delverRecoveryActive(Number.NaN, Number.NaN, Number.NaN, Number.NaN, false)).toBe(false);
  });

  it("resolves committed strikes near the visible middle of a bounded swing", () => {
    expect(strikeImpactDelay(0.42)).toBeCloseTo(0.21);
    expect(strikeImpactDelay(0.1)).toBe(0.08);
    expect(strikeImpactDelay(2)).toBe(0.24);
    expect(strikeImpactDelay(Number.NaN)).toBe(0.12);
  });

  it("gives depleted guards a class-tuned punish window", () => {
    expect(guardBreakDuration("vanguard")).toBe(0.7);
    expect(guardBreakDuration("cleric")).toBe(0.82);
    expect(guardBreakDuration("reaver")).toBe(0.82);
    expect(guardBreakDuration("cutpurse")).toBe(0.9);
    expect(guardBreakDuration("hexbound")).toBe(1.05);
  });

  it("keeps sidesteps short, costly, and class-weighted", () => {
    expect(dodgeStats("cutpurse")).toEqual({ distance: 1.8, stamina: 17, cooldown: 0.78 });
    expect(dodgeStats("vanguard")).toEqual({ distance: 1.3, stamina: 23, cooldown: 1.05 });
    expect(dodgeStats("reaver")).toEqual({ distance: 1.2, stamina: 24, cooldown: 1.08 });
    expect(dodgeStats("minstrel")).toEqual({ distance: 1.55, stamina: 20, cooldown: 0.9 });
  });

  it("bounds ripostes to a short melee-only counter window", () => {
    expect(RIPOSTE_DURATION_SECONDS).toBe(1.5);
    expect(riposteDamageMultiplier("vanguard", 1.5)).toBe(1.25);
    expect(riposteDamageMultiplier("minstrel", 0.01)).toBe(1.25);
    expect(riposteDamageMultiplier("ranger", 1.5)).toBe(1);
    expect(riposteDamageMultiplier("hexbound", 1.5)).toBe(1);
    expect(riposteDamageMultiplier("reaver", 0)).toBe(1);
    expect(riposteDamageMultiplier("reaver", Number.NaN)).toBe(1);
  });

  it("charges deliberate class and swing stamina costs", () => {
    expect(attackStaminaCost("cutpurse", "THRUST")).toBe(8);
    expect(attackStaminaCost("vanguard", "SWEEP")).toBe(12);
    expect(attackStaminaCost("vanguard", "OVERHEAD")).toBe(14);
    expect(attackStaminaCost("reaver", "OVERHEAD")).toBe(16);
    expect(attackStaminaCost("ranger", "OVERHEAD")).toBe(8);
    expect(attackStaminaCost("hexbound", "SWEEP")).toBe(6);
  });

  it("delays stamina recovery through attack and sidestep recovery", () => {
    expect(staminaRecoveryPerSecond(false, true)).toBe(0);
    expect(staminaRecoveryPerSecond(true, true)).toBe(0);
    expect(staminaRecoveryPerSecond(true, false)).toBe(12);
    expect(staminaRecoveryPerSecond(false, false)).toBe(19);
  });

  it("bounds Blood Rage to the Reaver's active damage window", () => {
    expect(classAbilityDamageMultiplier("reaver", 6)).toBe(1.25);
    expect(classAbilityDamageMultiplier("reaver", 0)).toBe(1);
    expect(classAbilityDamageMultiplier("reaver", Number.NaN)).toBe(1);
    expect(classAbilityDamageMultiplier("vanguard", 6)).toBe(1);
    expect(classAbilityDamageMultiplier("shapeshifter", 8)).toBe(1.3);
  });

  it("bounds Quickdraw cadence to the Ranger's active window", () => {
    expect(classAttackDelay("ranger", 0.78, 7)).toBeCloseTo(0.4524);
    expect(classAttackDelay("ranger", 0.3, 1)).toBe(0.24);
    expect(classAttackDelay("ranger", 0.78, 0)).toBe(0.78);
    expect(classAttackDelay("reaver", 0.94, 7)).toBe(0.94);
    expect(classAttackDelay("ranger", Number.NaN, 7)).toBeCloseTo(0.464);
    expect(classAttackDelay("shapeshifter", 0.75, 8)).toBeCloseTo(0.6);
    expect(classMovementMultiplier("shapeshifter", 8)).toBe(1.15);
    expect(classMovementMultiplier("shapeshifter", 0)).toBe(1);
  });

  it("blocks only threats inside the forward guard cone", () => {
    expect(guardFacesThreat({ x: 0, z: -1 }, { x: 0.2, z: -2 })).toBe(true);
    expect(guardFacesThreat({ x: 0, z: -1 }, { x: 1, z: 0 })).toBe(false);
    expect(guardFacesThreat({ x: 0, z: -1 }, { x: 0, z: 3 })).toBe(false);
    expect(guardFacesThreat({ x: 0, z: 0 }, { x: 0, z: -1 })).toBe(false);
  });

  it("accepts only one ordinary impact during the damage cooldown", () => {
    expect(damageImpactAccepted(0, false)).toBe(true);
    expect(damageImpactAccepted(-0.1, false)).toBe(true);
    expect(damageImpactAccepted(0.18, false)).toBe(false);
    expect(damageImpactAccepted(0.18, false, true)).toBe(true);
    expect(damageImpactAccepted(0, true)).toBe(false);
    expect(damageImpactAccepted(Number.NaN, false)).toBe(true);
  });

  it("clamps target vigor display percentages", () => {
    expect(healthPercent(25, 100)).toBe(25);
    expect(healthPercent(-10, 100)).toBe(0);
    expect(healthPercent(140, 100)).toBe(100);
    expect(healthPercent(5, 0)).toBe(0);
  });

  it("lets traps punish lesser threats without trivializing the keeper", () => {
    expect(trapDamageAgainstThreat(20, "skeleton")).toBe(26);
    expect(trapDamageAgainstThreat(20, "mimic")).toBe(26);
    expect(trapDamageAgainstThreat(20, "rival")).toBe(20);
    expect(trapDamageAgainstThreat(20, "boss")).toBe(11);
    expect(trapDamageAgainstThreat(Number.NaN, "skeleton")).toBe(0);
  });

  it("lets Sanctuary sear crypt threats without harming the living rival", () => {
    expect(sanctuaryDamage("skeleton")).toBe(28);
    expect(sanctuaryDamage("mimic")).toBe(28);
    expect(sanctuaryDamage("boss")).toBe(14);
    expect(sanctuaryDamage("rival")).toBe(0);
  });

  it("lets the Minstrel stagger lesser threats while the keeper only falters", () => {
    expect(minstrelStagger("skeleton")).toBe(2.1);
    expect(minstrelStagger("rival")).toBe(1.35);
    expect(minstrelStagger("boss")).toBe(0.45);
  });
});

describe("class perk milestones", () => {
  it("keeps level one neutral and unlocks class-specific bonuses", () => {
    expect(classPerkBonuses("vanguard", 1)).toEqual({
      health: 0,
      damage: 0,
      guardUpkeepMultiplier: 1,
      sprintCostMultiplier: 1,
      spellCharges: 0,
    });
    expect(classPerkBonuses("vanguard", 2).guardUpkeepMultiplier).toBe(0.8);
    expect(classPerkBonuses("cutpurse", 4)).toMatchObject({ damage: 3, sprintCostMultiplier: 0.8 });
    expect(classPerkBonuses("hexbound", 6)).toMatchObject({ health: 8, damage: 4, spellCharges: 1 });
    expect(classPerkBonuses("reaver", 6)).toMatchObject({ health: 8, damage: 4, guardUpkeepMultiplier: 0.9 });
    expect(classPerkBonuses("ranger", 6)).toMatchObject({ health: 8, damage: 4, sprintCostMultiplier: 0.9 });
    expect(classPerkBonuses("cleric", 6)).toMatchObject({ health: 8, damage: 3, guardUpkeepMultiplier: 0.9 });
    expect(classPerkBonuses("shapeshifter", 6)).toMatchObject({ health: 8, damage: 4, sprintCostMultiplier: 0.9 });
    expect(classPerkBonuses("minstrel", 6)).toMatchObject({ health: 8, damage: 3, sprintCostMultiplier: 0.9 });
  });

  it("gives every class a bounded active-skill cooldown", () => {
    expect(Object.keys(CLASS_ABILITIES).sort()).toEqual(["cleric", "cutpurse", "hexbound", "minstrel", "ranger", "reaver", "shapeshifter", "vanguard"]);
    for (const ability of Object.values(CLASS_ABILITIES)) {
      expect(ability.name.length).toBeGreaterThan(0);
      expect(ability.cooldown).toBeGreaterThanOrEqual(30);
      expect(ability.cooldown).toBeLessThanOrEqual(60);
    }
  });

  it("gives the Hexbound two bounded spell-memory choices", () => {
    expect(Object.keys(HEX_SPELLS).sort()).toEqual(["ash_bolt", "frost_hex"]);
    expect(HEX_SPELLS.ash_bolt).toMatchObject({ damageMultiplier: 1, cripples: false });
    expect(HEX_SPELLS.frost_hex.damageMultiplier).toBeGreaterThan(0.5);
    expect(HEX_SPELLS.frost_hex.damageMultiplier).toBeLessThan(1);
    expect(HEX_SPELLS.frost_hex.cripples).toBe(true);
  });
});

describe("merchant reputation", () => {
  it("keeps finite-light provisions in the unproven stock", () => {
    const bluewax = MERCHANT_OFFERS.find((offer) => offer.sku === "bluewax")!;
    expect(bluewax).toMatchObject({ price: 20, requiredExtracts: 0, item: { name: "Bluewax candle", kind: "consumable" } });
    expect(merchantOfferUnlocked(bluewax, 0)).toBe(true);
    expect(consumableEffect(bluewax.item)?.torchFuel).toBe(45);
  });

  it("unlocks stronger stock only after the required extracts", () => {
    const uncommon = MERCHANT_OFFERS.find((offer) => offer.sku === "oathblade")!;
    const rare = MERCHANT_OFFERS.find((offer) => offer.sku === "reliquary-edge")!;
    expect(merchantOfferUnlocked(uncommon, 0)).toBe(false);
    expect(merchantOfferUnlocked(uncommon, 1)).toBe(true);
    expect(merchantOfferUnlocked(rare, 2)).toBe(false);
    expect(merchantOfferUnlocked(rare, 3)).toBe(true);
    expect(merchantOfferUnlocked(rare, Number.POSITIVE_INFINITY)).toBe(false);
  });

  it("derives named standing and exact progress from successful returns", () => {
    expect(merchantStanding(0)).toEqual({ name: "Unproven", minimumExtracts: 0, nextExtracts: 1, progress: 0 });
    expect(merchantStanding(1)).toEqual({ name: "Known", minimumExtracts: 1, nextExtracts: 3, progress: 0 });
    expect(merchantStanding(2)).toEqual({ name: "Known", minimumExtracts: 1, nextExtracts: 3, progress: 50 });
    expect(merchantStanding(5)).toMatchObject({ name: "Trusted", minimumExtracts: 3, nextExtracts: 6 });
    expect(merchantStanding(5).progress).toBeCloseTo(200 / 3);
    expect(merchantStanding(6)).toEqual({ name: "Sworn", minimumExtracts: 6, progress: 100 });
    expect(merchantStanding(Number.NaN).name).toBe("Unproven");
  });

  it("reserves Epic Ironmonger stock for sworn delvers", () => {
    const swornStock = MERCHANT_OFFERS.filter((offer) => offer.requiredExtracts === 6);
    expect(swornStock).toHaveLength(2);
    expect(swornStock.every((offer) => offer.item.rarity === "Epic")).toBe(true);
    expect(swornStock.every((offer) => !merchantOfferUnlocked(offer, 5) && merchantOfferUnlocked(offer, 6))).toBe(true);
  });
});

describe("persistent bestiary intelligence", () => {
  it("gives every tracked threat a useful discovery note", () => {
    expect(Object.keys(BESTIARY).sort()).toEqual(["boss", "crawler", "mimic", "rival", "skeleton", "warden"]);
    for (const [kind, entry] of Object.entries(BESTIARY)) {
      expect(entry.kind).toBe(kind);
      expect(entry.name.length).toBeGreaterThan(3);
      expect(entry.title.length).toBeGreaterThan(3);
      expect(entry.tactic.length).toBeGreaterThan(24);
    }
  });
});

describe("Emberforge crafting", () => {
  it("atomically consumes a boss trophy and gold for the crafted ward", () => {
    const profile = createProfile();
    profile.gold = 100;
    profile.stash.push(createBossLoot(() => 0));
    const recipe = CRAFTING_RECIPES[0]!;
    profile.extracts = recipe.requiredExtracts;
    const crafted = craftItem(profile, recipe, "crafted-ward");
    expect(crafted.outcome).toBe("crafted");
    expect(crafted.profile.gold).toBe(20);
    expect(crafted.profile.stash.some((item) => item.name === recipe.ingredientName)).toBe(false);
    expect(crafted.profile.stash.find((item) => item.id === "crafted-ward")).toMatchObject({ rarity: "Epic", power: 18 });
  });

  it("preserves the profile when material or funds are missing", () => {
    const profile = createProfile();
    const recipe = CRAFTING_RECIPES[0]!;
    profile.extracts = recipe.requiredExtracts;
    expect(craftItem(profile, recipe, "missing").outcome).toBe("missing_material");
    profile.stash.push(createBossLoot(() => 0));
    profile.gold = 0;
    const refused = craftItem(profile, recipe, "poor");
    expect(refused.outcome).toBe("insufficient_gold");
    expect(refused.profile.stash.some((item) => item.name === recipe.ingredientName)).toBe(true);
  });

  it("offers unique, slot-neutral recipes for recovered dungeon relics", () => {
    expect(new Set(CRAFTING_RECIPES.map((recipe) => recipe.id)).size).toBe(CRAFTING_RECIPES.length);
    for (const [index, recipe] of CRAFTING_RECIPES.entries()) {
      const profile = createProfile();
      profile.extracts = recipe.requiredExtracts;
      profile.gold = 1_000;
      profile.stash.push({
        id: `material-${index}`,
        name: recipe.ingredientName,
        kind: recipe.ingredientKind,
        rarity: "Rare",
        power: 0,
        value: 50,
      });
      const before = profile.stash.length;
      const result = craftItem(profile, recipe, `output-${index}`);
      expect(result.outcome).toBe("crafted");
      expect(result.profile.stash).toHaveLength(before);
      expect(result.profile.stash.some((item) => item.id === `output-${index}` && item.name === recipe.output.name)).toBe(true);
    }
  });

  it("requires earned reputation even when the material and gold are present", () => {
    const recipe = CRAFTING_RECIPES.find((candidate) => candidate.id === "ruby-cantor")!;
    const profile = createProfile();
    profile.gold = 1_000;
    profile.stash.push({
      id: "ruby-material",
      name: recipe.ingredientName,
      kind: recipe.ingredientKind,
      rarity: "Epic",
      power: 0,
      value: 80,
    });

    const result = craftItem(profile, recipe, "locked-output");

    expect(result.outcome).toBe("reputation_locked");
    expect(result.profile.gold).toBe(1_000);
    expect(result.profile.stash.some((item) => item.id === "ruby-material")).toBe(true);
    expect(result.profile.stash.some((item) => item.id === "locked-output")).toBe(false);
  });

  it("unlocks forge knowledge at Known, Trusted, and Sworn standing", () => {
    expect(CRAFTING_RECIPES.map((recipe) => recipe.requiredExtracts).sort((a, b) => a - b)).toEqual([1, 3, 6]);
    for (const recipe of CRAFTING_RECIPES) {
      expect(craftingRecipeUnlocked(recipe, recipe.requiredExtracts - 1)).toBe(false);
      expect(craftingRecipeUnlocked(recipe, recipe.requiredExtracts)).toBe(true);
      expect(craftingRecipeUnlocked(recipe, Number.POSITIVE_INFINITY)).toBe(false);
    }
  });
});
