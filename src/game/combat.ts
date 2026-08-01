import type { ClassId } from "./types";
import type { Vec2 } from "./types";

export type AttackDirection = "OVERHEAD" | "THRUST" | "SWEEP";
export type ThreatKind = "skeleton" | "crawler" | "mimic" | "warden" | "rival" | "boss";

export interface EnemyAttackPattern {
  windup: number;
  recovery: number;
}

export type RivalTactic = "approach" | "retreat" | "throw" | "melee";

export interface DamageInput {
  baseDamage: number;
  weaponPower: number;
  progressionBonus: number;
  direction: AttackDirection;
  ambush: boolean;
  headshot: boolean;
  limb?: boolean;
}

export function attackDamage(input: DamageInput): number {
  let damage = Math.max(0, input.baseDamage + input.weaponPower + input.progressionBonus);
  if (input.direction === "OVERHEAD") damage *= 1.18;
  if (input.direction === "THRUST") damage *= 1.08;
  if (input.ambush) damage *= 2;
  if (input.headshot) damage *= 1.35;
  else if (input.limb) damage *= 0.82;
  return Math.round(damage);
}

export function enemyAttackPattern(kind: ThreatKind, enraged = false): EnemyAttackPattern {
  if (kind === "boss") return enraged ? { windup: 0.34, recovery: 1.2 } : { windup: 0.62, recovery: 2.2 };
  if (kind === "warden") return { windup: 0.48, recovery: 1.9 };
  if (kind === "crawler") return { windup: 0.26, recovery: 1.25 };
  if (kind === "mimic") return { windup: 0.32, recovery: 1.4 };
  if (kind === "rival") return { windup: 0.5, recovery: 1.8 };
  return { windup: 0.36, recovery: 1.55 };
}

export function rivalTactic(distance: number, hasSight: boolean): RivalTactic {
  if (!Number.isFinite(distance) || distance < 0 || !hasSight || distance > 6.5) return "approach";
  if (distance <= 1.75) return "melee";
  if (distance < 3.1) return "retreat";
  return "throw";
}

export function guardDrainPerSecond(classId: ClassId): number {
  if (classId === "vanguard") return 7;
  if (classId === "hexbound") return 14;
  return 11;
}

export function classAbilityDamageMultiplier(classId: ClassId, activeSeconds: number): number {
  return classId === "reaver" && Number.isFinite(activeSeconds) && activeSeconds > 0 ? 1.25 : 1;
}

export function healthPercent(current: number, maximum: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(maximum) || maximum <= 0) return 0;
  return Math.min(100, Math.max(0, (current / maximum) * 100));
}

export function guardFacesThreat(facing: Vec2, toThreat: Vec2, minimumAlignment = 0.2): boolean {
  const facingLength = Math.hypot(facing.x, facing.z);
  const threatLength = Math.hypot(toThreat.x, toThreat.z);
  if (!Number.isFinite(facingLength) || !Number.isFinite(threatLength) || facingLength <= 0.001 || threatLength <= 0.001) return false;
  const alignment = (facing.x * toThreat.x + facing.z * toThreat.z) / (facingLength * threatLength);
  return alignment >= Math.min(1, Math.max(-1, minimumAlignment));
}

export function trapDamageAgainstThreat(baseDamage: number, kind: ThreatKind): number {
  const safeDamage = Number.isFinite(baseDamage) ? Math.max(0, baseDamage) : 0;
  const multiplier = kind === "boss" ? 0.55 : kind === "rival" ? 1 : 1.3;
  return Math.round(safeDamage * multiplier);
}
