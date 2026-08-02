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
