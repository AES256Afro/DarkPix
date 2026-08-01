import type { ThreatKind } from "./types";

export const QUIET_KNIVES_TARGET = 3;
export const QUIET_KNIVES_REWARD = 140;
export const MAX_UNSEEN_STRIKES = 32;

export interface UnseenStrikeTarget {
  id: number;
  kind: ThreatKind;
  alerted: boolean;
}

export function recordUnseenStrike(markedThreats: Set<number>, target: UnseenStrikeTarget): boolean {
  if (target.alerted || target.kind === "boss" || markedThreats.has(target.id)) return false;
  markedThreats.add(target.id);
  return true;
}
