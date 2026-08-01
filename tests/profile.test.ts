import { describe, expect, it } from "vitest";
import { BESTIARY, CLASS_ABILITIES, CRAFTING_RECIPES, HEX_SPELLS, MERCHANT_OFFERS, classPerkBonuses, consumableEffect, createBossLoot, createLoot, formatTime, levelForXp, merchantOfferUnlocked, progressionBonuses, rarityFromRoll, throwableDamage } from "../src/game/data";
import { MAX_GOLD, MAX_ITEM_POWER, MAX_ITEM_VALUE, RAID_HISTORY_LIMIT, applyRaidResult, contractRecordSummary, craftItem, createProfile, createRaidEscrow, normalizeProfile, normalizeRaidEscrow, purchaseItem, raidXpBreakdown, sellStashItem, settleInterruptedRaid, settleRaid } from "../src/game/profile";
import { DEFAULT_PREFERENCES, normalizePreferences } from "../src/game/preferences";
import { RIPOSTE_DURATION_SECONDS, attackDamage, bossTactic, bossTollDamage, bossTollHits, classAbilityDamageMultiplier, classAttackDelay, classMovementMultiplier, dodgeStats, enemyAttackPattern, guardDrainPerSecond, guardFacesThreat, healthPercent, minstrelStagger, riposteDamageMultiplier, rivalTactic, sanctuaryDamage, trapDamageAgainstThreat } from "../src/game/combat";

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

  it("gives recovered consumables explicit utility instead of gear enchantments", () => {
    const rolls = [0.85, 0.7, 0.99, 0.1, 0.1, 0.1];
    const item = createLoot(() => rolls.shift() ?? 0.1);
    expect(item.kind).toBe("consumable");
    expect(item.name).toBe("Camp ember");
    expect(item.modifier).toContain("spell charges");
    expect(consumableEffect(item)).toMatchObject({ health: 20, stamina: 20, spellCharges: 2 });
    expect(consumableEffect({ name: "blade", kind: "weapon" })).toBeUndefined();
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

    const checkpoint = createRaidEscrow("ranger", "standard", [], 123, 2, 3);
    const recoveredCheckpoint = settleInterruptedRaid(createProfile(), checkpoint);
    expect(checkpoint).toMatchObject({ startedAt: 123, depthReached: 2, kills: 3 });
    expect(recoveredCheckpoint.xpGained).toBe(165);

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

  it("rejects malformed raid escrow journals before recovery", () => {
    expect(normalizeRaidEscrow({ version: 2, classId: "ranger", raidMode: "standard", equippedIds: [] })).toBeUndefined();
    expect(normalizeRaidEscrow({ version: 1, classId: "dragon", raidMode: "iron_soul", equippedIds: [] })).toBeUndefined();
    expect(normalizeRaidEscrow({ version: 1, classId: "ranger", raidMode: "unknown", equippedIds: [] })).toBeUndefined();
    expect(normalizeRaidEscrow({ version: 1, classId: "ranger", raidMode: "standard", equippedIds: "blade" })).toBeUndefined();
    expect(normalizeRaidEscrow({ version: 1, classId: "ranger", raidMode: "standard", equippedIds: [], startedAt: Number.NaN })?.startedAt).toBe(0);
  });

  it("banks unsecured loot and gold only after extraction", () => {
    const profile = createProfile();
    const loot = createLoot(() => 0.8);
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
    expect(result.version).toBe(11);
    expect(result.xp.reaver).toBe(0);
    expect(result.xp.ranger).toBe(0);
    expect(result.xp.cleric).toBe(0);
    expect(result.xp.shapeshifter).toBe(0);
    expect(result.xp.minstrel).toBe(0);
    expect(result.threatKills).toEqual({ skeleton: 0, crawler: 0, mimic: 0, warden: 0, rival: 0, boss: 0 });
    expect(result.boneBountyPaid).toBe(false);
    expect(result.rivalBountyPaid).toBe(false);
    expect(result.preferredClass).toBe("vanguard");
    expect(result.raidHistory).toEqual([]);
  });

  it("migrates pre-Shapeshifter profiles without changing established progression", () => {
    const legacy = createProfile() as unknown as Record<string, unknown>;
    legacy.version = 7;
    legacy.xp = { vanguard: 700, cutpurse: 350, hexbound: 0, reaver: 0, ranger: 0, cleric: 0 };
    const migrated = normalizeProfile(legacy);
    expect(migrated.version).toBe(11);
    expect(migrated.xp.vanguard).toBe(700);
    expect(migrated.xp.cutpurse).toBe(350);
    expect(migrated.xp.shapeshifter).toBe(0);
    expect(migrated.xp.minstrel).toBe(0);
  });

  it("migrates pre-bestiary profiles with empty bounded ledgers", () => {
    const legacy = { ...createProfile(), version: 8, threatKills: undefined, boneBountyPaid: undefined, rivalBountyPaid: undefined };
    const migrated = normalizeProfile(legacy);
    expect(migrated.version).toBe(11);
    expect(migrated.threatKills).toEqual({ skeleton: 0, crawler: 0, mimic: 0, warden: 0, rival: 0, boss: 0 });
    expect(migrated.boneBountyPaid).toBe(false);
    expect(migrated.rivalBountyPaid).toBe(false);
    expect(migrated.raidHistory).toEqual([]);
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
        elapsed: 60 + index,
        goldFound: index,
        bossKilled: index === 11,
        finishedAt: 1_000 + index,
      }).profile;
    }
    expect(profile.raidHistory).toHaveLength(RAID_HISTORY_LIMIT);
    expect(profile.raidHistory[0]).toMatchObject({ completedAt: 1_011, raidMode: "high_toll", depthReached: 2, kills: 11, bossKilled: true });
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
    expect(first.gold).toBe(185);
    expect(second.gold).toBe(195);
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
  });

  it("pays the first extracted Tollkeeper victory once and never on death", () => {
    const victory = {
      reason: "extracted" as const,
      classId: "vanguard" as const,
      loot: [],
      equippedIds: [],
      kills: 1,
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
    const base = { classId: "vanguard" as const, loot: [], equippedIds: [], kills: 0, elapsed: 220, goldFound: 0, depthReached: 2 as const };
    const escaped = settleRaid(createProfile(), { ...base, reason: "extracted" });
    const fallen = settleRaid(createProfile(), { ...base, reason: "slain" });
    expect(escaped.xpGained).toBe(350);
    expect(fallen.xpGained).toBe(90);
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
      kills: 0,
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
    expect(result.gold).toBe(190);
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
    expect(settlement.goldGained).toBe(100);
  });

  it("does not duplicate loot IDs or accept negative result rewards", () => {
    const profile = createProfile();
    const duplicate = { ...profile.stash[0]! };
    const result = applyRaidResult(profile, {
      reason: "extracted",
      classId: "vanguard",
      loot: [duplicate],
      equippedIds: [],
      kills: -20,
      elapsed: 0,
      goldFound: -50,
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
      consumedIds: [potion.id],
      kills: 0,
      elapsed: 40,
      goldFound: 0,
    });
    expect(result.stash.some((item) => item.id === potion.id)).toBe(false);
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
  it("unlocks stronger stock only after the required extracts", () => {
    const uncommon = MERCHANT_OFFERS.find((offer) => offer.sku === "oathblade")!;
    const rare = MERCHANT_OFFERS.find((offer) => offer.sku === "reliquary-edge")!;
    expect(merchantOfferUnlocked(uncommon, 0)).toBe(false);
    expect(merchantOfferUnlocked(uncommon, 1)).toBe(true);
    expect(merchantOfferUnlocked(rare, 2)).toBe(false);
    expect(merchantOfferUnlocked(rare, 3)).toBe(true);
    expect(merchantOfferUnlocked(rare, Number.POSITIVE_INFINITY)).toBe(false);
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
    const crafted = craftItem(profile, recipe, "crafted-ward");
    expect(crafted.outcome).toBe("crafted");
    expect(crafted.profile.gold).toBe(20);
    expect(crafted.profile.stash.some((item) => item.name === recipe.ingredientName)).toBe(false);
    expect(crafted.profile.stash.find((item) => item.id === "crafted-ward")).toMatchObject({ rarity: "Epic", power: 18 });
  });

  it("preserves the profile when material or funds are missing", () => {
    const profile = createProfile();
    const recipe = CRAFTING_RECIPES[0]!;
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
});
