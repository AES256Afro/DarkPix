import { describe, expect, it } from "vitest";
import { DUNGEON, dartTrapTargetDistance, dungeonCollides, dungeonLineOfSight, dungeonPath, dungeonPathExists, dungeonProjectilePathClear, dungeonProjectileStoneContact, encounterPosition, safeDroppedLootPosition, selectRaidVariation } from "../src/game/dungeon";
import { ASHEN_CHESTS, ASHEN_ENEMIES } from "../src/game/depth";
import { channelCommitmentLabel, channelInterruptionReason, continuousHold, heldInteractionTargetMatches, targetDistanceInView } from "../src/game/targeting";
import { cardinalDirection, circlesOverlap, directionalCue, movementOffset, movementSubstepCount, passiveAwarenessRange, recoveryNeed, relativeDirectionToSource } from "../src/game/navigation";
import { DARKNESS_PULSE_SECONDS, darknessPulseReady, directionToZoneCenter, distanceFromZoneCenter, distanceOutsideZone, zoneState } from "../src/game/zone";
import type { Vec2 } from "../src/game/types";
import { RAID_VARIATION_COUNT, normalizeRaidVariationSeed, raidVariationSeal, validRaidVariationSeed } from "../src/game/contract";

describe("Crypt of the Pale Toll topology", () => {
  it("keeps every contract-critical location reachable from the player start", () => {
    const contractEnemies = DUNGEON.enemies.filter((enemy) => enemy.kind === "warden" || enemy.kind === "boss");
    const criticalLocations = [...DUNGEON.campfireSites, DUNGEON.shrine, ...DUNGEON.portalSites, ...contractEnemies, ...DUNGEON.chests];
    for (const location of criticalLocations) {
      expect(dungeonPathExists(DUNGEON.playerStart, location), `${location.x},${location.z} should be reachable`).toBe(true);
    }
  });

  it("keeps both encounter orientations open and reachable", () => {
    for (const mirrored of [false, true]) {
      const encounters = [...DUNGEON.enemies, ...DUNGEON.chests, ...ASHEN_ENEMIES, ...ASHEN_CHESTS];
      for (const encounter of encounters) {
        const position = encounterPosition(encounter, mirrored);
        expect(dungeonCollides(position, 0.3), `${position.x},${position.z} should remain open`).toBe(false);
        expect(dungeonPathExists(DUNGEON.playerStart, position, 0.3), `${position.x},${position.z} should remain reachable`).toBe(true);
      }
    }
  });

  it("mirrors only the encounter x axis without mutating the source", () => {
    const source = { x: 7, z: -4 };
    expect(encounterPosition(source, false)).toEqual(source);
    expect(encounterPosition(source, true)).toEqual({ x: -7, z: -4 });
    expect(source).toEqual({ x: 7, z: -4 });
  });

  it("keeps the hidden reliquary alcove sealed by one discoverable gap", () => {
    const passage = DUNGEON.secretPassage;
    const outside = { x: passage.x + 1.5, z: passage.z };
    const inside = { x: passage.x - 1.5, z: passage.z };
    expect(dungeonCollides(passage, 0.1)).toBe(false);
    expect(dungeonCollides(passage, 0.1, true)).toBe(true);
    expect(dungeonPathExists(outside, DUNGEON.shrine, 0.3)).toBe(true);
    expect(dungeonPathExists(outside, DUNGEON.shrine, 0.3, 0.5, true)).toBe(false);
    expect(dungeonLineOfSight(outside, inside, 0.04)).toBe(true);
    expect(dungeonLineOfSight(outside, inside, 0.04, true)).toBe(false);
    expect(dungeonLineOfSight(outside, passage, 0.03)).toBe(true);
    expect(dungeonLineOfSight(outside, passage, 0.03, true)).toBe(false);
    expect(dungeonProjectileStoneContact(outside, inside, 0.04, true)).toBeDefined();
    expect(DUNGEON.walls.some((wall) => wall.x === passage.x && wall.z < passage.z)).toBe(true);
    expect(DUNGEON.walls.some((wall) => wall.x === passage.x && wall.z > passage.z)).toBe(true);
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

  it("blocks projectile segments whose start, path, or endpoint touches masonry", () => {
    expect(dungeonProjectilePathClear(DUNGEON.playerStart, { x: -5, z: 12 })).toBe(true);
    expect(dungeonProjectilePathClear({ x: -9, z: 14 }, { x: -9.6, z: 14 })).toBe(false);
    expect(dungeonProjectilePathClear({ x: -9.6, z: 14 }, { x: -9, z: 14 })).toBe(false);
    expect(dungeonProjectilePathClear({ x: -9, z: 14 }, { x: -11, z: 14 })).toBe(false);
    expect(dungeonProjectilePathClear({ x: Number.NaN, z: 0 }, { x: 0, z: 0 })).toBe(false);
    expect(dungeonProjectileStoneContact({ x: -9, z: 14 }, { x: -11, z: 14 })).toBeCloseTo(0.3);
    expect(dungeonProjectileStoneContact(DUNGEON.playerStart, { x: -5, z: 12 })).toBeUndefined();
    expect(dungeonProjectileStoneContact({ x: Number.NaN, z: 0 }, { x: 0, z: 0 })).toBe(0);
  });

  it("keeps discarded haul on the delver's side of masonry", () => {
    const openDrop = safeDroppedLootPosition(DUNGEON.playerStart, { x: 1, z: 0 });
    expect(openDrop).toEqual({ x: 1.15, z: DUNGEON.playerStart.z });
    const nearWall = { x: -9, z: 14 };
    const blockedDrop = safeDroppedLootPosition(nearWall, { x: -1, z: 0 });
    expect(blockedDrop.x).toBeGreaterThan(-9.5);
    expect(dungeonCollides(blockedDrop, 0.18)).toBe(false);
    expect(dungeonLineOfSight(nearWall, blockedDrop, 0.18)).toBe(true);
    const outsideSecret = { x: -16.8, z: DUNGEON.secretPassage.z };
    const sealedDrop = safeDroppedLootPosition(outsideSecret, { x: -1, z: 0 }, 2, 0.18, true);
    const openedDrop = safeDroppedLootPosition(outsideSecret, { x: -1, z: 0 }, 2, 0.18, false);
    expect(sealedDrop.x).toBeGreaterThan(DUNGEON.secretPassage.x);
    expect(openedDrop.x).toBeLessThan(DUNGEON.secretPassage.x);
    expect(safeDroppedLootPosition(nearWall, { x: Number.NaN, z: 0 })).toEqual(nearWall);
  });

  it("places both readable trap layouts in open corridors", () => {
    expect(DUNGEON.trapLayouts).toHaveLength(2);
    expect(DUNGEON.dartTrapLayouts).toHaveLength(2);
    for (const floorLayout of DUNGEON.trapLayouts) {
      expect(floorLayout).toHaveLength(4);
      for (const trap of floorLayout) expect(dungeonCollides(trap, 0.2)).toBe(false);
    }
    for (const dartLayout of DUNGEON.dartTrapLayouts) {
      expect(dartLayout).toHaveLength(2);
      for (const trap of dartLayout) {
        const target = {
          x: trap.x + trap.direction.x * (trap.range - 0.5),
          z: trap.z + trap.direction.z * (trap.range - 0.5),
        };
        expect(dungeonCollides(target, 0.2)).toBe(false);
        expect(dungeonLineOfSight({ x: trap.x, z: trap.z }, target, 0.02)).toBe(true);
        expect(dartTrapTargetDistance(trap, trap.direction, trap.range, target)).toBeCloseTo(trap.range - 0.5);
      }
    }
  });

  it("derives all five raid-variation switches from one bounded seed", () => {
    expect(selectRaidVariation(0)).toEqual({ encountersMirrored: false, portalSiteIndex: 0, trapLayoutIndex: 0, rivalArchetypeIndex: 0, campfireSiteIndex: 0 });
    expect(selectRaidVariation(31)).toEqual({ encountersMirrored: true, portalSiteIndex: 1, trapLayoutIndex: 1, rivalArchetypeIndex: 1, campfireSiteIndex: 1 });
    expect(selectRaidVariation(32)).toEqual(selectRaidVariation(0));
    expect(selectRaidVariation(-31)).toEqual(selectRaidVariation(31));
    expect(selectRaidVariation(Number.NaN)).toEqual(selectRaidVariation(0));
    expect(new Set(Array.from({ length: 32 }, (_, seed) => JSON.stringify(selectRaidVariation(seed))))).toHaveLength(32);
  });

  it("gives every bounded layout a compact stable contract seal", () => {
    expect(RAID_VARIATION_COUNT).toBe(32);
    expect(raidVariationSeal(0)).toBe("PT-00");
    expect(raidVariationSeal(31)).toBe("PT-1F");
    expect(raidVariationSeal(32)).toBe("PT-00");
    expect(normalizeRaidVariationSeed(-31)).toBe(31);
    expect(validRaidVariationSeed(31)).toBe(true);
    expect(validRaidVariationSeed(32)).toBe(false);
    expect(new Set(Array.from({ length: RAID_VARIATION_COUNT }, (_, seed) => raidVariationSeal(seed)))).toHaveLength(RAID_VARIATION_COUNT);
  });

  it("rejects targets behind, beside, or beyond a wall dart lane", () => {
    const origin = { x: 0, z: 0 };
    const direction = { x: 1, z: 0 };
    expect(dartTrapTargetDistance(origin, direction, 8, { x: 4, z: 0.4 })).toBe(4);
    expect(dartTrapTargetDistance(origin, direction, 8, { x: -1, z: 0 })).toBe(Number.POSITIVE_INFINITY);
    expect(dartTrapTargetDistance(origin, direction, 8, { x: 4, z: 0.6 })).toBe(Number.POSITIVE_INFINITY);
    expect(dartTrapTargetDistance(origin, direction, 8, { x: 9, z: 0 })).toBe(Number.POSITIVE_INFINITY);
    expect(dartTrapTargetDistance(origin, { x: 0, z: 0 }, 8, { x: 4, z: 0 })).toBe(Number.POSITIVE_INFINITY);
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
    expect(targetDistanceInView(origin, facing, { x: 0, z: -2 }, 2.6, 0.62, false)).toBe(Number.POSITIVE_INFINITY);
    expect(targetDistanceInView(origin, facing, { x: 0, z: -2 }, 2.6, 0.62, true)).toBe(2);
  });

  it("proves the dungeon cover check can separate close targets across stone", () => {
    const nearSide = { x: -9, z: 14 };
    const farSide = { x: -11, z: 14 };
    expect(Math.hypot(farSide.x - nearSide.x, farSide.z - nearSide.z)).toBeLessThan(2.6);
    expect(dungeonLineOfSight(nearSide, farSide, 0.03)).toBe(false);
    expect(targetDistanceInView(nearSide, { x: -1, z: 0 }, farSide, 2.6, 0.62, dungeonLineOfSight(nearSide, farSide, 0.03))).toBe(Number.POSITIVE_INFINITY);
  });

  it("resets continuous rest and extraction holds when interrupted", () => {
    const partial = continuousHold(0, 0.9, true);
    expect(continuousHold(partial, 0.4, true)).toBeCloseTo(1.3);
    expect(continuousHold(partial, 0.4, false)).toBe(0);
    expect(continuousHold(Number.NaN, -1, true)).toBe(0);
  });

  it("binds held progress to the world target that began the ritual", () => {
    expect(heldInteractionTargetMatches("portal", "portal")).toBe(true);
    expect(heldInteractionTargetMatches("campfire", "campfire")).toBe(true);
    expect(heldInteractionTargetMatches("false_wall", "portal")).toBe(false);
    expect(heldInteractionTargetMatches("portal", undefined)).toBe(false);
    expect(heldInteractionTargetMatches(undefined, undefined)).toBe(false);
  });

  it("names the irreversible destination throughout a held passage channel", () => {
    expect(channelCommitmentLabel("portal", false, 1)).toBe("EXTRACTING BLUE · RETURN TO STASH");
    expect(channelCommitmentLabel("portal", true, 1)).toBe("DESCENDING RED · FLOOR 2");
    expect(channelCommitmentLabel("portal", false, 2)).toBe("EXTRACTING ASHEN · RETURN TO STASH");
    expect(channelCommitmentLabel("campfire", false, 1)).toBe("RESTING AT CAMPFIRE");
    expect(channelCommitmentLabel("false_wall", false, 1)).toBe("OPENING FALSE STONE");
    expect(channelCommitmentLabel(undefined, false, 1)).toBe("CHANNELING");
  });

  it("reduces passive acquisition through both darkness and crouching", () => {
    expect(passiveAwarenessRange(true, false)).toBe(10.5);
    expect(passiveAwarenessRange(false, false)).toBe(6.5);
    expect(passiveAwarenessRange(true, true)).toBeCloseTo(6.93);
    expect(passiveAwarenessRange(false, true)).toBeCloseTo(4.29);
    expect(passiveAwarenessRange(true, false, true)).toBeCloseTo(14.175);
    expect(passiveAwarenessRange(false, false, true)).toBeCloseTo(8.775);
    expect(passiveAwarenessRange(true, true, true)).toBeCloseTo(6.93);
    expect(passiveAwarenessRange(false, false, false, false, 22)).toBeCloseTo(5.07);
    expect(passiveAwarenessRange(false, true, false, false, 22)).toBeCloseTo(3.64);
    expect(passiveAwarenessRange(false, false, false, true, 20)).toBeCloseTo(7.8);
    expect(passiveAwarenessRange(true, true, false, true, 20)).toBeCloseTo(8.316);
    expect(passiveAwarenessRange(true, false, false, true, Number.NaN)).toBe(10.5);
  });

  it("names the highest-priority channel interruption", () => {
    expect(channelInterruptionReason({ targeted: true, moving: false, guarding: false, recovering: false, damaged: false })).toBeUndefined();
    expect(channelInterruptionReason({ targeted: false, moving: true, guarding: true, recovering: true, damaged: false })).toBe("target_lost");
    expect(channelInterruptionReason({ targeted: true, moving: true, guarding: true, recovering: true, damaged: false })).toBe("moving");
    expect(channelInterruptionReason({ targeted: true, moving: false, guarding: true, recovering: true, damaged: false })).toBe("guarding");
    expect(channelInterruptionReason({ targeted: true, moving: false, guarding: false, recovering: true, damaged: false })).toBe("recovering");
    expect(channelInterruptionReason({ targeted: false, moving: true, guarding: true, recovering: true, damaged: true })).toBe("damaged");
  });
});

describe("contract wayfinding", () => {
  it("maps world vectors to stable eight-way headings", () => {
    expect(cardinalDirection({ x: 0, z: -1 })).toBe("N");
    expect(cardinalDirection({ x: 1, z: 0 })).toBe("E");
    expect(cardinalDirection({ x: -1, z: 1 })).toBe("SW");
    expect(cardinalDirection({ x: 0, z: 0 })).toBe("HERE");
  });

  it("classifies impact sources relative to the player's facing", () => {
    const origin = { x: 0, z: 0 };
    expect(relativeDirectionToSource(0, origin, { x: 0, z: -4 })).toBe("FRONT");
    expect(relativeDirectionToSource(0, origin, { x: 4, z: 0 })).toBe("RIGHT");
    expect(relativeDirectionToSource(0, origin, { x: 0, z: 4 })).toBe("BACK");
    expect(relativeDirectionToSource(0, origin, { x: -4, z: 0 })).toBe("LEFT");
    expect(relativeDirectionToSource(Math.PI / 2, origin, { x: -4, z: 0 })).toBe("FRONT");
    expect(relativeDirectionToSource(0, origin, origin)).toBe("CENTER");
    expect(relativeDirectionToSource(Number.NaN, origin, { x: 0, z: -4 })).toBe("FRONT");
  });

  it("pairs directional warnings with shapes and text", () => {
    const origin = { x: 0, z: 0 };
    expect(directionalCue(0, origin, { x: 4, z: 0 }, "strike")).toEqual({ direction: "RIGHT", marker: "▶", text: "▶ STRIKE · RIGHT" });
    expect(directionalCue(0, origin, origin, " ")).toEqual({ direction: "CENTER", marker: "◆", text: "◆ THREAT · CENTER" });
  });

  it("turns local sidestep input into a bounded world offset", () => {
    expect(movementOffset(0, 0, 1, 1.5)).toEqual({ x: 0, z: -1.5 });
    expect(movementOffset(0, 1, 0, 1.5)).toEqual({ x: 1.5, z: 0 });
    expect(movementOffset(Math.PI / 2, 0, 1, 2).x).toBeCloseTo(-2);
    expect(Math.hypot(...Object.values(movementOffset(0, 1, 1, 1.5)))).toBeCloseTo(1.5);
    expect(movementOffset(0, Number.NaN, 0, 2)).toEqual({ x: 0, z: 0 });
    expect(movementOffset(0, 1, 0, -2)).toEqual({ x: 0, z: 0 });
    const target = { x: 99, z: 99 };
    expect(movementOffset(0, 1, 1, 2, target)).toBe(target);
    expect(Math.hypot(target.x, target.z)).toBeCloseTo(2);
  });

  it("derives bounded collision substeps from movement distance", () => {
    expect(movementSubstepCount(0)).toBe(1);
    expect(movementSubstepCount(0.2)).toBe(1);
    expect(movementSubstepCount(0.21)).toBe(2);
    expect(movementSubstepCount(1.8)).toBe(9);
    expect(movementSubstepCount(1.8, 0.3)).toBe(6);
    expect(movementSubstepCount(Number.NaN)).toBe(1);
    expect(movementSubstepCount(1, 0)).toBe(1);
    expect(movementSubstepCount(1_000)).toBe(64);
  });

  it("requests campfire guidance only for critical recoverable resources", () => {
    expect(recoveryNeed(100, 100, 100, 100, 0, true)).toBe("MEMORY");
    expect(recoveryNeed(32, 100, 100, 100, 6, false)).toBe("VIGOR");
    expect(recoveryNeed(100, 100, 12, 100, 6, false)).toBe("STAMINA");
    expect(recoveryNeed(100, 100, 100, 100, 6, false, 20)).toBe("TORCH");
    expect(recoveryNeed(100, 100, 100, 100, 6, false, 21)).toBeUndefined();
    expect(recoveryNeed(33, 100, 13, 100, 6, false)).toBeUndefined();
    expect(recoveryNeed(Number.NaN, 100, 100, 100, 6, false)).toBeUndefined();
    expect(recoveryNeed(10, 0, 10, 0, 6, false)).toBeUndefined();
  });

  it("keeps physical threat circles from stacking", () => {
    expect(circlesOverlap({ x: 0, z: 0 }, 0.3, { x: 0.5, z: 0 }, 0.3)).toBe(true);
    expect(circlesOverlap({ x: 0, z: 0 }, 0.3, { x: 0.7, z: 0 }, 0.3)).toBe(false);
  });
});

describe("migrating darkness", () => {
  it("closes over time but keeps either final blue passage barely inside", () => {
    const dormant = zoneState(0);
    const middle = zoneState(115);
    const final = zoneState(210);
    expect(dormant.radius).toBe(31);
    expect(middle.radius).toBeLessThan(dormant.radius);
    expect(final.radius).toBeLessThan(middle.radius);
    expect(distanceFromZoneCenter(DUNGEON.portal, final)).toBeLessThan(final.radius);
    for (const passage of DUNGEON.portalSites) {
      const passageFinal = zoneState(210, 210, passage);
      expect(dungeonCollides(passage)).toBe(false);
      expect(dungeonPathExists(DUNGEON.playerStart, passage)).toBe(true);
      expect(distanceFromZoneCenter(passage, passageFinal)).toBeLessThan(passageFinal.radius);
    }
  });

  it("measures only unsafe excess distance and points toward safe ground", () => {
    const zone = { progress: 0.5, center: { x: 3, z: -4 }, radius: 6 };
    expect(distanceOutsideZone({ x: 3, z: 1 }, zone)).toBe(0);
    expect(distanceOutsideZone({ x: 3, z: 5 }, zone)).toBe(3);
    expect(directionToZoneCenter({ x: 8, z: -1 }, zone)).toEqual({ x: -5, z: -3 });
    expect(cardinalDirection(directionToZoneCenter({ x: 8, z: -1 }, zone))).toBe("NW");
  });

  it("can update caller-owned darkness records without changing their identity", () => {
    const zone = { progress: 0, center: { x: 0, z: 0 }, radius: 0 };
    const center = zone.center;
    const updated = zoneState(115, 210, DUNGEON.portal, zone);
    const direction = { x: 0, z: 0 };
    expect(updated).toBe(zone);
    expect(updated.center).toBe(center);
    expect(updated.progress).toBeGreaterThan(0);
    expect(directionToZoneCenter(DUNGEON.playerStart, updated, direction)).toBe(direction);
    expect(direction).toEqual({
      x: updated.center.x - DUNGEON.playerStart.x,
      z: updated.center.z - DUNGEON.playerStart.z,
    });
  });

  it("paces darkness damage independently from ordinary hit recovery", () => {
    expect(DARKNESS_PULSE_SECONDS).toBe(0.32);
    expect(darknessPulseReady(0.1, 0)).toBe(true);
    expect(darknessPulseReady(2, 0.1)).toBe(false);
    expect(darknessPulseReady(0, 0)).toBe(false);
    expect(darknessPulseReady(Number.NaN, 0)).toBe(false);
  });
});
