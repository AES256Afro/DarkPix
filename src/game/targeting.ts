import type { Vec2 } from "./types";

export function targetDistanceInView(
  origin: Vec2,
  facing: Vec2,
  target: Vec2,
  maxDistance: number,
  minimumAlignment = 0.62,
): number {
  const dx = target.x - origin.x;
  const dz = target.z - origin.z;
  const distance = Math.hypot(dx, dz);
  if (distance <= 0.001) return 0;
  if (distance > maxDistance) return Number.POSITIVE_INFINITY;
  const facingLength = Math.hypot(facing.x, facing.z);
  if (facingLength <= 0.001) return Number.POSITIVE_INFINITY;
  const alignment = (dx * facing.x + dz * facing.z) / (distance * facingLength);
  return alignment >= minimumAlignment ? distance : Number.POSITIVE_INFINITY;
}

export function continuousHold(previous: number, delta: number, active: boolean): number {
  if (!active) return 0;
  const safePrevious = Number.isFinite(previous) ? Math.max(0, previous) : 0;
  const safeDelta = Number.isFinite(delta) ? Math.max(0, delta) : 0;
  return safePrevious + safeDelta;
}

export type ChannelInterruptionReason = "target_lost" | "moving" | "guarding" | "recovering" | "damaged";

export function channelInterruptionReason(input: {
  targeted: boolean;
  moving: boolean;
  guarding: boolean;
  recovering: boolean;
  damaged: boolean;
}): ChannelInterruptionReason | undefined {
  if (input.damaged) return "damaged";
  if (!input.targeted) return "target_lost";
  if (input.moving) return "moving";
  if (input.guarding) return "guarding";
  if (input.recovering) return "recovering";
  return undefined;
}
