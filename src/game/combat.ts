import type { ClassId, ThreatKind, Vec2 } from "./types";

export type AttackDirection = "OVERHEAD" | "THRUST" | "SWEEP";
export type { ThreatKind } from "./types";

export interface EnemyAttackPattern {
  windup: number;
  recovery: number;
}

export type RivalTactic = "approach" | "retreat" | "throw" | "melee";
export type RivalArchetype = "skirmisher" | "marauder";
export type RivalDungeonTactic = "ignore" | "approach" | "clash";
export type BossTactic = "approach" | "chain" | "melee";

export interface DamageInput {
  baseDamage: number;
  weaponPower: number;
  progressionBonus: number;
  direction: AttackDirection;
  ambush: boolean;
  headshot: boolean;
  limb?: boolean;
}

export interface DodgeStats {
  distance: number;
  stamina: number;
  cooldown: number;
}

export const RIPOSTE_DURATION_SECONDS = 1.5;

export type GuardDenialReason = "guard_broken" | "action_recovery" | "sidestep_recovery" | "stamina" | undefined;
export type DelverActionLock = "guard_broken" | "guarding" | "action_recovery" | "sidestep_recovery" | "channeling" | undefined;

export function guardDenialReason(stamina: number, guardBreakRemaining: number, actionRecoveryRemaining: number, sidestepRecoveryRemaining = 0): GuardDenialReason {
  if (Number.isFinite(guardBreakRemaining) && guardBreakRemaining > 0) return "guard_broken";
  if (Number.isFinite(actionRecoveryRemaining) && actionRecoveryRemaining > 0) return "action_recovery";
  if (Number.isFinite(sidestepRecoveryRemaining) && sidestepRecoveryRemaining > 0) return "sidestep_recovery";
  if (!Number.isFinite(stamina) || stamina < 1) return "stamina";
  return undefined;
}

export function delverActionLock(
  blocking: boolean,
  actionRecoveryRemaining: number,
  sidestepRecoveryRemaining: number,
  guardBreakRemaining: number,
  channelProgress: number,
): DelverActionLock {
  if (Number.isFinite(guardBreakRemaining) && guardBreakRemaining > 0) return "guard_broken";
  if (blocking) return "guarding";
  if (Number.isFinite(actionRecoveryRemaining) && actionRecoveryRemaining > 0) return "action_recovery";
  if (Number.isFinite(sidestepRecoveryRemaining) && sidestepRecoveryRemaining > 0) return "sidestep_recovery";
  if (Number.isFinite(channelProgress) && channelProgress > 0) return "channeling";
  return undefined;
}

export function delverRecoveryActive(
  actionRecoveryRemaining: number,
  swingRemaining: number,
  sidestepRecoveryRemaining: number,
  guardBreakRemaining: number,
  treating: boolean,
): boolean {
  return treating || [actionRecoveryRemaining, swingRemaining, sidestepRecoveryRemaining, guardBreakRemaining]
    .some((remaining) => Number.isFinite(remaining) && remaining > 0);
}

export function strikeImpactDelay(swingDuration: number): number {
  if (!Number.isFinite(swingDuration)) return 0.12;
  return Math.min(0.24, Math.max(0.08, swingDuration * 0.5));
}

export function safeDamageAmount(amount: number): number {
  return Number.isFinite(amount) ? Math.min(1_000_000, Math.max(0, amount)) : 0;
}

export function attackDamage(input: DamageInput): number {
  let damage = safeDamageAmount(input.baseDamage) + safeDamageAmount(input.weaponPower) + safeDamageAmount(input.progressionBonus);
  if (input.direction === "OVERHEAD") damage *= 1.18;
  if (input.direction === "THRUST") damage *= 1.08;
  if (input.ambush) damage *= 2;
  if (input.headshot) damage *= 1.35;
  else if (input.limb) damage *= 0.82;
  return Math.round(safeDamageAmount(damage));
}

