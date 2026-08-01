import "./style.css";
import { CLASSES, MERCHANT_OFFERS, RARITY_COLOR, formatTime, levelForXp, progressionBonuses } from "./game/data";
import { DarkPixGame } from "./game/game";
import { loadPreferences, savePreferences } from "./game/preferences";
import { applyRaidResult, loadProfile, purchaseItem, saveProfile } from "./game/profile";
import type { ClassId, GamePreferences, Item, Profile, RaidResult } from "./game/types";

const foundApp = document.querySelector<HTMLDivElement>("#app");
if (!foundApp) throw new Error("DarkPix application root is missing");
const app = foundApp;

let profile: Profile = loadProfile();
let preferences: GamePreferences = loadPreferences();
let selectedClass: ClassId = profile.preferredClass;
let equippedIds = new Set<string>();
let activeGame: DarkPixGame | undefined;
let merchantNotice = "";

function itemMarkup(item: Item, riskable = false): string {
  const selected = equippedIds.has(item.id);
  return `
    <article class="stash-item ${selected ? "selected" : ""}" data-item-id="${item.id}" style="--rarity:${RARITY_COLOR[item.rarity]}">
      <span class="item-gem"></span>
      <span class="item-copy"><strong>${item.name}</strong><small>${item.rarity} ${item.kind}${item.modifier ? ` · ${item.modifier}` : ""}</small></span>
      <span class="item-value">${item.value}g</span>
      ${riskable && item.kind !== "treasure" ? `<button class="risk-item" type="button">${selected ? "Packed" : "Pack"}</button>` : ""}
      <button class="sell-item" type="button" aria-label="Sell ${item.name}">Sell</button>
    </article>`;
}

