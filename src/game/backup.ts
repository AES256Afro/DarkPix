import { normalizePreferences } from "./preferences";
import { PROFILE_VERSION, normalizeProfile } from "./profile";
import type { GamePreferences, Profile } from "./types";

export const SAVE_BACKUP_FORMAT = "darkpix-save-v1";

export interface SaveBackup {
  format: typeof SAVE_BACKUP_FORMAT;
  createdAt: string;
  release: string;
  profile: Profile;
  preferences: GamePreferences;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function recognizableProfile(value: unknown): boolean {
  const candidate = record(value);
  return Boolean(
    candidate &&
    typeof candidate.version === "number" && Number.isFinite(candidate.version) && candidate.version <= PROFILE_VERSION &&
    typeof candidate.gold === "number" && Number.isFinite(candidate.gold) &&
    record(candidate.xp) &&
    Array.isArray(candidate.stash) &&
    typeof candidate.preferredClass === "string",
  );
}

function recognizablePreferences(value: unknown): boolean {
  const candidate = record(value);
  return Boolean(
    candidate &&
    typeof candidate.mouseSensitivity === "number" && Number.isFinite(candidate.mouseSensitivity) &&
    typeof candidate.brightness === "number" && Number.isFinite(candidate.brightness) &&
    typeof candidate.volume === "number" && Number.isFinite(candidate.volume) &&
    typeof candidate.muted === "boolean",
  );
}

export function createSaveBackup(
  profile: Profile,
  preferences: GamePreferences,
  release: string,
  createdAt = new Date(),
): string {
  const backup: SaveBackup = {
    format: SAVE_BACKUP_FORMAT,
    createdAt: createdAt.toISOString(),
    release,
    profile: normalizeProfile(profile),
    preferences: normalizePreferences(preferences),
  };
  return JSON.stringify(backup, null, 2);
}

export function parseSaveBackup(serialized: string): Pick<SaveBackup, "profile" | "preferences"> | undefined {
  try {
    const candidate = record(JSON.parse(serialized));
    if (!candidate || candidate.format !== SAVE_BACKUP_FORMAT || !recognizableProfile(candidate.profile) || !recognizablePreferences(candidate.preferences)) return undefined;
    return {
      profile: normalizeProfile(candidate.profile),
      preferences: normalizePreferences(candidate.preferences),
    };
  } catch {
    return undefined;
  }
}

export type SaveImportPersistence = "rejected" | "complete" | "profile_only";

export function persistSaveImport(
  imported: Pick<SaveBackup, "profile" | "preferences">,
  persistProfile: (profile: Profile) => boolean,
  persistPreferences: (preferences: GamePreferences) => boolean,
): SaveImportPersistence {
  if (!persistProfile(imported.profile)) return "rejected";
  return persistPreferences(imported.preferences) ? "complete" : "profile_only";
}
