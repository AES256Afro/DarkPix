export type AttackDirection = "OVERHEAD" | "THRUST" | "SWEEP";

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