function renderLobby(): void {
  activeGame?.destroy();
  activeGame = undefined;
  const chosen = CLASSES[selectedClass];
  const classXp = profile.xp[selectedClass];
  const level = levelForXp(classXp);
  const bonuses = progressionBonuses(level);
  const nextLevelXp = level * 350;
  const levelProgress = ((classXp % 350) / 350) * 100;
  const stashValue = profile.stash.reduce((sum, item) => sum + item.value, 0);
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

      <section class="hero">
        <div class="hero-scrim"></div>
        <div class="hero-content">
          <p class="eyebrow"><span></span> ONE LIFE BELOW <span></span></p>
          <h1>DARK<span>PIX</span></h1>
          <p class="hero-decree">Descend empty-handed. Return legend-laden.</p>
          <div class="rule-line"><i></i><strong>DEATH TAKES WHAT YOU CARRY</strong><i></i></div>
          <button class="descend-button" type="button">
            <span>DESCEND INTO THE PALE TOLL</span>
            <small>Solo contract · 7 threats · 2 sigils</small>
          </button>
          <p class="raid-warning">Equipped items are lost on death. Class experience always persists.</p>
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
            <p class="panel-intro">Pack up to two pieces. Their power applies in the crypt, but death removes them from your stash.</p>
            <div class="stash-list">
              ${profile.stash.length ? profile.stash.map((item) => itemMarkup(item, true)).join("") : `<div class="empty-stash"><strong>THE CHEST IS BARE</strong><span>You can still descend with class equipment.</span></div>`}
            </div>
            <div class="merchant-market" id="merchant">
              <div class="panel-heading"><span><small>THE IRONMONGER</small><strong>Provision bench</strong></span><b>GOLD ACCEPTED</b></div>
              <p class="panel-intro">Buy dependable supplies between raids. Purchased gear enters the stash and is still lost if packed into a failed delve.</p>
              <div class="merchant-offers">
                ${MERCHANT_OFFERS.map((offer) => `
                  <article class="merchant-offer" style="--rarity:${RARITY_COLOR[offer.item.rarity]}">
                    <i></i><span><strong>${offer.item.name}</strong><small>${offer.item.modifier ?? `${offer.item.rarity} ${offer.item.kind}`}</small></span>
                    <button type="button" data-merchant-sku="${offer.sku}" aria-label="Buy ${offer.item.name} for ${offer.price} gold">${offer.price}g</button>
                  </article>`).join("")}
              </div>
              <p class="merchant-notice" role="status">${merchantNotice || "The ironmonger does not offer refunds."}</p>
            </div>
          </section>

          <aside class="right-rail">
            <section class="delver-sheet">
              <div class="panel-heading"><span><small>ACTIVE DELVER</small><strong>${chosen.name}</strong></span><b>LV ${level}</b></div>
              <div class="level-track"><i style="width:${levelProgress}%"></i></div>
              <div class="sheet-line"><span>Experience</span><strong>${classXp} / ${nextLevelXp}</strong></div>
              <div class="sheet-line"><span>Raid weapon</span><strong>${chosen.weapon}</strong></div>
              <div class="sheet-line"><span>Class art</span><strong>${chosen.ability}</strong></div>
              <div class="sheet-line"><span>Veterancy</span><strong>+${bonuses.health} vigor · +${bonuses.damage} damage</strong></div>
              <div class="risk-total"><span>GEAR AT RISK</span><strong>${equippedIds.size} / 2</strong></div>
            </section>
            <section class="contract-card" id="contracts">
              <span class="wax-seal">I</span>
              <div><small>THE TAVERNER'S FIRST DEBT</small><strong>${profile.extracts > 0 ? "Debt honored" : "Escape the Pale Toll"}</strong><p>${profile.extracts > 0 ? "The 100g bounty was paid. The tavern remembers your name." : "Return alive once with anything worth keeping. Reward: 100g."}</p></div>
              <b>${profile.extracts > 0 ? "PAID" : "0 / 1"}</b>
            </section>
            <section class="settings-panel" aria-labelledby="settings-heading">
              <div class="panel-heading"><span><small>ACCESSIBILITY</small><strong id="settings-heading">Delver settings</strong></span><b>LOCAL</b></div>
              <label class="setting-line"><span>Mouse sensitivity <output data-output="mouseSensitivity">${preferences.mouseSensitivity.toFixed(1)}x</output></span><input type="range" aria-label="Mouse sensitivity" data-preference="mouseSensitivity" min="0.5" max="2" step="0.1" value="${preferences.mouseSensitivity}"></label>
              <label class="setting-line"><span>Crypt brightness <output data-output="brightness">${Math.round(preferences.brightness * 100)}%</output></span><input type="range" aria-label="Crypt brightness" data-preference="brightness" min="0.75" max="1.4" step="0.05" value="${preferences.brightness}"></label>
              <label class="setting-toggle"><input type="checkbox" data-preference="muted" ${preferences.muted ? "checked" : ""}><span>Mute dungeon audio</span></label>
              <label class="setting-toggle"><input type="checkbox" data-preference="reducedMotion" ${preferences.reducedMotion ? "checked" : ""}><span>Reduce camera motion</span></label>
            </section>
          </aside>
        </div>
      </section>

      <footer class="site-footer"><span>DARKPIX PRE-ALPHA // SOLO PVPVE SIMULATION</span><span>Headphones recommended · desktop controls</span></footer>
    </main>`;

  app.querySelectorAll<HTMLElement>("[data-class-id]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedClass = button.dataset.classId as ClassId;
      profile.preferredClass = selectedClass;
      saveProfile(profile);
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
      if (equippedIds.has(id)) equippedIds.delete(id);
      else if (equippedIds.size < 2) equippedIds.add(id);
      renderLobby();
    });
  });
  app.querySelectorAll<HTMLButtonElement>(".sell-item").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.closest<HTMLElement>("[data-item-id]")?.dataset.itemId;
      const item = profile.stash.find((candidate) => candidate.id === id);
      if (!item) return;
      profile.gold += item.value;
      profile.stash = profile.stash.filter((candidate) => candidate.id !== id);
      equippedIds.delete(item.id);
      merchantNotice = `${item.name} sold for ${item.value}g.`;
      saveProfile(profile);
      renderLobby();
    });
  });
  app.querySelectorAll<HTMLButtonElement>("[data-merchant-sku]").forEach((button) => {
    button.addEventListener("click", () => {
      const offer = MERCHANT_OFFERS.find((candidate) => candidate.sku === button.dataset.merchantSku);
      if (!offer) return;
      const item: Item = {
        ...offer.item,
        id: `merchant-${offer.sku}-${crypto.randomUUID()}`,
      };
      const purchase = purchaseItem(profile, item, offer.price);
      profile = purchase.profile;
      merchantNotice = purchase.outcome === "purchased"
        ? `${offer.item.name} added to the stash.`
        : purchase.outcome === "stash_full"
          ? "The stash is full. Sell something before buying."
          : `You need ${offer.price - profile.gold}g more for ${offer.item.name}.`;
      if (purchase.outcome === "purchased") saveProfile(profile);
      renderLobby();
    });
  });
  app.querySelectorAll<HTMLInputElement>("[data-preference]").forEach((input) => {
    input.addEventListener("input", () => {
      const key = input.dataset.preference as keyof GamePreferences;
      if (key === "muted" || key === "reducedMotion") preferences = { ...preferences, [key]: input.checked };
      else preferences = { ...preferences, [key]: Number(input.value) };
      savePreferences(preferences);
      const output = app.querySelector<HTMLOutputElement>(`[data-output="${key}"]`);
      if (output) output.textContent = key === "brightness" ? `${Math.round(Number(input.value) * 100)}%` : `${Number(input.value).toFixed(1)}x`;
    });
  });
  app.querySelector<HTMLButtonElement>(".descend-button")?.addEventListener("click", startRaid);
  app.querySelector<HTMLAnchorElement>(".brand")?.addEventListener("click", (event) => event.preventDefault());
}

function startRaid(): void {
  const equipped = profile.stash.filter((item) => equippedIds.has(item.id));
  app.innerHTML = `<main class="game-mount" aria-label="DarkPix dungeon raid"></main>`;
  const mount = app.querySelector<HTMLElement>(".game-mount");
  if (!mount) return;
  activeGame = new DarkPixGame(mount, {
    classId: selectedClass,
    classLevel: levelForXp(profile.xp[selectedClass]),
    equipped,
    preferences,
    onFinish: finishRaid,
  });
}

function finishRaid(result: RaidResult): void {
  activeGame?.destroy();
  activeGame = undefined;
  const oldStash = [...profile.stash];
  const extracted = result.reason === "extracted";
  const firstContractPaid = extracted && profile.extracts === 0;
  const transferable = result.loot.filter((item) => item.kind !== "sigil");
  const overflow = extracted ? transferable.slice(Math.max(0, 24 - oldStash.length)) : [];
  const overflowGold = overflow.reduce((sum, item) => sum + Math.max(1, Math.floor(item.value * 0.5)), 0);
  const settlementGold = result.goldFound + (firstContractPaid ? 100 : 0) + overflowGold;
  profile = applyRaidResult(profile, result);
  saveProfile(profile);
  const lost = extracted ? [] : oldStash.filter((item) => result.equippedIds.includes(item.id));
  const headline = extracted ? "YOU RETURNED" : result.reason === "darkness" ? "THE DARK TOOK YOU" : "YOUR TORCH WENT OUT";
  const detail = extracted
    ? `The blue passage seals behind you. ${overflow.length ? `${overflow.length} overflow item${overflow.length === 1 ? " was" : "s were"} sold by the porter for ${overflowGold}g.` : "Everything in your haul fits safely in the stash."}${firstContractPaid ? " The Taverner's 100g bounty is paid." : ""}`
    : "Your class remembers. Your carried gear and every unsecured find remain below.";
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
          <span><small>GOLD ${extracted ? "SETTLED" : "LOST"}</small><strong>${extracted ? settlementGold : result.goldFound}g</strong></span>
          <span><small>CLASS XP</small><strong>+${30 + result.kills * 35 + (extracted ? 140 : 0)}</strong></span>
        </div>
        <div class="result-haul">
          <div class="panel-heading"><span><small>${extracted ? "STASHED" : "ABANDONED"}</small><strong>${extracted ? "Recovered haul" : "Lost below"}</strong></span><b>${result.loot.length + lost.length} ITEMS</b></div>
          <div class="result-items">
            ${[...lost, ...result.loot].length ? [...lost, ...result.loot].map((item) => `
              <div class="result-item" style="--rarity:${RARITY_COLOR[item.rarity]}"><i></i><span><strong>${item.name}</strong><small>${item.rarity} ${item.kind}</small></span><b>${item.value}g</b></div>`).join("") : `<div class="empty-stash"><strong>NOTHING TO RECORD</strong><span>The ledger remains clean.</span></div>`}
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
