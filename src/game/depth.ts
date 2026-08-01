import type { DungeonDepth } from "./types";

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

export function depthRules(depth: DungeonDepth | undefined): DepthRules {
  return depth === 2 ? ASHEN_DEPTH : PALE_TOLL;
}

export function depthXpBonus(depth: DungeonDepth | undefined, extracted: boolean): number {
  if (depth !== 2) return 0;
  return extracted ? 180 : 60;
}
