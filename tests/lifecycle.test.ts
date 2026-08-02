import { afterEach, describe, expect, it, vi } from "vitest";
import { LifecycleTimers, pointerLockRequestAllowed, pointerLockResumesRaid } from "../src/game/lifecycle";

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
});
