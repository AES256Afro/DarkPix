import type { Vec2 } from "./types";
import { normalizeRaidVariationSeed } from "./contract";

export interface WallSpec extends Vec2 {
  width: number;
  depth: number;
}

export interface ChestSpec extends Vec2 {
  depthBonus: number;
  mimic?: boolean;
}

export interface EnemySpec extends Vec2 {
  kind: "skeleton" | "crawler" | "mimic" | "warden" | "rival" | "boss";
}

export interface TorchSpec extends Vec2 {
  rotation: number;
}

export interface TrapSpec extends Vec2 {
  damage: number;
}

export interface DartTrapSpec extends Vec2 {
  direction: Vec2;
  range: number;
  damage: number;
  delay: number;
}

export interface RaidVariation {
  encountersMirrored: boolean;
  portalSiteIndex: number;
  trapLayoutIndex: number;
  rivalArchetypeIndex: number;
  campfireSiteIndex: number;
}

export const DUNGEON = {
  name: "Crypt of the Pale Toll",
  size: 44,
  playerStart: { x: 0, z: 17.4 },
  campfire: { x: -16, z: 15 },
  campfireSites: [{ x: -16, z: 15 }, { x: 16, z: 15 }] satisfies Vec2[],
  shrine: { x: -20.4, z: -16.5 },
  portal: { x: 16, z: -16 },
  portalSites: [{ x: 16, z: -16 }, { x: -14, z: -18 }] satisfies Vec2[],
  walls: [
    { x: 0, z: -22, width: 44, depth: 1 },
    { x: 0, z: 22, width: 44, depth: 1 },
    { x: -22, z: 0, width: 1, depth: 44 },
    { x: 22, z: 0, width: 1, depth: 44 },
    { x: -10, z: 14, width: 1, depth: 15 },
    { x: -10, z: -13, width: 1, depth: 13 },
    { x: 10, z: 15, width: 1, depth: 13 },
    { x: 10, z: -12, width: 1, depth: 16 },
    { x: -19, z: 7, width: 6, depth: 1 },
    { x: -12, z: 7, width: 4, depth: 1 },
    { x: 12, z: 7, width: 4, depth: 1 },
    { x: 19, z: 7, width: 6, depth: 1 },
    { x: -19, z: -7, width: 6, depth: 1 },
    { x: -12, z: -7, width: 4, depth: 1 },
    { x: 12, z: -7, width: 4, depth: 1 },
    { x: 19, z: -7, width: 6, depth: 1 },
    { x: -4, z: 3, width: 12, depth: 1 },
    { x: 5, z: -3, width: 11, depth: 1 },
    { x: -18, z: -10.5, width: 1, depth: 6 },
    { x: -18, z: -18.5, width: 1, depth: 6 },
  ] satisfies WallSpec[],
  secretPassage: { x: -18, z: -14.5, width: 1, depth: 2 } satisfies WallSpec,
  pillars: [
    { x: -19, z: 19 },
    { x: 19, z: 19 },
    { x: -19, z: -19 },
    { x: 19, z: -19 },
    { x: -8, z: 5 },
    { x: 8, z: -5 },
  ] satisfies Vec2[],
  torches: [
    { x: -7, z: 18, rotation: 0 },
    { x: 7, z: 18, rotation: 0 },
    { x: -18, z: 10, rotation: Math.PI / 2 },
    { x: 18, z: 10, rotation: -Math.PI / 2 },
    { x: -7, z: 1.5, rotation: 0 },
    { x: 7, z: -1.5, rotation: Math.PI },
    { x: -18, z: -12, rotation: Math.PI / 2 },
    { x: 18, z: -12, rotation: -Math.PI / 2 },
    { x: 0, z: -20.5, rotation: Math.PI },
  ] satisfies TorchSpec[],
  chests: [
    { x: -16, z: 11, depthBonus: 0.01 },
    { x: 16, z: 12, depthBonus: 0.03 },
    { x: -16, z: -15, depthBonus: 0.08 },
    { x: 4, z: -16, depthBonus: 0.12, mimic: true },
  ] satisfies ChestSpec[],
  trapLayouts: [
    [
      { x: 0, z: 8, damage: 16 },
      { x: -15, z: 4, damage: 18 },
      { x: 14, z: -4, damage: 20 },
      { x: 0, z: -13, damage: 22 },
    ],
    [
      { x: 0, z: 8, damage: 16 },
      { x: 15, z: 4, damage: 18 },
      { x: -14, z: -4, damage: 20 },
      { x: 0, z: -13, damage: 22 },
    ],
  ] satisfies TrapSpec[][],
  dartTrapLayouts: [
    [
      { x: -9.35, z: 11, direction: { x: 1, z: 0 }, range: 8, damage: 14, delay: 0.4 },
      { x: 9.35, z: -10, direction: { x: -1, z: 0 }, range: 8, damage: 16, delay: 1.8 },
    ],
    [
      { x: 9.35, z: 11, direction: { x: -1, z: 0 }, range: 8, damage: 14, delay: 0.4 },
      { x: -9.35, z: -10, direction: { x: 1, z: 0 }, range: 8, damage: 16, delay: 1.8 },
    ],
  ] satisfies DartTrapSpec[][],
  enemies: [
    { kind: "crawler", x: -5, z: 12 },
    { kind: "skeleton", x: 5, z: 9 },
    { kind: "warden", x: -16, z: -11 },
    { kind: "warden", x: 15, z: 2 },
    { kind: "skeleton", x: 4, z: -11 },
    { kind: "crawler", x: -4, z: -17 },
    { kind: "rival", x: 14, z: -9 },
    { kind: "boss", x: 16, z: -14 },
  ] satisfies EnemySpec[],
} as const;

