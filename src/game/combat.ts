import type { ClassId } from "./types";

export type AttackDirection = "OVERHEAD" | "THRUST" | "SWEEP";
export type ThreatKind = "skeleton" | "crawler" | "warden" | "rival" | "boss";

export interface EnemyAttackPattern {
  windup: number;
  recovery: number;
}

export interface DamageInput {
  baseDamage: number;
  weaponPower: number;
  progressionBonus: number;
  direction: AttackDirection;
  ambush: boolean;
  headshot: boolean;
}

export function attackDamage(input: DamageInput): number {
  let damage = Math.max(0, input.baseDamage + input.weaponPower + input.progressionBonus);
  if (input.direction === "OVERHEAD") damage *= 1.18;
  if (input.direction === "THRUST") damage *= 1.08;
  if (input.ambush) damage *= 2;
  if (input.headshot) damage *= 1.35;
  return Math.round(damage);
}

export function enemyAttackPattern(kind: ThreatKind, enraged = false): EnemyAttackPattern {
  if (kind === "boss") return enraged ? { windup: 0.34, recovery: 1.2 } : { windup: 0.62, recovery: 2.2 };
  if (kind === "warden") return { windup: 0.48, recovery: 1.9 };
  if (kind === "crawler") return { windup: 0.26, recovery: 1.25 };
  return { windup: 0.36, recovery: 1.55 };
}

export function guardDrainPerSecond(classId: ClassId): number {
  if (classId === "vanguard") return 7;
  if (classId === "hexbound") return 14;
  return 11;
}