export function enemyAttackPattern(kind: ThreatKind, enraged = false, ranged = false): EnemyAttackPattern {
  if (kind === "boss" && ranged) return enraged ? { windup: 0.62, recovery: 2.4 } : { windup: 0.9, recovery: 3.2 };
  if (kind === "boss") return enraged ? { windup: 0.34, recovery: 1.2 } : { windup: 0.62, recovery: 2.2 };
  if (kind === "warden") return { windup: 0.48, recovery: 1.9 };
  if (kind === "crawler") return { windup: 0.26, recovery: 1.25 };
  if (kind === "mimic") return { windup: 0.32, recovery: 1.4 };
  if (kind === "rival") return { windup: 0.5, recovery: 1.8 };
  return { windup: 0.36, recovery: 1.55 };
}

export function enemyStrikeFacesTarget(committedFacing: Vec2 | undefined, toTarget: Vec2, ranged: boolean): boolean {
  if (!committedFacing) return false;
  const facingLength = Math.hypot(committedFacing.x, committedFacing.z);
  const targetLength = Math.hypot(toTarget.x, toTarget.z);
  if (!Number.isFinite(facingLength) || !Number.isFinite(targetLength) || facingLength <= 0.001 || targetLength <= 0.001) return false;
  const alignment = (committedFacing.x * toTarget.x + committedFacing.z * toTarget.z) / (facingLength * targetLength);
  return alignment >= (ranged ? 0.92 : 0.35);
}

export type EnemyStrikeMissReason = "out_of_range" | "cover" | "evaded" | undefined;

export function enemyStrikeMissReason(distance: number, maximumRange: number, hasSight: boolean, facingTarget: boolean): EnemyStrikeMissReason {
  if (!Number.isFinite(distance) || !Number.isFinite(maximumRange) || maximumRange < 0 || distance > maximumRange) return "out_of_range";
  if (!hasSight) return "cover";
  if (!facingTarget) return "evaded";
  return undefined;
}

export function rivalTactic(distance: number, hasSight: boolean, archetype: RivalArchetype = "skirmisher"): RivalTactic {
  if (!Number.isFinite(distance) || distance < 0 || !hasSight || distance > 6.5) return "approach";
  if (archetype === "marauder") return distance <= 1.9 ? "melee" : "approach";
  if (distance <= 1.75) return "melee";
  if (distance < 3.1) return "retreat";
  return "throw";
}

export function rivalDungeonTactic(kind: ThreatKind, distance: number, hasSight: boolean): RivalDungeonTactic {
  if (kind === "rival" || kind === "boss" || !Number.isFinite(distance) || distance < 0 || !hasSight || distance > 6.5) return "ignore";
  return distance <= 1.9 ? "clash" : "approach";
}

export function dungeonCrossfireDamage(baseDamage: number, defenderKind: ThreatKind): number {
  const safeDamage = Number.isFinite(baseDamage) ? Math.max(0, baseDamage) : 0;
  const multiplier = defenderKind === "warden" ? 0.55 : defenderKind === "rival" ? 0.7 : defenderKind === "boss" ? 0 : 0.65;
  return safeDamage > 0 && multiplier > 0 ? Math.max(1, Math.round(safeDamage * multiplier)) : 0;
}

export function bossTactic(distance: number, hasSight: boolean, enraged = false): BossTactic {
  if (!Number.isFinite(distance) || distance < 0 || !hasSight || distance > 7.2) return "approach";
  if (distance <= 2.35) return "melee";
  if (distance >= (enraged ? 2.8 : 3.4)) return "chain";
  return "approach";
}

export function bossTollHits(distance: number, hasSight: boolean): boolean {
  return hasSight && Number.isFinite(distance) && distance >= 2.45 && distance <= 6.35;
}

export function bossTollDamage(baseDamage: number, guarded: boolean): number {
  const safeDamage = Number.isFinite(baseDamage) ? Math.max(0, baseDamage) : 0;
  return Math.round(safeDamage * 0.82 * (guarded ? 0.42 : 1));
}

export function guardDrainPerSecond(classId: ClassId): number {
  if (classId === "vanguard") return 7;
  if (classId === "hexbound") return 14;
  return 11;
}

export function guardBreakDuration(classId: ClassId): number {
  if (classId === "vanguard") return 0.7;
  if (classId === "hexbound") return 1.05;
  if (classId === "cleric" || classId === "reaver") return 0.82;
  return 0.9;
}

