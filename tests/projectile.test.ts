import { describe, expect, it } from "vitest";
import { enemyProjectileDefense, enemyProjectileDuration, enemyProjectileFlightCue, enemyProjectilePauseSummary, enemyProjectilePosition, enemyProjectileTargetsThreat, playerProjectileDuration, playerProjectilePosition, projectileContactPoint, projectileContactPrecedes, projectileImpactConnects, projectileSegmentConnects, projectileSegmentContact, projectileStoneOutcome, projectileTargetContact } from "../src/game/projectile";

describe("player projectile travel", () => {
  it("gives arrows and spells bounded nonzero travel time", () => {
    expect(playerProjectileDuration(9, "arrow")).toBe(0.5);
    expect(playerProjectileDuration(13, "spell")).toBe(1);
    expect(playerProjectileDuration(7.5, "throwable")).toBe(0.5);
    expect(playerProjectileDuration(Number.NaN, "arrow")).toBe(0.12);
    expect(playerProjectileDuration(999, "spell")).toBe(1.25);
  });

  it("moves along a visible arrow arc while spells follow the committed line", () => {
    const start = { x: 0, y: 1, z: 0 };
    const end = { x: 10, y: 1, z: -2 };
    expect(playerProjectilePosition(start, end, 0.5, 1, "arrow")).toEqual({ x: 5, y: 1.34, z: -1 });
    expect(playerProjectilePosition(start, end, 0.5, 1, "spell")).toEqual({ x: 5, y: 1, z: -1 });
    expect(playerProjectilePosition(start, end, 0.5, 1, "throwable")).toEqual({ x: 5, y: 1.2, z: -1 });
    expect(playerProjectilePosition(start, end, 2, 1, "arrow")).toMatchObject(end);
  });

  it("can reuse caller-owned flight points without changing travel", () => {
    const start = { x: 0, y: 1, z: 0 };
    const end = { x: 10, y: 1, z: -2 };
    const playerTarget = { x: 99, y: 99, z: 99 };
    const enemyTarget = { x: 99, y: 99, z: 99 };
    expect(playerProjectilePosition(start, end, 0.5, 1, "arrow", playerTarget)).toBe(playerTarget);
    expect(playerTarget).toEqual({ x: 5, y: 1.34, z: -1 });
    expect(enemyProjectilePosition(start, end, 0.5, 1, "knife", enemyTarget)).toBe(enemyTarget);
    expect(enemyTarget).toEqual({ x: 5, y: 1.14, z: -1 });
  });

  it("lets a target sidestep outside the committed impact radius", () => {
    const impact = { x: 2, z: 4 };
    expect(projectileImpactConnects(impact, { x: 2.3, z: 4.2 }, 0.5)).toBe(true);
    expect(projectileImpactConnects(impact, { x: 2.6, z: 4 }, 0.5)).toBe(false);
    expect(projectileImpactConnects(impact, { x: Number.NaN, z: 4 }, 0.5)).toBe(false);
  });

  it("gives hostile knives, chains, and dart volleys readable approach windows", () => {
    expect(enemyProjectileDuration(6.5, "knife")).toBe(0.5);
    expect(enemyProjectileDuration(5, "chain")).toBe(0.5);
    expect(enemyProjectileDuration(8, "dart")).toBe(0.5);
    expect(enemyProjectilePosition({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 5 }, 0.5, 1, "chain")).toEqual({ x: 0, y: 1, z: 2.5 });
    expect(enemyProjectilePosition({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 5 }, 0.5, 1, "knife")).toEqual({ x: 0, y: 1.14, z: 2.5 });
  });

  it("keeps hostile knife animation finite when timing state is malformed", () => {
    const start = { x: 1, y: 1.2, z: 2 };
    const end = { x: 4, y: 1.2, z: 8 };
    expect(enemyProjectilePosition(start, end, Number.NaN, 1, "knife")).toEqual(start);
    expect(Object.values(enemyProjectilePosition(start, end, 0.07, Number.NaN, "knife")).every(Number.isFinite)).toBe(true);
    expect(Object.values(enemyProjectilePosition(start, end, Number.POSITIVE_INFINITY, 1, "knife")).every(Number.isFinite)).toBe(true);
  });

  it("resolves incoming defense at impact and never parries a keeper chain", () => {
    expect(enemyProjectileDefense("knife", true, true, 0.12)).toBe("parry");
    expect(enemyProjectileDefense("knife", true, true, 0.24)).toBe("guard");
    expect(enemyProjectileDefense("chain", true, true, 0.04)).toBe("guard");
    expect(enemyProjectileDefense("dart", true, true, 0.04)).toBe("guard");
    expect(enemyProjectileDefense("knife", true, false, 0.04)).toBe("hit");
    expect(enemyProjectileDefense("knife", false, true, 0.04)).toBe("hit");
    expect(enemyProjectileDefense("knife", true, true, Number.NaN)).toBe("guard");
  });

  it("keeps a shape-and-text warning alive for the full hostile flight", () => {
    expect(enemyProjectileFlightCue("knife", 0.5)).toEqual({ label: "KNIFE IN FLIGHT", duration: 0.62 });
    expect(enemyProjectileFlightCue("chain", 0.8)).toEqual({ label: "CHAIN IN FLIGHT", duration: 0.92 });
    expect(enemyProjectileFlightCue("dart", 0.4)).toEqual({ label: "DARTS IN FLIGHT", duration: 0.52 });
    expect(enemyProjectileFlightCue("knife", Number.NaN)).toEqual({ label: "KNIFE IN FLIGHT", duration: 0.26 });
  });

  it("discloses frozen hostile missiles in the pause ledger", () => {
    expect(enemyProjectilePauseSummary([])).toBe("CLEAR");
    expect(enemyProjectilePauseSummary(["knife"])).toBe("1 KNIFE");
    expect(enemyProjectilePauseSummary(["knife", "knife", "chain"])).toBe("2 KNIVES · 1 CHAIN");
    expect(enemyProjectilePauseSummary(["chain", "chain"])).toBe("2 CHAINS");
    expect(enemyProjectilePauseSummary(["dart", "knife", "dart"])).toBe("1 KNIFE · 2 DART VOLLEYS");
  });

  it("lets living threats screen hostile missiles without hitting their source", () => {
    expect(enemyProjectileTargetsThreat(7, 7)).toBe(false);
    expect(enemyProjectileTargetsThreat(7, 8)).toBe(true);
    expect(enemyProjectileTargetsThreat(undefined, 8)).toBe(true);
    expect(enemyProjectileTargetsThreat(Number.NaN, 8)).toBe(true);
    expect(enemyProjectileTargetsThreat(7, Number.NaN)).toBe(false);
  });

  it("detects a threat crossed by a fast projectile without tunneling", () => {
    const start = { x: 0, y: 1, z: 0 };
    const end = { x: 0, y: 1, z: -1 };
    expect(projectileSegmentConnects(start, end, { x: 0.2, y: 1, z: -0.5 }, 0.25)).toBe(true);
    expect(projectileSegmentConnects(start, end, { x: 0.6, y: 1, z: -0.5 }, 0.25)).toBe(false);
    expect(projectileSegmentConnects(start, end, { x: 0, y: 1, z: -1.2 }, 0.25)).toBe(true);
    expect(projectileSegmentConnects(start, end, { x: 0, y: 1, z: -1.4 }, 0.25)).toBe(false);
    expect(projectileSegmentConnects({ x: 0, y: 1.4, z: 0 }, { x: 0, y: 1.82, z: -1 }, { x: 0, y: 1.82, z: -1 }, 0.3)).toBe(true);
    expect(projectileSegmentContact(start, end, { x: 0, y: 1, z: -0.75 }, 0.2)).toBeCloseTo(0.75);
    expect(projectileSegmentContact(start, end, { x: 1, y: 1, z: -0.5 }, 0.2)).toBeUndefined();
  });

  it("awards the physically first body or head contact", () => {
    expect(projectileTargetContact(0.7, 0.3)).toEqual({ progress: 0.3, headshot: false });
    expect(projectileTargetContact(0.2, 0.6)).toEqual({ progress: 0.2, headshot: true });
    expect(projectileTargetContact(0.4, 0.4)).toEqual({ progress: 0.4, headshot: true });
    expect(projectileTargetContact(undefined, 0.5)).toEqual({ progress: 0.5, headshot: false });
    expect(projectileTargetContact(Number.NaN, undefined)).toBeUndefined();
  });

  it("gives every masonry-stopped missile an explicit safe verdict", () => {
    expect(projectileStoneOutcome("arrow")).toEqual({ cue: "SHOT BLOCKED", message: "ARROW BROKEN · stone stops the shot." });
    expect(projectileStoneOutcome("spell").message).toContain("stone grounds");
    expect(projectileStoneOutcome("throwable", "Tin knife").message).toBe("Tin knife strikes the stone and is lost.");
    expect(projectileStoneOutcome("knife")).toEqual({ cue: "STONE HELD", message: "STONE HELD · the rival knife breaks against masonry." });
    expect(projectileStoneOutcome("chain").message).toContain("Tollkeeper chain");
    expect(projectileStoneOutcome("dart").message).toContain("dart volley");
  });

  it("resolves the physically first living or masonry contact", () => {
    expect(projectileContactPrecedes(0.2, 0.7)).toBe(true);
    expect(projectileContactPrecedes(0.7, 0.2)).toBe(false);
    expect(projectileContactPrecedes(0.4, 0.4)).toBe(true);
    expect(projectileContactPrecedes(0.4, undefined)).toBe(true);
    expect(projectileContactPrecedes(undefined, 0.4)).toBe(false);
    expect(projectileContactPrecedes(Number.NaN, 0.4)).toBe(false);
  });

  it("places impact feedback at the first swept contact instead of the frame endpoint", () => {
    const start = { x: -2, y: 1.2, z: 4 };
    const end = { x: 2, y: 1.6, z: 0 };
    expect(projectileContactPoint(start, end, 0.25)).toEqual({ x: -1, y: 1.3, z: 3 });
    expect(projectileContactPoint(start, end, 0)).toEqual(start);
    expect(projectileContactPoint(start, end, 1)).toEqual(end);
    expect(projectileContactPoint(start, end, Number.NaN)).toBeUndefined();
    expect(projectileContactPoint(start, end, -0.1)).toBeUndefined();
    expect(projectileContactPoint({ ...start, x: Number.NaN }, end, 0.5)).toBeUndefined();
  });
});
