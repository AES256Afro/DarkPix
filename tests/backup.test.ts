import { describe, expect, it } from "vitest";
import { createSaveBackup, parseSaveBackup, SAVE_BACKUP_FORMAT } from "../src/game/backup";
import { DEFAULT_PREFERENCES } from "../src/game/preferences";
import { createProfile } from "../src/game/profile";

describe("save backups", () => {
  it("round-trips a normalized profile and preferences", () => {
    const profile = createProfile();
    profile.gold = 321;
    profile.xp.hexbound = 700;
    const serialized = createSaveBackup(profile, DEFAULT_PREFERENCES, "test-release", new Date("2026-08-01T00:00:00Z"));
    expect(JSON.parse(serialized).format).toBe(SAVE_BACKUP_FORMAT);
    const restored = parseSaveBackup(serialized);
    expect(restored?.profile.gold).toBe(321);
    expect(restored?.profile.xp.hexbound).toBe(700);
    expect(restored?.preferences).toEqual(DEFAULT_PREFERENCES);
  });

  it("rejects malformed and unrelated JSON", () => {
    expect(parseSaveBackup("not json")).toBeUndefined();
    expect(parseSaveBackup(JSON.stringify({ format: "some-other-game" }))).toBeUndefined();
  });
});
