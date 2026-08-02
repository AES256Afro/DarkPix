import "./style.css";
import { escapeHtml } from "./html";
import { createSaveBackup, parseSaveBackup, persistSaveImport } from "./game/backup";
import { merchantCommission } from "./game/commission";
import { RAID_VARIATION_COUNT, raidVariationSeal, validRaidVariationSeed } from "./game/contract";
import { BESTIARY, CLASSES, CLASS_ABILITIES, CLASS_PERKS, CRAFTING_RECIPES, MERCHANT_OFFERS, RARITY_COLOR, createItemId, craftingRecipeUnlocked, formatTime, levelForXp, merchantOfferUnlocked, merchantStanding, progressionBonuses } from "./game/data";
import { itemValueTotal, raidValueSummary } from "./game/economy";
import { equippedPower, loadoutStats, saleNeedsConfirmation, sortStash, toggleEquippedItem } from "./game/loadout";
import { SingleFlightGate, lobbyOperationCurrent } from "./game/lifecycle";
import { loadPreferences, savePreferences } from "./game/preferences";
import { browserStorageWritable, persistBeforeClearingEscrow } from "./game/persistence";
import { BONE_BOUNTY_TARGET, RIVAL_BOUNTY_TARGET, beginRaidEscrow, boneKillCount, clearRaidEscrow, contractRecordSummary, craftItem, createRaidEscrow, loadProfileState, loadRaidEscrow, nextRaidStartedAt, normalizeRaidResult, purchaseItem, raidEscrowAlreadySettled, raidThreatKillLedger, raidXpBreakdown, saveProfile, sellStashItem, settleInterruptedRaid, settleRaid } from "./game/profile";
import { raidEntryStatus, raidRules } from "./game/raid";
import { rarityMark } from "./game/rarity";
import { QUIET_KNIVES_REWARD, QUIET_KNIVES_TARGET } from "./game/stealth";
import type { DarkPixGame } from "./game/game";
import type { ClassId, GamePreferences, Item, Profile, RaidMode, RaidResult } from "./game/types";

const foundApp = document.querySelector<HTMLDivElement>("#app");
if (!foundApp) throw new Error("DarkPix application root is missing");
const app = foundApp;
const release = import.meta.env.VITE_DARKPIX_VERSION || "dev";
const CLASS_RUNES: Record<ClassId, string> = { vanguard: "V", cutpurse: "C", hexbound: "H", reaver: "R", ranger: "A", cleric: "L", shapeshifter: "S", minstrel: "M" };
const storageWritableAtStart = browserStorageWritable();
const profileLoad = loadProfileState();

let profile: Profile = profileLoad.profile;
const profileRecovery = profileLoad.recovery;
let preferences: GamePreferences = loadPreferences();
let selectedClass: ClassId = profile.preferredClass;
let selectedRaidMode: RaidMode = "standard";
let equippedIds = new Set<string>();
let activeGame: DarkPixGame | undefined;
let merchantNotice = "";
let pendingSaleId: string | undefined;
let persistenceWarning = profileLoad.status === "corrupt"
  ? "The stored profile was unreadable. Its raw contents were preserved for download in Settings before a starter profile was shown."
  : profileLoad.status === "incompatible"
    ? "This profile belongs to a newer DarkPix release. Its raw contents were preserved for download instead of being downgraded."
  : storageWritableAtStart
    ? ""
    : "Persistent browser storage is unavailable. Lobby changes may vanish, and no raid will start unless its risk journal can be secured.";
let gameModulePromise: Promise<typeof import("./game/game")> | undefined;
let updateRegistration: ServiceWorkerRegistration | undefined;
let reloadForUpdate = false;
let activeRaidStartedAt = 0;
let interruptedSettlementPending = false;
let interruptedSettlementNotice = "";
let lobbyEpoch = 0;
const raidLaunchGate = new SingleFlightGate();
const saveImportGate = new SingleFlightGate();

const interruptedRaid = profileLoad.status === "incompatible" ? undefined : loadRaidEscrow();
if (interruptedRaid) {
  if (raidEscrowAlreadySettled(profile, interruptedRaid)) {
    if (clearRaidEscrow()) merchantNotice = "A completed raid journal was reconciled without repeating its verdict.";
    else persistenceWarning = "A completed raid journal could not be removed, but its verdict marker prevents repeat settlement.";
  } else {
    const recovered = settleInterruptedRaid(profile, interruptedRaid);
    profile = recovered.profile;
    profile.lastSettledRaidStartedAt = interruptedRaid.startedAt;
    selectedClass = profile.preferredClass;
    interruptedSettlementNotice = recovered.classXpLost > 0
      ? `Interrupted Iron Soul raid forfeited ${recovered.classXpLost} class XP and all risked gear.`
      : "Interrupted raid settled as an abandonment. Risked gear was left below.";
    if (persistBeforeClearingEscrow(() => saveProfile(profile), clearRaidEscrow)) {
      merchantNotice = interruptedSettlementNotice;
    } else {
      interruptedSettlementPending = true;
      persistenceWarning = "The interrupted raid verdict is not durable yet. Lobby actions are locked to prevent duplicate settlement.";
    }
  }
}

function loadGameModule(): Promise<typeof import("./game/game")> {
  gameModulePromise ??= import("./game/game").catch((error) => {
    gameModulePromise = undefined;
    throw error;
  });
  return gameModulePromise;
}

function persistProfile(): boolean {
  const persisted = saveProfile(profile);
  if (!persisted) persistenceWarning = "This browser refused local storage. Progress will last only until the page closes.";
  return persisted;
}

function persistPreferences(): void {
  if (savePreferences(preferences)) return;
  persistenceWarning = "This browser refused local storage. Settings will last only until the page closes.";
  const notice = app.querySelector<HTMLElement>(".merchant-notice");
  if (notice) notice.textContent = persistenceWarning;
}

function showUpdatePrompt(registration: ServiceWorkerRegistration): void {
  updateRegistration = registration;
  if (document.querySelector(".update-prompt")) return;
  const prompt = document.createElement("aside");
  prompt.className = "update-prompt";
  prompt.setAttribute("role", "status");
  prompt.innerHTML = `<span><strong>NEW TORCHLIGHT READY</strong><small>A newer DarkPix release is waiting.</small></span><button type="button">APPLY UPDATE</button>`;
  const button = prompt.querySelector<HTMLButtonElement>("button");
  button?.addEventListener("click", () => {
    if (raidLaunchGate.busy) {
      button.textContent = "WAIT FOR DESCENT";
      return;
    }
    if (interruptedSettlementPending) {
      button.textContent = "SECURE THE VERDICT FIRST";
      return;
    }
    if (saveImportGate.busy) {
      button.textContent = "FINISH THE SAVE IMPORT FIRST";
      return;
    }
    if (activeGame) {
      button.textContent = "FINISH THE RAID FIRST";
      return;
    }
    const waitingWorker = updateRegistration?.waiting;
    if (!waitingWorker) {
      button.disabled = true;
      button.textContent = "RELOADING APPLIED UPDATE...";
      location.reload();
      return;
    }
    button.disabled = true;
    button.textContent = "REKINDLING...";
    reloadForUpdate = true;
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
    window.setTimeout(() => {
      if (reloadForUpdate) location.reload();
    }, 5_000);
  });
  document.body.append(prompt);
}

