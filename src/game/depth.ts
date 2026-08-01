import type { DungeonDepth } from "./types";
import type { ChestSpec, EnemySpec } from "./dungeon";

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

export function depthRules(depth: DungeonDepth | undefined): DepthRules {
  return depth === 2 ? ASHEN_DEPTH : PALE_TOLL;
}

export function depthXpBonus(depth: DungeonDepth | undefined, extracted: boolean): number {
  if (depth !== 2) return 0;
  return extracted ? 180 : 60;
}
