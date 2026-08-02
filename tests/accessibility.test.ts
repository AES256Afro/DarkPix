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
