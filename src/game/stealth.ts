import type { ThreatKind } from "./types";

export const QUIET_KNIVES_TARGET = 3;
export const QUIET_KNIVES_REWARD = 140;
export const MAX_UNSEEN_STRIKES = 32;

export interface UnseenStrikeTarget {
  id: number;
  kind: ThreatKind;
  alerted: boolean;
}

export type UnseenStrikeCueState = "eligible" | "marked" | "aware" | "ineligible";

export interface UnseenStrikeCue {
  state: UnseenStrikeCueState;
  label: string;
}

export function unseenStrikeCue(markedThreats: ReadonlySet<number>, target: UnseenStrikeTarget): UnseenStrikeCue {
  if (target.kind === "boss") return { state: "ineligible", label: "KEEPER · NO UNSEEN MARK" };
  if (markedThreats.has(target.id)) return { state: "marked", label: "UNSEEN MARK RECORDED" };
  if (target.alerted) return { state: "aware", label: "TARGET AWARE · NO MARK" };
  return { state: "eligible", label: "UNSEEN MARK READY" };
}

export function recordUnseenStrike(markedThreats: Set<number>, target: UnseenStrikeTarget): boolean {
  if (target.alerted || target.kind === "boss" || markedThreats.has(target.id)) return false;
  markedThreats.add(target.id);
  return true;
}
