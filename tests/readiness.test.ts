import { describe, expect, it } from "vitest";
import { raidReadinessSummary } from "../src/game/readiness";

describe("paused raid readiness", () => {
  it("reports exact resources and unopened passage progress", () => {
    expect(raidReadinessSummary({
      classId: "hexbound", depth: 1, health: 42.2, maxHealth: 80, stamina: 67.1, maxStamina: 100,
      spellCharges: 3, maxSpellCharges: 7, sigils: 1, portalUnlocked: false, campfireUsed: false,
    })).toEqual({
      vigor: "43 / 80",
      stamina: "68 / 100",
      memory: "3 / 7 CHARGES",
      passage: "BLUE SIGILS 1 / 2",
      campfire: "AVAILABLE",
    });
  });

  it("shows deep extraction and clamps malformed counters", () => {
    expect(raidReadinessSummary({
      classId: "vanguard", depth: 2, health: Number.NaN, maxHealth: Number.NaN, stamina: 500, maxStamina: 100,
      spellCharges: -5, maxSpellCharges: 6, sigils: 99, portalUnlocked: true, campfireUsed: true,
    })).toEqual({
      vigor: "0 / 1",
      stamina: "100 / 100",
      memory: "NOT USED",
      passage: "ASHEN OPEN",
      campfire: "SPENT",
    });
  });
});
