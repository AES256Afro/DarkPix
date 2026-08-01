import type { GamePreferences, StashSort } from "./types";

const PREFERENCES_KEY = "darkpix-preferences-v1";

export const DEFAULT_PREFERENCES: GamePreferences = {
  mouseSensitivity: 1,
  brightness: 1,
  fieldOfView: 72,
  volume: 1,
  muted: false,
  reducedMotion: false,
  invertY: false,
  stashSort: "recent",
};

const STASH_SORTS = new Set<StashSort>(["recent", "rarity", "value", "kind"]);

function clampNumber(value: unknown, minimum: number, maximum: number, fallback: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, number));
}

export function normalizePreferences(value: unknown): GamePreferences {
  if (!value || typeof value !== "object") return { ...DEFAULT_PREFERENCES };
  const candidate = value as Partial<GamePreferences>;
  return {
    mouseSensitivity: clampNumber(candidate.mouseSensitivity, 0.5, 2, DEFAULT_PREFERENCES.mouseSensitivity),
    brightness: clampNumber(candidate.brightness, 0.75, 1.4, DEFAULT_PREFERENCES.brightness),
    fieldOfView: clampNumber(candidate.fieldOfView, 60, 95, DEFAULT_PREFERENCES.fieldOfView),
    volume: clampNumber(candidate.volume, 0, 1, DEFAULT_PREFERENCES.volume),
    muted: typeof candidate.muted === "boolean" ? candidate.muted : DEFAULT_PREFERENCES.muted,
    reducedMotion: typeof candidate.reducedMotion === "boolean" ? candidate.reducedMotion : DEFAULT_PREFERENCES.reducedMotion,
    invertY: typeof candidate.invertY === "boolean" ? candidate.invertY : DEFAULT_PREFERENCES.invertY,
    stashSort: STASH_SORTS.has(candidate.stashSort as StashSort) ? candidate.stashSort as StashSort : DEFAULT_PREFERENCES.stashSort,
  };
}

export function loadPreferences(): GamePreferences {
  try {
    return normalizePreferences(JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? "null"));
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function savePreferences(preferences: GamePreferences): boolean {
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(normalizePreferences(preferences)));
    return true;
  } catch {
    return false;
  }
}