function registerOfflineWorker(): void {
  if (!("serviceWorker" in navigator) || location.protocol !== "https:") return;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadForUpdate) location.reload();
  });
  void navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(release)}`).then((registration) => {
    if (registration.waiting && navigator.serviceWorker.controller) showUpdatePrompt(registration);
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      worker?.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) showUpdatePrompt(registration);
      });
    });
  }).catch((error) => console.warn("DarkPix offline shell could not register", error));
}

function downloadTextFile(contents: string, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function renderIncompatibleProfileRecovery(): void {
  app.innerHTML = `<main class="game-mount" aria-label="DarkPix profile recovery"><section class="runtime-error persistence-recovery"><span>†</span><h1>A NEWER LEDGER IS SEALED HERE</h1><p role="alert">This DarkPix release cannot safely read the stored profile. Lobby actions are locked so unknown progress is not overwritten. Download the raw save, then update DarkPix or return to the newer release that created it.</p><button type="button">DOWNLOAD RAW SAVE</button></section></main>`;
  app.querySelector<HTMLButtonElement>("button")?.addEventListener("click", () => {
    if (profileRecovery === undefined) return;
    downloadTextFile(profileRecovery, `darkpix-newer-profile-${new Date().toISOString().slice(0, 10)}.json`, "application/json");
  });
}

function itemMarkup(item: Item, riskable = false): string {
  const selected = equippedIds.has(item.id);
  const confirmingSale = pendingSaleId === item.id;
  const itemId = escapeHtml(item.id);
  const itemName = escapeHtml(item.name);
  const itemModifier = item.modifier ? ` · ${escapeHtml(item.modifier)}` : "";
  return `
    <article class="stash-item ${selected ? "selected" : ""}" data-item-id="${itemId}" style="--rarity:${RARITY_COLOR[item.rarity]}">
      <span class="item-gem" data-mark="${rarityMark(item.rarity)}" aria-hidden="true"></span>
      <span class="item-copy"><strong>${itemName}</strong><small>${item.rarity} ${item.kind}${itemModifier}</small></span>
      <span class="item-value">${item.value}g</span>
      ${riskable && item.kind !== "treasure" ? `<button class="risk-item" type="button" aria-pressed="${selected}" aria-label="${selected ? "Unpack" : "Pack"} ${itemName}">${selected ? "Packed" : "Pack"}</button>` : ""}
      <button class="sell-item ${confirmingSale ? "confirming" : ""}" type="button" aria-label="${confirmingSale ? "Confirm sale of" : "Sell"} ${itemName}">${confirmingSale ? "Confirm" : "Sell"}</button>
    </article>`;
}

function journalDate(completedAt: number): string {
  if (!Number.isFinite(completedAt) || completedAt <= 0) return "RECOVERED RAID";
  const date = new Date(completedAt);
  if (Number.isNaN(date.getTime())) return "RECOVERED RAID";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date).toUpperCase();
}

function renderInterruptedSettlementRecovery(): void {
  activeGame?.destroy();
  activeGame = undefined;
  app.innerHTML = `<main class="game-mount" aria-label="DarkPix raid recovery"><section class="runtime-error persistence-recovery"><span>†</span><h1>THE LEDGER IS NOT SECURE</h1><p role="alert">The raid transaction was resolved in memory, but the browser has not stored and cleared it. The Last Lantern remains locked so this journal cannot be applied twice.</p><button type="button">RETRY SECURING VERDICT</button></section></main>`;
  app.querySelector<HTMLButtonElement>("button")?.addEventListener("click", () => {
    const secured = persistBeforeClearingEscrow(() => saveProfile(profile), clearRaidEscrow);
    if (!secured) {
      const notice = app.querySelector<HTMLElement>("[role=alert]");
      if (notice) notice.textContent = "The browser still refused the verdict. Keep this page open, check private-browsing or storage settings, then retry.";
      return;
    }
    interruptedSettlementPending = false;
    persistenceWarning = "";
    merchantNotice = interruptedSettlementNotice;
    renderLobby();
  });
}

function renderLobby(): void {
  if (interruptedSettlementPending) {
    renderInterruptedSettlementRecovery();
    return;
  }
  activeGame?.destroy();
  activeGame = undefined;
  lobbyEpoch += 1;
  const renderedLobbyEpoch = lobbyEpoch;
  if (raidEntryStatus(selectedRaidMode, profile.extracts, profile.gold, profile.ashenExtracts) !== "ready") selectedRaidMode = "standard";
  const chosen = CLASSES[selectedClass];
  const selectedRaidRules = raidRules(selectedRaidMode);
  const highTollStatus = raidEntryStatus("high_toll", profile.extracts, profile.gold);
  const ironSoulStatus = raidEntryStatus("iron_soul", profile.extracts, profile.gold, profile.ashenExtracts);
  const classXp = profile.xp[selectedClass];
  const level = levelForXp(classXp);
  const bonuses = progressionBonuses(level);
  const nextLevelXp = level * 350;
  const levelProgress = ((classXp % 350) / 350) * 100;
  const stashValue = profile.stash.reduce((sum, item) => sum + item.value, 0);
  const displayedStash = sortStash(profile.stash, preferences.stashSort);
  const previewLoadout = profile.stash.filter((item) => equippedIds.has(item.id));
  const previewStats = loadoutStats(previewLoadout);
  const packedVigor = equippedPower(previewLoadout, "armor") + previewStats.health;
  const packedRiskValue = itemValueTotal(previewLoadout);
  const contractRiskValue = packedRiskValue + selectedRaidRules.entryFee;
  const classXpAtRisk = selectedRaidRules.wipesClassXpOnFailure ? classXp : 0;
  const boneKills = boneKillCount(profile);
  const contractRecord = contractRecordSummary(profile);
  const ironmongerStanding = merchantStanding(profile.extracts);
  const todaysCommission = merchantCommission(Date.now());
  const commissionClaimed = profile.lastCommissionDay === todaysCommission.day;
  app.innerHTML = `
    <main class="lobby">
      <header class="lobby-header">
        <a class="brand" href="#" aria-label="DarkPix home"><span>DP</span><strong>DARKPIX</strong></a>
        <nav class="lobby-nav" aria-label="Game sections">
          <button class="active" type="button" aria-current="page">Delve</button>
          <button type="button" data-jump="stash">Stash <b>${profile.stash.length}</b></button>
          <button type="button" data-jump="contracts">Contracts</button>
        </nav>
        <div class="account-strip">
          <span>LV ${level}</span>
          <strong>${profile.gold}<i>g</i></strong>
        </div>
      </header>
      ${persistenceWarning ? `<p class="persistence-warning" role="alert">${persistenceWarning}</p>` : ""}

      <section class="hero">
        <div class="hero-scrim"></div>
        <div class="hero-content">
          <p class="eyebrow"><span></span> ONE LIFE BELOW <span></span></p>
          <h1>DARK<span>PIX</span></h1>
          <p class="hero-decree">Descend empty-handed. Return legend-laden.</p>
          <div class="rule-line"><i></i><strong>DEATH TAKES WHAT YOU CARRY</strong><i></i></div>
          <div class="raid-mode-picker" role="group" aria-label="Raid contract">
            <button class="${selectedRaidMode === "standard" ? "selected" : ""}" data-raid-mode="standard" type="button" aria-pressed="${selectedRaidMode === "standard"}"><small>NO ENTRY FEE</small><strong>PALE TOLL</strong></button>
            <button class="high-toll ${selectedRaidMode === "high_toll" ? "selected" : ""}" data-raid-mode="high_toll" type="button" aria-pressed="${selectedRaidMode === "high_toll"}" ${highTollStatus === "ready" ? "" : "disabled"}><small>${highTollStatus === "extract_required" ? "ESCAPE ONCE TO UNLOCK" : highTollStatus === "insufficient_gold" ? "50G REQUIRED" : "50G ENTRY FEE"}</small><strong>HIGH TOLL</strong></button>
            <button class="iron-soul ${selectedRaidMode === "iron_soul" ? "selected" : ""}" data-raid-mode="iron_soul" type="button" aria-pressed="${selectedRaidMode === "iron_soul"}" ${ironSoulStatus === "ready" ? "" : "disabled"}><small>${ironSoulStatus === "ashen_extract_required" ? "ASHEN RETURN REQUIRED" : ironSoulStatus === "insufficient_gold" ? "100G REQUIRED" : "100G · XP AT RISK"}</small><strong>IRON SOUL</strong></button>
          </div>
          <button class="descend-button" type="button">
            <span>DESCEND INTO THE ${selectedRaidRules.name.toUpperCase()}</span>
            <small>Solo contract · ${selectedRaidMode === "iron_soul" ? "brutal threats · +75% XP · class XP lost on failure" : selectedRaidMode === "high_toll" ? "empowered threats · improved rarity · +35% XP" : "8 roaming threats · 2 sigils · 1 keeper"}</small>
          </button>
          <p class="raid-warning">${packedRiskValue}g packed gear${selectedRaidRules.entryFee ? ` + ${selectedRaidRules.entryFee}g entry fee` : ""} = ${contractRiskValue}g value at risk. ${selectedRaidRules.wipesClassXpOnFailure ? `${classXpAtRisk} ${chosen.name} XP is also at risk.` : "Class experience persists."}</p>
        </div>
        <div class="hero-stats">
          <span><small>SUCCESSFUL EXTRACTS</small><strong>${profile.extracts}</strong></span>
          <span><small>DELVER DEATHS</small><strong>${profile.deaths}</strong></span>
          <span><small>STASH VALUE</small><strong>${stashValue}g</strong></span>
        </div>
      </section>

      <section class="lobby-body">
        <div class="section-heading">
          <div><span class="eyebrow">CHOOSE YOUR BURDEN</span><h2>Delver roster</h2></div>
          <p>Every discipline enters alone. Every discipline remembers.</p>
        </div>
        <div class="class-grid">
          ${(Object.values(CLASSES) as typeof chosen[]).map((entry) => `
            <button class="class-card ${entry.id === selectedClass ? "selected" : ""}" data-class-id="${entry.id}" type="button" aria-pressed="${entry.id === selectedClass}" style="--class-accent:${entry.accent}">
              <span class="class-rune">${CLASS_RUNES[entry.id]}</span>
              <span class="class-copy">
                <small>${entry.title}</small>
                <strong>${entry.name}</strong>
                <p>${entry.summary}</p>
                <span class="class-traits"><i>VIG ${entry.maxHealth}</i><i>DMG ${entry.damage}</i><i>SPD ${entry.speed.toFixed(1)}</i></span>
              </span>
              <span class="selection-mark">${entry.id === selectedClass ? "CHOSEN" : "CHOOSE"}</span>
            </button>`).join("")}
        </div>

        <div class="lower-grid">
          <section class="loadout-panel" id="stash">
            <div class="panel-heading"><span><small>RISK LOADOUT</small><strong>Stash</strong></span><b>${profile.stash.length} / 24</b></div>
            <div class="stash-toolbar">
              <p class="panel-intro">Pack up to two pieces, with one weapon and one armor slot. Consumables use any open slot. Death removes packed items from your stash.</p>
              <label class="stash-sort"><span>ORDER</span><select data-stash-sort aria-label="Sort stash">
                <option value="recent" ${preferences.stashSort === "recent" ? "selected" : ""}>Newest</option>
                <option value="rarity" ${preferences.stashSort === "rarity" ? "selected" : ""}>Rarity</option>
                <option value="value" ${preferences.stashSort === "value" ? "selected" : ""}>Value</option>
                <option value="kind" ${preferences.stashSort === "kind" ? "selected" : ""}>Type</option>
              </select></label>
            </div>
            <div class="stash-list">
              ${displayedStash.length ? displayedStash.map((item) => itemMarkup(item, true)).join("") : `<div class="empty-stash"><strong>THE CHEST IS BARE</strong><span>You can still descend with class equipment.</span></div>`}
            </div>
            <div class="merchant-market" id="merchant">
              <div class="panel-heading"><span><small>THE IRONMONGER</small><strong>Provision bench</strong></span><b>${ironmongerStanding.name.toUpperCase()}</b></div>
              <p class="panel-intro">Buy dependable supplies between raids. Successful extracts unlock stronger stock. Purchased gear enters the stash and is still lost if packed into a failed delve.</p>
              <div class="merchant-standing">
                <span><i style="width:${ironmongerStanding.progress}%"></i></span>
                <small>${ironmongerStanding.nextExtracts === undefined ? "ALL STOCK EARNED" : `NEXT STOCK · ${profile.extracts} / ${ironmongerStanding.nextExtracts} EXTRACTS`}</small>
              </div>
              <div class="merchant-offers">
                ${MERCHANT_OFFERS.map((offer) => {
                  const unlocked = merchantOfferUnlocked(offer, profile.extracts);
                  return `<article class="merchant-offer ${unlocked ? "" : "locked"}" style="--rarity:${RARITY_COLOR[offer.item.rarity]}">
                    <i data-mark="${rarityMark(offer.item.rarity)}" aria-hidden="true"></i><span><strong>${offer.item.name}</strong><small>${offer.item.modifier ?? `${offer.item.rarity} ${offer.item.kind}`}</small></span>
                    <button type="button" data-merchant-sku="${offer.sku}" aria-label="${unlocked ? `Buy ${offer.item.name} for ${offer.price} gold` : `Requires ${offer.requiredExtracts} successful extracts`}" ${unlocked ? "" : "disabled"}>${unlocked ? `${offer.price}g` : `${offer.requiredExtracts} EXT`}</button>
                  </article>`;
                }).join("")}
              </div>
              <div class="forge-recipes">
                ${CRAFTING_RECIPES.map((recipe) => {
                  const unlocked = craftingRecipeUnlocked(recipe, profile.extracts);
                  const hasMaterial = profile.stash.some((item) => item.name === recipe.ingredientName && item.kind === recipe.ingredientKind);
                  const affordable = profile.gold >= recipe.goldCost;
                  const ready = unlocked && hasMaterial && affordable;
                  const standing = merchantStanding(recipe.requiredExtracts).name.toUpperCase();
                  return `<article class="forge-recipe ${ready ? "ready" : ""} ${unlocked ? "" : "locked"}">
                    <span><small>${standing} EMBERFORGE RECIPE</small><strong>${recipe.name}</strong><p>${recipe.ingredientName} + ${recipe.goldCost}g</p></span>
                    <button type="button" data-recipe-id="${recipe.id}" aria-label="${unlocked ? `Forge ${recipe.name}` : `${recipe.name} requires ${recipe.requiredExtracts} successful extracts`}" ${ready ? "" : "disabled"}>${!unlocked ? `NEED ${recipe.requiredExtracts} EXT` : !hasMaterial ? "NEED RELIC" : !affordable ? `NEED ${recipe.goldCost}g` : "FORGE"}</button>
                  </article>`;
                }).join("")}
              </div>
              <p class="merchant-notice" role="status">${escapeHtml(merchantNotice || "The ironmonger does not offer refunds.")}</p>
            </div>
          </section>

          <aside class="right-rail">
            <section class="delver-sheet">
              <div class="panel-heading"><span><small>ACTIVE DELVER</small><strong>${chosen.name}</strong></span><b>LV ${level}</b></div>
              <div class="level-track"><i style="width:${levelProgress}%"></i></div>
              <div class="sheet-line"><span>Experience</span><strong>${classXp} / ${nextLevelXp}</strong></div>
              <div class="sheet-line"><span>Raid weapon</span><strong>${chosen.weapon}</strong></div>
              <div class="sheet-line"><span>Class art</span><strong>${chosen.ability}</strong></div>
              <div class="sheet-line"><span>Active skill</span><strong>Q · ${CLASS_ABILITIES[selectedClass].name}</strong></div>
              <div class="sheet-line"><span>Veterancy</span><strong>+${bonuses.health} vigor · +${bonuses.damage} damage</strong></div>
              <div class="sheet-line"><span>Packed vigor</span><strong>+${packedVigor}</strong></div>
              <div class="sheet-line"><span>Loadout pace</span><strong>${Math.round(previewStats.movementMultiplier * 100)}%</strong></div>
              <div class="perk-list">
                ${CLASS_PERKS[selectedClass].map((perk) => `<div class="${level >= perk.level ? "unlocked" : "locked"}"><b>LV ${perk.level}</b><span><strong>${perk.name}</strong><small>${perk.description}</small></span></div>`).join("")}
              </div>
              <div class="risk-total"><span>TOTAL CONTRACT RISK</span><strong>${contractRiskValue}G · ${equippedIds.size} / 2 ITEMS${classXpAtRisk ? ` · ${classXpAtRisk} XP` : ""}</strong></div>
            </section>
            <section class="contract-card" id="contracts">
              <span class="wax-seal">I</span>
              <div><small>THE TAVERNER'S FIRST DEBT</small><strong>${profile.extracts > 0 ? "Debt honored" : "Escape the Pale Toll"}</strong><p>${profile.extracts > 0 ? "The 100g bounty was paid. The tavern remembers your name." : "Return alive once with anything worth keeping. Reward: 100g."}</p></div>
              <b>${profile.extracts > 0 ? "PAID" : "0 / 1"}</b>
            </section>
            <section class="contract-card">
              <span class="wax-seal">II</span>
              <div><small>THE PALE TOLL BROKEN</small><strong>${profile.bossVictories > 0 ? "Keeper answered" : "Kill the Tollkeeper and escape"}</strong><p>${profile.bossVictories > 0 ? `${profile.bossVictories} victorious return${profile.bossVictories === 1 ? "" : "s"}. The first 150g bounty was paid.` : "Slay the keeper, then survive the blue passage. Reward: 150g."}</p></div>
              <b>${profile.bossVictories > 0 ? "PAID" : "0 / 1"}</b>
            </section>
            <section class="contract-card">
              <span class="wax-seal">III</span>
              <div><small>THE DEEPER WAGER</small><strong>${profile.highTollExtracts > 0 ? "Wager returned" : "Escape the High Toll"}</strong><p>${profile.highTollExtracts > 0 ? `${profile.highTollExtracts} High Toll escape${profile.highTollExtracts === 1 ? "" : "s"}. The first 200g bounty was paid.` : "Pay the fee, survive the empowered crypt, and extract. Reward: 200g."}</p></div>
              <b>${profile.highTollExtracts > 0 ? "PAID" : "0 / 1"}</b>
            </section>
            <section class="contract-card">
              <span class="wax-seal">IV</span>
              <div><small>ASH BELOW ASH</small><strong>${profile.ashenExtracts > 0 ? "Depth answered" : "Return from the Ashen Depth"}</strong><p>${profile.ashenExtracts > 0 ? `${profile.ashenExtracts} Ashen return${profile.ashenExtracts === 1 ? "" : "s"}. The first 250g bounty was paid.` : "Slay the first keeper, descend red, and escape the second floor. Reward: 250g."}</p></div>
              <b>${profile.ashenExtracts > 0 ? "PAID" : "0 / 1"}</b>
            </section>
            <section class="contract-card">
              <span class="wax-seal">V</span>
              <div><small>THE OSSUARY LEDGER</small><strong>${profile.boneBountyPaid ? "Bone tithe settled" : boneKills >= BONE_BOUNTY_TARGET ? "Return alive to claim" : "Cull cryptborn threats"}</strong><p>${profile.boneBountyPaid ? "The guild paid 175g for the completed bestiary ledger." : `Skeletons, crawlers, mimics, and wardens count. Reward: 175g on extraction.`}</p></div>
              <b>${profile.boneBountyPaid ? "PAID" : `${Math.min(BONE_BOUNTY_TARGET, boneKills)} / ${BONE_BOUNTY_TARGET}`}</b>
            </section>
            <section class="contract-card">
              <span class="wax-seal">VI</span>
              <div><small>KNIVES OF THE GUILDLESS</small><strong>${profile.rivalBountyPaid ? "Rival ledger settled" : profile.threatKills.rival >= RIVAL_BOUNTY_TARGET ? "Return alive to claim" : "Defeat rival delvers"}</strong><p>${profile.rivalBountyPaid ? "The guild paid 225g for three hostile delver marks." : "Kill three rival delvers across any contracts. Reward: 225g on extraction."}</p></div>
              <b>${profile.rivalBountyPaid ? "PAID" : `${Math.min(RIVAL_BOUNTY_TARGET, profile.threatKills.rival)} / ${RIVAL_BOUNTY_TARGET}`}</b>
            </section>
            <section class="contract-card">
              <span class="wax-seal">VII</span>
              <div><small>THREE RETURNS WITHOUT FUNERAL</small><strong>${profile.streakBountyPaid ? "Lantern oath honored" : "Extract three times in a row"}</strong><p>${profile.streakBountyPaid ? "The Ironmonger paid 300g for the completed survival oath." : "Any failed or abandoned contract breaks the chain. Reward: 300g on the third consecutive extraction."}</p></div>
              <b>${profile.streakBountyPaid ? "PAID" : `${Math.min(3, contractRecord.currentExtractStreak)} / 3`}</b>
            </section>
            <section class="contract-card">
              <span class="wax-seal">VIII</span>
              <div><small>QUIET KNIVES, OPEN PASSAGE</small><strong>${profile.quietKnivesPaid ? "Silent tithe settled" : `Mark ${QUIET_KNIVES_TARGET} unaware threats`}</strong><p>${profile.quietKnivesPaid ? `The guild paid ${QUIET_KNIVES_REWARD}g for a return written before the crypt could answer.` : `Strike ${QUIET_KNIVES_TARGET} unique non-boss threats before they detect you, then extract. Reward: ${QUIET_KNIVES_REWARD}g.`}</p></div>
              <b>${profile.quietKnivesPaid ? "PAID" : `0 / ${QUIET_KNIVES_TARGET}`}</b>
            </section>
            <section class="contract-card daily">
              <span class="wax-seal">IX</span>
              <div><small>DAILY IRONMONGER COMMISSION · ${todaysCommission.day}</small><strong>${commissionClaimed ? "Commission settled" : todaysCommission.title}</strong><p>${commissionClaimed ? `${todaysCommission.reward}g paid for today's live return.` : `Defeat ${todaysCommission.target} ${todaysCommission.kind}${todaysCommission.target === 1 ? "" : "s"} in one raid and extract. Reward: ${todaysCommission.reward}g. Resets at 00:00 UTC.`}</p></div>
              <b>${commissionClaimed ? "PAID TODAY" : `0 / ${todaysCommission.target}`}</b>
            </section>
            <section class="journal-panel" aria-labelledby="journal-heading">
              <div class="panel-heading"><span><small>PERSISTENT LEDGER</small><strong id="journal-heading">Recent contracts</strong></span><b>${profile.raidHistory.length} / 10</b></div>
              <div class="journal-summary" aria-label="Contract record summary">
                <span><small>LIFETIME CONTRACTS</small><strong>${contractRecord.totalContracts}</strong></span>
                <span><small>EXTRACTION RATE</small><strong>${contractRecord.extractionRate}%</strong></span>
                <span><small>CURRENT STREAK</small><strong>${contractRecord.currentExtractStreak}</strong></span>
                <span><small>10-RUN BEST</small><strong>${contractRecord.recentBestGold}g</strong></span>
              </div>
              <div class="journal-list">
                ${profile.raidHistory.length ? profile.raidHistory.map((entry) => {
                  const rules = raidRules(entry.raidMode);
                  const outcome = entry.reason === "extracted" ? "EXTRACTED" : entry.reason === "darkness" ? "TAKEN BY DARK" : entry.reason === "abandoned" ? "FORFEITED" : "SLAIN";
                  const floor = entry.depthReached === 2 ? "ASHEN DEPTH" : "PALE TOLL";
                  const xp = entry.xpDelta >= 0 ? `+${entry.xpDelta} XP` : `${entry.xpDelta} XP`;
                  return `<article class="journal-entry ${entry.reason === "extracted" ? "survived" : "failed"}">
                    <span>${CLASS_RUNES[entry.classId]}</span>
                    <div><small>${journalDate(entry.completedAt)} · ${rules.name.toUpperCase()} · ${floor}${validRaidVariationSeed(entry.variationSeed) ? ` · ${raidVariationSeal(entry.variationSeed)}` : ""}</small><strong>${outcome}${entry.bossKilled ? " · KEEPER FELLED" : ""}</strong><p>${CLASSES[entry.classId].name} · ${formatTime(entry.elapsed)} · ${entry.kills} kills${entry.unseenStrikes ? ` · ${entry.unseenStrikes} unseen` : ""}${entry.gearLost ? ` · ${entry.gearLost} gear lost` : ""}</p></div>
                    <b>${entry.goldDelta > 0 ? `+${entry.goldDelta}G` : "0G"}<small>${xp}</small></b>
                  </article>`;
                }).join("") : `<div class="empty-stash"><strong>NO CONTRACTS RECORDED</strong><span>Your next verdict will be preserved here.</span></div>`}
              </div>
            </section>
            <section class="bestiary-panel" aria-labelledby="bestiary-heading">
              <div class="panel-heading"><span><small>PERSISTENT INTELLIGENCE</small><strong id="bestiary-heading">Crypt bestiary</strong></span><b>${Object.values(profile.threatKills).filter((count) => count > 0).length} / 6</b></div>
              <div class="bestiary-list">
                ${Object.values(BESTIARY).map((entry) => {
                  const kills = profile.threatKills[entry.kind];
                  return `<article class="bestiary-entry ${kills > 0 ? "discovered" : "unknown"}">
                    <span>${kills > 0 ? entry.kind.slice(0, 1).toUpperCase() : "?"}</span>
                    <div><small>${kills > 0 ? entry.title : "UNDISCOVERED THREAT"}</small><strong>${kills > 0 ? entry.name : "Ink-stained page"}</strong><p>${kills > 0 ? entry.tactic : "Defeat this threat once to preserve a tactical note."}</p></div>
                    <b>${kills > 0 ? `${kills} KILLS` : "LOCKED"}</b>
                  </article>`;
                }).join("")}
              </div>
            </section>
            <section class="settings-panel" aria-labelledby="settings-heading">
              <div class="panel-heading"><span><small>ACCESSIBILITY</small><strong id="settings-heading">Delver settings</strong></span><b>LOCAL</b></div>
              <label class="setting-line"><span>Mouse sensitivity <output data-output="mouseSensitivity">${preferences.mouseSensitivity.toFixed(1)}x</output></span><input type="range" aria-label="Mouse sensitivity" data-preference="mouseSensitivity" min="0.5" max="2" step="0.1" value="${preferences.mouseSensitivity}"></label>
              <label class="setting-line"><span>Field of view <output data-output="fieldOfView">${Math.round(preferences.fieldOfView)}°</output></span><input type="range" aria-label="Field of view" data-preference="fieldOfView" min="60" max="95" step="1" value="${preferences.fieldOfView}"></label>
              <label class="setting-line"><span>Crosshair size <output data-output="crosshairScale">${Math.round(preferences.crosshairScale * 100)}%</output></span><input type="range" aria-label="Crosshair size" data-preference="crosshairScale" min="0.75" max="1.75" step="0.05" value="${preferences.crosshairScale}"></label>
              <label class="setting-line"><span>Crypt brightness <output data-output="brightness">${Math.round(preferences.brightness * 100)}%</output></span><input type="range" aria-label="Crypt brightness" data-preference="brightness" min="0.75" max="1.4" step="0.05" value="${preferences.brightness}"></label>
              <label class="setting-line"><span>Master volume <output data-output="volume">${Math.round(preferences.volume * 100)}%</output></span><input type="range" aria-label="Master volume" data-preference="volume" min="0" max="1" step="0.05" value="${preferences.volume}"></label>
              <label class="setting-toggle"><input type="checkbox" data-preference="muted" ${preferences.muted ? "checked" : ""}><span>Mute dungeon audio</span></label>
              <label class="setting-toggle"><input type="checkbox" data-preference="reducedMotion" ${preferences.reducedMotion ? "checked" : ""}><span>Reduce camera motion</span></label>
              <label class="setting-toggle"><input type="checkbox" data-preference="reducedFlashes" ${preferences.reducedFlashes ? "checked" : ""}><span>Reduce flashing effects</span></label>
              <label class="setting-toggle"><input type="checkbox" data-preference="highContrastHud" ${preferences.highContrastHud ? "checked" : ""}><span>High-contrast raid HUD</span></label>
              <label class="setting-toggle"><input type="checkbox" data-preference="invertY" ${preferences.invertY ? "checked" : ""}><span>Invert vertical mouse look</span></label>
              <div class="save-actions">
                <button type="button" data-save-action="export">Export save</button>
                <button type="button" data-save-action="import">Import save</button>
                ${profileRecovery !== undefined ? `<button type="button" data-save-action="recovery">Download unreadable recovery</button>` : ""}
                <input type="file" data-save-file accept="application/json,.json" hidden>
              </div>
            </section>
          </aside>
        </div>
      </section>

      <footer class="site-footer"><span>DARKPIX PRE-ALPHA // ${release} // SOLO PVPVE SIMULATION</span><span>Headphones recommended · desktop controls</span></footer>
    </main>`;

  app.querySelectorAll<HTMLElement>("[data-class-id]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedClass = button.dataset.classId as ClassId;
      profile.preferredClass = selectedClass;
      persistProfile();
      renderLobby();
    });
  });
  app.querySelectorAll<HTMLButtonElement>("[data-raid-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.raidMode as RaidMode;
      if (raidEntryStatus(mode, profile.extracts, profile.gold, profile.ashenExtracts) !== "ready") return;
      selectedRaidMode = mode;
      renderLobby();
    });
  });
  app.querySelectorAll<HTMLElement>("[data-jump]").forEach((button) => {
    button.addEventListener("click", () => document.querySelector(`#${button.dataset.jump}`)?.scrollIntoView({ behavior: "smooth" }));
  });
  app.querySelectorAll<HTMLButtonElement>(".risk-item").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.closest<HTMLElement>("[data-item-id]")?.dataset.itemId;
      if (!id) return;
      pendingSaleId = undefined;
      equippedIds = toggleEquippedItem(equippedIds, profile.stash, id);
      renderLobby();
    });
  });
  app.querySelectorAll<HTMLButtonElement>(".sell-item").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.closest<HTMLElement>("[data-item-id]")?.dataset.itemId;
      const item = profile.stash.find((candidate) => candidate.id === id);
      if (!item) return;
      if (saleNeedsConfirmation(item, equippedIds.has(item.id)) && pendingSaleId !== item.id) {
        pendingSaleId = item.id;
        merchantNotice = `${item.name} is protected. Click Confirm to sell it for ${item.value}g.`;
        renderLobby();
        return;
      }
      pendingSaleId = undefined;
      const sale = sellStashItem(profile, item.id);
      profile = sale.profile;
      if (!sale.sold) {
        merchantNotice = "Your coin ledger is full. Spend gold before selling more relics.";
        renderLobby();
        return;
      }
      equippedIds.delete(item.id);
      merchantNotice = sale.proceeds === item.value
        ? `${item.name} sold for ${sale.proceeds}g.`
        : `${item.name} sold for ${sale.proceeds}g. The coin ledger reached its limit.`;
      persistProfile();
      renderLobby();
    });
  });
  app.querySelectorAll<HTMLButtonElement>("[data-merchant-sku]").forEach((button) => {
    button.addEventListener("click", () => {
      const offer = MERCHANT_OFFERS.find((candidate) => candidate.sku === button.dataset.merchantSku);
      if (!offer) return;
      if (!merchantOfferUnlocked(offer, profile.extracts)) {
        merchantNotice = `${offer.item.name} requires ${offer.requiredExtracts} successful extracts.`;
        renderLobby();
        return;
      }
      const item: Item = {
        ...offer.item,
        id: createItemId(`merchant-${offer.sku}`),
      };
      const purchase = purchaseItem(profile, item, offer.price);
      profile = purchase.profile;
      merchantNotice = purchase.outcome === "purchased"
        ? `${offer.item.name} added to the stash.`
        : purchase.outcome === "stash_full"
          ? "The stash is full. Sell something before buying."
          : purchase.outcome === "insufficient_gold"
            ? `You need ${offer.price - profile.gold}g more for ${offer.item.name}.`
            : "The Ironmonger withdrew that malformed offer.";
      if (purchase.outcome === "purchased") persistProfile();
      renderLobby();
    });
  });
  app.querySelectorAll<HTMLButtonElement>("[data-recipe-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const recipe = CRAFTING_RECIPES.find((candidate) => candidate.id === button.dataset.recipeId);
      if (!recipe) return;
      const outputId = createItemId(`crafted-${recipe.id}`);
      const craft = craftItem(profile, recipe, outputId);
      profile = craft.profile;
      merchantNotice = craft.outcome === "crafted"
        ? `${recipe.name} forged and placed in the stash.`
        : craft.outcome === "reputation_locked"
          ? `${recipe.name} requires ${recipe.requiredExtracts} successful extracts.`
          : craft.outcome === "missing_material"
          ? `Recover ${recipe.ingredientName} before attempting this recipe.`
          : craft.outcome === "insufficient_gold"
            ? `The forge requires ${recipe.goldCost}g.`
            : "The forge refused a duplicate item mark.";
      if (craft.outcome === "crafted") persistProfile();
      renderLobby();
    });
  });
  app.querySelectorAll<HTMLInputElement>("[data-preference]").forEach((input) => {
    input.addEventListener("input", () => {
      const key = input.dataset.preference as keyof GamePreferences;
      if (key === "muted" || key === "reducedMotion" || key === "reducedFlashes" || key === "highContrastHud" || key === "invertY") preferences = { ...preferences, [key]: input.checked };
      else preferences = { ...preferences, [key]: Number(input.value) };
      persistPreferences();
      const output = app.querySelector<HTMLOutputElement>(`[data-output="${key}"]`);
      if (output) output.textContent = key === "brightness" || key === "volume" || key === "crosshairScale"
        ? `${Math.round(Number(input.value) * 100)}%`
        : key === "fieldOfView"
          ? `${Math.round(Number(input.value))}°`
          : `${Number(input.value).toFixed(1)}x`;
    });
  });
  app.querySelector<HTMLSelectElement>("[data-stash-sort]")?.addEventListener("change", (event) => {
    preferences = { ...preferences, stashSort: (event.currentTarget as HTMLSelectElement).value as GamePreferences["stashSort"] };
    persistPreferences();
    renderLobby();
  });
  app.querySelector<HTMLButtonElement>('[data-save-action="export"]')?.addEventListener("click", () => {
    const backup = createSaveBackup(profile, preferences, release);
    downloadTextFile(backup, `darkpix-save-${new Date().toISOString().slice(0, 10)}.json`, "application/json");
    const notice = app.querySelector<HTMLElement>(".merchant-notice");
    if (notice) notice.textContent = "Save exported. Keep the JSON file somewhere safe.";
  });
  app.querySelector<HTMLButtonElement>('[data-save-action="recovery"]')?.addEventListener("click", () => {
    if (profileRecovery === undefined) return;
    downloadTextFile(profileRecovery, `darkpix-unreadable-recovery-${new Date().toISOString().slice(0, 10)}.txt`, "text/plain");
    const notice = app.querySelector<HTMLElement>(".merchant-notice");
    if (notice) notice.textContent = "Unreadable recovery downloaded. Keep it with any earlier DarkPix backups.";
  });
  const saveFileInput = app.querySelector<HTMLInputElement>("[data-save-file]");
  app.querySelector<HTMLButtonElement>('[data-save-action="import"]')?.addEventListener("click", () => saveFileInput?.click());
  saveFileInput?.addEventListener("change", () => void (async () => {
    const importTicket = saveImportGate.begin();
    if (importTicket === undefined) return;
    try {
      const file = saveFileInput.files?.[0];
      if (!file) return;
      if (file.size > 1_000_000) {
        merchantNotice = "That save file is too large to be a DarkPix backup.";
        renderLobby();
        return;
      }
      app.querySelectorAll<HTMLButtonElement>('[data-save-action="import"], .descend-button').forEach((button) => { button.disabled = true; });
      let imported: ReturnType<typeof parseSaveBackup>;
      try {
        imported = parseSaveBackup(await file.text());
      } catch {
        imported = undefined;
      }
      saveFileInput.value = "";
      if (!lobbyOperationCurrent(renderedLobbyEpoch, lobbyEpoch, raidLaunchGate.busy, Boolean(activeGame))) return;
      if (!imported) {
        merchantNotice = "That file is not a valid DarkPix save backup.";
        renderLobby();
        return;
      }
      if (!window.confirm("Replace this browser's DarkPix profile and settings with the selected backup?")) {
        renderLobby();
        return;
      }
      const importPersistence = persistSaveImport(imported, saveProfile, savePreferences);
      if (importPersistence === "rejected") {
        persistenceWarning = "The browser refused the imported profile. The existing durable save was left unchanged.";
        merchantNotice = "Save import was not applied.";
        renderLobby();
        return;
      }
      profile = imported.profile;
      preferences = imported.preferences;
      selectedClass = profile.preferredClass;
      equippedIds = new Set();
      persistenceWarning = importPersistence === "complete" ? "" : "The profile was imported, but its settings will last only until the page closes.";
      merchantNotice = importPersistence === "complete"
        ? "Save imported. The Last Lantern remembers you again."
        : "Profile imported. The browser refused its settings.";
      renderLobby();
    } finally {
      saveImportGate.finish(importTicket);
    }
  })());
  const descendButton = app.querySelector<HTMLButtonElement>(".descend-button");
  descendButton?.addEventListener("pointerenter", () => void loadGameModule());
  descendButton?.addEventListener("focus", () => void loadGameModule());
  descendButton?.addEventListener("click", () => void startRaid());
  app.querySelector<HTMLAnchorElement>(".brand")?.addEventListener("click", (event) => event.preventDefault());
}

