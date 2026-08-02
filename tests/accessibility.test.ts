import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import mainSource from "../src/main.ts?raw";

const styles = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");

describe("lobby accessibility contracts", () => {
  it("exposes selected class, contract, loadout, and current navigation state", () => {
    expect(mainSource).toContain('aria-current="page"');
    expect(mainSource).toContain('aria-pressed="${entry.id === selectedClass}"');
    expect(mainSource).toContain('aria-pressed="${selectedRaidMode === "standard"}"');
    expect(mainSource).toContain('aria-pressed="${selected}"');
  });

  it("keeps every native control visibly focused and preserves selection in forced colors", () => {
    expect(styles).toContain("button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible");
    expect(styles).toContain("@media (forced-colors: active)");
    expect(styles).toContain(".class-card.selected, .raid-mode-picker button.selected, .stash-item.selected");
  });

  it("keeps an unsecured raid verdict visible and blocks lobby return until retry succeeds", () => {
    expect(mainSource).toContain('class="result-persistence" role="alert"');
    expect(mainSource).toContain('if (!verdictSecured) {');
    expect(mainSource).toContain('"RETRY SECURING VERDICT"');
  });

  it("locks an incompatible future profile to a raw recovery download", () => {
    expect(mainSource).toContain("renderIncompatibleProfileRecovery");
    expect(mainSource).toContain("Lobby actions are locked so unknown progress is not overwritten.");
    expect(mainSource).toContain("DOWNLOAD RAW SAVE");
  });

  it("locks a malformed raid journal behind recovery and explicit discard", () => {
    expect(mainSource).toContain("renderDamagedRaidJournalRecovery");
    expect(mainSource).toContain("DOWNLOAD RAW JOURNAL");
    expect(mainSource).toContain("CONFIRM DISCARD AND RETURN");
    expect(mainSource).toContain('if (!clearRaidEscrow())');
    expect(mainSource).toContain('if (damagedRaidJournal !== undefined)');
  });

  it("locks a foreign live raid journal without offering a destructive action", () => {
    expect(mainSource).toContain("renderForeignRaidLease");
    expect(mainSource).toContain("This tab is locked so it cannot settle, overwrite, clear, or mutate the shared stash");
    expect(mainSource).toContain("CHECK RAID JOURNAL AGAIN");
    expect(mainSource).toContain('window.addEventListener("storage"');
    expect(mainSource).toContain("event.key === RAID_ESCROW_KEY");
    expect(mainSource).toContain("lobbyEpoch += 1");
    expect(mainSource).toContain("if (lockForForeignRaidJournal()) return false;");
    expect(mainSource).toContain("if (lockForForeignRaidJournal()) return;");
  });

  it("refreshes an idle lobby when another tab stores a durable profile", () => {
    expect(mainSource).toContain("event.key === PROFILE_KEY");
    expect(mainSource).toContain("refreshIdleProfileFromStorage");
    expect(mainSource).toContain("profile = refreshed.profile");
    expect(mainSource).toContain("availableIds.has(id)");
    expect(mainSource).toContain('refreshed.status === "corrupt" || refreshed.status === "incompatible"');
    expect(mainSource).toContain('!app.querySelector(".lobby")');
  });

  it("refreshes durable settings across idle lobby tabs", () => {
    expect(mainSource).toContain("event.key === PREFERENCES_KEY");
    expect(mainSource).toContain("refreshIdlePreferencesFromStorage");
    expect(mainSource).toContain("preferences = loadPreferences()");
  });

  it("automatically releases an idle tab after the owning raid clears its journal", () => {
    expect(mainSource).toContain("event.newValue === null && foreignRaidLease");
    expect(mainSource).toMatch(/event\.newValue === null && foreignRaidLease[\s\S]+location\.reload\(\);[\s\S]+return;/);
  });

  it("clears a retained settled journal before considering its foreign lease", () => {
    expect(mainSource).toMatch(/interruptedRaid[\s\S]+!raidEscrowAlreadySettled\(profile, interruptedRaid\)[\s\S]+raidEscrowLeaseHeldByOther/);
    expect(mainSource).toMatch(/if \(raidEscrowAlreadySettled\(profile, journal\.escrow\)\)[\s\S]+clearRaidEscrow\(\)[\s\S]+return false;/);
    expect(mainSource).toMatch(/const pendingEscrow = existingJournal\.escrow;[\s\S]+if \(raidEscrowAlreadySettled\(profile, pendingEscrow\)\)[\s\S]+if \(!clearRaidEscrow\(\)\)[\s\S]+new raid will not overwrite its recovery evidence/);
  });

  it("recovers an update prompt after another tab activates its worker", () => {
    expect(mainSource).toContain("const waitingWorker = updateRegistration?.waiting");
    expect(mainSource).toContain("RELOADING APPLIED UPDATE...");
    expect(mainSource).toContain("if (reloadForUpdate) location.reload()");
  });

  it("offers a paused live-journal retry without resuming the raid", () => {
    const gameSource = readFileSync(new URL("../src/game/game.ts", import.meta.url), "utf8");
    expect(gameSource).toContain('class="retry-journal hidden"');
    expect(gameSource).toContain('this.retryJournalButton.addEventListener("click", this.onRetryJournal)');
    expect(styles).toContain(".lock-actions .retry-journal.hidden { display: none; }");
  });

  it("exposes held ritual progress and its committed destination semantically", () => {
    const gameSource = readFileSync(new URL("../src/game/game.ts", import.meta.url), "utf8");
    expect(gameSource).toContain('class="extract-meter" role="progressbar"');
    expect(gameSource).toContain('this.extractMeter.setAttribute("aria-valuenow"');
    expect(gameSource).toContain('this.extractMeter.setAttribute("aria-label", channeling ? channelLabel');
  });

  it("keeps occluded movement cues separate from combat impact announcements", () => {
    expect(readFileSync(new URL("../src/game/game.ts", import.meta.url), "utf8")).toContain('class="sound-direction" role="status" aria-live="polite"');
    expect(styles).toContain(".raid-shell.high-contrast-hud .damage-direction, .raid-shell.high-contrast-hud .sound-direction");
  });
});
