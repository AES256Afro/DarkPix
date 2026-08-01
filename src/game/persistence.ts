export function persistBeforeClearingEscrow(persist: () => boolean, clearEscrow: () => void): boolean {
  if (!persist()) return false;
  clearEscrow();
  return true;
}
