import "./style.css";
import { escapeHtml } from "./html";
import { createSaveBackup, parseSaveBackup } from "./game/backup";
import { CLASSES, CLASS_ABILITIES, CLASS_PERKS, CRAFTING_RECIPES, MERCHANT_OFFERS, RARITY_COLOR, formatTime, levelForXp, merchantOfferUnlocked, progressionBonuses } from "./game/data";
import { equippedPower, loadoutStats, saleNeedsConfirmation, sortStash, toggleEquippedItem } from "./game/loadout";
import { loadPreferences, savePreferences } from "./game/preferences";
import { craftItem, loadProfile, purchaseItem, saveProfile, settleRaid } from "./game/profile";
import { raidEntryStatus, raidRules } from "./game/raid";
import type { DarkPixGame } from "./game/game";
import type { ClassId, GamePreferences, Item, Profile, RaidMode, RaidResult } from "./game/types";

const foundApp = document.querySelector<HTMLDivElement>("#app");
if (!foundApp) throw new Error("DarkPix application root is missing");
const app = foundApp;
const release = import.meta.env.VITE_DARKPIX_VERSION || "dev";

let profile: Profile = loadProfile();
let preferences: GamePreferences = loadPreferences();
let selectedClass: ClassId = profile.preferredClass;
let selectedRaidMode: RaidMode = "standard";
let equippedIds = new Set<string>();
let activeGame: DarkPixGame | undefined;
let merchantNotice = "";
let pendingSaleId: string | undefined;
let persistenceWarning = "";
let gameModulePromise: Promise<typeof import("./game/game")> | undefined;

function loadGameModule(): Promise<typeof import("./game/game")> {
  gameModulePromise ??= import("./game/game");
  return gameModulePromise;
}

function persistProfile(): void {
  if (!saveProfile(profile)) persistenceWarning = "This browser refused local storage. Progress will last only until the page closes.";
}

function persistPreferences(): void {
  if (savePreferences(preferences)) return;
  persistenceWarning = "This browser refused local storage. Settings will last only until the page closes.";
  const notice = app.querySelector<HTMLElement>(".merchant-notice");
  if (notice) notice.textContent = persistenceWarning;
}

function itemMarkup(item: Item, riskable = false): string {
  const selected = equippedIds.has(item.id);
  const confirmingSale = pendingSaleId === item.id;
  const itemId = escapeHtml(item.id);
  const itemName = escapeHtml(item.name);
  const itemModifier = item.modifier ? ` · ${escapeHtml(item.modifier)}` : "";
  return `
    <article class="stash-item ${selected ? "selected" : ""}" data-item-id="${itemId}" style="--rarity:${RARITY_COLOR[item.rarity]}">
      <span class="item-gem"></span>
      <span class="item-copy"><strong>${itemName}</strong><small>${item.rarity} ${item.kind}${itemModifier}</small></span>
      <span class="item-value">${item.value}g</span>
      ${riskable && item.kind !== "treasure" ? `<button class="risk-item" type="button">${selected ? "Packed" : "Pack"}</button>` : ""}
      <button class="sell-item ${confirmingSale ? "confirming" : ""}" type="button" aria-label="${confirmingSale ? "Confirm sale of" : "Sell"} ${itemName}">${confirmingSale ? "Confirm" : "Sell"}</button>
    </article>`;
}