function refundFailedRaidStart(goldBeforeEntry: number): boolean {
  profile.gold = goldBeforeEntry;
  if (activeRaidStartedAt > 0) profile.lastSettledRaidStartedAt = activeRaidStartedAt;
  if (!saveProfile(profile)) return false;
  const cleared = clearRaidEscrow();
  if (cleared) activeRaidStartedAt = 0;
  return cleared;
}

async function startRaid(): Promise<void> {
  if (saveImportGate.busy) {
    merchantNotice = "Finish or cancel the save import before descending.";
    renderLobby();
    return;
  }
  const launchTicket = raidLaunchGate.begin();
  if (launchTicket === undefined) return;
  let securedGoldBeforeEntry: number | undefined;
  let mount: HTMLElement | null = null;
  try {
    const descendButton = app.querySelector<HTMLButtonElement>(".descend-button");
    if (descendButton) {
      descendButton.disabled = true;
      descendButton.textContent = "SECURING CONTRACT...";
    }
    if (typeof HTMLCanvasElement.prototype.requestPointerLock !== "function") {
      merchantNotice = "DarkPix raids require pointer lock. Use a current desktop browser to descend.";
      renderLobby();
      document.querySelector("#stash")?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    const classId = selectedClass;
    const raidMode = selectedRaidMode;
    const raidPreferences = { ...preferences };
    const rules = raidRules(raidMode);
    const entryStatus = raidEntryStatus(raidMode, profile.extracts, profile.gold, profile.ashenExtracts);
    if (entryStatus !== "ready") {
      merchantNotice = entryStatus === "extract_required"
        ? "Escape the Pale Toll once before attempting the High Toll."
        : entryStatus === "ashen_extract_required"
          ? "Return alive from the Ashen Depth before wagering an Iron Soul."
          : `${rules.name} requires its ${rules.entryFee}g entry fee.`;
      selectedRaidMode = "standard";
      renderLobby();
      document.querySelector("#stash")?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    const equipped = profile.stash.filter((item) => equippedIds.has(item.id));
    const goldBeforeEntry = profile.gold;
    securedGoldBeforeEntry = goldBeforeEntry;
    const variationSeed = Math.floor(Math.random() * RAID_VARIATION_COUNT);
    const startedAt = nextRaidStartedAt(Date.now(), profile.lastSettledRaidStartedAt);
    let escrow = createRaidEscrow(classId, raidMode, equipped.map((item) => item.id), startedAt, 1, 0, goldBeforeEntry, {}, variationSeed);
    if (!beginRaidEscrow(escrow)) {
      persistenceWarning = "The browser could not secure a raid escrow. No fee was charged and the raid did not start.";
      renderLobby();
      return;
    }
    activeRaidStartedAt = escrow.startedAt;
    profile.gold = escrow.goldAfterEntry ?? Math.max(0, goldBeforeEntry - rules.entryFee);
    if (!saveProfile(profile)) {
      profile.gold = goldBeforeEntry;
      const canceled = clearRaidEscrow();
      if (canceled) activeRaidStartedAt = 0;
      else {
        profile.lastSettledRaidStartedAt = activeRaidStartedAt;
        interruptedSettlementPending = true;
        interruptedSettlementNotice = "Canceled raid entry reconciled without charging its fee.";
      }
      persistenceWarning = canceled
        ? "The browser could not persist the raid entry. No fee was charged and the raid did not start."
        : "The browser could not remove the canceled raid journal. Lobby actions are locked until its cancellation marker is durable.";
      renderLobby();
      return;
    }
    app.innerHTML = `<main class="game-mount" aria-label="DarkPix dungeon raid"><div class="crypt-loading ${raidPreferences.reducedMotion ? "reduced-motion" : ""}" role="status"><span>DP</span><strong>OPENING THE ${rules.name.toUpperCase()}</strong><small>Kindling the dungeon renderer</small></div></main>`;
    mount = app.querySelector<HTMLElement>(".game-mount");
    if (!mount) {
      if (!refundFailedRaidStart(goldBeforeEntry)) persistenceWarning = "The failed raid entry could not be refunded yet. Its escrow remains for recovery.";
      return;
    }
    const { DarkPixGame: GameRuntime } = await loadGameModule();
    if (!mount.isConnected || !app.contains(mount)) {
      if (!refundFailedRaidStart(goldBeforeEntry)) persistenceWarning = "The canceled raid entry could not be refunded yet. Its escrow remains for recovery.";
      return;
    }
    activeGame = new GameRuntime(mount, {
      classId,
      classLevel: levelForXp(profile.xp[classId]),
      raidMode,
      equipped,
      preferences: raidPreferences,
      variationSeed,
      onCheckpoint: (depthReached, kills, killsByKind, unseenStrikes) => {
        escrow = createRaidEscrow(escrow.classId, escrow.raidMode, escrow.equippedIds, escrow.startedAt, depthReached, kills, escrow.goldBeforeEntry, killsByKind, escrow.variationSeed, unseenStrikes);
        const saved = beginRaidEscrow(escrow);
        if (!saved) console.warn("DarkPix could not update the active raid escrow checkpoint");
        return saved;
      },
      onFinish: finishRaid,
    });
  } catch (error) {
    console.error("DarkPix could not start the 3D raid", error);
    const refunded = securedGoldBeforeEntry === undefined ? true : refundFailedRaidStart(securedGoldBeforeEntry);
    if (!refunded) persistenceWarning = "The failed raid entry could not be refunded yet. Its escrow remains for recovery.";
    if (mount?.isConnected) {
      mount.innerHTML = `<section class="runtime-error"><span>†</span><h1>THE PASSAGE FAILED</h1><p>The 3D renderer could not start. Update the browser, enable WebGL, or try the raid again.</p><button type="button">RETURN TO THE LAST LANTERN</button></section>`;
      mount.querySelector<HTMLButtonElement>("button")?.addEventListener("click", refunded ? renderLobby : () => location.reload());
    }
  } finally {
    raidLaunchGate.finish(launchTicket);
  }
}

function finishRaid(result: RaidResult): void {
  activeGame?.destroy();
  activeGame = undefined;
  const settledAt = Date.now();
  result = normalizeRaidResult(profile, result, settledAt);
  const extracted = result.reason === "extracted";
  const rules = raidRules(result.raidMode);
  const riskedIds = new Set(result.equippedIds);
  const consumedIds = new Set(result.consumedIds ?? []);
  const riskedBeforeSettlement = profile.stash.filter((item) => riskedIds.has(item.id));
  const consumedItems = riskedBeforeSettlement.filter((item) => consumedIds.has(item.id));
  const returnedItems = extracted ? riskedBeforeSettlement.filter((item) => !consumedIds.has(item.id)) : [];
  const xpBreakdown = raidXpBreakdown(result);
  const threatLedger = raidThreatKillLedger(result);
  const threatBreakdown = Object.entries(threatLedger.byKind)
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => `${kind.toUpperCase()} ${count}`)
    .join(" · ");
  const settlement = settleRaid(profile, result, settledAt);
  const riskedValue = itemValueTotal(riskedBeforeSettlement);
  const valueSummary = raidValueSummary({
    extracted,
    banked: settlement.banked,
    lost: settlement.lost,
    consumed: consumedItems,
    goldGained: settlement.goldGained,
    entryFee: rules.entryFee,
  });
  profile = settlement.profile;
  if (activeRaidStartedAt > 0) profile.lastSettledRaidStartedAt = activeRaidStartedAt;
  let verdictSecured = persistBeforeClearingEscrow(persistProfile, clearRaidEscrow);
  if (verdictSecured) activeRaidStartedAt = 0;
  const recordedItems = extracted
    ? [
        ...returnedItems.map((item) => ({ item, outcome: "GEAR RETURNED" })),
        ...consumedItems.map((item) => ({ item, outcome: "USED BELOW" })),
        ...settlement.banked.map((item) => ({ item, outcome: "STASHED" })),
        ...settlement.overflow.map((item) => ({ item, outcome: "PORTER-SOLD" })),
      ]
    : [
        ...consumedItems.map((item) => ({ item, outcome: "USED BELOW" })),
        ...settlement.lost.map((item) => ({ item, outcome: "GEAR LOST" })),
        ...result.loot.map((item) => ({ item, outcome: "HAUL LOST" })),
      ];
  const headline = extracted
    ? "YOU RETURNED"
    : result.reason === "darkness"
      ? "THE DARK TOOK YOU"
    : result.raidMode === "iron_soul"
      ? "THE IRON SOUL WAS EXTINGUISHED"
      : result.reason === "abandoned" ? "THE CONTRACT WAS FORFEIT" : "YOUR TORCH WENT OUT";
  const detail = extracted
    ? `${result.depthReached === 2 ? "The Ashen Depth's passage" : "The blue passage"} seals behind you. ${settlement.overflow.length ? `${settlement.overflow.length} overflow item${settlement.overflow.length === 1 ? " was" : "s were"} sold by the porter for ${settlement.overflowGold}g.` : "Everything in your haul fits safely in the stash."}${result.depthReached === 2 ? " The red-depth veterancy bonus is recorded." : ""}${settlement.firstContractPaid ? " The Taverner's 100g bounty is paid." : ""}${settlement.bossContractPaid ? " The 150g Tollkeeper bounty is paid." : ""}${settlement.highTollContractPaid ? " The 200g Deeper Wager bounty is paid." : result.raidMode === "high_toll" ? " The High Toll veterancy bonus is recorded." : ""}${settlement.ashenContractPaid ? " The 250g Ash Below Ash bounty is paid." : ""}${settlement.boneBountyPaid ? " The 175g Ossuary Ledger bounty is paid." : ""}${settlement.rivalBountyPaid ? " The 225g Guildless Knives bounty is paid." : ""}${settlement.streakBountyPaid ? " The 300g Three Returns bounty is paid." : ""}${settlement.quietKnivesPaid ? ` The ${QUIET_KNIVES_REWARD}g Quiet Knives bounty is paid.` : ""}${settlement.commissionPaid ? ` The daily Ironmonger commission pays ${settlement.commissionReward}g.` : ""}`
    : `${settlement.classXpLost > 0 ? `${settlement.classXpLost} ${CLASSES[result.classId].name} XP is erased by the Iron Soul oath.` : result.raidMode === "iron_soul" ? "The Iron Soul oath finds no veterancy left to erase." : "Your class remembers."} Your carried gear and every unsecured find remain ${result.depthReached === 2 ? "in the Ashen Depth" : "below"}.${result.depthReached === 2 && result.raidMode !== "iron_soul" ? " Some red-depth veterancy survives." : ""}${rules.entryFee ? ` The ${rules.entryFee}g entry fee is gone.` : ""}`;
  const nextStep = extracted
    ? settlement.overflow.length
      ? "The stash is full. Sell or forge an item before the next descent to avoid another porter discount."
      : result.depthReached === 2
        ? "The Ashen Return is secured. Refit at the Ironmonger or wager an Iron Soul when ready."
        : "Refit from the recovered haul, or risk a red descent after the next Tollkeeper falls."
    : profile.stash.length > 0
      ? "Rebuild a two-item kit from the stash, or descend with base equipment and scavenge."
      : "The stash is bare. Descend with base class equipment and rebuild from recovered loot.";
  app.innerHTML = `
    <main class="result-screen ${extracted ? "success" : "failure"}">
      <div class="result-backdrop"></div>
      <section class="result-card">
        <span class="result-rune">${extracted ? "◇" : "†"}</span>
        <p class="eyebrow">RAID VERDICT</p>
        <h1>${headline}</h1>
        <p class="result-detail">${detail}</p>
        <div class="result-ledger">
          <span><small>CONTRACT</small><strong>${rules.name}${validRaidVariationSeed(result.variationSeed) ? ` · ${raidVariationSeal(result.variationSeed)}` : ""}</strong></span>
          <span><small>DEEPEST FLOOR</small><strong>${result.depthReached === 2 ? "Ashen Depth" : "Pale Toll"}</strong></span>
          <span><small>LOADOUT RISK</small><strong>${riskedBeforeSettlement.length} items · ${riskedValue}g</strong></span>
          <span><small>NET POSITION</small><strong>${valueSummary.netValue >= 0 ? "+" : ""}${valueSummary.netValue}g value</strong></span>
        </div>
        <div class="result-metrics">
          <span><small>TIME BELOW</small><strong>${formatTime(result.elapsed)}</strong></span>
          <span><small>THREATS FELLED</small><strong>${threatLedger.total}</strong></span>
          <span><small>GOLD ${extracted ? "SETTLED" : "LOST"}</small><strong>${extracted ? settlement.goldGained : result.goldFound}g</strong></span>
          <span><small>CLASS XP</small><strong>${settlement.classXpLost > 0 ? `-${settlement.classXpLost}` : `+${settlement.xpGained}`}</strong></span>
        </div>
        <p class="xp-breakdown">XP LEDGER · presence ${xpBreakdown.presence} · kills ${xpBreakdown.kills} · extraction ${xpBreakdown.extraction} · depth ${xpBreakdown.depth} · ${xpBreakdown.multiplier.toFixed(2)}x${xpBreakdown.forfeited ? " · FORFEITED BY IRON SOUL" : ` = ${xpBreakdown.total}`}</p>
        <p class="threat-breakdown">THREAT LEDGER · ${threatBreakdown || "NO CREDITED KILLS"} · UNSEEN MARKS ${result.unseenStrikes ?? 0}</p>
        <div class="result-haul">
          <div class="panel-heading"><span><small>${extracted ? "SETTLED" : "ABANDONED"}</small><strong>${extracted ? "Recovered haul" : "Lost below"}</strong></span><b>${recordedItems.length} ITEMS</b></div>
          <div class="result-items">
            ${recordedItems.length ? recordedItems.map(({ item, outcome }) => `
              <div class="result-item" style="--rarity:${RARITY_COLOR[item.rarity]}"><i data-mark="${rarityMark(item.rarity)}" aria-hidden="true"></i><span><strong>${escapeHtml(item.name)}</strong><small>${item.rarity} ${item.kind} · ${outcome}</small></span><b>${item.value}g</b></div>`).join("") : `<div class="empty-stash"><strong>NOTHING TO RECORD</strong><span>The ledger remains clean.</span></div>`}
          </div>
        </div>
        <p class="result-next"><small>NEXT DESCENT</small><span>${nextStep}</span></p>
        ${verdictSecured ? "" : `<p class="result-persistence" role="alert">This verdict is not stored yet. The Last Lantern remains locked so the raid cannot be settled twice.</p>`}
        <button class="return-button" type="button">${verdictSecured ? "RETURN TO THE LAST LANTERN" : "RETRY SECURING VERDICT"}</button>
      </section>
    </main>`;
  app.querySelector<HTMLButtonElement>(".return-button")?.addEventListener("click", () => {
    if (!verdictSecured) {
      verdictSecured = persistBeforeClearingEscrow(persistProfile, clearRaidEscrow);
      if (!verdictSecured) {
        const notice = app.querySelector<HTMLElement>(".result-persistence");
        if (notice) notice.textContent = "The browser still refused the verdict. Keep this page open, check private-browsing or storage settings, then retry.";
        return;
      }
      activeRaidStartedAt = 0;
      persistenceWarning = "";
    }
    equippedIds = new Set();
    renderLobby();
  });
}

if (profileLoad.status === "incompatible") renderIncompatibleProfileRecovery();
else renderLobby();
registerOfflineWorker();