export function selectRaidVariation(seed: number): RaidVariation {
  const normalized = normalizeRaidVariationSeed(seed);
  return {
    encountersMirrored: (normalized & 1) === 1,
    portalSiteIndex: (normalized >> 1) & 1,
    trapLayoutIndex: (normalized >> 2) & 1,
    rivalArchetypeIndex: (normalized >> 3) & 1,
    campfireSiteIndex: (normalized >> 4) & 1,
  };
}

function dungeonCoordinatesCollide(x: number, z: number, radius: number, secretPassageClosed: boolean): boolean {
  for (const wall of DUNGEON.walls) {
    if (Math.abs(x - wall.x) < wall.width / 2 + radius && Math.abs(z - wall.z) < wall.depth / 2 + radius) return true;
  }
  for (const pillar of DUNGEON.pillars) {
    if (Math.abs(x - pillar.x) < 0.55 + radius && Math.abs(z - pillar.z) < 0.55 + radius) return true;
  }
  if (!secretPassageClosed) return false;
  const passage = DUNGEON.secretPassage;
  return Math.abs(x - passage.x) < passage.width / 2 + radius
    && Math.abs(z - passage.z) < passage.depth / 2 + radius;
}

export function dungeonCollides(position: Vec2, radius = 0.38, secretPassageClosed = false): boolean {
  return dungeonCoordinatesCollide(position.x, position.z, radius, secretPassageClosed);
}

export function encounterPosition(position: Vec2, mirrored: boolean): Vec2 {
  return { x: mirrored ? -position.x : position.x, z: position.z };
}

