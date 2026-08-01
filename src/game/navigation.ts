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
