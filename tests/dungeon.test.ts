import { describe, expect, it } from "vitest";
import { DUNGEON, dungeonCollides, dungeonLineOfSight, dungeonPath, dungeonPathExists } from "../src/game/dungeon";
import { continuousHold, targetDistanceInView } from "../src/game/targeting";
import { cardinalDirection, circlesOverlap } from "../src/game/navigation";
import { distanceFromZoneCenter, zoneState } from "../src/game/zone";
import type { Vec2 } from "../src/game/types";

describe("Crypt of the Pale Toll topology", () => {
  it("keeps every contract-critical location reachable from the player start", () => {
    const contractEnemies = DUNGEON.enemies.filter((enemy) => enemy.kind === "warden" || enemy.kind === "boss");
    const criticalLocations = [DUNGEON.campfire, DUNGEON.shrine, DUNGEON.portal, ...contractEnemies, ...DUNGEON.chests];
    for (const location of criticalLocations) {
      expect(dungeonPathExists(DUNGEON.playerStart, location), `${location.x},${location.z} should be reachable`).toBe(true);
    }
  });

  it("marks exactly one deep coffer as the hidden mimic encounter", () => {
    const mimics = DUNGEON.chests.filter((chest) => chest.mimic);
    expect(mimics).toHaveLength(1);
    expect(mimics[0]?.depthBonus).toBeGreaterThanOrEqual(0.1);
  });

  it("treats walls and pillars as solid while leaving the start open", () => {
    expect(dungeonCollides(DUNGEON.playerStart)).toBe(false);
    expect(dungeonCollides({ x: -10, z: 14 })).toBe(true);
    expect(dungeonCollides({ x: -8, z: 5 })).toBe(true);
  });

  it("blocks sight through masonry while preserving an open-room sightline", () => {
    expect(dungeonLineOfSight(DUNGEON.playerStart, DUNGEON.campfire)).toBe(false);
    expect(dungeonLineOfSight(DUNGEON.playerStart, { x: -5, z: 12 })).toBe(true);
  });

  it("routes an alerted pursuer around masonry without crossing a collider", () => {
    const start = DUNGEON.playerStart;
    const target = DUNGEON.campfire;
    expect(dungeonLineOfSight(start, target)).toBe(false);
    const route = dungeonPath(start, target);
    expect(route.length).toBeGreaterThan(0);
    expect(route.every((point) => !dungeonCollides(point, 0.3))).toBe(true);
    expect(route.at(-1)).toEqual(target);
    let previous: Vec2 = start;
    for (const waypoint of route) {
      expect(dungeonLineOfSight(previous, waypoint, 0.3)).toBe(true);
      previous = waypoint;
    }
  });
});

describe("deliberate interaction targeting", () => {
  it("accepts nearby objects in front and rejects objects behind or too far away", () => {
    const origin = { x: 0, z: 0 };
    const facing = { x: 0, z: -1 };
    expect(targetDistanceInView(origin, facing, { x: 0.4, z: -2 }, 2.6)).toBeLessThan(2.6);
    expect(targetDistanceInView(origin, facing, { x: 0, z: 2 }, 2.6)).toBe(Number.POSITIVE_INFINITY);
    expect(targetDistanceInView(origin, facing, { x: 0, z: -3 }, 2.6)).toBe(Number.POSITIVE_INFINITY);
  });

  it("resets continuous rest and extraction holds when interrupted", () => {
    const partial = continuousHold(0, 0.9, true);
    expect(continuousHold(partial, 0.4, true)).toBeCloseTo(1.3);
    expect(continuousHold(partial, 0.4, false)).toBe(0);
    expect(continuousHold(Number.NaN, -1, true)).toBe(0);
  });
});

describe("contract wayfinding", () => {
  it("maps world vectors to stable eight-way headings", () => {
    expect(cardinalDirection({ x: 0, z: -1 })).toBe("N");
    expect(cardinalDirection({ x: 1, z: 0 })).toBe("E");
    expect(cardinalDirection({ x: -1, z: 1 })).toBe("SW");
    expect(cardinalDirection({ x: 0, z: 0 })).toBe("HERE");
  });

  it("keeps physical threat circles from stacking", () => {
    expect(circlesOverlap({ x: 0, z: 0 }, 0.3, { x: 0.5, z: 0 }, 0.3)).toBe(true);
    expect(circlesOverlap({ x: 0, z: 0 }, 0.3, { x: 0.7, z: 0 }, 0.3)).toBe(false);
  });
});

describe("migrating darkness", () => {
  it("closes over time but keeps the final blue passage barely inside", () => {
    const dormant = zoneState(0);
    const middle = zoneState(115);
    const final = zoneState(210);
    expect(dormant.radius).toBe(31);
    expect(middle.radius).toBeLessThan(dormant.radius);
    expect(final.radius).toBeLessThan(middle.radius);
    expect(distanceFromZoneCenter(DUNGEON.portal, final)).toBeLessThan(final.radius);
  });
});
