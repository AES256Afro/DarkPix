export interface PointerLockResumeState {
  lockMatchesCanvas: boolean;
  requestAllowed: boolean;
  contextLost: boolean;
  documentHidden: boolean;
  ended: boolean;
}

export function pointerLockResumesRaid(state: PointerLockResumeState): boolean {
  return state.lockMatchesCanvas
    && state.requestAllowed
    && !state.contextLost
    && !state.documentHidden
    && !state.ended;
}

export interface PointerLockRequestState {
  alreadyLocked: boolean;
  requestPending: boolean;
  contextLost: boolean;
  ended: boolean;
}

export function pointerLockRequestAllowed(state: PointerLockRequestState): boolean {
  return !state.alreadyLocked && !state.requestPending && !state.contextLost && !state.ended;
}

export class LifecycleTimers {
  private readonly timers = new Set<ReturnType<typeof globalThis.setTimeout>>();

  schedule(callback: () => void, delay: number): void {
    const timer = globalThis.setTimeout(() => {
      this.timers.delete(timer);
      callback();
    }, delay);
    this.timers.add(timer);
  }

  cancelAll(): void {
    for (const timer of this.timers) globalThis.clearTimeout(timer);
    this.timers.clear();
  }

  get pendingCount(): number {
    return this.timers.size;
  }
}

export class SingleFlightGate {
  private activeTicket?: number;
  private nextTicket = 0;

  begin(): number | undefined {
    if (this.activeTicket !== undefined) return undefined;
    this.nextTicket += 1;
    this.activeTicket = this.nextTicket;
    return this.activeTicket;
  }

  finish(ticket: number): void {
    if (this.activeTicket === ticket) this.activeTicket = undefined;
  }

  get busy(): boolean {
    return this.activeTicket !== undefined;
  }
}

export function lobbyOperationCurrent(startedEpoch: number, currentEpoch: number, raidLaunching: boolean, raidActive: boolean): boolean {
  return Number.isInteger(startedEpoch)
    && startedEpoch === currentEpoch
    && !raidLaunching
    && !raidActive;
}

export function raidDeadlineReached(elapsed: number, duration: number): boolean {
  if (!Number.isFinite(elapsed) || !Number.isFinite(duration) || duration <= 0) return true;
  return elapsed >= duration;
}

export function raidFrameLoopActive(paused: boolean, ended: boolean, contextLost: boolean): boolean {
  return !paused && !ended && !contextLost;
}

export function simulationFrameDelta(delta: number, maximum = 0.05): number {
  if (!Number.isFinite(delta) || delta <= 0 || !Number.isFinite(maximum) || maximum <= 0) return 0;
  return Math.min(delta, maximum);
}

export type PointerLockTimeoutOutcome = "ignore" | "confirm" | "reject";

export function pointerLockTimeoutOutcome(requestPending: boolean, requestIsCurrent: boolean, lockMatchesCanvas: boolean): PointerLockTimeoutOutcome {
  if (!requestPending || !requestIsCurrent) return "ignore";
  return lockMatchesCanvas ? "confirm" : "reject";
}
