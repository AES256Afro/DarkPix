import { normalizePreferences } from "./preferences";
import { normalizeProfile } from "./profile";
import type { GamePreferences, Profile } from "./types";

export const SAVE_BACKUP_FORMAT = "darkpix-save-v1";

export interface SaveBackup {
  format: typeof SAVE_BACKUP_FORMAT;
  createdAt: string;
  release: string;
  profile: Profile;
  preferences: GamePreferences;
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
    const candidate = JSON.parse(serialized) as Partial<SaveBackup>;
    if (!candidate || candidate.format !== SAVE_BACKUP_FORMAT || !candidate.profile || !candidate.preferences) return undefined;
    return {
      profile: normalizeProfile(candidate.profile),
      preferences: normalizePreferences(candidate.preferences),
    };
  } catch {
    return undefined;
  }
}
