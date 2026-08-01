import type { ThreatKind } from "./types";

export interface MerchantCommission {
  day: string;
  kind: ThreatKind;
  title: string;
  target: number;
  reward: number;
}

const DAY_MS = 86_400_000;
const MAX_TIMESTAMP = 253_402_300_799_999;
const COMMISSIONS = [
  { kind: "skeleton", title: "RATTLE THE RANKS", target: 2, reward: 90 },
  { kind: "crawler", title: "SILENCE THE CRAWL", target: 2, reward: 110 },
  { kind: "warden", title: "BREAK A SIGIL-BEARER", target: 1, reward: 125 },
  { kind: "mimic", title: "OPEN THE HUNGRY COFFER", target: 1, reward: 140 },
  { kind: "rival", title: "MARK A GUILDLESS DELVER", target: 1, reward: 160 },
] as const;

export function utcDayKey(timestamp: number): string {
  const safeTimestamp = Number.isFinite(timestamp) && timestamp >= 0 && timestamp <= MAX_TIMESTAMP ? Math.floor(timestamp) : 0;
  return new Date(safeTimestamp).toISOString().slice(0, 10);
}

export function validUtcDayKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && utcDayKey(timestamp) === value;
}

export function merchantCommission(timestamp: number): MerchantCommission {
  const safeTimestamp = Number.isFinite(timestamp) && timestamp >= 0 && timestamp <= MAX_TIMESTAMP ? Math.floor(timestamp) : 0;
  const dayIndex = Math.floor(safeTimestamp / DAY_MS);
  const template = COMMISSIONS[dayIndex % COMMISSIONS.length] ?? COMMISSIONS[0];
  return { day: utcDayKey(safeTimestamp), ...template };
}
