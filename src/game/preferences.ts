import type { GamePreferences, StashSort } from "./types";

export const PREFERENCES_KEY = "darkpix-preferences-v1";

export const DEFAULT_PREFERENCES: GamePreferences = {
  mouseSensitivity: 1,
  brightness: 1,
  fieldOfView: 72,
  crosshairScale: 1,
  volume: 1,
  muted: false,
  reducedMotion: false,
  reducedFlashes: false,
  highContrastHud: false,
  invertY: false,
  stashSort: "recent",
};

const STASH_SORTS = new Set<StashSort>(["recent", "rarity", "value", "kind"]);

interface PreferencesStorageTarget {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface SystemPreferenceSignals {
  reducedMotion: boolean;
  highContrast: boolean;
}

export function firstRunPreferences(signals: Partial<SystemPreferenceSignals> = {}): GamePreferences {
  return {
    ...DEFAULT_PREFERENCES,
    reducedMotion: signals.reducedMotion === true,
    reducedFlashes: signals.reducedMotion === true,
    highContrastHud: signals.highContrast === true,
  };
}

function mediaMatches(query: string): boolean {
  try {
    return typeof matchMedia === "function" && matchMedia(query).matches;
  } catch {
    return false;
  }
}

function systemPreferenceSignals(): SystemPreferenceSignals {
  return {
    reducedMotion: mediaMatches("(prefers-reduced-motion: reduce)"),
    highContrast: mediaMatches("(prefers-contrast: more)") || mediaMatches("(forced-colors: active)"),
  };
}

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
    crosshairScale: clampNumber(candidate.crosshairScale, 0.75, 1.75, DEFAULT_PREFERENCES.crosshairScale),
    volume: clampNumber(candidate.volume, 0, 1, DEFAULT_PREFERENCES.volume),
    muted: typeof candidate.muted === "boolean" ? candidate.muted : DEFAULT_PREFERENCES.muted,
    reducedMotion: typeof candidate.reducedMotion === "boolean" ? candidate.reducedMotion : DEFAULT_PREFERENCES.reducedMotion,
    reducedFlashes: typeof candidate.reducedFlashes === "boolean" ? candidate.reducedFlashes : DEFAULT_PREFERENCES.reducedFlashes,
    highContrastHud: typeof candidate.highContrastHud === "boolean" ? candidate.highContrastHud : DEFAULT_PREFERENCES.highContrastHud,
    invertY: typeof candidate.invertY === "boolean" ? candidate.invertY : DEFAULT_PREFERENCES.invertY,
    stashSort: STASH_SORTS.has(candidate.stashSort as StashSort) ? candidate.stashSort as StashSort : DEFAULT_PREFERENCES.stashSort,
  };
}

export function loadPreferences(): GamePreferences {
  const firstRun = firstRunPreferences(systemPreferenceSignals());
  try {
    const serialized = localStorage.getItem(PREFERENCES_KEY);
    return serialized === null ? firstRun : normalizePreferences(JSON.parse(serialized));
  } catch {
    return firstRun;
  }
}

export function savePreferences(preferences: GamePreferences, storage?: PreferencesStorageTarget): boolean {
  try {
    const target = storage ?? globalThis.localStorage;
    const serialized = JSON.stringify(normalizePreferences(preferences));
    target.setItem(PREFERENCES_KEY, serialized);
    return target.getItem(PREFERENCES_KEY) === serialized;
  } catch {
    return false;
  }
}
