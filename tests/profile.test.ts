import { describe, expect, it } from "vitest";
import { createLoot, formatTime, levelForXp, rarityFromRoll } from "../src/game/data";
import { applyRaidResult, createProfile, normalizeProfile } from "../src/game/profile";
import { DEFAULT_PREFERENCES, normalizePreferences } from "../src/game/preferences";

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
    expect(result.gold).toBe(96);
    expect(result.xp.hexbound).toBe(275);
    expect(result.stash.some((item) => item.id === loot.id)).toBe(true);
    expect(result.stash.some((item) => item.id === "starter-jack")).toBe(true);
  });

  it("sanitizes a corrupted persisted profile", () => {
    const result = normalizeProfile({ gold: -8, xp: { vanguard: "bad" }, stash: [{ name: "broken" }], preferredClass: "dragon" });
    expect(result.gold).toBe(0);
    expect(result.xp.vanguard).toBe(0);
    expect(result.stash).toEqual([]);
    expect(result.preferredClass).toBe("vanguard");
  });
});

describe("display helpers", () => {
  it("formats raid time and persistent levels", () => {
    expect(formatTime(209.9)).toBe("3:29");
    expect(formatTime(-3)).toBe("0:00");
    expect(levelForXp(699)).toBe(2);
    expect(levelForXp(700)).toBe(3);
  });
});

describe("local game preferences", () => {
  it("clamps numeric settings and rejects malformed toggles", () => {
    expect(normalizePreferences({ mouseSensitivity: 20, brightness: 0, muted: "yes", reducedMotion: true })).toEqual({
      mouseSensitivity: 2,
      brightness: 0.75,
      muted: false,
      reducedMotion: true,
    });
    expect(normalizePreferences(null)).toEqual(DEFAULT_PREFERENCES);
  });
});
