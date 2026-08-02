import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import mainSource from "../src/main.ts?raw";

const styles = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");

describe("lobby accessibility contracts", () => {
  it("exposes selected class, contract, loadout, and current navigation state", () => {
    expect(mainSource).toContain('aria-current="page"');
    expect(mainSource).toContain('<span class="active" aria-current="page">Delve</span>');
    expect(mainSource).not.toContain('<button class="active" type="button" aria-current="page">Delve</button>');
    expect(mainSource).toContain('<main class="lobby" id="top">');
    expect(mainSource).toContain('class="brand" href="#top" aria-label="DarkPix home"');
    expect(mainSource).not.toContain('addEventListener("click", (event) => event.preventDefault())');
    expect(mainSource).toContain('aria-pressed="${entry.id === selectedClass}"');
    expect(mainSource).toContain('aria-pressed="${selectedRaidMode === "standard"}"');
    expect(mainSource).toContain('aria-pressed="${selected}"');
  });

  it("exposes class and merchant advancement beyond their visual tracks", () => {
    expect(mainSource).toContain('role="progressbar" aria-label="Ironmonger reputation"');
    expect(mainSource).toContain('aria-valuenow="${ironmongerStanding.progress}"');
    expect(mainSource).toContain('role="progressbar" aria-label="${chosen.name} level progress"');
    expect(mainSource).toContain('aria-valuenow="${levelProgress}"');
    expect(mainSource).toContain("const levelProgress = levelMaxed ? 100");
    expect(mainSource).toContain('`${classXp} XP · MAX`');
  });

  it("announces the complete lobby merchant and persistence notice when it changes", () => {
    expect(mainSource).toContain('class="merchant-notice" role="status" aria-live="polite" aria-atomic="true"');
  });

  it("keeps every native control visibly focused and preserves selection in forced colors", () => {
    expect(styles).toContain("button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible");
    expect(styles).toContain("@media (forced-colors: active)");
    expect(styles).toContain(".class-card.selected, .raid-mode-picker button.selected, .stash-item.selected");
  });

  it("restores the logical keyboard control after a lobby render", () => {
    expect(mainSource).toContain("function focusedLobbySelector()");
    expect(mainSource).toContain("const focusSelector = focusedLobbySelector()");
    expect(mainSource).toContain("focus({ preventScroll: true })");
    expect(mainSource).toContain('active.closest<HTMLElement>("[data-item-id]")');
    expect(mainSource).toContain('"data-class-id", "data-raid-mode", "data-jump", "data-merchant-sku", "data-recipe-id", "data-preference", "data-save-action"');
  });

  it("moves header-jump focus into named Stash and Contracts destinations", () => {
    expect(mainSource).toContain('id="stash" tabindex="-1" aria-label="Stash and loadout"');
    expect(mainSource).toContain('id="contracts" tabindex="-1" aria-label="Contracts"');
    expect(mainSource).toContain("document.getElementById(button.dataset.jump ?? \"\")");
    expect(mainSource).toContain("target.focus({ preventScroll: true })");
    expect(styles).toContain('[tabindex="-1"]:focus-visible');
  });

  it("keeps an unsecured raid verdict visible and blocks lobby return until retry succeeds", () => {
    expect(mainSource).toContain('class="result-persistence" role="alert"');
    expect(mainSource).toContain('if (!verdictSecured) {');
    expect(mainSource).toContain('"RETRY SECURING VERDICT"');
  });

  it("requests the browser leave warning while an active raid journal remains at risk", () => {
    expect(mainSource).toContain('window.addEventListener("beforeunload"');
    expect(mainSource).toContain("raidDepartureNeedsWarning(activeRaidStartedAt)");
    expect(mainSource).toContain('event.returnValue = ""');
  });

  it("announces terminal verdicts and restores a useful lobby focus target", () => {
    expect(mainSource).toContain('aria-labelledby="raid-verdict-heading"');
    expect(mainSource).toContain('id="raid-verdict-heading" tabindex="-1"');
    expect(mainSource).toContain('querySelector<HTMLElement>("#raid-verdict-heading")?.focus({ preventScroll: true })');
    expect(mainSource).toContain('querySelector<HTMLButtonElement>(".descend-button")?.focus({ preventScroll: true })');
  });

  it("locks an incompatible future profile to a raw recovery download", () => {
    expect(mainSource).toContain("renderIncompatibleProfileRecovery");
    expect(mainSource).toContain("Lobby actions are locked so unknown progress is not overwritten.");
    expect(mainSource).toContain("DOWNLOAD RAW SAVE");
  });

  it("attaches recovery downloads before invoking the browser save action", () => {
    expect(mainSource).toContain("document.body.append(anchor)");
    expect(mainSource).toContain("try {");
    expect(mainSource).toContain("anchor.click()");
    expect(mainSource).toContain("} finally {");
    expect(mainSource).toContain("anchor.remove()");
    expect(mainSource).toContain("URL.revokeObjectURL(url)");
  });

  it("moves keyboard focus to the first safe action on every locked recovery screen", () => {
    expect(mainSource).toContain("function focusFirstRecoveryAction()");
    expect(mainSource).toContain('querySelector<HTMLButtonElement>(".persistence-recovery button")?.focus({ preventScroll: true })');
    expect(mainSource.match(/focusFirstRecoveryAction\(\);/g)).toHaveLength(4);
    const damagedRecovery = mainSource.slice(mainSource.indexOf("function renderDamagedRaidJournalRecovery"), mainSource.indexOf("function renderForeignRaidLease"));
    expect(damagedRecovery.indexOf("DOWNLOAD RAW JOURNAL")).toBeLessThan(damagedRecovery.indexOf("DISCARD DAMAGED JOURNAL"));
  });

  it("hides decorative recovery, contract, verdict, and pause glyphs from reading order", () => {
    expect(mainSource).toContain('<span aria-hidden="true">†</span>');
    expect(mainSource).toContain('class="wax-seal" aria-hidden="true"');
    expect(mainSource).toContain('class="result-rune" aria-hidden="true"');
    expect(readFileSync(new URL("../src/game/game.ts", import.meta.url), "utf8")).toContain('class="sigil-mark" aria-hidden="true"');
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
    expect(mainSource).toContain("This tab stopped immediately so it cannot settle, overwrite, clear, or mutate the shared stash");
    expect(mainSource).toContain("CHECK RAID JOURNAL AGAIN");
    expect(mainSource).toContain('window.addEventListener("storage"');
    expect(mainSource).toContain("event.key === RAID_ESCROW_KEY");
    expect(mainSource).toContain("lobbyEpoch += 1");
    expect(mainSource).toContain("if (lockForForeignRaidJournal()) return false;");
    expect(mainSource).toContain("if (lockForForeignRaidJournal()) return;");
  });

  it("stops a losing concurrent raid claim without overwriting the winning journal", () => {
    expect(mainSource).toContain("function queueRaidLeaseLoss()");
    expect(mainSource).toContain("raidEscrowOwnedBy(journal.escrow, raidOwnerId, activeRaidStartedAt)");
    expect(mainSource).toContain('renewal !== "secure" && activeRaidJournalOwnershipLost()');
    expect(mainSource).toContain("lostRaidLeaseStartedAt === claimedRaidStartedAt");
    expect(mainSource).toContain("() => activeRaidJournalOwned() && persistProfile()");
    expect(mainSource).toContain("clearOwnedRaidEscrow(raidOwnerId, activeRaidStartedAt)");
    expect(mainSource).toContain("activeGame?.destroy()");
    const leaseLoss = mainSource.slice(mainSource.indexOf("function queueRaidLeaseLoss"), mainSource.indexOf("function loadGameModule"));
    expect(leaseLoss).not.toContain("clearRaidEscrow");
    expect(leaseLoss).not.toContain("saveProfile");
  });

  it("rechecks journal continuity after every failed active lease renewal", () => {
    expect(mainSource).toContain('renewal !== "secure" && activeRaidJournalOwnershipLost()');
    expect(mainSource).toContain("queueRaidLeaseLoss()");
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
    expect(mainSource).not.toContain("The active raid journal changed while descent was being secured");
  });

  it("blocks descent when the durable raid marker cannot advance", () => {
    expect(mainSource).toContain("if (startedAt === undefined)");
    expect(mainSource).toContain("The settled-raid marker is exhausted");
    expect(mainSource.indexOf("if (startedAt === undefined)")).toBeLessThan(mainSource.indexOf("let escrow = createRaidEscrow"));
  });

  it("stops the loading lease before refunding a rejected raid-entry write", () => {
    const refund = mainSource.slice(mainSource.indexOf("function refundFailedRaidStart"), mainSource.indexOf("async function startRaid"));
    const entryWriteStart = mainSource.indexOf("profile.gold = escrow.goldAfterEntry");
    const entryWriteFailure = mainSource.slice(entryWriteStart, mainSource.indexOf("app.innerHTML = `<main class=\"game-mount\"", entryWriteStart));
    expect(refund.indexOf("stopRaidHeartbeat()")).toBeLessThan(refund.indexOf("saveProfile(profile)"));
    expect(refund.indexOf("activeRaidJournalOwned()")).toBeLessThan(refund.indexOf("saveProfile(profile)"));
    expect(refund.indexOf("saveProfile(profile)")).toBeLessThan(refund.indexOf("clearOwnedRaidEscrow"));
    expect(entryWriteFailure).toContain("const canceled = refundFailedRaidStart(goldBeforeEntry)");
    expect(entryWriteFailure).not.toContain("const canceled = clearRaidEscrow()");
  });

  it("recovers an update prompt after another tab activates its worker", () => {
    expect(mainSource).toContain("const waitingWorker = updateRegistration?.waiting");
    expect(mainSource).toContain("RELOADING APPLIED UPDATE...");
    expect(mainSource).toContain("if (reloadForUpdate) location.reload()");
  });

  it("contains speculative renderer warm-up failures until a real descent retries", () => {
    expect(mainSource).toContain("function warmGameModule(): void");
    expect(mainSource).toContain("void loadGameModule().catch(() => undefined)");
    expect(mainSource).toContain('addEventListener("pointerenter", warmGameModule)');
    expect(mainSource).toContain('addEventListener("focus", warmGameModule)');
    expect(mainSource).toContain("const { DarkPixGame: GameRuntime } = await loadGameModule()");
  });

  it("moves focus to the safe return action after renderer initialization fails", () => {
    expect(mainSource).toContain('const returnButton = mount.querySelector<HTMLButtonElement>("button")');
    expect(mainSource).toContain("returnButton?.focus({ preventScroll: true })");
  });

  it("contains unexpected save-import failures inside the originating idle lobby", () => {
    expect(mainSource).toContain('console.error("DarkPix could not import the selected save", error)');
    expect(mainSource).toContain('merchantNotice = "The selected save could not be read. The current profile remains active."');
    expect(mainSource).toMatch(/saveFileInput\?\.addEventListener\("change"[\s\S]+\}\)\(\)\.catch\(\(error\) =>/);
    expect(mainSource).toMatch(/\.catch\(\(error\) => \{[\s\S]+lobbyOperationCurrent\(renderedLobbyEpoch, lobbyEpoch, raidLaunchGate\.busy, Boolean\(activeGame\)\)/);
  });

  it("offers a paused live-journal retry without resuming the raid", () => {
    const gameSource = readFileSync(new URL("../src/game/game.ts", import.meta.url), "utf8");
    expect(gameSource).toContain('class="retry-journal hidden"');
    expect(gameSource).toContain('this.retryJournalButton.addEventListener("click", this.onRetryJournal)');
    expect(styles).toContain(".lock-actions .retry-journal.hidden { display: none; }");
  });

  it("exposes a real-time raid inventory on both familiar inventory keys", () => {
    const gameSource = readFileSync(new URL("../src/game/game.ts", import.meta.url), "utf8");
    expect(gameSource).toContain('class="raid-inventory" hidden aria-labelledby="raid-inventory-title"');
    expect(gameSource).toContain('event.code === "Tab" || event.code === "KeyI"');
    expect(gameSource).toContain("RAID CONTINUES · MOVEMENT REMAINS LIVE");
    expect(gameSource).toContain("if (this.inventoryOpen) this.updateRaidInventory()");
  });

  it("holds and retries right-click guard through committed recovery", () => {
    const gameSource = readFileSync(new URL("../src/game/game.ts", import.meta.url), "utf8");
    expect(gameSource).toContain("this.guardHeld = true");
    expect(gameSource).toContain("this.tryRaiseGuard(false)");
    expect(gameSource).toContain("GUARD RAISED · HOLD RMB · FACE THE THREAT");
    expect(gameSource).toContain('document.addEventListener("contextmenu", this.onContextMenu)');
  });

  it("keeps keyboard focus on the raid resume action across paused control states", () => {
    const gameSource = readFileSync(new URL("../src/game/game.ts", import.meta.url), "utf8");
    expect(gameSource).toContain("private focusResumeAction()");
    expect(gameSource).toContain("this.resumeButton.focus({ preventScroll: true })");
    const focusLossPath = gameSource.slice(gameSource.indexOf("private pauseForFocusLoss"), gameSource.indexOf("private onWindowBlur"));
    const contextLossPath = gameSource.slice(gameSource.indexOf("private onContextLost"), gameSource.indexOf("private onContextRestored"));
    const contextRestorePath = gameSource.slice(gameSource.indexOf("private onContextRestored"), gameSource.indexOf("private requestPointerLock"));
    const lockFailurePath = gameSource.slice(gameSource.indexOf("private handlePointerLockFailure"), gameSource.indexOf("private invalidatePointerLockRequest"));
    expect(focusLossPath).toContain("this.focusResumeAction()");
    expect(contextLossPath).toContain("this.focusResumeAction()");
    expect(contextRestorePath).toContain("this.focusResumeAction()");
    expect(lockFailurePath).toContain("this.focusResumeAction()");
    expect(gameSource.slice(gameSource.indexOf("private requestPointerLock"), gameSource.indexOf("private handlePointerLockFailure"))).not.toContain("this.focusResumeAction()");
  });

  it("exposes the paused raid and cursor-binding progress as a modal state", () => {
    const gameSource = readFileSync(new URL("../src/game/game.ts", import.meta.url), "utf8");
    expect(gameSource).toContain('class="lock-overlay" role="dialog" aria-modal="true"');
    expect(gameSource).toContain('aria-labelledby="raid-lock-title" aria-describedby="raid-lock-detail" aria-busy="false"');
    expect(gameSource).toContain('id="raid-lock-title" role="heading" aria-level="1"');
    expect(gameSource).toContain('this.lockOverlay.setAttribute("aria-busy", String(pending))');
    expect(gameSource).toContain("this.resumeButton.disabled = pending");
  });

  it("contains forward and reverse keyboard focus inside the visible raid modal actions", () => {
    const gameSource = readFileSync(new URL("../src/game/game.ts", import.meta.url), "utf8");
    const focusTrap = gameSource.slice(gameSource.indexOf("private trapLockOverlayFocus"), gameSource.indexOf("private updatePauseLedger"));
    expect(gameSource).toContain("if (this.trapLockOverlayFocus(event)) return;");
    expect(focusTrap).toContain('event.code !== "Tab"');
    expect(focusTrap).toContain('!button.disabled && !button.classList.contains("hidden")');
    expect(focusTrap).toContain("event.shiftKey");
    expect(focusTrap).toContain("event.preventDefault()");
    expect(focusTrap).toContain("focus({ preventScroll: true })");
  });

  it("keeps ability discovery visible and suppresses repeated space scrolling", () => {
    const gameSource = readFileSync(new URL("../src/game/game.ts", import.meta.url), "utf8");
    expect(gameSource).toContain("Ctrl crouch · Q ability · 1/2 spells");
    expect(gameSource).toMatch(/if \(event\.code === "Space"\) event\.preventDefault\(\);[\s\S]+if \(event\.code === "Space" && !event\.repeat\)/);
  });

  it("removes sliding and transition motion from the raid HUD when requested", () => {
    expect(styles).toContain(".raid-shell.reduced-motion .event-feed.show { animation: feed-show-reduced");
    expect(styles).toContain("@keyframes feed-show-reduced");
    expect(styles).toContain(".raid-shell.reduced-motion .damage-direction");
    expect(styles).toContain(".raid-shell.reduced-motion .bar i { transition: none; }");
  });

  it("removes smooth lobby navigation for saved and system reduced-motion requests", () => {
    expect(mainSource).toContain('classList.toggle("reduced-motion", preferences.reducedMotion)');
    expect(mainSource.match(/behavior: preferences\.reducedMotion \? "auto" : "smooth"/g)).toHaveLength(3);
    expect(styles).toContain("html.reduced-motion { scroll-behavior: auto; }");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }");
    expect(styles).toContain("html.reduced-motion .lobby button");
  });

  it("exposes held ritual progress and its committed destination semantically", () => {
    const gameSource = readFileSync(new URL("../src/game/game.ts", import.meta.url), "utf8");
    expect(gameSource).toContain('class="extract-meter" role="progressbar"');
    expect(gameSource).toContain('setAttributeIfChanged(this.extractMeter, "aria-valuenow"');
    expect(gameSource).toContain('setAttributeIfChanged(this.extractMeter, "aria-label", channeling ? channelLabel');
  });

  it("skips unchanged frame-loop style and accessibility writes", () => {
    const gameSource = readFileSync(new URL("../src/game/game.ts", import.meta.url), "utf8");
    expect(gameSource).toContain("function setAttributeIfChanged");
    expect(gameSource).toContain("function setStylePropertyIfChanged");
    expect(gameSource).toContain('setStylePropertyIfChanged(this.extractProgress, "width"');
    expect(gameSource).toContain('setStylePropertyIfChanged(this.healthFill, "width"');
    expect(gameSource).toContain('setStylePropertyIfChanged(this.spellFill, "--spell-fill"');
    expect(gameSource).toContain('setTextIfChanged(this.threatNameHud, enemy.name.toUpperCase())');
    expect(gameSource).toContain('setStylePropertyIfChanged(this.threatHealthFill, "width"');
    expect(gameSource).toContain('setAttributeIfChanged(this.threatHud, "data-kind", enemy.kind)');
    expect(styles).toContain("var(--spell-fill, linear-gradient");
  });

  it("exposes bounded raid resources as semantic progress while hiding unused spell memory", () => {
    const gameSource = readFileSync(new URL("../src/game/game.ts", import.meta.url), "utf8");
    expect(gameSource).toContain('class="bar health" role="progressbar" aria-label="Vigor"');
    expect(gameSource).toContain('class="bar stamina" role="progressbar" aria-label="Stamina"');
    expect(gameSource).toContain(`: 'aria-hidden="true"'`);
    expect(gameSource).toContain('setAttributeIfChanged(this.healthBar, "aria-valuenow"');
    expect(gameSource).toContain('setAttributeIfChanged(this.staminaBar, "aria-valuenow"');
    expect(gameSource).toContain('setAttributeIfChanged(this.spellBar, "aria-valuenow"');
    expect(gameSource).toContain('setAttributeIfChanged(this.spellBar, "aria-label"');
  });

  it("hides the unlabeled WebGL surface while retaining the semantic raid HUD", () => {
    const gameSource = readFileSync(new URL("../src/game/game.ts", import.meta.url), "utf8");
    expect(gameSource).toContain('class="render-host" aria-hidden="true"');
    expect(gameSource).toContain('class="raid-hud"');
  });

  it("names the raid HUD regions and exposes a non-interrupting floor timer", () => {
    const gameSource = readFileSync(new URL("../src/game/game.ts", import.meta.url), "utf8");
    for (const label of ["Raid contract", "Raid objective", "Delver resources", "Raid controls", "Unsecured haul"]) {
      expect(gameSource).toContain(`aria-label="${label}"`);
    }
    expect(gameSource).toContain('class="raid-clock" role="timer" aria-label="Floor time remaining"');
  });

  it("exposes the current threat name, vigor, and state as one live status", () => {
    const gameSource = readFileSync(new URL("../src/game/game.ts", import.meta.url), "utf8");
    expect(gameSource).toContain('class="threat-vitals" role="status" aria-live="polite" aria-atomic="true"');
    expect(gameSource).toContain('role="progressbar" aria-label="Threat vigor" aria-valuemin="0" aria-valuemax="1" aria-valuenow="0"');
    expect(gameSource).toContain('setAttributeIfChanged(this.threatHealthBar, "aria-label", `${enemy.name} vigor`)');
    expect(gameSource).toContain('setAttributeIfChanged(this.threatHealthBar, "aria-valuenow", String(Math.max(0, enemy.hp)))');
  });

  it("announces the complete raid journal state when it changes", () => {
    const gameSource = readFileSync(new URL("../src/game/game.ts", import.meta.url), "utf8");
    expect(gameSource).toContain('class="journal-copy" role="status" aria-live="polite" aria-atomic="true"');
  });

  it("keeps occluded movement cues separate from combat impact announcements", () => {
    expect(readFileSync(new URL("../src/game/game.ts", import.meta.url), "utf8")).toContain('class="sound-direction" role="status" aria-live="polite"');
    expect(styles).toContain(".raid-shell.high-contrast-hud .damage-direction, .raid-shell.high-contrast-hud .sound-direction");
  });

  it("pairs ash vent and keeper ring windups with directional text cues", () => {
    const gameSource = readFileSync(new URL("../src/game/game.ts", import.meta.url), "utf8");
    expect(gameSource).toContain('this.showDirectionalCue(vent.group.position, "ASH VENT"');
    expect(gameSource).toContain('this.depth === 2 ? "ASH RING" : "CHAIN RING"');
    expect(gameSource).toContain('enemy.tollWindupDuration + 0.1, "warning"');
  });
});
