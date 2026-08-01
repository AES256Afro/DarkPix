export const RAID_VARIATION_COUNT = 32;

export function normalizeRaidVariationSeed(value: number): number {
  return Number.isFinite(value) ? Math.abs(Math.floor(value)) % RAID_VARIATION_COUNT : 0;
}

export function validRaidVariationSeed(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < RAID_VARIATION_COUNT;
}

export function raidVariationSeal(value: number): string {
  return `PT-${normalizeRaidVariationSeed(value).toString(16).padStart(2, "0").toUpperCase()}`;
}
