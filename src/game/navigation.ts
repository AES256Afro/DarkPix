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