export function classAbilityDamageMultiplier(classId: ClassId, activeSeconds: number): number {
  if (!Number.isFinite(activeSeconds) || activeSeconds <= 0) return 1;
  return classId === "reaver" ? 1.25 : classId === "shapeshifter" ? 1.3 : 1;
}

export function classAttackDelay(classId: ClassId, baseDelay: number, activeSeconds: number): number {
  const safeDelay = Number.isFinite(baseDelay) ? Math.max(0.2, baseDelay) : 0.8;
  if (!Number.isFinite(activeSeconds) || activeSeconds <= 0) return safeDelay;
  if (classId === "ranger") return Math.max(0.24, safeDelay * 0.58);
  if (classId === "shapeshifter") return Math.max(0.28, safeDelay * 0.8);
  return safeDelay;
}

export function attackStaminaCost(classId: ClassId, direction: AttackDirection): number {
  const baseCost = classId === "hexbound"
    ? 6
    : classId === "ranger" || classId === "cutpurse"
      ? 8
      : classId === "reaver"
        ? 13
        : classId === "vanguard" || classId === "cleric"
          ? 11
          : 10;
  if (classId === "hexbound" || classId === "ranger") return baseCost;
  if (direction === "OVERHEAD") return baseCost + 3;
  if (direction === "SWEEP") return baseCost + 1;
  return baseCost;
}

export function staminaRecoveryPerSecond(moving: boolean, recovering: boolean): number {
  if (recovering) return 0;
  return moving ? 12 : 19;
}

export function classMovementMultiplier(classId: ClassId, activeSeconds: number): number {
  return classId === "shapeshifter" && Number.isFinite(activeSeconds) && activeSeconds > 0 ? 1.15 : 1;
}

export function healthPercent(current: number, maximum: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(maximum) || maximum <= 0) return 0;
  return Math.min(100, Math.max(0, (current / maximum) * 100));
}

export function damageImpactAccepted(damageCooldown: number, ended: boolean, independentPulse = false): boolean {
  if (ended) return false;
  return independentPulse || !Number.isFinite(damageCooldown) || damageCooldown <= 0;
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

export function trapTargetPrecedes(candidateDistanceSquared: number, currentDistanceSquared: number): boolean {
  if (!Number.isFinite(candidateDistanceSquared) || candidateDistanceSquared < 0) return false;
  if (!Number.isFinite(currentDistanceSquared)) return true;
  return candidateDistanceSquared < Math.max(0, currentDistanceSquared);
}

export const FLOOR_TRAP_WINDUP_SECONDS = 0.32;
export const FLOOR_TRAP_WARNING_RANGE = 13;

export function floorTrapWarningAudible(distanceSquared: number): boolean {
  return Number.isFinite(distanceSquared) && distanceSquared >= 0 && distanceSquared <= FLOOR_TRAP_WARNING_RANGE * FLOOR_TRAP_WARNING_RANGE;
}

export function advanceFloorTrapWindup(current: number, delta: number): { remaining: number; fires: boolean } {
  const safeCurrent = Number.isFinite(current) ? Math.max(0, current) : 0;
  const safeDelta = Number.isFinite(delta) ? Math.max(0, delta) : 0;
  const remaining = Math.max(0, safeCurrent - safeDelta);
  return { remaining, fires: safeCurrent > 0 && remaining === 0 };
}

export function sanctuaryDamage(kind: ThreatKind): number {
  if (kind === "rival") return 0;
  return kind === "boss" ? 14 : 28;
}

export function minstrelStagger(kind: ThreatKind): number {
  return kind === "boss" ? 0.45 : kind === "rival" ? 1.35 : 2.1;
}

export function dodgeStats(classId: ClassId): DodgeStats {
  if (classId === "cutpurse") return { distance: 1.8, stamina: 17, cooldown: 0.78 };
  if (classId === "vanguard") return { distance: 1.3, stamina: 23, cooldown: 1.05 };
  if (classId === "reaver") return { distance: 1.2, stamina: 24, cooldown: 1.08 };
  return { distance: 1.55, stamina: 20, cooldown: 0.9 };
}

export function riposteDamageMultiplier(classId: ClassId, activeSeconds: number): number {
  if (!Number.isFinite(activeSeconds) || activeSeconds <= 0 || classId === "hexbound" || classId === "ranger") return 1;
  return 1.25;
}
