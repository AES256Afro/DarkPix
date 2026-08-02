import type { Vec2 } from "./types";

const CARDINALS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

export function cardinalDirection(vector: Vec2): string {
  if (Math.hypot(vector.x, vector.z) < 0.001) return "HERE";
  const angle = Math.atan2(vector.x, -vector.z);
  const index = Math.round(angle / (Math.PI / 4));
  return CARDINALS[(index + CARDINALS.length) % CARDINALS.length] ?? "N";
}

export function circlesOverlap(left: Vec2, leftRadius: number, right: Vec2, rightRadius: number): boolean {
  const minimumDistance = Math.max(0, leftRadius) + Math.max(0, rightRadius);
  return Math.hypot(left.x - right.x, left.z - right.z) < minimumDistance;
}

export type RelativeDirection = "FRONT" | "RIGHT" | "BACK" | "LEFT" | "CENTER";

export interface DirectionalCue {
  direction: RelativeDirection;
  marker: "▲" | "▶" | "▼" | "◀" | "◆";
  text: string;
}

export function relativeDirectionToSource(yaw: number, origin: Vec2, source: Vec2): RelativeDirection {
  const safeYaw = Number.isFinite(yaw) ? yaw : 0;
  const dx = source.x - origin.x;
  const dz = source.z - origin.z;
  if (!Number.isFinite(dx) || !Number.isFinite(dz) || Math.hypot(dx, dz) < 0.001) return "CENTER";
  const forwardX = -Math.sin(safeYaw);
  const forwardZ = -Math.cos(safeYaw);
  const rightX = Math.cos(safeYaw);
  const rightZ = -Math.sin(safeYaw);
  const angle = Math.atan2(dx * rightX + dz * rightZ, dx * forwardX + dz * forwardZ);
  if (angle >= -Math.PI / 4 && angle < Math.PI / 4) return "FRONT";
  if (angle >= Math.PI / 4 && angle < Math.PI * 3 / 4) return "RIGHT";
  if (angle <= -Math.PI / 4 && angle > -Math.PI * 3 / 4) return "LEFT";
  return "BACK";
}

export function directionalCue(yaw: number, origin: Vec2, source: Vec2, label: string): DirectionalCue {
  const direction = relativeDirectionToSource(yaw, origin, source);
  const marker = direction === "FRONT" ? "▲" : direction === "RIGHT" ? "▶" : direction === "BACK" ? "▼" : direction === "LEFT" ? "◀" : "◆";
  const safeLabel = label.trim().toUpperCase().slice(0, 24) || "THREAT";
  return { direction, marker, text: `${marker} ${safeLabel} · ${direction}` };
}

export function movementOffset(yaw: number, strafe: number, forward: number, distance: number, target: Vec2 = { x: 0, z: 0 }): Vec2 {
  const safeYaw = Number.isFinite(yaw) ? yaw : 0;
  const safeStrafe = Number.isFinite(strafe) ? strafe : 0;
  const safeForward = Number.isFinite(forward) ? forward : 0;
  const length = Math.hypot(safeStrafe, safeForward);
  const scale = length > 0.001 && Number.isFinite(distance) ? Math.max(0, distance) / Math.max(1, length) : 0;
  const x = (safeStrafe * Math.cos(safeYaw) - safeForward * Math.sin(safeYaw)) * scale;
  const z = (-safeStrafe * Math.sin(safeYaw) - safeForward * Math.cos(safeYaw)) * scale;
  target.x = x === 0 ? 0 : x;
  target.z = z === 0 ? 0 : z;
  return target;
}

export function movementSubstepCount(distance: number, maximumStep = 0.2): number {
  if (!Number.isFinite(distance) || distance <= 0 || !Number.isFinite(maximumStep) || maximumStep <= 0) return 1;
  return Math.min(64, Math.max(1, Math.ceil(distance / maximumStep)));
}

export function passiveAwarenessRange(torchLit: boolean, crouching: boolean, sprinting = false, moving = true, armorWeight = 0): number {
  const base = torchLit ? 10.5 : 6.5;
  const movementNoise = crouching ? (moving ? 0.66 : 0.56) : !moving ? 0.78 : sprinting ? 1.35 : 1;
  const safeArmor = Number.isFinite(armorWeight) ? Math.min(22, Math.max(0, armorWeight)) : 0;
  const armorNoise = moving ? 1 + safeArmor * 0.01 : 1;
  return base * movementNoise * armorNoise;
}

export type RecoveryNeed = "MEMORY" | "VIGOR" | "STAMINA" | "TORCH" | undefined;

export function recoveryNeed(
  health: number,
  maximumHealth: number,
  stamina: number,
  maximumStamina: number,
  spellCharges: number,
  usesSpellMemory: boolean,
  torchFuel = Number.POSITIVE_INFINITY,
): RecoveryNeed {
  if (usesSpellMemory && Number.isFinite(spellCharges) && spellCharges <= 0) return "MEMORY";
  if (Number.isFinite(health) && Number.isFinite(maximumHealth) && maximumHealth > 0 && health / maximumHealth <= 0.32) return "VIGOR";
  if (Number.isFinite(stamina) && Number.isFinite(maximumStamina) && maximumStamina > 0 && stamina / maximumStamina <= 0.12) return "STAMINA";
  if (Number.isFinite(torchFuel) && torchFuel <= 20) return "TORCH";
  return undefined;
}
