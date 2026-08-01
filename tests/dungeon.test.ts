import { describe, expect, it } from "vitest";
import { DUNGEON, dungeonCollides, dungeonLineOfSight, dungeonPathExists } from "../src/game/dungeon";
import { targetDistanceInView } from "../src/game/targeting";
import { cardinalDirection } from "../src/game/navigation";

describe("Crypt of the Pale Toll topology", () => {
  it("keeps every contract-critical location reachable from the player start", () => {
    const wardens = DUNGEON.enemies.filter((enemy) => enemy.kind === "warden");
    const criticalLocations = [DUNGEON.campfire, DUNGEON.portal, ...wardens, ...DUNGEON.chests];
    for (const location of criticalLocations) {
      expect(dungeonPathExists(DUNGEON.playerStart, location), `${location.x},${location.z} should be reachable`).toBe(true);
    }
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
});

describe("deliberate interaction targeting", () => {
  it("accepts nearby objects in front and rejects objects behind or too far away", () => {
    const origin = { x: 0, z: 0 };
    const facing = { x: 0, z: -1 };
    expect(targetDistanceInView(origin, facing, { x: 0.4, z: -2 }, 2.6)).toBeLessThan(2.6);
    expect(targetDistanceInView(origin, facing, { x: 0, z: 2 }, 2.6)).toBe(Number.POSITIVE_INFINITY);
    expect(targetDistanceInView(origin, facing, { x: 0, z: -3 }, 2.6)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("contract wayfinding", () => {
  it("maps world vectors to stable eight-way headings", () => {
    expect(cardinalDirection({ x: 0, z: -1 })).toBe("N");
    expect(cardinalDirection({ x: 1, z: 0 })).toBe("E");
    expect(cardinalDirection({ x: -1, z: 1 })).toBe("SW");
    expect(cardinalDirection({ x: 0, z: 0 })).toBe("HERE");
  });
});
