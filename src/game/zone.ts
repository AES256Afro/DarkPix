import { DUNGEON } from "./dungeon";
import type { Vec2 } from "./types";

export interface ZoneState {
  progress: number;
  center: Vec2;
  radius: number;
}

export const DARKNESS_PULSE_SECONDS = 0.32;

export function darknessPulseReady(outsideDistance: number, pulseRemaining: number): boolean {
  return Number.isFinite(outsideDistance) && outsideDistance > 0 &&
    (!Number.isFinite(pulseRemaining) || pulseRemaining <= 0);
}

export function zoneState(elapsed: number, duration = 210, passage: Vec2 = DUNGEON.portal, result?: ZoneState): ZoneState {
  const closingDuration = Math.max(1, duration - 20);
  const progress = Math.min(1, Math.max(0, (elapsed - 20) / closingDuration));
  const zone = result ?? { progress: 0, center: { x: 0, z: 0 }, radius: 0 };
  zone.progress = progress;
  zone.center.x = passage.x * 0.75 * progress;
  zone.center.z = passage.z * 0.75 * progress;
  zone.radius = 31 + (6.2 - 31) * progress;
  return zone;
}

export function distanceFromZoneCenter(position: Vec2, zone: ZoneState): number {
  return Math.hypot(position.x - zone.center.x, position.z - zone.center.z);
}

export function distanceOutsideZone(position: Vec2, zone: ZoneState): number {
  return Math.max(0, distanceFromZoneCenter(position, zone) - Math.max(0, zone.radius));
}

export function directionToZoneCenter(position: Vec2, zone: ZoneState, result?: Vec2): Vec2 {
  const direction = result ?? { x: 0, z: 0 };
  direction.x = zone.center.x - position.x;
  direction.z = zone.center.z - position.z;
  return direction;
}
