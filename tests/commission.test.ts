import { describe, expect, it } from "vitest";
import { merchantCommission, utcDayKey, validUtcDayKey } from "../src/game/commission";
import { createProfile, settleRaid } from "../src/game/profile";
import type { ThreatKind } from "../src/game/types";

describe("daily Ironmonger commissions", () => {
  it("rotates deterministically on UTC day boundaries", () => {
    const beforeMidnight = Date.UTC(2026, 7, 1, 23, 59, 59);
    const afterMidnight = beforeMidnight + 1_000;
    expect(utcDayKey(beforeMidnight)).toBe("2026-08-01");
    expect(utcDayKey(afterMidnight)).toBe("2026-08-02");
    expect(merchantCommission(beforeMidnight).day).toBe("2026-08-01");
    expect(merchantCommission(afterMidnight).day).toBe("2026-08-02");
    expect(merchantCommission(beforeMidnight)).not.toEqual(merchantCommission(afterMidnight));
    expect(merchantCommission(Number.NaN).day).toBe("1970-01-01");
    expect(merchantCommission(Number.MAX_VALUE).day).toBe("1970-01-01");
    expect(validUtcDayKey("2026-08-02")).toBe(true);
    expect(validUtcDayKey("2026-99-99")).toBe(false);
  });

  it("pays one completed live-return commission per day", () => {
    const finishedAt = Date.UTC(2026, 7, 1, 12);
    const commission = merchantCommission(finishedAt);
    const profile = createProfile();
    profile.extracts = 1;
    profile.boneBountyPaid = true;
    profile.rivalBountyPaid = true;
    profile.streakBountyPaid = true;
    const killsByKind: Partial<Record<ThreatKind, number>> = { [commission.kind]: commission.target };
    const result = {
      reason: "extracted" as const,
      raidMode: "standard" as const,
      depthReached: 1 as const,
      classId: "vanguard" as const,
      loot: [],
      equippedIds: [],
      kills: commission.target,
      killsByKind,
      elapsed: 60,
      goldFound: 7,
      finishedAt,
    };
    const first = settleRaid(profile, result);
    expect(first.commissionPaid).toBe(true);
    expect(first.commissionReward).toBe(commission.reward);
    expect(first.goldGained).toBe(commission.reward);
    expect(first.profile.lastCommissionDay).toBe(commission.day);
    const repeated = settleRaid(first.profile, result);
    expect(repeated.commissionPaid).toBe(false);
    expect(repeated.commissionReward).toBe(0);
    expect(repeated.goldGained).toBe(0);
  });

  it("requires both the target count and a successful extraction", () => {
    const finishedAt = Date.UTC(2026, 7, 2, 12);
    const commission = merchantCommission(finishedAt);
    const profile = createProfile();
    profile.extracts = 1;
    const killsByKind: Partial<Record<ThreatKind, number>> = { [commission.kind]: Math.max(0, commission.target - 1) };
    const base = { raidMode: "standard" as const, depthReached: 1 as const, classId: "vanguard" as const, loot: [], equippedIds: [], kills: commission.target, killsByKind, elapsed: 60, goldFound: 0, finishedAt };
    expect(settleRaid(profile, { ...base, reason: "extracted" }).commissionPaid).toBe(false);
    expect(settleRaid(profile, { ...base, reason: "slain", killsByKind: { [commission.kind]: commission.target } }).commissionPaid).toBe(false);
    expect(settleRaid(profile, { ...base, reason: "extracted", killsByKind: { [commission.kind]: commission.target }, finishedAt: undefined }).commissionPaid).toBe(false);
  });
});