function snap(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function nearestOpenGridPoint(point: Vec2, radius: number, step: number, secretPassageClosed: boolean): Vec2 | undefined {
  const half = DUNGEON.size / 2;
  const snapped = { x: snap(point.x, step), z: snap(point.z, step) };
  for (let ring = 0; ring <= 4; ring += 1) {
    for (let xOffset = -ring; xOffset <= ring; xOffset += 1) {
      for (let zOffset = -ring; zOffset <= ring; zOffset += 1) {
        if (ring > 0 && Math.max(Math.abs(xOffset), Math.abs(zOffset)) !== ring) continue;
        const candidate = {
          x: snapped.x + xOffset * step,
          z: snapped.z + zOffset * step,
        };
        if (Math.abs(candidate.x) > half || Math.abs(candidate.z) > half || dungeonCollides(candidate, radius, secretPassageClosed)) continue;
        return candidate;
      }
    }
  }
  return undefined;
}

function simplifyPath(start: Vec2, path: Vec2[], radius: number, secretPassageClosed: boolean): Vec2[] {
  const simplified: Vec2[] = [];
  let anchor = start;
  let cursor = 0;
  while (cursor < path.length) {
    let farthest = cursor;
    for (let candidate = path.length - 1; candidate > cursor; candidate -= 1) {
      const target = path[candidate];
      if (target && dungeonLineOfSight(anchor, target, radius, secretPassageClosed)) {
        farthest = candidate;
        break;
      }
    }
    const waypoint = path[farthest];
    if (!waypoint) break;
    simplified.push(waypoint);
    anchor = waypoint;
    cursor = farthest + 1;
  }
  return simplified;
}

export function dungeonPath(start: Vec2, target: Vec2, radius = 0.3, step = 0.5, secretPassageClosed = false): Vec2[] {
  const origin = nearestOpenGridPoint(start, radius, step, secretPassageClosed);
  const destination = nearestOpenGridPoint(target, radius, step, secretPassageClosed);
  if (!origin || !destination) return [];

  const key = (point: Vec2) => `${point.x.toFixed(2)}:${point.z.toFixed(2)}`;
  const originKey = key(origin);
  const destinationKey = key(destination);
  if (originKey === destinationKey) return [{ ...target }];

  const half = DUNGEON.size / 2;
  const open = new Map<string, Vec2>([[originKey, origin]]);
  const cameFrom = new Map<string, string>();
  const points = new Map<string, Vec2>([[originKey, origin]]);
  const cost = new Map<string, number>([[originKey, 0]]);

  while (open.size > 0) {
    let currentKey = "";
    let current: Vec2 | undefined;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const [candidateKey, candidate] of open) {
      const candidateScore = (cost.get(candidateKey) ?? Number.POSITIVE_INFINITY)
        + Math.abs(destination.x - candidate.x)
        + Math.abs(destination.z - candidate.z);
      if (candidateScore < bestScore) {
        currentKey = candidateKey;
        current = candidate;
        bestScore = candidateScore;
      }
    }
    if (!current) break;
    if (currentKey === destinationKey) {
      const path: Vec2[] = [destination];
      let backtrackKey = destinationKey;
      while (backtrackKey !== originKey) {
        const parentKey = cameFrom.get(backtrackKey);
        if (!parentKey) return [];
        backtrackKey = parentKey;
        const point = points.get(backtrackKey);
        if (point && backtrackKey !== originKey) path.push(point);
      }
      path.reverse();
      if (!dungeonCollides(target, radius, secretPassageClosed)) path[path.length - 1] = { ...target };
      return simplifyPath(start, path, radius, secretPassageClosed);
    }

    open.delete(currentKey);
    const currentCost = cost.get(currentKey) ?? Number.POSITIVE_INFINITY;
    for (const [dx, dz] of [[step, 0], [-step, 0], [0, step], [0, -step]] as const) {
      const next = { x: current.x + dx, z: current.z + dz };
      if (Math.abs(next.x) > half || Math.abs(next.z) > half || dungeonCollides(next, radius, secretPassageClosed)) continue;
      const nextKey = key(next);
      const nextCost = currentCost + step;
      if (nextCost >= (cost.get(nextKey) ?? Number.POSITIVE_INFINITY)) continue;
      cameFrom.set(nextKey, currentKey);
      points.set(nextKey, next);
      cost.set(nextKey, nextCost);
      open.set(nextKey, next);
    }
  }
  return [];
}

