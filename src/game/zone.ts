import { DUNGEON } from "./dungeon";
import type { Vec2 } from "./types";

export interface ZoneState {
  progress: number;
  center: Vec2;
  radius: number;
}

export function zoneState(elapsed: number, duration = 210): ZoneState {
  const closingDuration = Math.max(1, duration - 20);
  const progress = Math.min(1, Math.max(0, (elapsed - 20) / closingDuration));
  return {
    progress,
    center: {
      x: DUNGEON.portal.x * 0.75 * progress,
      z: DUNGEON.portal.z * 0.75 * progress,
    },
    radius: 31 + (6.2 - 31) * progress,
  };
}

export function distanceFromZoneCenter(position: Vec2, zone: ZoneState): number {
  return Math.hypot(position.x - zone.center.x, position.z - zone.center.z);
}
