import { describe, expect, it } from "vitest";
import { raidHazardReadiness, raidReadinessSummary } from "../src/game/readiness";

describe("paused raid readiness", () => {
  it("reports exact resources and unopened passage progress", () => {
    expect(raidReadinessSummary({
      classId: "hexbound", depth: 1, health: 42.2, maxHealth: 80, stamina: 67.1, maxStamina: 100,
      spellCharges: 3, maxSpellCharges: 7, sigils: 1, portalUnlocked: false, campfireUsed: false, torchLit: true, torchFuel: 42.2,
    })).toEqual({
      vigor: "43 / 80",
      stamina: "68 / 100",
      memory: "3 / 7 CHARGES",
      passage: "BLUE SIGILS 1 / 2",
      campfire: "AVAILABLE",
      torch: "LIT · 43S",
    });
  });

  it("shows deep extraction and clamps malformed counters", () => {
    expect(raidReadinessSummary({
      classId: "vanguard", depth: 2, health: Number.NaN, maxHealth: Number.NaN, stamina: 500, maxStamina: 100,
      spellCharges: -5, maxSpellCharges: 6, sigils: 99, portalUnlocked: true, campfireUsed: true, torchLit: false, torchFuel: 0,
    })).toEqual({
      vigor: "0 / 1",
      stamina: "100 / 100",
      memory: "NOT USED",
      passage: "ASHEN OPEN",
      campfire: "SPENT",
      torch: "SPENT",
    });
  });

  it("reports the paused floor clock and a direction back from darkness", () => {
    expect(raidHazardReadiness(1, 2, { x: 16, z: -16 }, { x: 0, z: 0 })).toEqual({
      remainingSeconds: 208,
      safety: "WARDING VEIL · 6S",
    });
    const outside = raidHazardReadiness(1, 180, { x: 16, z: -16 }, { x: -30, z: 30 });
    expect(outside.remainingSeconds).toBe(30);
    expect(outside.safety).toMatch(/^DARK · \d+M OUT · NE TO SAFETY$/);
  });

  it("bounds malformed paused hazard evidence", () => {
    expect(raidHazardReadiness(2, Number.NaN, { x: Number.NaN, z: Number.NaN }, { x: Number.NaN, z: Number.POSITIVE_INFINITY })).toEqual({
      remainingSeconds: 135,
      safety: "WARDING VEIL · 5S",
    });
    expect(raidHazardReadiness(2, 999, { x: 16, z: -16 }, { x: 16, z: -16 }).remainingSeconds).toBe(0);
  });
});
