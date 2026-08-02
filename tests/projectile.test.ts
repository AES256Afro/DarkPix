import { describe, expect, it } from "vitest";
import { enemyProjectileDefense, enemyProjectileDuration, enemyProjectileFlightCue, enemyProjectilePauseSummary, enemyProjectilePosition, playerProjectileDuration, playerProjectilePosition, projectileImpactConnects, projectileSegmentConnects } from "../src/game/projectile";

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

  it("lets a target sidestep outside the committed impact radius", () => {
    const impact = { x: 2, z: 4 };
    expect(projectileImpactConnects(impact, { x: 2.3, z: 4.2 }, 0.5)).toBe(true);
    expect(projectileImpactConnects(impact, { x: 2.6, z: 4 }, 0.5)).toBe(false);
    expect(projectileImpactConnects(impact, { x: Number.NaN, z: 4 }, 0.5)).toBe(false);
  });

  it("gives hostile knives and chains their own readable approach window", () => {
    expect(enemyProjectileDuration(6.5, "knife")).toBe(0.5);
    expect(enemyProjectileDuration(5, "chain")).toBe(0.5);
    expect(enemyProjectilePosition({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 5 }, 0.5, 1, "chain")).toEqual({ x: 0, y: 1, z: 2.5 });
    expect(enemyProjectilePosition({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 5 }, 0.5, 1, "knife")).toEqual({ x: 0, y: 1.14, z: 2.5 });
  });

  it("resolves incoming defense at impact and never parries a keeper chain", () => {
    expect(enemyProjectileDefense("knife", true, true, 0.12)).toBe("parry");
    expect(enemyProjectileDefense("knife", true, true, 0.24)).toBe("guard");
    expect(enemyProjectileDefense("chain", true, true, 0.04)).toBe("guard");
    expect(enemyProjectileDefense("knife", true, false, 0.04)).toBe("hit");
    expect(enemyProjectileDefense("knife", false, true, 0.04)).toBe("hit");
    expect(enemyProjectileDefense("knife", true, true, Number.NaN)).toBe("guard");
  });

  it("keeps a shape-and-text warning alive for the full hostile flight", () => {
    expect(enemyProjectileFlightCue("knife", 0.5)).toEqual({ label: "KNIFE IN FLIGHT", duration: 0.62 });
    expect(enemyProjectileFlightCue("chain", 0.8)).toEqual({ label: "CHAIN IN FLIGHT", duration: 0.92 });
    expect(enemyProjectileFlightCue("knife", Number.NaN)).toEqual({ label: "KNIFE IN FLIGHT", duration: 0.26 });
  });

  it("discloses frozen hostile missiles in the pause ledger", () => {
    expect(enemyProjectilePauseSummary([])).toBe("CLEAR");
    expect(enemyProjectilePauseSummary(["knife"])).toBe("1 KNIFE");
    expect(enemyProjectilePauseSummary(["knife", "knife", "chain"])).toBe("2 KNIVES · 1 CHAIN");
    expect(enemyProjectilePauseSummary(["chain", "chain"])).toBe("2 CHAINS");
  });

  it("detects a threat crossed by a fast projectile without tunneling", () => {
    const start = { x: 0, y: 1, z: 0 };
    const end = { x: 0, y: 1, z: -1 };
    expect(projectileSegmentConnects(start, end, { x: 0.2, y: 1, z: -0.5 }, 0.25)).toBe(true);
    expect(projectileSegmentConnects(start, end, { x: 0.6, y: 1, z: -0.5 }, 0.25)).toBe(false);
    expect(projectileSegmentConnects(start, end, { x: 0, y: 1, z: -1.2 }, 0.25)).toBe(true);
    expect(projectileSegmentConnects(start, end, { x: 0, y: 1, z: -1.4 }, 0.25)).toBe(false);
    expect(projectileSegmentConnects({ x: 0, y: 1.4, z: 0 }, { x: 0, y: 1.82, z: -1 }, { x: 0, y: 1.82, z: -1 }, 0.3)).toBe(true);
  });
});
