import { describe, expect, it } from "vitest";
import { createSaveBackup, parseSaveBackup, persistSaveImport, SAVE_BACKUP_FORMAT } from "../src/game/backup";
import { DEFAULT_PREFERENCES } from "../src/game/preferences";
import { createProfile } from "../src/game/profile";

describe("save backups", () => {
  it("round-trips a normalized profile and preferences", () => {
    const profile = createProfile();
    profile.gold = 321;
    profile.xp.hexbound = 700;
    profile.raidHistory.push({ completedAt: 123, classId: "hexbound", raidMode: "standard", reason: "extracted", depthReached: 1, kills: 2, elapsed: 90, goldDelta: 41, xpDelta: 240, gearLost: 0, bossKilled: false });
    const serialized = createSaveBackup(profile, DEFAULT_PREFERENCES, "test-release", new Date("2026-08-01T00:00:00Z"));
    expect(JSON.parse(serialized).format).toBe(SAVE_BACKUP_FORMAT);
    const restored = parseSaveBackup(serialized);
    expect(restored?.profile.gold).toBe(321);
    expect(restored?.profile.xp.hexbound).toBe(700);
    expect(restored?.profile.raidHistory[0]).toMatchObject({ completedAt: 123, classId: "hexbound", reason: "extracted" });
    expect(restored?.preferences).toEqual(DEFAULT_PREFERENCES);
  });

  it("rejects malformed and unrelated JSON", () => {
    expect(parseSaveBackup("not json")).toBeUndefined();
    expect(parseSaveBackup(JSON.stringify({ format: "some-other-game" }))).toBeUndefined();
    expect(parseSaveBackup(JSON.stringify({ format: SAVE_BACKUP_FORMAT, profile: {}, preferences: {} }))).toBeUndefined();
    expect(parseSaveBackup(JSON.stringify({
      format: SAVE_BACKUP_FORMAT,
      profile: { version: 14, gold: 75, xp: {}, stash: "not-an-array", preferredClass: "vanguard" },
      preferences: DEFAULT_PREFERENCES,
    }))).toBeUndefined();
  });

  it("rejects a backup written by a newer profile schema", () => {
    const backup = JSON.parse(createSaveBackup(createProfile(), DEFAULT_PREFERENCES, "future"));
    backup.profile.version = 16;
    backup.profile.futureLedger = { unknown: true };
    expect(parseSaveBackup(JSON.stringify(backup))).toBeUndefined();
  });

  it("stores an imported profile before settings and rejects memory replacement when profile storage fails", () => {
    const imported = { profile: createProfile(), preferences: DEFAULT_PREFERENCES };
    const order: string[] = [];
    expect(persistSaveImport(imported, () => { order.push("profile"); return true; }, () => { order.push("preferences"); return true; })).toBe("complete");
    expect(order).toEqual(["profile", "preferences"]);

    const settings = () => { throw new Error("settings must not run"); };
    expect(persistSaveImport(imported, () => false, settings)).toBe("rejected");
    expect(persistSaveImport(imported, () => true, () => false)).toBe("profile_only");
  });
});
