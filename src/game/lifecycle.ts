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
