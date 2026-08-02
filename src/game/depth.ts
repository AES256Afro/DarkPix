import type { DungeonDepth } from "./types";
import type { ChestSpec, EnemySpec } from "./dungeon";

export interface AshVentSpec {
  x: number;
  z: number;
  delay: number;
}

export const ASH_VENT_RADIUS = 1.35;
export const ASH_VENT_DAMAGE = 14;
export const ASH_VENT_WINDUP_SECONDS = 0.9;
export const ASH_VENT_ACTIVE_SECONDS = 0.45;
export const ASH_VENT_COOLDOWN_SECONDS = 4.8;

export interface DepthRules {
  depth: DungeonDepth;
  name: string;
  duration: number;
  spawnGrace: number;
  enemyHealthMultiplier: number;
  enemyDamageMultiplier: number;
  enemySpeedMultiplier: number;
  lootDepthBonus: number;
}

const PALE_TOLL: DepthRules = {
  depth: 1,
  name: "Pale Toll",
  duration: 210,
  spawnGrace: 8,
  enemyHealthMultiplier: 1,
  enemyDamageMultiplier: 1,
  enemySpeedMultiplier: 1,
  lootDepthBonus: 0,
};

const ASHEN_DEPTH: DepthRules = {
  depth: 2,
  name: "Ashen Depth",
  duration: 135,
  spawnGrace: 5,
  enemyHealthMultiplier: 1.22,
  enemyDamageMultiplier: 1.18,
  enemySpeedMultiplier: 1.05,
  lootDepthBonus: 0.16,
};

export const ASHEN_CHESTS = [
  { x: -16, z: 11, depthBonus: 0.18 },
  { x: 16, z: 12, depthBonus: 0.2 },
  { x: 4, z: -16, depthBonus: 0.24, mimic: true },
] satisfies ChestSpec[];

export const ASHEN_ENEMIES = [
  { kind: "skeleton", x: -5, z: 12 },
  { kind: "mimic", x: -16, z: 10 },
  { kind: "warden", x: -16, z: -11 },
  { kind: "warden", x: 15, z: 2 },
  { kind: "skeleton", x: 4, z: -11 },
  { kind: "crawler", x: -4, z: -17 },
  { kind: "rival", x: 14, z: -9 },
  { kind: "boss", x: 16, z: -14 },
] satisfies EnemySpec[];

export const ASH_VENTS = [
  { x: 0, z: 10, delay: 1.1 },
  { x: -15, z: 1, delay: 2.3 },
  { x: 15, z: -1, delay: 3.5 },
  { x: 0, z: -11, delay: 4.7 },
] satisfies AshVentSpec[];

export function ashVentHits(origin: { x: number; z: number }, target: { x: number; z: number }, radius = ASH_VENT_RADIUS): boolean {
  if (!Number.isFinite(origin.x) || !Number.isFinite(origin.z) || !Number.isFinite(target.x) || !Number.isFinite(target.z) || !Number.isFinite(radius) || radius < 0) return false;
  return Math.hypot(target.x - origin.x, target.z - origin.z) <= radius;
}

export function depthRules(depth: DungeonDepth | undefined): DepthRules {
  return depth === 2 ? ASHEN_DEPTH : PALE_TOLL;
}

export function depthXpBonus(depth: DungeonDepth | undefined, extracted: boolean): number {
  if (depth !== 2) return 0;
  return extracted ? 180 : 60;
}

export function bossRingActive(depth: DungeonDepth | undefined, enraged: boolean): boolean {
  return depth === 2 || enraged;
}

export function bossRingCooldown(depth: DungeonDepth | undefined, enraged: boolean): number {
  if (depth === 2) return enraged ? 3.8 : 4.8;
  return 6.4;
}
