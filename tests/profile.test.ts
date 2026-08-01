import { describe, expect, it } from "vitest";
import { CLASS_ABILITIES, CRAFTING_RECIPES, MERCHANT_OFFERS, classPerkBonuses, createBossLoot, createLoot, formatTime, levelForXp, merchantOfferUnlocked, progressionBonuses, rarityFromRoll } from "../src/game/data";
import { applyRaidResult, craftItem, createProfile, normalizeProfile, purchaseItem, settleRaid } from "../src/game/profile";
import { DEFAULT_PREFERENCES, normalizePreferences } from "../src/game/preferences";
import { attackDamage, classAbilityDamageMultiplier, enemyAttackPattern, guardDrainPerSecond, guardFacesThreat, healthPercent, rivalTactic, trapDamageAgainstThreat } from "../src/game/combat";

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
    expect(result.version).toBe(4);
    expect(result.xp.reaver).toBe(0);
    expect(result.preferredClass).toBe("vanguard");
  });

  it("rejects non-finite items and deduplicates persisted stash IDs", () => {
    const valid = createProfile().stash[0]!;
    const result = normalizeProfile({
      stash: [valid, { ...valid }, { ...valid, id: "infinite", value: Number.POSITIVE_INFINITY }, { ...valid, id: "negative", power: -1 }],
    });
    expect(result.stash).toHaveLength(1);
    expect(result.stash[0]?.id).toBe(valid.id);
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
    expect(normalizePreferences({ mouseSensitivity: 20, brightness: 0, fieldOfView: 120, muted: "yes", reducedMotion: true })).toEqual({
      mouseSensitivity: 2,
      brightness: 0.75,
      fieldOfView: 95,
      muted: false,
      reducedMotion: true,
      stashSort: "recent",
    });
    expect(normalizePreferences({ stashSort: "value" }).stashSort).toBe("value");
    expect(normalizePreferences({ fieldOfView: 40 }).fieldOfView).toBe(60);
    expect(normalizePreferences({ stashSort: "unknown" }).stashSort).toBe("recent");
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

  it("makes sustained guards cost class-tuned stamina", () => {
    expect(guardDrainPerSecond("vanguard")).toBe(7);
    expect(guardDrainPerSecond("cutpurse")).toBe(11);
    expect(guardDrainPerSecond("hexbound")).toBe(14);
    expect(guardDrainPerSecond("reaver")).toBe(11);
  });

  it("bounds Blood Rage to the Reaver's active damage window", () => {
    expect(classAbilityDamageMultiplier("reaver", 6)).toBe(1.25);
    expect(classAbilityDamageMultiplier("reaver", 0)).toBe(1);
    expect(classAbilityDamageMultiplier("reaver", Number.NaN)).toBe(1);
    expect(classAbilityDamageMultiplier("vanguard", 6)).toBe(1);
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
  });

  it("gives every class a bounded active-skill cooldown", () => {
    expect(Object.keys(CLASS_ABILITIES).sort()).toEqual(["cutpurse", "hexbound", "reaver", "vanguard"]);
    for (const ability of Object.values(CLASS_ABILITIES)) {
      expect(ability.name.length).toBeGreaterThan(0);
      expect(ability.cooldown).toBeGreaterThanOrEqual(30);
      expect(ability.cooldown).toBeLessThanOrEqual(60);
    }
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
