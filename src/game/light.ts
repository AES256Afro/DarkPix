export const MAX_TORCH_FUEL_SECONDS = 90;
export const BLUEWAX_FUEL_SECONDS = 45;

function boundedFuel(value: number): number {
  return Number.isFinite(value) ? Math.min(MAX_TORCH_FUEL_SECONDS, Math.max(0, value)) : 0;
}

export function spendTorchFuel(fuel: number, delta: number, lit: boolean): number {
  const current = boundedFuel(fuel);
  if (!lit || !Number.isFinite(delta) || delta <= 0) return current;
  return Math.max(0, current - delta);
}

export function addTorchFuel(fuel: number, seconds: number): number {
  const amount = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  return Math.min(MAX_TORCH_FUEL_SECONDS, boundedFuel(fuel) + amount);
}