export function dungeonPathExists(start: Vec2, target: Vec2, radius = 0.38, step = 0.5, secretPassageClosed = false): boolean {
  return dungeonPath(start, target, radius, step, secretPassageClosed).length > 0;
}

export function dungeonLineOfSight(start: Vec2, target: Vec2, radius = 0.06, secretPassageClosed = false): boolean {
  const distance = Math.hypot(target.x - start.x, target.z - start.z);
  const samples = Math.max(1, Math.ceil(distance / 0.2));
  for (let index = 1; index < samples; index += 1) {
    const progress = index / samples;
    const x = start.x + (target.x - start.x) * progress;
    const z = start.z + (target.z - start.z) * progress;
    if (dungeonCoordinatesCollide(x, z, radius, secretPassageClosed)) return false;
  }
  return true;
}

export function safeDroppedLootPosition(
  origin: Vec2,
  direction: Vec2,
  preferredDistance = 1.15,
  radius = 0.18,
  secretPassageClosed = false,
  target: Vec2 = { x: 0, z: 0 },
): Vec2 {
  const directionLength = Math.hypot(direction.x, direction.z);
  if (!Number.isFinite(origin.x) || !Number.isFinite(origin.z)) {
    target.x = 0;
    target.z = 0;
    return target;
  }
  if (!Number.isFinite(directionLength) || directionLength <= 0.001 || !Number.isFinite(preferredDistance) || preferredDistance <= 0 || !Number.isFinite(radius) || radius < 0) {
    target.x = origin.x;
    target.z = origin.z;
    return target;
  }
  const unitX = direction.x / directionLength;
  const unitZ = direction.z / directionLength;
  const maximumDistance = Math.min(3, preferredDistance);
  for (let distance = maximumDistance; distance >= 0.15; distance -= 0.15) {
    target.x = origin.x + unitX * distance;
    target.z = origin.z + unitZ * distance;
    if (!dungeonCollides(target, radius, secretPassageClosed) && dungeonLineOfSight(origin, target, radius, secretPassageClosed)) return target;
  }
  target.x = origin.x;
  target.z = origin.z;
  return target;
}

export function dungeonProjectileStoneContact(start: Vec2, target: Vec2, radius = 0.04, secretPassageClosed = false): number | undefined {
  if (!Number.isFinite(start.x) || !Number.isFinite(start.z) || !Number.isFinite(target.x) || !Number.isFinite(target.z) || !Number.isFinite(radius) || radius < 0) return 0;
  const distance = Math.hypot(target.x - start.x, target.z - start.z);
  const samples = Math.max(1, Math.ceil(distance / 0.2));
  for (let index = 0; index <= samples; index += 1) {
    const progress = index / samples;
    const x = start.x + (target.x - start.x) * progress;
    const z = start.z + (target.z - start.z) * progress;
    if (dungeonCoordinatesCollide(x, z, radius, secretPassageClosed)) return progress;
  }
  return undefined;
}

export function dungeonProjectilePathClear(start: Vec2, target: Vec2, radius = 0.04, secretPassageClosed = false): boolean {
  return dungeonProjectileStoneContact(start, target, radius, secretPassageClosed) === undefined;
}

export function dartTrapTargetDistance(origin: Vec2, direction: Vec2, range: number, target: Vec2, laneRadius = 0.5): number {
  const directionLength = Math.hypot(direction.x, direction.z);
  if (!Number.isFinite(directionLength) || directionLength <= 0.001 || !Number.isFinite(range) || range <= 0) return Number.POSITIVE_INFINITY;
  const unitX = direction.x / directionLength;
  const unitZ = direction.z / directionLength;
  const offsetX = target.x - origin.x;
  const offsetZ = target.z - origin.z;
  const distance = offsetX * unitX + offsetZ * unitZ;
  const lateralDistance = Math.abs(offsetX * unitZ - offsetZ * unitX);
  if (distance < 0.15 || distance > range || lateralDistance > Math.max(0, laneRadius)) return Number.POSITIVE_INFINITY;
  return distance;
}
