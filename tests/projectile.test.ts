import { describe, expect, it } from "vitest";
import { playerProjectileDuration, playerProjectilePosition, projectileImpactConnects, projectileSegmentConnects } from "../src/game/projectile";

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