function renderLobby(): void {
  activeGame?.destroy();
  activeGame = undefined;
  if (raidEntryStatus(selectedRaidMode, profile.extracts, profile.gold) !== "ready") selectedRaidMode = "standard";
  const chosen = CLASSES[selectedClass];
  const selectedRaidRules = raidRules(selectedRaidMode);
  const highTollStatus = raidEntryStatus("high_toll", profile.extracts, profile.gold);
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
  app.innerHTML = `
    <main class="lobby">
      <header class="lobby-header">
        <a class="brand" href="#" aria-label="DarkPix home"><span>DP</span><strong>DARKPIX</strong></a>
        <nav class="lobby-nav" aria-label="Game sections">
          <button class="active" type="button">Delve</button>
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
            <button class="${selectedRaidMode === "standard" ? "selected" : ""}" data-raid-mode="standard" type="button"><small>NO ENTRY FEE</small><strong>PALE TOLL</strong></button>
            <button class="high-toll ${selectedRaidMode === "high_toll" ? "selected" : ""}" data-raid-mode="high_toll" type="button" ${highTollStatus === "ready" ? "" : "disabled"}><small>${highTollStatus === "extract_required" ? "ESCAPE ONCE TO UNLOCK" : highTollStatus === "insufficient_gold" ? "50G REQUIRED" : "50G ENTRY FEE"}</small><strong>HIGH TOLL</strong></button>
          </div>
          <button class="descend-button" type="button">
            <span>DESCEND INTO THE ${selectedRaidMode === "high_toll" ? "HIGH TOLL" : "PALE TOLL"}</span>
            <small>Solo contract · ${selectedRaidMode === "high_toll" ? "empowered threats · improved rarity · +35% XP" : "8 roaming threats · 2 sigils · 1 keeper"}</small>
          </button>
          <p class="raid-warning">${selectedRaidRules.entryFee ? `${selectedRaidRules.entryFee}g is paid on entry. ` : ""}Equipped items are lost on death. Class experience always persists.</p>
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
            <button class="class-card ${entry.id === selectedClass ? "selected" : ""}" data-class-id="${entry.id}" type="button" style="--class-accent:${entry.accent}">
              <span class="class-rune">${entry.id === "vanguard" ? "V" : entry.id === "cutpurse" ? "C" : "H"}</span>
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
              <div class="panel-heading"><span><small>THE IRONMONGER</small><strong>Provision bench</strong></span><b>${profile.extracts >= 3 ? "TRUSTED" : profile.extracts >= 1 ? "KNOWN" : "UNPROVEN"}</b></div>
              <p class="panel-intro">Buy dependable supplies between raids. Successful extracts unlock stronger stock. Purchased gear enters the stash and is still lost if packed into a failed delve.</p>
              <div class="merchant-offers">
                ${MERCHANT_OFFERS.map((offer) => {
                  const unlocked = merchantOfferUnlocked(offer, profile.extracts);
                  return `<article class="merchant-offer ${unlocked ? "" : "locked"}" style="--rarity:${RARITY_COLOR[offer.item.rarity]}">
                    <i></i><span><strong>${offer.item.name}</strong><small>${offer.item.modifier ?? `${offer.item.rarity} ${offer.item.kind}`}</small></span>
                    <button type="button" data-merchant-sku="${offer.sku}" aria-label="${unlocked ? `Buy ${offer.item.name} for ${offer.price} gold` : `Requires ${offer.requiredExtracts} successful extracts`}" ${unlocked ? "" : "disabled"}>${unlocked ? `${offer.price}g` : `${offer.requiredExtracts} EXT`}</button>
                  </article>`;
                }).join("")}
              </div>
              <div class="forge-recipes">
                ${CRAFTING_RECIPES.map((recipe) => {
                  const hasMaterial = profile.stash.some((item) => item.name === recipe.ingredientName && item.kind === recipe.ingredientKind);
                  const affordable = profile.gold >= recipe.goldCost;
                  return `<article class="forge-recipe ${hasMaterial && affordable ? "ready" : ""}">
                    <span><small>EMBERFORGE RECIPE</small><strong>${recipe.name}</strong><p>${recipe.ingredientName} + ${recipe.goldCost}g</p></span>
                    <button type="button" data-recipe-id="${recipe.id}" ${hasMaterial && affordable ? "" : "disabled"}>${!hasMaterial ? "NEED RELIC" : !affordable ? `NEED ${recipe.goldCost}g` : "FORGE"}</button>
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
              <div class="risk-total"><span>GEAR AT RISK</span><strong>${equippedIds.size} / 2</strong></div>
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
            <section class="settings-panel" aria-labelledby="settings-heading">
              <div class="panel-heading"><span><small>ACCESSIBILITY</small><strong id="settings-heading">Delver settings</strong></span><b>LOCAL</b></div>
              <label class="setting-line"><span>Mouse sensitivity <output data-output="mouseSensitivity">${preferences.mouseSensitivity.toFixed(1)}x</output></span><input type="range" aria-label="Mouse sensitivity" data-preference="mouseSensitivity" min="0.5" max="2" step="0.1" value="${preferences.mouseSensitivity}"></label>
              <label class="setting-line"><span>Crypt brightness <output data-output="brightness">${Math.round(preferences.brightness * 100)}%</output></span><input type="range" aria-label="Crypt brightness" data-preference="brightness" min="0.75" max="1.4" step="0.05" value="${preferences.brightness}"></label>
              <label class="setting-toggle"><input type="checkbox" data-preference="muted" ${preferences.muted ? "checked" : ""}><span>Mute dungeon audio</span></label>
              <label class="setting-toggle"><input type="checkbox" data-preference="reducedMotion" ${preferences.reducedMotion ? "checked" : ""}><span>Reduce camera motion</span></label>
              <div class="save-actions">
                <button type="button" data-save-action="export">Export save</button>
                <button type="button" data-save-action="import">Import save</button>
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
      if (raidEntryStatus(mode, profile.extracts, profile.gold) !== "ready") return;
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
      profile.gold += item.value;
      profile.stash = profile.stash.filter((candidate) => candidate.id !== id);
      equippedIds.delete(item.id);
      merchantNotice = `${item.name} sold for ${item.value}g.`;
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
      const purchaseId = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.floor(Math.random() * 1_000_000).toString(36)}`;
      const item: Item = {
        ...offer.item,
        id: `merchant-${offer.sku}-${purchaseId}`,
      };
      const purchase = purchaseItem(profile, item, offer.price);
      profile = purchase.profile;
      merchantNotice = purchase.outcome === "purchased"
        ? `${offer.item.name} added to the stash.`
        : purchase.outcome === "stash_full"
          ? "The stash is full. Sell something before buying."
          : `You need ${offer.price - profile.gold}g more for ${offer.item.name}.`;
      if (purchase.outcome === "purchased") persistProfile();
      renderLobby();
    });
  });
  app.querySelectorAll<HTMLButtonElement>("[data-recipe-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const recipe = CRAFTING_RECIPES.find((candidate) => candidate.id === button.dataset.recipeId);
      if (!recipe) return;
      const outputId = `crafted-${recipe.id}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.floor(Math.random() * 1_000_000).toString(36)}`}`;
      const craft = craftItem(profile, recipe, outputId);
      profile = craft.profile;
      merchantNotice = craft.outcome === "crafted"
        ? `${recipe.name} forged and placed in the stash.`
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
      if (key === "muted" || key === "reducedMotion") preferences = { ...preferences, [key]: input.checked };
      else preferences = { ...preferences, [key]: Number(input.value) };
      persistPreferences();
      const output = app.querySelector<HTMLOutputElement>(`[data-output="${key}"]`);
      if (output) output.textContent = key === "brightness" ? `${Math.round(Number(input.value) * 100)}%` : `${Number(input.value).toFixed(1)}x`;
    });
  });
  app.querySelector<HTMLSelectElement>("[data-stash-sort]")?.addEventListener("change", (event) => {
    preferences = { ...preferences, stashSort: (event.currentTarget as HTMLSelectElement).value as GamePreferences["stashSort"] };
    persistPreferences();
    renderLobby();
  });
  app.querySelector<HTMLButtonElement>('[data-save-action="export"]')?.addEventListener("click", () => {
    const backup = createSaveBackup(profile, preferences, release);
    const url = URL.createObjectURL(new Blob([backup], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `darkpix-save-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    const notice = app.querySelector<HTMLElement>(".merchant-notice");
    if (notice) notice.textContent = "Save exported. Keep the JSON file somewhere safe.";
  });
  const saveFileInput = app.querySelector<HTMLInputElement>("[data-save-file]");
  app.querySelector<HTMLButtonElement>('[data-save-action="import"]')?.addEventListener("click", () => saveFileInput?.click());
  saveFileInput?.addEventListener("change", () => void (async () => {
    const file = saveFileInput.files?.[0];
    if (!file) return;
    if (file.size > 1_000_000) {
      merchantNotice = "That save file is too large to be a DarkPix backup.";
      renderLobby();
      return;
    }
    let imported: ReturnType<typeof parseSaveBackup>;
    try {
      imported = parseSaveBackup(await file.text());
    } catch {
      imported = undefined;
    }
    saveFileInput.value = "";
    if (!imported) {
      merchantNotice = "That file is not a valid DarkPix save backup.";
      renderLobby();
      return;
    }
    if (!window.confirm("Replace this browser's DarkPix profile and settings with the selected backup?")) return;
    profile = imported.profile;
    preferences = imported.preferences;
    selectedClass = profile.preferredClass;
    equippedIds = new Set();
    merchantNotice = "Save imported. The Last Lantern remembers you again.";
    persistProfile();
    persistPreferences();
    renderLobby();
  })());
  const descendButton = app.querySelector<HTMLButtonElement>(".descend-button");
  descendButton?.addEventListener("pointerenter", () => void loadGameModule());
  descendButton?.addEventListener("focus", () => void loadGameModule());
  descendButton?.addEventListener("click", () => void startRaid());
  app.querySelector<HTMLAnchorElement>(".brand")?.addEventListener("click", (event) => event.preventDefault());
}

async function startRaid(): Promise<void> {
  if (typeof HTMLCanvasElement.prototype.requestPointerLock !== "function") {
    merchantNotice = "DarkPix raids require pointer lock. Use a current desktop browser to descend.";
    renderLobby();
    document.querySelector("#stash")?.scrollIntoView({ behavior: "smooth" });
    return;
  }
  const rules = raidRules(selectedRaidMode);
  const entryStatus = raidEntryStatus(selectedRaidMode, profile.extracts, profile.gold);
  if (entryStatus !== "ready") {
    merchantNotice = entryStatus === "extract_required"
      ? "Escape the Pale Toll once before attempting the High Toll."
      : `The High Toll requires its ${rules.entryFee}g entry fee.`;
    selectedRaidMode = "standard";
    renderLobby();
    document.querySelector("#stash")?.scrollIntoView({ behavior: "smooth" });
    return;
  }
  let chargedEntryFee = false;
  if (rules.entryFee > 0) {
    profile.gold -= rules.entryFee;
    chargedEntryFee = true;
    persistProfile();
  }
  const equipped = profile.stash.filter((item) => equippedIds.has(item.id));
  app.innerHTML = `<main class="game-mount" aria-label="DarkPix dungeon raid"><div class="crypt-loading" role="status"><span>DP</span><strong>OPENING THE PALE TOLL</strong><small>Kindling the dungeon renderer</small></div></main>`;
  const mount = app.querySelector<HTMLElement>(".game-mount");
  if (!mount) return;
  try {
    const { DarkPixGame: GameRuntime } = await loadGameModule();
    activeGame = new GameRuntime(mount, {
      classId: selectedClass,
      classLevel: levelForXp(profile.xp[selectedClass]),
      raidMode: selectedRaidMode,
      equipped,
      preferences,
      onFinish: finishRaid,
    });
  } catch (error) {
    console.error("DarkPix could not start the 3D raid", error);
    if (chargedEntryFee) {
      profile.gold += rules.entryFee;
      persistProfile();
    }
    mount.innerHTML = `<section class="runtime-error"><span>†</span><h1>THE PASSAGE FAILED</h1><p>The 3D renderer could not start. Update the browser, enable WebGL, or try the raid again.</p><button type="button">RETURN TO THE LAST LANTERN</button></section>`;
    mount.querySelector<HTMLButtonElement>("button")?.addEventListener("click", renderLobby);
  }
}

function finishRaid(result: RaidResult): void {
  activeGame?.destroy();
  activeGame = undefined;
  const extracted = result.reason === "extracted";
  const rules = raidRules(result.raidMode);
  const settlement = settleRaid(profile, result);
  profile = settlement.profile;
  persistProfile();
  const recordedItems = extracted
    ? [
        ...settlement.banked.map((item) => ({ item, outcome: "STASHED" })),
        ...settlement.overflow.map((item) => ({ item, outcome: "PORTER-SOLD" })),
      ]
    : [
        ...settlement.lost.map((item) => ({ item, outcome: "GEAR LOST" })),
        ...result.loot.map((item) => ({ item, outcome: "HAUL LOST" })),
      ];
  const headline = extracted ? "YOU RETURNED" : result.reason === "darkness" ? "THE DARK TOOK YOU" : "YOUR TORCH WENT OUT";
  const detail = extracted
    ? `The blue passage seals behind you. ${settlement.overflow.length ? `${settlement.overflow.length} overflow item${settlement.overflow.length === 1 ? " was" : "s were"} sold by the porter for ${settlement.overflowGold}g.` : "Everything in your haul fits safely in the stash."}${settlement.firstContractPaid ? " The Taverner's 100g bounty is paid." : ""}${settlement.bossContractPaid ? " The 150g Tollkeeper bounty is paid." : ""}${result.raidMode === "high_toll" ? " The High Toll veterancy bonus is recorded." : ""}`
    : `Your class remembers. Your carried gear and every unsecured find remain below.${result.raidMode === "high_toll" ? ` The ${rules.entryFee}g entry fee is gone.` : ""}`;
  app.innerHTML = `
    <main class="result-screen ${extracted ? "success" : "failure"}">
      <div class="result-backdrop"></div>
      <section class="result-card">
        <span class="result-rune">${extracted ? "◇" : "†"}</span>
        <p class="eyebrow">RAID VERDICT</p>
        <h1>${headline}</h1>
        <p class="result-detail">${detail}</p>
        <div class="result-metrics">
          <span><small>TIME BELOW</small><strong>${formatTime(result.elapsed)}</strong></span>
          <span><small>THREATS FELLED</small><strong>${result.kills}</strong></span>
          <span><small>GOLD ${extracted ? "SETTLED" : "LOST"}</small><strong>${extracted ? settlement.goldGained : result.goldFound}g</strong></span>
          <span><small>CLASS XP</small><strong>+${settlement.xpGained}</strong></span>
        </div>
        <div class="result-haul">
          <div class="panel-heading"><span><small>${extracted ? "SETTLED" : "ABANDONED"}</small><strong>${extracted ? "Recovered haul" : "Lost below"}</strong></span><b>${recordedItems.length} ITEMS</b></div>
          <div class="result-items">
            ${recordedItems.length ? recordedItems.map(({ item, outcome }) => `
              <div class="result-item" style="--rarity:${RARITY_COLOR[item.rarity]}"><i></i><span><strong>${escapeHtml(item.name)}</strong><small>${item.rarity} ${item.kind} · ${outcome}</small></span><b>${item.value}g</b></div>`).join("") : `<div class="empty-stash"><strong>NOTHING TO RECORD</strong><span>The ledger remains clean.</span></div>`}
          </div>
        </div>
        <button class="return-button" type="button">RETURN TO THE LAST LANTERN</button>
      </section>
    </main>`;
  app.querySelector<HTMLButtonElement>(".return-button")?.addEventListener("click", () => {
    equippedIds = new Set();
    renderLobby();
  });
}

renderLobby();
