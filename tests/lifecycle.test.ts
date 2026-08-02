import { afterEach, describe, expect, it, vi } from "vitest";
import { LifecycleTimers, SingleFlightGate, pointerLockRequestAllowed, pointerLockResumesRaid, pointerLockTimeoutOutcome, raidDeadlineReached, raidFrameLoopActive } from "../src/game/lifecycle";

afterEach(() => vi.useRealTimers());

describe("raid lifecycle", () => {
  const ready = {
    lockMatchesCanvas: true,
    requestAllowed: true,
    contextLost: false,
    documentHidden: false,
    ended: false,
  };

  it("resumes only after the requested canvas lock is confirmed", () => {
    expect(pointerLockResumesRaid(ready)).toBe(true);
    expect(pointerLockResumesRaid({ ...ready, lockMatchesCanvas: false })).toBe(false);
    expect(pointerLockResumesRaid({ ...ready, requestAllowed: false })).toBe(false);
  });

  it("rejects a confirmed lock after visibility, renderer, or verdict invalidation", () => {
    expect(pointerLockResumesRaid({ ...ready, documentHidden: true })).toBe(false);
    expect(pointerLockResumesRaid({ ...ready, contextLost: true })).toBe(false);
    expect(pointerLockResumesRaid({ ...ready, ended: true })).toBe(false);
  });

  it("does not request another lock for an attack click on the locked canvas", () => {
    const request = { alreadyLocked: false, requestPending: false, contextLost: false, ended: false };
    expect(pointerLockRequestAllowed(request)).toBe(true);
    expect(pointerLockRequestAllowed({ ...request, alreadyLocked: true })).toBe(false);
    expect(pointerLockRequestAllowed({ ...request, requestPending: true })).toBe(false);
    expect(pointerLockRequestAllowed({ ...request, contextLost: true })).toBe(false);
    expect(pointerLockRequestAllowed({ ...request, ended: true })).toBe(false);
  });

  it("cancels owned callbacks when a raid is destroyed", () => {
    vi.useFakeTimers();
    const callbacks: string[] = [];
    const timers = new LifecycleTimers();
    timers.schedule(() => callbacks.push("visual"), 25);
    timers.schedule(() => callbacks.push("verdict"), 260);
    expect(timers.pendingCount).toBe(2);
    vi.advanceTimersByTime(25);
    expect(callbacks).toEqual(["visual"]);
    expect(timers.pendingCount).toBe(1);
    timers.cancelAll();
    vi.runAllTimers();
    expect(callbacks).toEqual(["visual"]);
    expect(timers.pendingCount).toBe(0);
  });

  it("admits only one asynchronous raid launch at a time", () => {
    const gate = new SingleFlightGate();
    const first = gate.begin();
    expect(first).toBe(1);
    expect(gate.busy).toBe(true);
    expect(gate.begin()).toBeUndefined();
    gate.finish(999);
    expect(gate.busy).toBe(true);
    gate.finish(first ?? 0);
    expect(gate.busy).toBe(false);
    expect(gate.begin()).toBe(2);
  });

  it("ends the terminal frame at the exact floor deadline", () => {
    expect(raidDeadlineReached(209.999, 210)).toBe(false);
    expect(raidDeadlineReached(210, 210)).toBe(true);
    expect(raidDeadlineReached(211, 210)).toBe(true);
    expect(raidDeadlineReached(Number.NaN, 210)).toBe(true);
    expect(raidDeadlineReached(1, 0)).toBe(true);
  });

  it("runs continuous rendering only for an active raid", () => {
    expect(raidFrameLoopActive(false, false, false)).toBe(true);
    expect(raidFrameLoopActive(true, false, false)).toBe(false);
    expect(raidFrameLoopActive(false, true, false)).toBe(false);
    expect(raidFrameLoopActive(false, false, true)).toBe(false);
  });

  it("recovers a pointer-lock request that never settles", () => {
    expect(pointerLockTimeoutOutcome(true, true, false)).toBe("reject");
    expect(pointerLockTimeoutOutcome(true, true, true)).toBe("confirm");
    expect(pointerLockTimeoutOutcome(false, true, false)).toBe("ignore");
    expect(pointerLockTimeoutOutcome(true, false, false)).toBe("ignore");
  });
});
