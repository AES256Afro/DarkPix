import * as THREE from "three";
import { escapeHtml } from "../html";
import { AudioDirector, footstepCadenceCrossed } from "./audio";
import { RIPOSTE_DURATION_SECONDS, attackDamage, attackStaminaCost, bossTactic, bossTollDamage, bossTollHits, classAbilityDamageMultiplier, classAttackDelay, classMovementMultiplier, delverActionLock, delverRecoveryActive, dodgeStats, dungeonCrossfireDamage, enemyAttackPattern, enemyStrikeFacesTarget, enemyStrikeMissReason, guardBreakDuration, guardDenialReason, guardDrainPerSecond, guardFacesThreat, healthPercent, minstrelStagger, riposteDamageMultiplier, rivalDungeonTactic, rivalTactic, sanctuaryDamage, staminaRecoveryPerSecond, strikeImpactDelay, trapDamageAgainstThreat, type AttackDirection, type RivalArchetype } from "./combat";
import { CLASSES, CLASS_ABILITIES, HEX_SPELLS, RARITY_COLOR, classPerkBonuses, consumableEffect, consumableUseDuration, createBossLoot, createLoot, createSigil, formatTime, progressionBonuses, throwableDamage, type ClassPerkBonuses, type HexSpellId } from "./data";
import { DUNGEON, dartTrapTargetDistance, dungeonLineOfSight, dungeonPath, encounterPosition, selectRaidVariation } from "./dungeon";
import { ASHEN_CHESTS, ASHEN_ENEMIES, ASH_VENTS, ASH_VENT_ACTIVE_SECONDS, ASH_VENT_COOLDOWN_SECONDS, ASH_VENT_DAMAGE, ASH_VENT_RADIUS, ASH_VENT_WINDUP_SECONDS, ashVentHits, bossRingActive, bossRingCooldown, depthRules } from "./depth";
import { HAUL_CAPACITY, RIVAL_EXTRACTION_SECONDS, advanceRivalExtraction, canAddToHaul, canRivalScavenge, dropLeastValuable, haulCount, rivalShouldExtract, treasureGoldTotal } from "./haul";
import { equippedPower, loadoutStats, physicalDamageAfterArmor, pickupDecision, type LoadoutStats } from "./loadout";
import { cardinalDirection, circlesOverlap, directionalCue, movementOffset, passiveAwarenessRange, recoveryNeed } from "./navigation";
import { raidRules, type RaidRules } from "./raid";
import { consumablesInUseOrder, nextConsumableId, nextThrowableId, resolveConsumableId, resolveThrowableId, throwablesInUseOrder } from "./quickslots";
import { adaptiveRenderScale, initialRenderScale, maximumRenderScale } from "./resolution";
import { disposeSceneResources } from "./resources";
import { RAID_VARIATION_COUNT, raidVariationSeal, validRaidVariationSeed } from "./contract";
import { rarityShape } from "./rarity";
import { raidReadinessSummary } from "./readiness";
import { MAX_TORCH_FUEL_SECONDS, addTorchFuel, spendTorchFuel } from "./light";
import { LifecycleTimers, pointerLockRequestAllowed, pointerLockResumesRaid, pointerLockTimeoutOutcome, raidDeadlineReached, raidFrameLoopActive } from "./lifecycle";
import { shrineOfferingRules, type ShrineOffering } from "./shrine";
import { QUIET_KNIVES_TARGET, recordUnseenStrike as markUnseenStrike, unseenStrikeCue } from "./stealth";
import { channelInterruptionReason, continuousHold, targetDistanceInView, type ChannelInterruptionReason } from "./targeting";
import { playerProjectileDuration, playerProjectilePosition, projectileSegmentConnects, type PlayerProjectileKind } from "./projectile";
import type { ClassId, DungeonDepth, GamePreferences, Item, RaidEndReason, RaidMode, RaidResult, ThreatKind, Vec2 } from "./types";
import { DARKNESS_PULSE_SECONDS, darknessPulseReady, directionToZoneCenter, distanceFromZoneCenter, distanceOutsideZone, zoneState } from "./zone";

interface WallCollider {
  x: number;
  z: number;
  halfW: number;
  halfD: number;
}

interface Enemy {
  id: number;
  group: THREE.Group;
  kind: ThreatKind;
  name: string;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  range: number;
  cooldown: number;
  windup: number;
  windupDuration: number;
  windupFacing?: Vec2;
  stagger: number;
  alerted: boolean;
  alive: boolean;
  phase: number;
  baseScale: number;
  path: Vec2[];
  pathTimer: number;
  attackStyle: "melee" | "ranged";
  crippled: boolean;
  carriedLoot: Item[];
  extractProgress: number;
  extractAnnounced: boolean;
  rivalArchetype?: RivalArchetype;
  tollCooldown: number;
  tollWindup: number;
  tollWindupDuration: number;
  tollRing?: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
}

interface PendingStrike {
  direction: AttackDirection;
  spellId: HexSpellId;
  riposteMultiplier: number;
  abilityDamageMultiplier: number;
  impactRemaining: number;
}

interface PlayerProjectile {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  kind: PlayerProjectileKind;
  start: THREE.Vector3;
  end: THREE.Vector3;
  elapsed: number;
  duration: number;
  strike: PendingStrike;
}

interface Pickup {
  group: THREE.Group;
  item: Item;
  collected: boolean;
  phase: number;
}

interface Chest {
  group: THREE.Group;
  opened: boolean;
  depthBonus: number;
  mimic: boolean;
}

interface FloorTrap {
  group: THREE.Group;
  spikes: THREE.Group;
  damage: number;
  cooldown: number;
  active: number;
}

interface DartTrap {
  group: THREE.Group;
  portMaterial: THREE.MeshStandardMaterial;
  direction: Vec2;
  range: number;
  damage: number;
  cooldown: number;
  windup: number;
}

interface AshVent {
  group: THREE.Group;
  runeMaterial: THREE.MeshStandardMaterial;
  plume: THREE.Mesh;
  plumeMaterial: THREE.MeshBasicMaterial;
  light: THREE.PointLight;
  cooldown: number;
  windup: number;
  active: number;
}

export interface DarkPixGameOptions {
  classId: ClassId;
  classLevel: number;
  raidMode: RaidMode;
  equipped: Item[];
  preferences: GamePreferences;
  variationSeed?: number;
  onFinish: (result: RaidResult) => void;
  onCheckpoint?: (depthReached: DungeonDepth, kills: number, killsByKind: Readonly<Record<ThreatKind, number>>, unseenStrikes: number) => boolean;
}

const PLAYER_HEIGHT = 1.67;
const CROUCH_HEIGHT = 1.24;
const PLAYER_RADIUS = 0.38;

function pixelTexture(base: string, light: string, dark: string, mortar = false): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is unavailable");
  context.fillStyle = base;
  context.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 64; y += 4) {
    for (let x = 0; x < 64; x += 4) {
      const choice = (x * 13 + y * 7 + Math.floor(Math.random() * 5)) % 5;
      context.fillStyle = choice === 0 ? light : choice === 1 ? dark : base;
      context.fillRect(x, y, 4, 4);
    }
  }
  if (mortar) {
    context.fillStyle = dark;
    for (let y = 0; y < 64; y += 16) {
      context.fillRect(0, y, 64, 2);
      const offset = y % 32 === 0 ? 0 : 16;
      for (let x = offset; x < 64; x += 32) context.fillRect(x, y, 2, 16);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipMapNearestFilter;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function material(color: number, emissive = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity: emissive ? 1.25 : 0,
    roughness: 0.9,
    metalness: 0.05,
    flatShading: true,
  });
}

export class DarkPixGame {
  private readonly options: DarkPixGameOptions;
  private readonly mount: HTMLElement;
  private readonly definition;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(72, 1, 0.05, 80);
  private readonly renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
  private readonly clock = new THREE.Clock();
  private readonly audio: AudioDirector;
  private readonly lifecycleTimers = new LifecycleTimers();
  private readonly keys = new Set<string>();
  private readonly walls: WallCollider[] = [];
  private readonly enemies: Enemy[] = [];
  private readonly pickups: Pickup[] = [];
  private readonly chests: Chest[] = [];
  private readonly traps: FloorTrap[] = [];
  private readonly dartTraps: DartTrap[] = [];
  private readonly ashVents: AshVent[] = [];
  private readonly raidLoot: Item[] = [];
  private readonly carriedConsumables: Item[];
  private readonly carriedThrowables: Item[];
  private readonly weapon = new THREE.Group();
  private readonly shield = new THREE.Group();
  private readonly delverTorch = new THREE.SpotLight(0xffb267, 5.2, 18, Math.PI / 3.8, 0.7, 1.25);
  private readonly portal = new THREE.Group();
  private readonly portalCore = new THREE.Mesh();
  private readonly redDepthRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.76, 0.055, 4, 16),
    new THREE.MeshBasicMaterial({ color: 0xe04438, transparent: true, opacity: 0 }),
  );
  private readonly campfire = new THREE.Group();
  private readonly shrine = new THREE.Group();
  private readonly falseWall = new THREE.Group();
  private falseWallCollider: WallCollider | undefined;
  private readonly resizeObserver: ResizeObserver;
  private readonly maxHealth: number;
  private readonly damageBonus: number;
  private readonly perkBonuses: ClassPerkBonuses;
  private readonly loadoutBonuses: LoadoutStats;
  private readonly raidRules: RaidRules;
  private readonly variationSeed: number;
  private readonly variation: ReturnType<typeof selectRaidVariation>;
  private readonly encountersMirrored: boolean;
  private readonly portalSite: Vec2;
  private readonly campfireSite: Vec2;
  private readonly maxSpellCharges: number;
  private healthFill!: HTMLElement;
  private staminaFill!: HTMLElement;
  private spellFill!: HTMLElement;
  private spellLabelHud!: HTMLElement;
  private raidClock!: HTMLElement;
  private journalHud!: HTMLElement;
  private stealthHud!: HTMLElement;
  private stealthCueHud!: HTMLElement;
  private lootHud!: HTMLElement;
  private objectiveHud!: HTMLElement;
  private promptHud!: HTMLElement;
  private feedHud!: HTMLElement;
  private threatHud!: HTMLElement;
  private threatNameHud!: HTMLElement;
  private threatStateHud!: HTMLElement;
  private threatHealthFill!: HTMLElement;
  private directionHud!: HTMLElement;
  private compassHeadingHud!: HTMLElement;
  private wayfinderHud!: HTMLElement;
  private lockOverlay!: HTMLElement;
  private resumeButton!: HTMLButtonElement;
  private abandonButton!: HTMLButtonElement;
  private damageOverlay!: HTMLElement;
  private damageDirectionHud!: HTMLElement;
  private extractProgress!: HTMLElement;
  private abilityHud!: HTMLElement;
  private consumableHud!: HTMLElement;
  private throwableHud!: HTMLElement;
  private torchHud!: HTMLElement;
  private pauseLedger!: HTMLElement;
  private animationFrame = 0;
  private enemyId = 0;
  private elapsed = 0;
  private health: number;
  private stamina: number;
  private spellCharges: number;
  private selectedSpell: HexSpellId = "ash_bolt";
  private selectedConsumableId?: string;
  private remedyItemId?: string;
  private remedyName = "";
  private remedyTimer = 0;
  private selectedThrowableId?: string;
  private kills = 0;
  private readonly killsByKind: Record<ThreatKind, number> = { skeleton: 0, crawler: 0, mimic: 0, warden: 0, rival: 0, boss: 0 };
  private unseenStrikes = 0;
  private readonly markedUnseenThreats = new Set<number>();
  private bossKilled = false;
  private readonly consumedIds: string[] = [];
  private sigils = 0;
  private portalUnlocked = false;
  private portalAnnounced = false;
  private spawnGraceAnnounced = false;
  private campfireUsed = false;
  private shrineUsed = false;
  private falseWallOpened = false;
  private ended = false;
  private paused = true;
  private contextLost = false;
  private pointerLockAllowed = false;
  private pointerLockPending = false;
  private pointerLockEpoch = 0;
  private blocking = false;
  private crouching = false;
  private sprinting = false;
  private moving = false;
  private blockAge = 0;
  private guardBreakTimer = 0;
  private attackCooldown = 0;
  private dodgeCooldown = 0;
  private riposteTimer = 0;
  private swingClock = 0;
  private swingDuration = 0.42;
  private footstepClock = 0;
  private damageCooldown = 0;
  private darknessPulseTimer = 0;
  private damageDirectionTimer = 0;
  private interactHeld = false;
  private descendHeld = false;
  private interactionHold = 0;
  private interactionInput?: "interact" | "descend";
  private attackDirection: AttackDirection = "THRUST";
  private swingDirection: AttackDirection = "THRUST";
  private pendingStrike?: PendingStrike;
  private readonly playerProjectiles: PlayerProjectile[] = [];
  private mouseAccumulator = { x: 0, y: 0 };
  private yaw = 0;
  private pitch = 0;
  private messageTimer = 0;
  private threatTimer = 0;
  private vignette = 0;
  private torchLit = true;
  private torchFuel = MAX_TORCH_FUEL_SECONDS;
  private abilityCooldown = 0;
  private concealmentTimer = 0;
  private rageTimer = 0;
  private quickdrawTimer = 0;
  private wildshapeTimer = 0;
  private abandonArmed = false;
  private renderScale = 0;
  private frameTimeTotal = 0;
  private frameSamples = 0;
  private resolutionTimer = 0;
  private depth: DungeonDepth = 1;
  private depthStartedAt = 0;

  constructor(mount: HTMLElement, options: DarkPixGameOptions) {
    this.mount = mount;
    this.options = options;
    this.audio = new AudioDirector(!options.preferences.muted, options.preferences.volume);
    this.raidRules = raidRules(options.raidMode);
    this.variationSeed = validRaidVariationSeed(options.variationSeed) ? options.variationSeed : Math.floor(Math.random() * RAID_VARIATION_COUNT);
    this.variation = selectRaidVariation(this.variationSeed);
    this.encountersMirrored = this.variation.encountersMirrored;
    this.portalSite = DUNGEON.portalSites[this.variation.portalSiteIndex] ?? DUNGEON.portal;
    this.campfireSite = DUNGEON.campfireSites[this.variation.campfireSiteIndex] ?? DUNGEON.campfire;
    this.definition = CLASSES[options.classId];
    const progression = progressionBonuses(options.classLevel);
    this.perkBonuses = classPerkBonuses(options.classId, options.classLevel);
    this.loadoutBonuses = loadoutStats(options.equipped);
    const armorBonus = equippedPower(options.equipped, "armor");
    this.maxHealth = this.definition.maxHealth + armorBonus + progression.health + this.perkBonuses.health + this.loadoutBonuses.health;
    this.damageBonus = progression.damage + this.perkBonuses.damage + this.loadoutBonuses.damage;
    this.maxSpellCharges = 6 + this.perkBonuses.spellCharges;
    this.spellCharges = this.maxSpellCharges;
    this.carriedConsumables = options.equipped.filter((item) => item.kind === "consumable").map((item) => ({ ...item }));
    this.carriedThrowables = options.equipped.filter((item) => item.kind === "throwable").map((item) => ({ ...item }));
    this.health = this.maxHealth;
    this.stamina = this.definition.maxStamina;
    this.resizeObserver = new ResizeObserver(() => this.resize());

    this.createShell();
    this.configureRenderer();
    this.createWorld();
    this.createViewModel();
    this.bindEvents();
    this.resizeObserver.observe(this.mount);
    this.resize();
    this.feed("Find two warden sigils. The blue passage will answer.", "system");
    this.queueFrame();
  }

  private createShell(): void {
    this.mount.innerHTML = `
      <div class="raid-shell ${this.options.preferences.reducedMotion ? "reduced-motion" : ""} ${this.options.preferences.reducedFlashes ? "reduced-flashes" : ""} ${this.options.preferences.highContrastHud ? "high-contrast-hud" : ""}" data-class="${this.options.classId}" data-raid-mode="${this.options.raidMode}" style="--crosshair-scale:${this.options.preferences.crosshairScale}">
        <div class="render-host"></div>
        <div class="pixel-grid" aria-hidden="true"></div>
        <div class="darkness-vignette" aria-hidden="true"></div>
        <div class="damage-flash" aria-hidden="true"></div>
        <div class="damage-direction" role="status" aria-live="polite" aria-atomic="true"></div>
        <div class="raid-hud">
          <div class="hud-top">
            <section class="contract-panel">
              <span class="eyebrow">${this.raidRules.name.toUpperCase()} CONTRACT · ${raidVariationSeal(this.variationSeed)}</span>
              <strong class="raid-clock">3:30</strong>
              <span class="zone-copy">darkness dormant</span>
              <span class="journal-copy" role="status" aria-live="polite">journal secure</span>
            </section>
            <div class="compass"><span class="compass-heading">N</span><strong class="wayfinder">WARDEN · SEEK</strong><span>⌖</span></div>
            <section class="objective-panel">
              <span class="eyebrow">CONTRACT</span>
              <strong class="objective-copy">WARDEN SIGILS 0 / 2</strong>
              <span class="stealth-copy">unseen marks 0 / ${QUIET_KNIVES_TARGET} · steady</span>
            </section>
          </div>
          <div class="event-feed" role="status"></div>
          <div class="threat-vitals" aria-live="polite"><strong></strong><div><i></i></div><small></small></div>
          <div class="crosshair" aria-hidden="true"><i></i><b></b><em></em><span></span></div>
          <div class="stealth-cue" aria-hidden="true"></div>
          <div class="attack-direction">THRUST</div>
          <div class="interaction-prompt"></div>
          <div class="extract-meter"><i></i></div>
          <div class="hud-bottom">
            <section class="vitals">
              <div class="portrait-rune">${this.options.classId === "vanguard" ? "V" : this.options.classId === "cutpurse" ? "C" : this.options.classId === "hexbound" ? "H" : this.options.classId === "reaver" ? "R" : this.options.classId === "ranger" ? "A" : this.options.classId === "cleric" ? "L" : this.options.classId === "shapeshifter" ? "S" : "M"}</div>
              <div class="bars">
                <div class="bar health"><i></i><span>VIGOR</span></div>
                <div class="bar stamina"><i></i><span>STAMINA</span></div>
                <div class="bar spells"><i></i><span>MEMORY${this.options.classId === "hexbound" ? " · ASH BOLT" : ""}</span></div>
              </div>
            </section>
            <section class="quick-slots">
              <div class="ability-slot"><kbd>Q</kbd><span class="slot-icon ability-icon"></span><small>${CLASS_ABILITIES[this.options.classId].name}</small></div>
              <div class="consumable-slot"><kbd>F</kbd><span class="slot-icon potion-icon"></span><small>${escapeHtml(this.carriedConsumables[0]?.name ?? "No remedy")} · C cycle</small></div>
              <div class="throwable-slot"><kbd>V</kbd><span class="slot-icon knife-icon"></span><small>${escapeHtml(this.carriedThrowables[0]?.name ?? "No throwing weapon")} · B cycle</small></div>
              <div><kbd>G</kbd><span class="slot-icon hand-icon"></span><small>Drop lowest haul</small></div>
              <div><kbd>E</kbd><span class="slot-icon hand-icon"></span><small>Interact / extract</small></div>
              <div class="torch-slot"><kbd>T</kbd><span class="slot-icon torch-icon"></span><small>Hood torch · 90s</small></div>
            </section>
            <section class="haul-panel">
              <span class="eyebrow">UNSECURED HAUL</span>
              <strong class="loot-count">0 / ${HAUL_CAPACITY} slots · 0g</strong>
              <span>death takes all</span>
            </section>
          </div>
        </div>
        <div class="lock-overlay">
          <span class="sigil-mark">DP</span>
          <strong data-lock-title>ENTER THE CRYPT</strong>
          <small data-lock-detail>Bind the cursor when you are ready</small>
          <section class="pause-ledger" aria-label="Current raid risk ledger"></section>
          <span class="lock-actions">
            <button class="resume-raid" type="button">BIND CURSOR / RESUME</button>
            <button class="abandon-raid" type="button">ABANDON RAID</button>
          </span>
          <span class="control-line">WASD move · mouse look · LMB strike · RMB guard · Space sidestep · Ctrl crouch · 1/2 spells · E interact · R red descent · F use remedy · C cycle remedy · V throw · B cycle throw · G drop · T torch · Shift sprint</span>
        </div>
      </div>`;
    const host = this.mount.querySelector<HTMLElement>(".render-host");
    if (!host) throw new Error("Game render host was not created");
    host.appendChild(this.renderer.domElement);
    this.healthFill = this.mount.querySelector<HTMLElement>(".health i")!;
    this.staminaFill = this.mount.querySelector<HTMLElement>(".stamina i")!;
    this.spellFill = this.mount.querySelector<HTMLElement>(".spells i")!;
    this.spellLabelHud = this.mount.querySelector<HTMLElement>(".spells span")!;
    this.raidClock = this.mount.querySelector<HTMLElement>(".raid-clock")!;
    this.journalHud = this.mount.querySelector<HTMLElement>(".journal-copy")!;
    this.stealthHud = this.mount.querySelector<HTMLElement>(".stealth-copy")!;
    this.stealthCueHud = this.mount.querySelector<HTMLElement>(".stealth-cue")!;
    this.lootHud = this.mount.querySelector<HTMLElement>(".loot-count")!;
    this.objectiveHud = this.mount.querySelector<HTMLElement>(".objective-copy")!;
    this.promptHud = this.mount.querySelector<HTMLElement>(".interaction-prompt")!;
    this.feedHud = this.mount.querySelector<HTMLElement>(".event-feed")!;
    this.threatHud = this.mount.querySelector<HTMLElement>(".threat-vitals")!;
    this.threatNameHud = this.mount.querySelector<HTMLElement>(".threat-vitals strong")!;
    this.threatStateHud = this.mount.querySelector<HTMLElement>(".threat-vitals small")!;
    this.threatHealthFill = this.mount.querySelector<HTMLElement>(".threat-vitals i")!;
    this.directionHud = this.mount.querySelector<HTMLElement>(".attack-direction")!;
    this.compassHeadingHud = this.mount.querySelector<HTMLElement>(".compass-heading")!;
    this.wayfinderHud = this.mount.querySelector<HTMLElement>(".wayfinder")!;
    this.lockOverlay = this.mount.querySelector<HTMLElement>(".lock-overlay")!;
    this.resumeButton = this.mount.querySelector<HTMLButtonElement>(".resume-raid")!;
    this.abandonButton = this.mount.querySelector<HTMLButtonElement>(".abandon-raid")!;
    this.damageOverlay = this.mount.querySelector<HTMLElement>(".damage-flash")!;
    this.damageDirectionHud = this.mount.querySelector<HTMLElement>(".damage-direction")!;
    this.extractProgress = this.mount.querySelector<HTMLElement>(".extract-meter i")!;
    this.abilityHud = this.mount.querySelector<HTMLElement>(".ability-slot small")!;
    this.consumableHud = this.mount.querySelector<HTMLElement>(".consumable-slot small")!;
    this.throwableHud = this.mount.querySelector<HTMLElement>(".throwable-slot small")!;
    this.torchHud = this.mount.querySelector<HTMLElement>(".torch-slot small")!;
    this.pauseLedger = this.mount.querySelector<HTMLElement>(".pause-ledger")!;
    this.updatePauseLedger();
  }

  private configureRenderer(): void {
    this.renderer.setClearColor(0x050606);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = "game-canvas";
    this.renderer.domElement.style.filter = `brightness(${this.options.preferences.brightness})`;
    this.scene.background = new THREE.Color(0x050606);
    this.scene.fog = new THREE.FogExp2(0x050707, 0.04);
    this.camera.rotation.order = "YXZ";
    this.camera.fov = this.options.preferences.fieldOfView;
    this.camera.position.set(DUNGEON.playerStart.x, PLAYER_HEIGHT, DUNGEON.playerStart.z);
    this.scene.add(this.camera);
    this.delverTorch.position.set(0.28, 0.05, 0.1);
    this.delverTorch.target.position.set(0, -0.12, -1);
    this.camera.add(this.delverTorch, this.delverTorch.target);
  }

  private createWorld(): void {
    const floorTexture = pixelTexture("#282622", "#39352e", "#171817");
    floorTexture.repeat.set(11, 11);
    const wallTexture = pixelTexture("#302e2b", "#413d37", "#1a1b1a", true);
    wallTexture.repeat.set(3, 2);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(DUNGEON.size, DUNGEON.size, 1, 1),
      new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 1, color: 0x77736b }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.userData.solid = true;
    this.scene.add(floor);

    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(DUNGEON.size, DUNGEON.size),
      new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 1, side: THREE.DoubleSide }),
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = 4.2;
    this.scene.add(ceiling);

    const wallMat = new THREE.MeshStandardMaterial({ map: wallTexture, roughness: 0.96, color: 0x8b8479 });
    DUNGEON.walls.forEach((wall) => this.addWall(wall.x, wall.z, wall.width, wall.depth, wallMat));
    this.createFalseWall(DUNGEON.secretPassage.x, DUNGEON.secretPassage.z, DUNGEON.secretPassage.width, DUNGEON.secretPassage.depth, wallMat);

    for (const { x, z } of DUNGEON.pillars) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 4, 1.1), wallMat);
      pillar.position.set(x, 2, z);
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      this.scene.add(pillar);
      this.walls.push({ x, z, halfW: 0.55, halfD: 0.55 });
    }

    DUNGEON.torches.forEach(({ x, z, rotation }, index) => this.addTorch(x, z, rotation, index));
    this.createCampfire(this.campfireSite.x, this.campfireSite.z);
    this.createShrine(DUNGEON.shrine.x, DUNGEON.shrine.z);
    this.createPortal(this.portalSite.x, this.portalSite.z);
    DUNGEON.chests.forEach((chest) => {
      const position = encounterPosition(chest, this.encountersMirrored);
      this.createChest(position.x, position.z, chest.depthBonus, chest.mimic ?? false);
    });
    const trapLayout = DUNGEON.trapLayouts[this.variation.trapLayoutIndex] ?? DUNGEON.trapLayouts[0];
    const dartTrapLayout = DUNGEON.dartTrapLayouts[this.variation.trapLayoutIndex] ?? DUNGEON.dartTrapLayouts[0];
    trapLayout.forEach((trap) => this.createTrap(trap.x, trap.z, trap.damage));
    dartTrapLayout.forEach((trap) => this.createDartTrap(trap.x, trap.z, trap.direction, trap.range, trap.damage, trap.delay));
    DUNGEON.enemies.forEach((enemy) => {
      const position = encounterPosition(enemy, this.encountersMirrored);
      this.spawnEnemy(enemy.kind, position.x, position.z);
    });

    this.scene.add(new THREE.HemisphereLight(0x59676b, 0x241611, 0.56));
    this.scene.add(new THREE.AmbientLight(0x312b27, 0.42));
  }

  private addWall(x: number, z: number, width: number, depth: number, wallMaterial: THREE.Material): void {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(width, 4.2, depth), wallMaterial);
    wall.position.set(x, 2.1, z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    wall.userData.solid = true;
    this.scene.add(wall);
    this.walls.push({ x, z, halfW: width / 2, halfD: depth / 2 });
  }

  private createFalseWall(x: number, z: number, width: number, depth: number, wallMaterial: THREE.Material): void {
    this.falseWall.position.set(x, 0, z);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(width, 4.2, depth), wallMaterial);
    panel.position.y = 2.1;
    panel.castShadow = true;
    panel.receiveShadow = true;
    const seamMaterial = material(0x3a342f, 0x120b08);
    seamMaterial.emissiveIntensity = 0.12;
    const verticalSeam = new THREE.Mesh(new THREE.BoxGeometry(0.025, 2.8, 0.025), seamMaterial);
    verticalSeam.position.set(0.515, 1.75, 0.42);
    const crossSeam = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.025, 0.72), seamMaterial);
    crossSeam.position.set(0.516, 1.18, 0);
    this.falseWall.add(panel, verticalSeam, crossSeam);
    this.scene.add(this.falseWall);
    this.falseWallCollider = { x, z, halfW: width / 2, halfD: depth / 2 };
    this.walls.push(this.falseWallCollider);
  }

  private addTorch(x: number, z: number, rotation: number, phase: number): void {
    const torch = new THREE.Group();
    torch.position.set(x, 2.15, z);
    torch.rotation.y = rotation;
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.65, 0.1), material(0x3a2416));
    handle.rotation.z = -0.24;
    const flame = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), material(0xff6d20, 0xff3100));
    flame.position.set(0, 0.43, 0);
    flame.scale.set(0.7, 1.45, 0.7);
    flame.userData.flamePhase = phase;
    torch.add(handle, flame);
    const light = new THREE.PointLight(0xff6c2a, 1.7, 9, 2);
    light.position.y = 0.4;
    light.castShadow = phase % 3 === 0;
    light.shadow.mapSize.set(256, 256);
    light.userData.torchLight = true;
    light.userData.phase = phase;
    torch.add(light);
    this.scene.add(torch);
  }

  private createChest(x: number, z: number, depthBonus: number, mimic: boolean): void {
    const group = new THREE.Group();
    group.position.set(x, 0.42, z);
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.65, 0.7), material(0x4b2d18));
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.24, 0.74), material(0x66401f));
    lid.position.y = 0.42;
    lid.name = "lid";
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.92, 0.76), material(0x554a3a));
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.24, 0.12), material(mimic ? 0x8f4937 : 0xb07b34, mimic ? 0x35130d : 0));
    lock.position.set(0, 0.22, 0.4);
    group.add(base, lid, band, lock);
    group.traverse((object) => {
      object.castShadow = true;
      object.receiveShadow = true;
    });
    this.scene.add(group);
    if (mimic) {
      for (const side of [-1, 1]) {
        const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.16, 4), material(0x8d806c));
        tooth.position.set(side * 0.24, 0.31, 0.39);
        tooth.rotation.x = Math.PI;
        group.add(tooth);
      }
    }
    this.chests.push({ group, opened: false, depthBonus, mimic });
  }

  private createCampfire(x: number, z: number): void {
    this.campfire.position.set(x, 0.08, z);
    for (let index = 0; index < 5; index += 1) {
      const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), material(0x4c4942));
      const angle = (index / 5) * Math.PI * 2;
      stone.position.set(Math.cos(angle) * 0.48, 0.12, Math.sin(angle) * 0.48);
      this.campfire.add(stone);
    }
    const logA = new THREE.Mesh(new THREE.BoxGeometry(1, 0.13, 0.13), material(0x44281a));
    logA.position.y = 0.24;
    logA.rotation.y = 0.5;
    const logB = logA.clone();
    logB.rotation.y = -0.5;
    const fire = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), material(0xff761f, 0xff3300));
    fire.position.y = 0.62;
    fire.scale.y = 1.8;
    const light = new THREE.PointLight(0xff5a24, 1.8, 7);
    light.position.y = 0.7;
    this.campfire.add(logA, logB, fire, light);
    this.scene.add(this.campfire);
  }

  private createShrine(x: number, z: number): void {
    this.shrine.position.set(x, 0, z);
    this.shrine.rotation.y = Math.PI / 2;
    const altar = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.7, 1.55), material(0x2d2925));
    altar.position.y = 0.85;
    const face = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.72, 0.72), material(0x665044));
    face.position.set(0.29, 1.15, 0);
    const rune = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.065, 4, 8), material(0x8d241c, 0x6b120e));
    rune.name = "bloodRune";
    rune.position.set(0.37, 1.17, 0);
    rune.rotation.y = Math.PI / 2;
    const light = new THREE.PointLight(0xb52c20, 0.8, 4.5);
    light.name = "shrineLight";
    light.position.set(0.6, 1.15, 0);
    this.shrine.add(altar, face, rune, light);
    this.shrine.traverse((object) => {
      object.castShadow = true;
      object.receiveShadow = true;
    });
    this.scene.add(this.shrine);
    this.walls.push({ x, z, halfW: 0.78, halfD: 0.24 });
  }

  private createTrap(x: number, z: number, damage: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0.025, z);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.07, 1.45), material(0x312e29));
    const inset = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.075, 1.15), material(0x4a4033));
    inset.position.y = 0.02;
    const spikes = new THREE.Group();
    for (const [spikeX, spikeZ] of [[-0.36, -0.36], [0.36, -0.36], [0, 0], [-0.36, 0.36], [0.36, 0.36]] as const) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.75, 4), material(0x777168));
      spike.position.set(spikeX, 0.4, spikeZ);
      spike.castShadow = true;
      spikes.add(spike);
    }
    spikes.scale.y = 0.04;
    group.add(plate, inset, spikes);
    this.scene.add(group);
    this.traps.push({ group, spikes, damage, cooldown: 0, active: 0 });
  }

  private createDartTrap(x: number, z: number, direction: Vec2, range: number, damage: number, delay: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = Math.atan2(direction.x, direction.z);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.2, 0.24), material(0x282521));
    frame.position.y = 1.35;
    const portMaterial = material(0x5c5147, 0x160a06);
    portMaterial.emissiveIntensity = 0.15;
    for (const portX of [-0.22, 0, 0.22]) {
      const port = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.1, 6), portMaterial);
      port.position.set(portX, 1.35, 0.16);
      port.rotation.x = Math.PI / 2;
      group.add(port);
    }
    group.add(frame);
    group.traverse((object) => {
      object.castShadow = true;
      object.receiveShadow = true;
    });
    this.scene.add(group);
    this.dartTraps.push({ group, portMaterial, direction: { ...direction }, range, damage, cooldown: delay, windup: 0 });
  }

  private createAshVent(x: number, z: number, delay: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0.035, z);
    const runeMaterial = material(0x3a211b, 0x5d150d);
    runeMaterial.emissiveIntensity = 0.18;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(ASH_VENT_RADIUS, 0.065, 4, 16), runeMaterial);
    ring.rotation.x = Math.PI / 2;
    for (let index = 0; index < 4; index += 1) {
      const crack = new THREE.Mesh(new THREE.BoxGeometry(ASH_VENT_RADIUS * 2, 0.035, 0.055), runeMaterial);
      crack.rotation.y = (index / 4) * Math.PI;
      group.add(crack);
    }
    const plumeMaterial = new THREE.MeshBasicMaterial({ color: 0xff5b24, transparent: true, opacity: 0, side: THREE.DoubleSide });
    const plume = new THREE.Mesh(new THREE.ConeGeometry(ASH_VENT_RADIUS * 0.72, 2.3, 8, 1, true), plumeMaterial);
    plume.position.y = 1.15;
    plume.visible = false;
    const light = new THREE.PointLight(0xff3d1d, 0, 7.5, 2);
    light.position.y = 0.7;
    group.add(ring, plume, light);
    this.scene.add(group);
    this.ashVents.push({ group, runeMaterial, plume, plumeMaterial, light, cooldown: Math.max(0, delay), windup: 0, active: 0 });
  }

  private createPortal(x: number, z: number): void {
    this.portal.position.set(x, 1.7, z);
    const frameMaterial = material(0x27555d, 0x08363e);
    for (let index = 0; index < 14; index += 1) {
      const block = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.48, 0.34), frameMaterial);
      const angle = (index / 14) * Math.PI * 2;
      block.position.set(Math.cos(angle) * 1.35, Math.sin(angle) * 1.35, 0);
      block.rotation.z = angle;
      this.portal.add(block);
    }
    this.portalCore.geometry = new THREE.CircleGeometry(1.05, 16);
    this.portalCore.material = new THREE.MeshBasicMaterial({ color: 0x4adbd1, transparent: true, opacity: 0.05, side: THREE.DoubleSide });
    this.portalCore.position.z = 0.05;
    this.redDepthRing.position.z = 0.08;
    this.portal.add(this.portalCore, this.redDepthRing);
    const portalLight = new THREE.PointLight(0x43e0d5, 0, 8);
    portalLight.name = "portalLight";
    portalLight.position.z = 0.5;
    this.portal.add(portalLight);
    this.scene.add(this.portal);
  }

  private createViewModel(): void {
    const handMaterial = material(0x6f4d36);
    const gloveMaterial = material(this.options.classId === "hexbound" ? 0x263c3c : 0x302b27);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.45), handMaterial);
    hand.position.set(0, -0.35, 0.25);
    this.weapon.add(hand);
    if (this.options.classId === "hexbound") {
      const book = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.62, 0.12), material(0x143a3c, 0x082d30));
      book.position.set(0, 0, -0.05);
      book.rotation.z = -0.2;
      const rune = new THREE.Mesh(new THREE.RingGeometry(0.08, 0.12, 8), material(0x68e5db, 0x3ad4cd));
      rune.position.z = 0.07;
      book.add(rune);
      this.weapon.add(book);
    } else if (this.options.classId === "reaver") {
      const haft = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.42, 0.1), material(0x68452e));
      haft.position.y = 0.3;
      const axeHead = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.34, 0.14), material(0x817b71));
      axeHead.position.set(-0.16, 0.96, 0);
      axeHead.rotation.z = -0.16;
      const axeEdge = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.42, 4), material(0xaaa398));
      axeEdge.position.set(-0.48, 0.96, 0);
      axeEdge.rotation.z = Math.PI / 2;
      this.weapon.add(haft, axeHead, axeEdge);
    } else if (this.options.classId === "ranger") {
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.72, 0.08), material(0x5d3a22));
      const upperLimb = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.72, 0.07), material(0x77603a));
      upperLimb.position.set(0.12, 0.62, 0);
      upperLimb.rotation.z = -0.32;
      const lowerLimb = upperLimb.clone();
      lowerLimb.position.set(0.12, -0.62, 0);
      lowerLimb.rotation.z = 0.32;
      const stringGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0.23, 0.96, 0),
        new THREE.Vector3(-0.08, 0, 0),
        new THREE.Vector3(0.23, -0.96, 0),
      ]);
      const string = new THREE.Line(stringGeometry, new THREE.LineBasicMaterial({ color: 0xc3b69a }));
      this.weapon.add(grip, upperLimb, lowerLimb, string);
    } else if (this.options.classId === "cleric") {
      const haft = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.08, 0.1), material(0x5f422a));
      haft.position.y = 0.28;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.36, 0.34), material(0x908878, 0x261d14));
      head.position.y = 0.88;
      const seal = new THREE.Mesh(new THREE.RingGeometry(0.08, 0.12, 8), material(0xd6c58e, 0x8c6c28));
      seal.position.set(0, 0.88, 0.18);
      this.weapon.add(haft, head, seal);
    } else if (this.options.classId === "minstrel") {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.16, 8), material(0x6d452a, 0x24130d));
      body.rotation.x = Math.PI / 2;
      const neck = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.92, 0.12), material(0x704b2f));
      neck.position.y = 0.62;
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.08), material(0xb68d5a));
      bridge.position.set(0, 0.05, 0.12);
      this.weapon.add(body, neck, bridge);
    } else if (this.options.classId === "shapeshifter") {
      const bracer = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.48), material(0x3f4d2d, 0x16200d));
      bracer.position.y = 0.05;
      this.weapon.add(bracer);
      for (const clawX of [-0.16, 0, 0.16]) {
        const claw = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.72, 4), material(0xa4a18b, 0x292b19));
        claw.position.set(clawX, 0.52, -0.08);
        claw.rotation.z = Math.PI;
        this.weapon.add(claw);
      }
    } else {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.05, 0.08), material(this.options.classId === "cutpurse" ? 0x918a7d : 0xb2afa6));
      blade.position.y = 0.38;
      const point = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 4), material(0xa9a59c));
      point.position.y = 1.0;
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.08, 0.1), material(0x6e4c23));
      guard.position.y = -0.14;
      this.weapon.add(blade, point, guard);
    }
    this.weapon.position.set(0.6, -0.58, -1.05);
    this.weapon.rotation.set(-0.25, 0.05, -0.3);
    this.camera.add(this.weapon);

    const shieldFace = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 12), gloveMaterial);
    shieldFace.rotation.x = Math.PI / 2;
    const shieldRim = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.045, 4, 12), material(0x6d6557));
    shieldRim.position.z = -0.05;
    this.shield.add(shieldFace, shieldRim);
    this.shield.position.set(-0.72, -0.48, -1.1);
    this.shield.rotation.set(0.25, -0.4, 0.1);
    this.camera.add(this.shield);
  }

  private spawnEnemy(kind: Enemy["kind"], x: number, z: number): void {
    const group = new THREE.Group();
    const id = this.enemyId++;
    const isCrawler = kind === "crawler" || kind === "mimic";
    const isRival = kind === "rival";
    const isWarden = kind === "warden";
    const isBoss = kind === "boss";
    const rivalArchetype: RivalArchetype | undefined = isRival
      ? (this.variation.rivalArchetypeIndex + this.depth - 1) % 2 === 0 ? "skirmisher" : "marauder"
      : undefined;
    const bone = material(isBoss ? 0x8e5d3f : isRival ? 0x513542 : isWarden ? 0xc2b07f : kind === "mimic" ? 0x8a5336 : isCrawler ? 0x695d4d : 0x9c9687);
    const dark = material(isBoss ? 0x24110c : isRival ? 0x251720 : kind === "mimic" ? 0x321b13 : 0x27251f);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(isCrawler ? 0.62 : 0.52, isCrawler ? 0.4 : 0.78, 0.3), dark);
    torso.position.y = isCrawler ? 0.45 : 1.18;
    const head = new THREE.Mesh(new THREE.BoxGeometry(isCrawler ? 0.44 : 0.38, 0.38, 0.38), bone);
    head.position.y = isCrawler ? 0.72 : 1.82;
    head.userData.hitZone = "head";
    group.add(torso, head);
    if (!isCrawler) {
      for (const side of [-1, 1]) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.72, 0.14), bone);
        arm.position.set(side * 0.38, 1.16, 0);
        arm.rotation.z = side * -0.12;
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.78, 0.18), bone);
        leg.position.set(side * 0.16, 0.48, 0);
        group.add(arm, leg);
      }
      const weapon = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.88, 0.08), material(isRival ? 0x899192 : 0x6f6b62));
      weapon.position.set(0.5, 1.0, 0.16);
      weapon.rotation.z = -0.5;
      group.add(weapon);
      if (isRival) {
        const satchel = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.42, 0.2), material(0x5e3825));
        satchel.name = "rivalSatchel";
        satchel.position.set(-0.38, 1.0, 0.14);
        satchel.rotation.z = 0.16;
        satchel.visible = false;
        group.add(satchel);
        if (rivalArchetype === "marauder") {
          const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.09, 8), material(0x514737, 0x160d09));
          shield.position.set(-0.48, 1.16, 0.14);
          shield.rotation.x = Math.PI / 2;
          group.add(shield);
        }
      }
    } else {
      for (let index = 0; index < 6; index += 1) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.07, 0.07), bone);
        leg.position.set(index % 2 ? 0.31 : -0.31, 0.32 + Math.floor(index / 2) * 0.08, (Math.floor(index / 2) - 1) * 0.23);
        leg.rotation.z = index % 2 ? -0.4 : 0.4;
        group.add(leg);
      }
    }
    group.position.set(x, 0, z);
    const baseScale = isBoss ? 1.35 : 1;
    group.scale.setScalar(baseScale);
    group.traverse((object) => {
      object.castShadow = true;
      object.userData.enemyId = id;
    });
    let tollRing: Enemy["tollRing"];
    if (isBoss) {
      tollRing = new THREE.Mesh(
        new THREE.RingGeometry(2.45 / baseScale, 6.35 / baseScale, 24, 1),
        new THREE.MeshBasicMaterial({ color: 0xc9412f, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
      );
      tollRing.position.y = 0.055 / baseScale;
      tollRing.rotation.x = -Math.PI / 2;
      tollRing.visible = false;
      tollRing.castShadow = false;
      tollRing.renderOrder = 2;
      group.add(tollRing);
    }
    this.scene.add(group);
    const baseStats = kind === "boss"
      ? { hp: 245, speed: 1.12, damage: 31, range: 2.15, name: "The Tollkeeper" }
      : kind === "warden"
      ? { hp: 115, speed: 1.35, damage: 24, range: 1.7, name: "Ossuary warden" }
      : kind === "rival"
        ? rivalArchetype === "marauder"
          ? { hp: 112, speed: 1.82, damage: 23, range: 1.9, name: "Guildless marauder" }
          : { hp: 88, speed: 2.05, damage: 16, range: 6.5, name: "Guildless skirmisher" }
        : kind === "mimic"
          ? { hp: 76, speed: 2.3, damage: 20, range: 1.3, name: "Coffer mimic" }
        : kind === "crawler"
          ? { hp: 38, speed: 2.65, damage: 12, range: 1.15, name: "Grave crawler" }
          : { hp: 64, speed: 1.55, damage: 17, range: 1.55, name: "Hollow legionary" };
    const floorRules = depthRules(this.depth);
    const stats = {
      ...baseStats,
      name: this.depth === 2 && kind === "boss" ? "The Ash Tollkeeper" : baseStats.name,
      hp: Math.round(baseStats.hp * this.raidRules.enemyHealthMultiplier * floorRules.enemyHealthMultiplier),
      speed: baseStats.speed * this.raidRules.enemySpeedMultiplier * floorRules.enemySpeedMultiplier,
      damage: Math.round(baseStats.damage * this.raidRules.enemyDamageMultiplier * floorRules.enemyDamageMultiplier),
    };
    this.enemies.push({
      id,
      group,
      kind,
      name: stats.name,
      hp: stats.hp,
      maxHp: stats.hp,
      speed: stats.speed,
      damage: stats.damage,
      range: stats.range,
      cooldown: 0,
      windup: 0,
      windupDuration: 0,
      stagger: 0,
      alerted: false,
      alive: true,
      phase: Math.random() * Math.PI * 2,
      baseScale,
      path: [],
      pathTimer: 0,
      attackStyle: "melee",
      crippled: false,
      carriedLoot: [],
      extractProgress: 0,
      extractAnnounced: false,
      rivalArchetype,
      tollCooldown: Math.min(5, bossRingCooldown(this.depth, false) * 0.7),
      tollWindup: 0,
      tollWindupDuration: 1.15,
      tollRing,
    });
  }

  private spawnPickup(item: Item, position: THREE.Vector3): void {
    const group = new THREE.Group();
    const color = new THREE.Color(RARITY_COLOR[item.rarity]);
    const shape = rarityShape(item.rarity);
    const geometry = item.kind === "sigil"
      ? new THREE.TorusGeometry(0.25, 0.08, 4, 8)
      : shape === "tetrahedron"
        ? new THREE.TetrahedronGeometry(0.3, 0)
        : shape === "octahedron"
          ? new THREE.OctahedronGeometry(0.3, 0)
          : shape === "dodecahedron"
            ? new THREE.DodecahedronGeometry(0.28, 0)
            : shape === "icosahedron"
              ? new THREE.IcosahedronGeometry(0.29, 0)
              : new THREE.BoxGeometry(0.34, 0.34, 0.34);
    const object = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.55, roughness: 0.7, flatShading: true }));
    group.add(object);
    group.position.copy(position);
    group.position.y = 0.55;
    const light = new THREE.PointLight(color, 0.6, 2.8);
    group.add(light);
    this.scene.add(group);
    this.pickups.push({ group, item, collected: false, phase: Math.random() * 5 });
  }

  private bindEvents(): void {
    document.addEventListener("keydown", this.onKeyDown);
    document.addEventListener("keyup", this.onKeyUp);
    document.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("mousedown", this.onMouseDown);
    document.addEventListener("mouseup", this.onMouseUp);
    document.addEventListener("pointerlockchange", this.onPointerLockChange);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    window.addEventListener("blur", this.onWindowBlur);
    this.renderer.domElement.addEventListener("webglcontextlost", this.onContextLost);
    this.renderer.domElement.addEventListener("webglcontextrestored", this.onContextRestored);
    this.renderer.domElement.addEventListener("contextmenu", this.onContextMenu);
    this.renderer.domElement.addEventListener("click", this.requestPointerLock);
    this.resumeButton.addEventListener("click", this.requestPointerLock);
    this.abandonButton.addEventListener("click", this.onAbandonRaid);
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (this.paused || this.ended) return;
    this.keys.add(event.code);
    if (event.code === "KeyE" && !event.repeat && !this.remedyBlocks("INTERACT")) this.interactHeld = true;
    if (event.code === "KeyR" && !event.repeat && !this.remedyBlocks("INTERACT")) this.descendHeld = true;
    if (event.code === "KeyF" && !event.repeat) this.useConsumable();
    if (event.code === "KeyC" && !event.repeat) this.cycleConsumable();
    if (event.code === "KeyV" && !event.repeat) this.throwItem();
    if (event.code === "KeyB" && !event.repeat) this.cycleThrowable();
    if (event.code === "KeyG" && !event.repeat) this.dropLowestHaul();
    if (event.code === "KeyQ" && !event.repeat) this.useClassAbility();
    if (event.code === "KeyT" && !event.repeat) this.toggleTorch();
    if ((event.code === "ControlLeft" || event.code === "ControlRight") && !event.repeat) this.feed("CROUCH · slower steps reduce passive detection", "system");
    if ((event.code === "ShiftLeft" || event.code === "ShiftRight") && !event.repeat) this.feed("SPRINT · fast steps carry farther through the crypt", "system");
    if (event.code === "Space" && !event.repeat) {
      event.preventDefault();
      this.dodge();
    }
    if (event.code === "Digit1" && !event.repeat) this.selectSpell("ash_bolt");
    if (event.code === "Digit2" && !event.repeat) this.selectSpell("frost_hex");
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
    if (event.code === "KeyE") {
      this.interactHeld = false;
      if (this.interactionInput === "interact") this.breakInteractionChannel("released");
    }
    if (event.code === "KeyR") {
      this.descendHeld = false;
      if (this.interactionInput === "descend") this.breakInteractionChannel("released");
    }
  };

  private onMouseMove = (event: MouseEvent): void => {
    if (document.pointerLockElement !== this.renderer.domElement || this.ended) return;
    this.yaw -= event.movementX * 0.0023 * this.options.preferences.mouseSensitivity;
    const pitchDirection = this.options.preferences.invertY ? 1 : -1;
    this.pitch += event.movementY * 0.0021 * this.options.preferences.mouseSensitivity * pitchDirection;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.35, 1.35);
    this.mouseAccumulator.x += event.movementX;
    this.mouseAccumulator.y += event.movementY;
    if (this.options.classId === "ranger" || this.options.classId === "hexbound") {
      this.attackDirection = "THRUST";
    } else if (Math.abs(this.mouseAccumulator.y) > Math.abs(this.mouseAccumulator.x) * 1.15 && Math.abs(this.mouseAccumulator.y) > 18) {
      this.attackDirection = "OVERHEAD";
    } else if (Math.abs(this.mouseAccumulator.x) > 23) {
      this.attackDirection = "SWEEP";
    } else {
      this.attackDirection = "THRUST";
    }
  };

  private onMouseDown = (event: MouseEvent): void => {
    if (this.paused || this.ended) return;
    if (event.button === 0) this.attack();
    if (event.button === 2) {
      if (this.remedyBlocks("GUARD")) return;
      const denial = guardDenialReason(this.stamina, this.guardBreakTimer, this.attackCooldown, this.dodgeCooldown);
      if (denial === "guard_broken") {
        this.feed(`GUARD BROKEN · ${this.guardBreakTimer.toFixed(1)}s`, "danger");
        return;
      }
      if (denial === "action_recovery") {
        this.feed(`GUARD DENIED · action recovery ${this.attackCooldown.toFixed(1)}s`, "danger");
        return;
      }
      if (denial === "sidestep_recovery") {
        this.feed(`GUARD DENIED · sidestep recovery ${this.dodgeCooldown.toFixed(1)}s`, "danger");
        return;
      }
      if (denial === "stamina") {
        this.feed("GUARD NEEDS STAMINA", "danger");
        return;
      }
      this.blocking = true;
      this.blockAge = 0;
    }
  };

  private onMouseUp = (event: MouseEvent): void => {
    if (event.button === 2) this.blocking = false;
  };

  private onContextMenu = (event: MouseEvent): void => event.preventDefault();

  private onPointerLockChange = (): void => {
    const lockMatchesCanvas = document.pointerLockElement === this.renderer.domElement;
    const resumesRaid = pointerLockResumesRaid({
      lockMatchesCanvas,
      requestAllowed: this.pointerLockAllowed,
      contextLost: this.contextLost,
      documentHidden: document.hidden,
      ended: this.ended,
    });
    this.pointerLockPending = false;
    this.resumeButton.disabled = false;
    if (resumesRaid) {
      this.paused = false;
      this.lockOverlay.classList.add("hidden");
      this.audio.start();
      this.clock.getDelta();
      this.queueFrame();
      return;
    }
    this.pointerLockAllowed = false;
    this.pointerLockEpoch += 1;
    this.paused = true;
    this.clearHeldInputs();
    this.audio.pause();
    if (!this.ended && !this.contextLost) {
      this.resetAbandonConfirmation();
      this.setLockOverlayCopy("RETURN TO THE CRYPT", "Bind the cursor when you are ready.");
      this.updatePauseLedger();
    }
    this.lockOverlay.classList.toggle("hidden", this.ended);
    if (lockMatchesCanvas) void document.exitPointerLock();
  };

  private clearHeldInputs(): void {
    this.keys.clear();
    this.blocking = false;
    this.crouching = false;
    this.sprinting = false;
    this.moving = false;
    this.blockAge = 0;
    this.interactHeld = false;
    this.descendHeld = false;
    this.resetInteractionChannel();
    this.mouseAccumulator.x = 0;
    this.mouseAccumulator.y = 0;
  }

  private pauseForFocusLoss(): void {
    if (this.ended) return;
    this.invalidatePointerLockRequest();
    this.paused = true;
    this.clearHeldInputs();
    this.audio.pause();
    this.resetAbandonConfirmation();
    this.setLockOverlayCopy("RETURN TO THE CRYPT", "Bind the cursor when you are ready.");
    this.updatePauseLedger();
    this.lockOverlay.classList.remove("hidden");
    if (document.pointerLockElement === this.renderer.domElement) void document.exitPointerLock();
  }

  private onWindowBlur = (): void => this.pauseForFocusLoss();

  private onVisibilityChange = (): void => {
    if (document.hidden) this.pauseForFocusLoss();
  };

  private setLockOverlayCopy(title: string, detail: string): void {
    const titleElement = this.lockOverlay.querySelector<HTMLElement>("[data-lock-title]");
    const detailElement = this.lockOverlay.querySelector<HTMLElement>("[data-lock-detail]");
    if (titleElement) titleElement.textContent = title;
    if (detailElement) detailElement.textContent = detail;
  }

  private updatePauseLedger(): void {
    const remainingPacked = this.options.equipped.filter((item) => !this.consumedIds.includes(item.id));
    const ordinaryHaul = this.raidLoot.filter((item) => item.kind !== "sigil");
    const sigils = this.raidLoot.filter((item) => item.kind === "sigil").length;
    const haulValue = ordinaryHaul.reduce((sum, item) => sum + item.value, 0);
    const coinValue = treasureGoldTotal(this.raidLoot);
    const dropCandidate = dropLeastValuable(this.raidLoot).dropped;
    const readiness = raidReadinessSummary({
      classId: this.options.classId,
      depth: this.depth,
      health: this.health,
      maxHealth: this.maxHealth,
      stamina: this.stamina,
      maxStamina: this.definition.maxStamina,
      spellCharges: this.spellCharges,
      maxSpellCharges: this.maxSpellCharges,
      sigils,
      portalUnlocked: this.portalUnlocked,
      campfireUsed: this.campfireUsed,
      torchLit: this.torchLit,
      torchFuel: this.torchFuel,
    });
    const itemRow = (item: Item, status: string): string => `<span class="pause-ledger-item" style="--rarity:${RARITY_COLOR[item.rarity]}"><i></i><b>${escapeHtml(item.name)}</b><small>${status} · ${item.value}g</small></span>`;
    this.pauseLedger.innerHTML = `
      <div class="pause-ledger-summary">
        <span><small>VIGOR</small><strong>${readiness.vigor}</strong></span>
        <span><small>STAMINA</small><strong>${readiness.stamina}</strong></span>
        <span><small>SPELL MEMORY</small><strong>${readiness.memory}</strong></span>
        <span><small>PASSAGE</small><strong>${readiness.passage}</strong></span>
        <span><small>PACKED RISK</small><strong>${remainingPacked.length} ITEM${remainingPacked.length === 1 ? "" : "S"}</strong></span>
        <span><small>UNSECURED HAUL</small><strong>${ordinaryHaul.length} / ${HAUL_CAPACITY} · ${haulValue}G VALUE · ${coinValue}G COIN</strong></span>
        <span><small>RESERVES</small><strong>${this.availableConsumables().length} REMEDY · ${this.availableThrowables().length} THROW</strong></span>
        <span><small>CAMPFIRE</small><strong>${readiness.campfire}</strong></span>
        <span><small>TORCH</small><strong>${readiness.torch}</strong></span>
        <span><small>UNSEEN MARKS</small><strong>${Math.min(QUIET_KNIVES_TARGET, this.unseenStrikes)} / ${QUIET_KNIVES_TARGET}</strong></span>
      </div>
      <div class="pause-ledger-items">
        ${remainingPacked.map((item) => itemRow(item, "PACKED")).join("")}
        ${ordinaryHaul.map((item) => itemRow(item, "HAUL")).join("")}
        ${remainingPacked.length || ordinaryHaul.length ? "" : `<span class="pause-ledger-empty">No gear or unsecured loot is recorded.</span>`}
      </div>
      <p>CONTRACT SEAL · ${raidVariationSeal(this.variationSeed)} · identifies this raid layout</p>
      <p>${dropCandidate ? `DROP PREVIEW · G will discard ${escapeHtml(dropCandidate.name)} (${dropCandidate.value}g)` : "DROP PREVIEW · no ordinary haul can be discarded"}</p>`;
  }

  private resetAbandonConfirmation(): void {
    this.abandonArmed = false;
    this.abandonButton.classList.remove("armed");
    this.abandonButton.textContent = "ABANDON RAID";
  }

  private onAbandonRaid = (): void => {
    if (this.ended) return;
    if (!this.abandonArmed) {
      this.abandonArmed = true;
      this.abandonButton.classList.add("armed");
      this.abandonButton.textContent = "CONFIRM LOSS OF GEAR AND HAUL";
      this.setLockOverlayCopy("FORFEIT THE CONTRACT?", "This counts as a death. Your class persists, but equipped gear and unsecured loot do not.");
      return;
    }
    this.abandonButton.disabled = true;
    this.abandonButton.textContent = "FORFEITING...";
    this.finish("abandoned");
  };

  private onContextLost = (event: Event): void => {
    event.preventDefault();
    if (this.ended) return;
    this.invalidatePointerLockRequest();
    this.contextLost = true;
    this.paused = true;
    this.clearHeldInputs();
    this.audio.pause();
    this.resetAbandonConfirmation();
    this.setLockOverlayCopy("REKINDLING THE CRYPT", "The renderer was interrupted. Waiting for the torch to return.");
    this.updatePauseLedger();
    this.lockOverlay.classList.remove("hidden");
    if (document.pointerLockElement === this.renderer.domElement) void document.exitPointerLock();
  };

  private onContextRestored = (): void => {
    if (this.ended) return;
    this.contextLost = false;
    this.paused = true;
    this.resetAbandonConfirmation();
    this.setLockOverlayCopy("RETURN TO THE CRYPT", "Renderer restored. Click to bind the cursor again.");
    this.updatePauseLedger();
    this.lockOverlay.classList.remove("hidden");
    this.feed("The torch catches. The crypt is visible again.", "system");
    this.queueFrame();
  };

  private requestPointerLock = (): void => {
    if (!pointerLockRequestAllowed({
      alreadyLocked: document.pointerLockElement === this.renderer.domElement,
      requestPending: this.pointerLockPending,
      contextLost: this.contextLost,
      ended: this.ended,
    })) return;
    this.resetAbandonConfirmation();
    if (typeof this.renderer.domElement.requestPointerLock !== "function") {
      this.handlePointerLockFailure(this.pointerLockEpoch, "This browser cannot bind a first-person cursor. Return to the lobby and use a desktop browser.");
      return;
    }
    const epoch = ++this.pointerLockEpoch;
    this.pointerLockAllowed = true;
    this.pointerLockPending = true;
    this.paused = true;
    this.clearHeldInputs();
    this.audio.pause();
    this.resumeButton.disabled = true;
    this.setLockOverlayCopy("BINDING THE CURSOR", "The raid remains paused until the browser confirms first-person control.");
    this.updatePauseLedger();
    this.lockOverlay.classList.remove("hidden");
    try {
      const pointerLockRequest = this.renderer.domElement.requestPointerLock();
      void Promise.resolve(pointerLockRequest).catch(() => this.handlePointerLockFailure(epoch));
      this.lifecycleTimers.schedule(() => this.settleTimedOutPointerLock(epoch), 1_800);
    } catch {
      this.handlePointerLockFailure(epoch);
    }
  };

  private handlePointerLockFailure(epoch: number, detail = "Click to try again. If the browser keeps refusing, allow pointer lock for this site."): void {
    if (this.ended || this.contextLost || epoch !== this.pointerLockEpoch) return;
    if (document.pointerLockElement === this.renderer.domElement) return;
    this.invalidatePointerLockRequest();
    this.paused = true;
    this.clearHeldInputs();
    this.audio.pause();
    this.setLockOverlayCopy("CURSOR UNBOUND", detail);
    this.updatePauseLedger();
    this.lockOverlay.classList.remove("hidden");
    this.feed("The browser refused pointer lock. The raid remains paused.", "system");
  }

  private invalidatePointerLockRequest(): void {
    this.pointerLockAllowed = false;
    this.pointerLockPending = false;
    this.pointerLockEpoch += 1;
    this.resumeButton.disabled = false;
  }

  private settleTimedOutPointerLock(epoch: number): void {
    const outcome = pointerLockTimeoutOutcome(
      this.pointerLockPending,
      epoch === this.pointerLockEpoch,
      document.pointerLockElement === this.renderer.domElement,
    );
    if (outcome === "confirm") this.onPointerLockChange();
    if (outcome === "reject") this.handlePointerLockFailure(epoch, "The browser did not confirm first-person control. Click to try again.");
  }

  private frame = (): void => {
    this.animationFrame = 0;
    const delta = Math.min(this.clock.getDelta(), 0.05);
    if (raidFrameLoopActive(this.paused, this.ended, this.contextLost)) this.update(delta);
    if (!this.contextLost) {
      if (raidFrameLoopActive(this.paused, this.ended, this.contextLost)) {
        this.updateAdaptiveResolution(delta);
        this.animateWorld(delta);
      }
      this.renderer.render(this.scene, this.camera);
    }
    if (raidFrameLoopActive(this.paused, this.ended, this.contextLost)) this.queueFrame();
  };

  private queueFrame(): void {
    if (this.animationFrame !== 0 || this.ended || this.contextLost) return;
    this.animationFrame = requestAnimationFrame(this.frame);
  }

  private updateAdaptiveResolution(delta: number): void {
    if (document.hidden || this.contextLost) return;
    this.frameTimeTotal += delta;
    this.frameSamples += 1;
    this.resolutionTimer += delta;
    if (this.resolutionTimer < 2.5 || this.frameSamples < 30) return;
    const averageFrameMs = (this.frameTimeTotal / this.frameSamples) * 1_000;
    const nextScale = adaptiveRenderScale(this.renderScale, averageFrameMs, this.mount.clientWidth);
    this.frameTimeTotal = 0;
    this.frameSamples = 0;
    this.resolutionTimer = 0;
    if (nextScale === this.renderScale) return;
    this.renderScale = nextScale;
    this.resize();
  }

  private update(delta: number): void {
    this.elapsed += delta;
    if (raidDeadlineReached(this.phaseElapsed(), depthRules(this.depth).duration)) {
      this.finish("darkness");
      return;
    }
    const previousTorchFuel = this.torchFuel;
    this.torchFuel = spendTorchFuel(this.torchFuel, delta, this.torchLit);
    if (this.torchLit && previousTorchFuel > 0 && this.torchFuel <= 0) {
      this.torchLit = false;
      this.delverTorch.intensity = 0;
      this.feed("TORCH SPENT · seek the campfire or burn bluewax", "danger");
      this.audio.tone(78, 0.28, "sawtooth", 0.09);
    }
    this.attackCooldown = Math.max(0, this.attackCooldown - delta);
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - delta);
    this.guardBreakTimer = Math.max(0, this.guardBreakTimer - delta);
    if (this.remedyItemId) {
      this.remedyTimer = Math.max(0, this.remedyTimer - delta);
      if (this.remedyTimer <= 0) this.completeConsumableUse();
    }
    this.riposteTimer = Math.max(0, this.riposteTimer - delta);
    this.abilityCooldown = Math.max(0, this.abilityCooldown - delta);
    this.concealmentTimer = Math.max(0, this.concealmentTimer - delta);
    this.rageTimer = Math.max(0, this.rageTimer - delta);
    this.quickdrawTimer = Math.max(0, this.quickdrawTimer - delta);
    this.wildshapeTimer = Math.max(0, this.wildshapeTimer - delta);
    this.swingClock = Math.max(0, this.swingClock - delta);
    if (this.pendingStrike) {
      this.pendingStrike.impactRemaining = Math.max(0, this.pendingStrike.impactRemaining - delta);
      if (this.pendingStrike.impactRemaining <= 0) {
        const strike = this.pendingStrike;
        this.pendingStrike = undefined;
        this.resolveStrike(strike);
      }
    }
    this.updatePlayerProjectiles(delta);
    this.damageCooldown = Math.max(0, this.damageCooldown - delta);
    this.darknessPulseTimer = Math.max(0, this.darknessPulseTimer - delta);
    this.damageDirectionTimer = Math.max(0, this.damageDirectionTimer - delta);
    this.messageTimer = Math.max(0, this.messageTimer - delta);
    this.threatTimer = Math.max(0, this.threatTimer - delta);
    this.blockAge += this.blocking ? delta : 0;
    this.vignette = Math.max(0, this.vignette - delta * 1.8);
    this.updateMovement(delta);
    this.updateTraps(delta);
    if (this.ended) return;
    this.updateDartTraps(delta);
    if (this.ended) return;
    this.updateAshVents(delta);
    if (this.ended) return;
    this.updateEnemies(delta);
    if (this.ended) return;
    this.updateZone(delta);
    if (this.ended) return;
    this.updateInteraction(delta);
    if (this.ended) return;
    this.updateHud();
  }

  private phaseElapsed(): number {
    return Math.max(0, this.elapsed - this.depthStartedAt);
  }

  private updateMovement(delta: number): void {
    const input = new THREE.Vector2(
      Number(this.keys.has("KeyD")) - Number(this.keys.has("KeyA")),
      Number(this.keys.has("KeyW")) - Number(this.keys.has("KeyS")),
    );
    const moving = input.lengthSq() > 0;
    if (moving) input.normalize();
    const crouching = this.keys.has("ControlLeft") || this.keys.has("ControlRight");
    const sprinting = moving && !crouching && (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight")) && this.stamina > 1 && !this.blocking && !this.remedyItemId;
    this.crouching = crouching;
    this.sprinting = sprinting;
    this.moving = moving;
    const sprintMultiplier = sprinting ? (this.options.classId === "cutpurse" ? 1.65 : 1.48) : 1;
    const movementPenalty = (this.blocking ? 0.55 : this.guardBreakTimer > 0 ? 0.42 : this.remedyItemId ? 0.62 : 1) * (crouching ? 0.58 : 1);
    const speed = this.definition.speed * this.loadoutBonuses.movementMultiplier * classMovementMultiplier(this.options.classId, this.wildshapeTimer) * sprintMultiplier * movementPenalty;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const dx = (input.x * cos - input.y * sin) * speed * delta;
    const dz = (-input.x * sin - input.y * cos) * speed * delta;
    this.tryMove(dx, dz);
    if (sprinting) {
      this.stamina = Math.max(0, this.stamina - delta * (this.options.classId === "cutpurse" ? 17 : 24) * this.perkBonuses.sprintCostMultiplier);
    } else if (this.blocking) {
      this.drainGuard(delta * guardDrainPerSecond(this.options.classId) * this.perkBonuses.guardUpkeepMultiplier);
    } else {
      const recovering = delverRecoveryActive(this.attackCooldown, this.swingClock, this.dodgeCooldown, this.guardBreakTimer, Boolean(this.remedyItemId));
      this.stamina = Math.min(this.definition.maxStamina, this.stamina + delta * staminaRecoveryPerSecond(moving, recovering));
    }

    const stanceHeight = crouching ? CROUCH_HEIGHT : PLAYER_HEIGHT;
    if (moving) {
      const previousFootstepDistance = this.footstepClock;
      this.footstepClock += delta * speed;
      if (footstepCadenceCrossed(previousFootstepDistance, this.footstepClock, 1.6)) {
        this.audio.footstep(crouching, sprinting, equippedPower(this.options.equipped, "armor"));
      }
    }
    if (moving && !this.options.preferences.reducedMotion) {
      this.camera.position.y = stanceHeight + Math.sin(this.footstepClock * 2.25) * 0.035;
    } else {
      this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, stanceHeight, delta * 7);
    }
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }

  private dodge(): void {
    if (this.paused || this.ended || this.blocking || this.attackCooldown > 0 || this.swingClock > 0 || this.interactionHold > 0) return;
    if (this.remedyBlocks("SIDESTEP")) return;
    if (this.guardBreakTimer > 0) {
      this.feed(`SIDESTEP DENIED · guard broken ${this.guardBreakTimer.toFixed(1)}s`, "danger");
      return;
    }
    const stats = dodgeStats(this.options.classId);
    if (this.dodgeCooldown > 0) {
      this.feed(`SIDESTEP RECOVERING · ${this.dodgeCooldown.toFixed(1)}s`, "system");
      return;
    }
    if (this.stamina < stats.stamina) {
      this.feed(`SIDESTEP NEEDS ${stats.stamina} STAMINA`, "danger");
      return;
    }
    const strafe = Number(this.keys.has("KeyD")) - Number(this.keys.has("KeyA"));
    let forward = Number(this.keys.has("KeyW")) - Number(this.keys.has("KeyS"));
    if (strafe === 0 && forward === 0) forward = -1;
    const offset = movementOffset(this.yaw, strafe, forward, stats.distance);
    const startX = this.camera.position.x;
    const startZ = this.camera.position.z;
    for (let step = 0; step < 5; step += 1) this.tryMove(offset.x / 5, offset.z / 5);
    const moved = Math.hypot(this.camera.position.x - startX, this.camera.position.z - startZ);
    if (moved < 0.1) {
      this.feed("SIDESTEP BLOCKED · the masonry holds", "system");
      return;
    }
    this.stamina = Math.max(0, this.stamina - stats.stamina);
    this.dodgeCooldown = stats.cooldown;
    this.concealmentTimer = 0;
    this.audio.tone(170, 0.09, "sawtooth", 0.055);
    this.feed(`SIDESTEP · ${moved.toFixed(1)}m`, "system");
  }

  private tryMove(dx: number, dz: number): void {
    const nextX = this.camera.position.x + dx;
    const nextZ = this.camera.position.z + dz;
    if (!this.collides(nextX, this.camera.position.z)) this.camera.position.x = nextX;
    if (!this.collides(this.camera.position.x, nextZ)) this.camera.position.z = nextZ;
  }

  private collides(x: number, z: number): boolean {
    return this.walls.some((wall) =>
      Math.abs(x - wall.x) < wall.halfW + PLAYER_RADIUS && Math.abs(z - wall.z) < wall.halfD + PLAYER_RADIUS,
    );
  }

  private toggleTorch(): void {
    if (this.paused || this.ended) return;
    if (this.remedyBlocks("TORCH")) return;
    if (!this.torchLit && this.torchFuel <= 0) {
      this.feed("TORCH SPENT · seek the campfire or burn bluewax", "danger");
      return;
    }
    this.torchLit = !this.torchLit;
    this.delverTorch.intensity = this.torchLit ? 5.2 : 0;
    this.feed(this.torchLit ? "Torch unhooded. You see farther, and so do they." : "Torch hooded. Stay close to the stones.", "system");
    this.audio.tone(this.torchLit ? 310 : 140, 0.12, "sine", 0.08);
  }

  private selectSpell(spellId: HexSpellId): void {
    if (this.options.classId !== "hexbound" || this.selectedSpell === spellId) return;
    this.selectedSpell = spellId;
    const spell = HEX_SPELLS[spellId];
    this.feed(`${spell.name.toUpperCase()} MEMORIZED · ${spell.cripples ? "slows non-boss threats" : "full spell damage"}`, "system");
    this.audio.tone(spell.cripples ? 390 : 520, 0.1, "sine", 0.06);
  }

  private updateTraps(delta: number): void {
    for (const trap of this.traps) {
      trap.cooldown = Math.max(0, trap.cooldown - delta);
      trap.active = Math.max(0, trap.active - delta);
      const targetScale = trap.active > 0 ? 1 : 0.04;
      trap.spikes.scale.y = THREE.MathUtils.lerp(trap.spikes.scale.y, targetScale, delta * 22);
      const distance = Math.hypot(this.camera.position.x - trap.group.position.x, this.camera.position.z - trap.group.position.z);
      if (trap.cooldown > 0) continue;
      if (distance < 0.82) {
        trap.cooldown = 3.2;
        trap.active = 0.72;
        this.hurt(trap.damage, "a floor trap", true, { x: trap.group.position.x, z: trap.group.position.z });
        if (this.ended) return;
        continue;
      }
      const victim = this.enemies.find((enemy) => enemy.alive && Math.hypot(
        enemy.group.position.x - trap.group.position.x,
        enemy.group.position.z - trap.group.position.z,
      ) < (enemy.kind === "boss" ? 1.05 : 0.78));
      if (!victim) continue;
      trap.cooldown = 3.2;
      trap.active = 0.72;
      this.damageEnemy(victim, trapDamageAgainstThreat(trap.damage, victim.kind), false, false);
      this.feed(`FLOOR TRAP · ${victim.name} is impaled`, "combat");
    }
  }

  private updateDartTraps(delta: number): void {
    for (const trap of this.dartTraps) {
      trap.cooldown = Math.max(0, trap.cooldown - delta);
      if (trap.windup > 0) {
        trap.windup = Math.max(0, trap.windup - delta);
        trap.portMaterial.emissiveIntensity = 1.2 + Math.sin(this.elapsed * 26) * 0.35;
        if (trap.windup === 0) {
          this.fireDartTrap(trap);
          if (this.ended) return;
        }
        continue;
      }
      trap.portMaterial.emissiveIntensity = 0.15;
      if (trap.cooldown > 0) continue;
      const origin = { x: trap.group.position.x, z: trap.group.position.z };
      const playerDistance = dartTrapTargetDistance(origin, trap.direction, trap.range, this.camera.position);
      const enemyDistance = this.enemies.reduce((nearest, enemy) => {
        if (!enemy.alive) return nearest;
        return Math.min(nearest, dartTrapTargetDistance(origin, trap.direction, trap.range, enemy.group.position, enemy.kind === "boss" ? 0.72 : 0.5));
      }, Number.POSITIVE_INFINITY);
      if (!Number.isFinite(Math.min(playerDistance, enemyDistance))) continue;
      trap.windup = 0.62;
      if (Number.isFinite(playerDistance)) {
        this.feed("WALL PORTS GLOW · leave the dart lane", "danger");
        this.showDirectionalCue(origin, "DART LANE", 0.8, "warning");
        this.audio.tone(880, 0.08, "square", 0.07);
      }
    }
  }

  private updateAshVents(delta: number): void {
    for (const vent of this.ashVents) {
      if (vent.active > 0) {
        vent.active = Math.max(0, vent.active - delta);
        const progress = vent.active / ASH_VENT_ACTIVE_SECONDS;
        vent.plume.visible = true;
        vent.plume.scale.set(1 + (1 - progress) * 0.35, 0.75 + progress * 0.45, 1 + (1 - progress) * 0.35);
        vent.plumeMaterial.opacity = Math.min(0.72, progress * 0.9);
        vent.light.intensity = progress * 3.6;
        if (vent.active === 0) {
          vent.plume.visible = false;
          vent.plumeMaterial.opacity = 0;
          vent.light.intensity = 0;
          vent.runeMaterial.emissiveIntensity = 0.18;
        }
        continue;
      }
      if (vent.windup > 0) {
        vent.windup = Math.max(0, vent.windup - delta);
        const progress = 1 - vent.windup / ASH_VENT_WINDUP_SECONDS;
        const pulse = this.options.preferences.reducedFlashes ? 0 : Math.sin(this.elapsed * 24) * 0.18;
        vent.runeMaterial.emissiveIntensity = 0.5 + progress * 1.8 + pulse;
        vent.light.intensity = 0.25 + progress * 1.5;
        if (vent.windup === 0) {
          this.eruptAshVent(vent);
          if (this.ended) return;
        }
        continue;
      }
      vent.cooldown = Math.max(0, vent.cooldown - delta);
      vent.runeMaterial.emissiveIntensity = 0.18;
      if (vent.cooldown > 0) continue;
      vent.windup = ASH_VENT_WINDUP_SECONDS;
      const distance = Math.hypot(this.camera.position.x - vent.group.position.x, this.camera.position.z - vent.group.position.z);
      if (distance <= 7) {
        this.feed("ASH CRACKS GLOW · clear the marked ring", "danger");
        this.audio.tone(96, 0.18, "sawtooth", 0.08);
      }
    }
  }

  private eruptAshVent(vent: AshVent): void {
    vent.active = ASH_VENT_ACTIVE_SECONDS;
    vent.cooldown = ASH_VENT_COOLDOWN_SECONDS;
    vent.plume.visible = true;
    vent.plumeMaterial.opacity = 0.72;
    vent.light.intensity = 3.6;
    const origin = { x: vent.group.position.x, z: vent.group.position.z };
    const playerHit = ashVentHits(origin, this.camera.position);
    if (playerHit) this.hurt(ASH_VENT_DAMAGE, "an ash vent", false, origin);
    if (this.ended) return;
    let enemyHits = 0;
    for (const enemy of this.enemies) {
      if (!enemy.alive || !ashVentHits(origin, enemy.group.position, enemy.kind === "boss" ? ASH_VENT_RADIUS + 0.35 : ASH_VENT_RADIUS)) continue;
      enemyHits += 1;
      this.damageEnemy(enemy, trapDamageAgainstThreat(ASH_VENT_DAMAGE, enemy.kind), false, false);
    }
    if (!playerHit && enemyHits > 0) this.feed(`ASH ERUPTION · ${enemyHits} threat${enemyHits === 1 ? "" : "s"} scorched`, "combat");
    this.audio.tone(54, 0.28, "sawtooth", 0.12);
  }

  private fireDartTrap(trap: DartTrap): void {
    trap.cooldown = 4.2;
    trap.portMaterial.emissiveIntensity = 0.15;
    const origin = { x: trap.group.position.x, z: trap.group.position.z };
    let victim: Enemy | undefined;
    let victimDistance = Number.POSITIVE_INFINITY;
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const distance = dartTrapTargetDistance(origin, trap.direction, trap.range, enemy.group.position, enemy.kind === "boss" ? 0.72 : 0.5);
      if (distance < victimDistance) {
        victim = enemy;
        victimDistance = distance;
      }
    }
    const playerDistance = dartTrapTargetDistance(origin, trap.direction, trap.range, this.camera.position);
    const strikeDistance = Math.min(playerDistance, victimDistance);
    this.spawnDartVolley(trap, Number.isFinite(strikeDistance) ? strikeDistance : trap.range);
    if (playerDistance < victimDistance) {
      const guardFacing = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      const facingPort = guardFacesThreat(
        { x: guardFacing.x, z: guardFacing.z },
        { x: origin.x - this.camera.position.x, z: origin.z - this.camera.position.z },
      );
      const guarded = this.blocking && facingPort;
      this.hurt(trap.damage * (guarded ? 0.28 : 1), "a wall dart", true, origin);
      if (this.ended) return;
      if (guarded) this.drainGuard(trap.damage * 0.5);
      return;
    }
    if (!victim || !Number.isFinite(victimDistance)) return;
    this.damageEnemy(victim, trapDamageAgainstThreat(trap.damage, victim.kind), false, false);
    this.feed(`WALL DART · ${victim.name} is pinned`, "combat");
  }

  private spawnDartVolley(trap: DartTrap, distance: number): void {
    const direction = new THREE.Vector3(trap.direction.x, 0, trap.direction.z).normalize();
    const start = trap.group.position.clone().add(new THREE.Vector3(0, 1.35, 0)).add(direction.clone().multiplyScalar(0.18));
    const dartMaterial = material(0x9f978c, 0x21120c);
    const darts: THREE.Mesh[] = [];
    for (const offset of [-0.22, 0, 0.22]) {
      const dart = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, Math.max(0.2, distance)), dartMaterial);
      dart.position.copy(start).add(new THREE.Vector3(0, offset, 0)).add(direction.clone().multiplyScalar(distance / 2));
      dart.lookAt(start.clone().add(direction));
      this.scene.add(dart);
      darts.push(dart);
    }
    this.audio.tone(190, 0.11, "sawtooth", 0.08);
    this.lifecycleTimers.schedule(() => {
      for (const dart of darts) {
        this.scene.remove(dart);
        dart.geometry.dispose();
      }
      dartMaterial.dispose();
    }, 95);
  }

  private attack(): void {
    if (this.attackCooldown > 0 || this.blocking) return;
    if (this.remedyBlocks("ATTACK")) return;
    if (this.guardBreakTimer > 0) {
      this.feed(`ATTACK DENIED · guard broken ${this.guardBreakTimer.toFixed(1)}s`, "danger");
      return;
    }
    if (this.dodgeCooldown > 0) {
      this.feed(`ATTACK DENIED · sidestep recovery ${this.dodgeCooldown.toFixed(1)}s`, "danger");
      return;
    }
    const staminaCost = attackStaminaCost(this.options.classId, this.attackDirection);
    if (this.stamina < staminaCost) {
      this.feed(`${this.attackDirection} NEEDS ${staminaCost} STAMINA`, "danger");
      return;
    }
    if (this.options.classId === "hexbound" && this.spellCharges <= 0) {
      this.feed("Your spell memory is ash. Find the campfire.", "danger");
      return;
    }
    const cadenceTimer = this.options.classId === "ranger" ? this.quickdrawTimer : this.options.classId === "shapeshifter" ? this.wildshapeTimer : 0;
    const attackDelay = classAttackDelay(this.options.classId, this.definition.attackDelay, cadenceTimer);
    this.attackCooldown = attackDelay;
    this.swingDirection = this.attackDirection;
    this.concealmentTimer = 0;
    this.swingDuration = Math.min(0.42, attackDelay * 0.72);
    this.swingClock = this.swingDuration;
    this.stamina = Math.max(0, this.stamina - staminaCost);
    if (this.options.classId === "hexbound") this.spellCharges -= 1;
    this.pendingStrike = {
      direction: this.swingDirection,
      spellId: this.selectedSpell,
      riposteMultiplier: riposteDamageMultiplier(this.options.classId, this.riposteTimer),
      abilityDamageMultiplier: classAbilityDamageMultiplier(this.options.classId, this.options.classId === "shapeshifter" ? this.wildshapeTimer : this.rageTimer),
      impactRemaining: strikeImpactDelay(this.swingDuration),
    };
    this.mouseAccumulator.x = 0;
    this.mouseAccumulator.y = 0;
    this.audio.attack();
  }

  private resolveStrike(strike: PendingStrike): void {
    const cameraPosition = this.camera.position.clone();
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    let best: Enemy | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const toEnemy = enemy.group.position.clone().add(new THREE.Vector3(0, 1.1, 0)).sub(cameraPosition);
      const distance = toEnemy.length();
      const cone = this.options.classId === "hexbound" ? 0.965 : this.options.classId === "ranger" ? 0.975 : strike.direction === "SWEEP" ? 0.72 : 0.86;
      const visible = dungeonLineOfSight(
        { x: cameraPosition.x, z: cameraPosition.z },
        { x: enemy.group.position.x, z: enemy.group.position.z },
      );
      if (distance <= this.definition.reach && visible && toEnemy.normalize().dot(forward) > cone && distance < bestDistance) {
        best = enemy;
        bestDistance = distance;
      }
    }
    const ranged = this.options.classId === "hexbound" || this.options.classId === "ranger";
    if (!best && ranged) {
      this.launchPlayerProjectile(strike, cameraPosition, cameraPosition.clone().add(forward.multiplyScalar(this.definition.reach)));
      return;
    }
    if (!best) return;

    const headHeight = best.kind === "crawler" || best.kind === "mimic" ? 0.72 : best.kind === "boss" ? 2.35 : 1.82;
    const toHead = best.group.position.clone().add(new THREE.Vector3(0, headHeight, 0)).sub(cameraPosition).normalize();
    const headshot = toHead.dot(forward) > (this.options.classId === "hexbound" ? 0.992 : this.options.classId === "ranger" ? 0.988 : 0.975);
    if (ranged) {
      const impactHeight = headshot ? headHeight : best.kind === "crawler" || best.kind === "mimic" ? 0.38 : best.kind === "boss" ? 1.55 : 1.1;
      this.launchPlayerProjectile(strike, cameraPosition, best.group.position.clone().add(new THREE.Vector3(0, impactHeight, 0)));
      return;
    }
    const limbHit = !headshot && strike.direction === "SWEEP" && this.options.classId !== "hexbound" && this.options.classId !== "ranger";
    const weaponPower = equippedPower(this.options.equipped, "weapon");
    const baseDamage = attackDamage({
      baseDamage: this.definition.damage,
      weaponPower,
      progressionBonus: this.damageBonus,
      direction: strike.direction,
      ambush: this.options.classId === "cutpurse" && !best.alerted,
      headshot,
      limb: limbHit,
    });
    const spell = this.options.classId === "hexbound" ? HEX_SPELLS[strike.spellId] : undefined;
    const riposte = strike.riposteMultiplier > 1;
    if (riposte) this.riposteTimer = 0;
    const damage = Math.round(
      baseDamage
      * (best.kind === "rival" ? 1 : this.loadoutBonuses.undeadDamageMultiplier)
      * strike.abilityDamageMultiplier
      * (spell?.damageMultiplier ?? 1)
      * strike.riposteMultiplier,
    );
    const unseenStrike = this.recordUnseenStrike(best);
    this.damageEnemy(best, damage, headshot, limbHit, Boolean(spell?.cripples && !headshot), riposte, true, true, true, unseenStrike);
  }

  private launchPlayerProjectile(strike: PendingStrike, start: THREE.Vector3, end: THREE.Vector3): void {
    const kind: PlayerProjectileKind = this.options.classId === "ranger" ? "arrow" : "spell";
    const color = kind === "arrow" ? 0x8c7146 : HEX_SPELLS[strike.spellId].color;
    const projectileMaterial = material(color, kind === "arrow" ? 0x24160c : color);
    const projectile = new THREE.Mesh(
      kind === "arrow" ? new THREE.BoxGeometry(0.045, 0.045, 0.48) : new THREE.OctahedronGeometry(0.1, 0),
      projectileMaterial,
    );
    const origin = start.clone().add(new THREE.Vector3(0, -0.12, 0));
    const distance = origin.distanceTo(end);
    projectile.position.copy(origin);
    projectile.lookAt(end);
    this.scene.add(projectile);
    this.playerProjectiles.push({
      mesh: projectile,
      material: projectileMaterial,
      kind,
      start: origin,
      end: end.clone(),
      elapsed: 0,
      duration: playerProjectileDuration(distance, kind),
      strike,
    });
  }

  private updatePlayerProjectiles(delta: number): void {
    for (let index = this.playerProjectiles.length - 1; index >= 0; index -= 1) {
      const projectile = this.playerProjectiles[index]!;
      const previous = projectile.mesh.position.clone();
      projectile.elapsed = Math.min(projectile.duration, projectile.elapsed + delta);
      const position = playerProjectilePosition(projectile.start, projectile.end, projectile.elapsed, projectile.duration, projectile.kind);
      projectile.mesh.position.set(position.x, position.y, position.z);
      const nextPosition = playerProjectilePosition(projectile.start, projectile.end, projectile.elapsed + 0.02, projectile.duration, projectile.kind);
      projectile.mesh.lookAt(nextPosition.x, nextPosition.y, nextPosition.z);
      if (!dungeonLineOfSight({ x: previous.x, z: previous.z }, position, 0.04)) {
        this.removePlayerProjectile(index);
        continue;
      }
      const enemy = this.enemies
        .filter((candidate) => candidate.alive)
        .map((candidate) => {
          const lowThreat = candidate.kind === "crawler" || candidate.kind === "mimic";
          const bodyHeight = lowThreat ? 0.36 : candidate.kind === "boss" ? 1.45 : 1.05;
          const headHeight = lowThreat ? 0.72 : candidate.kind === "boss" ? 2.35 : 1.82;
          const body = candidate.group.position.clone().add(new THREE.Vector3(0, bodyHeight, 0));
          const head = candidate.group.position.clone().add(new THREE.Vector3(0, headHeight, 0));
          const headHit = projectileSegmentConnects(previous, position, head, lowThreat ? 0.2 : candidate.kind === "boss" ? 0.38 : 0.3);
          const bodyHit = projectileSegmentConnects(previous, position, body, lowThreat ? 0.42 : candidate.kind === "boss" ? 0.78 : 0.54);
          return { enemy: candidate, distance: previous.distanceToSquared(candidate.group.position), headHit, bodyHit };
        })
        .filter(({ headHit, bodyHit }) => headHit || bodyHit)
        .sort((left, right) => left.distance - right.distance)[0];
      if (enemy) {
        const headshot = enemy.headHit;
        this.removePlayerProjectile(index);
        this.resolvePlayerProjectileHit(projectile, enemy.enemy, headshot);
        continue;
      }
      if (projectile.elapsed >= projectile.duration) this.removePlayerProjectile(index);
    }
  }

  private resolvePlayerProjectileHit(projectile: PlayerProjectile, enemy: Enemy, headshot: boolean): void {
    const weaponPower = equippedPower(this.options.equipped, "weapon");
    const baseDamage = attackDamage({
      baseDamage: this.definition.damage,
      weaponPower,
      progressionBonus: this.damageBonus,
      direction: projectile.strike.direction,
      ambush: false,
      headshot,
    });
    const spell = projectile.kind === "spell" ? HEX_SPELLS[projectile.strike.spellId] : undefined;
    const riposte = projectile.strike.riposteMultiplier > 1;
    const damage = Math.round(
      baseDamage
      * (enemy.kind === "rival" ? 1 : this.loadoutBonuses.undeadDamageMultiplier)
      * projectile.strike.abilityDamageMultiplier
      * (spell?.damageMultiplier ?? 1)
      * projectile.strike.riposteMultiplier,
    );
    const unseenStrike = this.recordUnseenStrike(enemy);
    this.damageEnemy(enemy, damage, headshot, false, Boolean(spell?.cripples && !headshot), riposte, true, true, true, unseenStrike);
  }

  private removePlayerProjectile(index: number): void {
    const [projectile] = this.playerProjectiles.splice(index, 1);
    if (!projectile) return;
    this.scene.remove(projectile.mesh);
    projectile.mesh.geometry.dispose();
    projectile.material.dispose();
  }

  private clearPlayerProjectiles(): void {
    while (this.playerProjectiles.length) this.removePlayerProjectile(this.playerProjectiles.length - 1);
  }

  private spawnRivalKnife(enemy: Enemy): void {
    const start = enemy.group.position.clone().add(new THREE.Vector3(0, 1.25, 0));
    const end = this.camera.position.clone().add(new THREE.Vector3(0, -0.2, 0));
    const distance = start.distanceTo(end);
    const knifeMaterial = material(0xa59b8d, 0x3b2921);
    const knife = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.065, Math.max(0.2, distance)), knifeMaterial);
    knife.position.copy(start).lerp(end, 0.5);
    knife.lookAt(end);
    this.scene.add(knife);
    this.lifecycleTimers.schedule(() => {
      this.scene.remove(knife);
      knife.geometry.dispose();
      knifeMaterial.dispose();
    }, 95);
  }

  private spawnBossChain(enemy: Enemy): void {
    const start = enemy.group.position.clone().add(new THREE.Vector3(0, 1.35, 0));
    const end = this.camera.position.clone().add(new THREE.Vector3(0, -0.28, 0));
    const distance = start.distanceTo(end);
    const chainMaterial = material(0x796554, 0x301712);
    const chain = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, Math.max(0.3, distance)), chainMaterial);
    chain.position.copy(start).lerp(end, 0.5);
    chain.lookAt(end);
    this.scene.add(chain);
    this.lifecycleTimers.schedule(() => {
      this.scene.remove(chain);
      chain.geometry.dispose();
      chainMaterial.dispose();
    }, 130);
  }

  private damageEnemy(
    enemy: Enemy,
    amount: number,
    headshot: boolean,
    limbHit: boolean,
    forcedCripple = false,
    riposte = false,
    credited = true,
    alertPlayer = true,
    announce = true,
    unseenStrike = false,
  ): void {
    enemy.hp -= amount;
    if (alertPlayer) enemy.alerted = true;
    enemy.stagger = 0.18;
    if (enemy.kind === "rival") {
      enemy.extractProgress = 0;
      enemy.extractAnnounced = false;
    }
    if (enemy.kind !== "boss" && enemy.windup > 0) {
      enemy.windup = 0;
      enemy.windupFacing = undefined;
      enemy.cooldown = Math.max(enemy.cooldown, 0.45);
    }
    if (announce) this.audio.hit();
    const crippledNow = (limbHit || forcedCripple) && enemy.kind !== "boss" && !enemy.crippled;
    if (crippledNow) {
      enemy.crippled = true;
      enemy.speed *= 0.72;
    }
    if (announce) this.feed(`${unseenStrike ? "UNSEEN STRIKE · " : ""}${riposte ? "RIPOSTE · " : ""}${headshot ? "HEADSHOT · " : forcedCripple ? "FROSTBITE · " : limbHit ? "LIMB HIT · " : ""}${enemy.name} takes ${amount}.${crippledNow ? " Its stride breaks." : ""}`, enemy.kind === "rival" ? "rival" : "combat");
    enemy.group.scale.set(enemy.baseScale * 1.14, enemy.baseScale * 0.9, enemy.baseScale * 1.14);
    if (enemy.kind === "boss" && enemy.hp > 0 && enemy.hp <= enemy.maxHp / 2 && !enemy.group.userData.enraged) {
      enemy.group.userData.enraged = true;
      enemy.speed *= 1.28;
      enemy.damage = Math.round(enemy.damage * 1.2);
      enemy.cooldown = 0;
      enemy.tollCooldown = 1.8;
      if (announce) {
        this.feed("THE TOLLKEEPER ENRAGES · its chain quickens and the floor becomes a weapon", "danger");
        this.audio.tone(46, 0.6, "sawtooth", 0.16);
      }
    }
    if (enemy.hp > 0) {
      if (announce) this.showThreatVitals(enemy);
      return;
    }
    enemy.alive = false;
    if (enemy.tollRing) enemy.tollRing.visible = false;
    if (credited) {
      this.killsByKind[enemy.kind] += 1;
      if (enemy.kind === "boss") {
        this.bossKilled = true;
        if (this.depth === 1) this.revealRedDepth();
      }
      this.kills += 1;
      this.checkpointRaid();
    }
    enemy.group.rotation.z = 1.2;
    enemy.group.position.y = -0.55;
    if (announce) this.feed(`${enemy.name} falls.`, enemy.kind === "rival" ? "rival" : "loot");
    if (enemy.kind === "rival" && enemy.carriedLoot.length) {
      enemy.carriedLoot.forEach((item, index) => {
        const angle = (index / enemy.carriedLoot.length) * Math.PI * 2;
        const position = enemy.group.position.clone().add(new THREE.Vector3(Math.cos(angle) * 0.5, 0, Math.sin(angle) * 0.5));
        this.spawnPickup(item, position);
      });
      if (announce) this.feed(`RIVAL FELLED · ${enemy.carriedLoot.length} stolen relic${enemy.carriedLoot.length === 1 ? "" : "s"} recovered`, "rival");
      enemy.carriedLoot = [];
    }
    const drop = enemy.kind === "warden"
      ? createSigil()
      : enemy.kind === "boss"
        ? createBossLoot(Math.random, this.raidRules.lootDepthBonus + depthRules(this.depth).lootDepthBonus)
        : createLoot(Math.random, (enemy.kind === "rival" ? 0.12 : enemy.kind === "mimic" ? 0.18 : 0.03) + this.raidRules.lootDepthBonus + depthRules(this.depth).lootDepthBonus);
    this.spawnPickup(drop, enemy.group.position.clone());
    if (announce) this.showThreatVitals(enemy);
    if (announce && enemy.kind === "boss" && this.depth === 1) {
      this.feed("RED BREACH AWAKENED · extract with E or descend with R", "danger");
      this.audio.portal();
    }
  }

  private showThreatVitals(enemy: Enemy): void {
    this.threatTimer = enemy.alive ? 3.2 : 2;
    this.threatNameHud.textContent = enemy.name.toUpperCase();
    this.threatHealthFill.style.width = `${healthPercent(enemy.hp, enemy.maxHp)}%`;
    this.threatStateHud.textContent = !enemy.alive
      ? "FELLED"
      : enemy.kind === "boss"
        ? enemy.tollWindup > 0
          ? this.depth === 2 ? "KEEPER · ASH RING" : "KEEPER · CHAIN RING"
          : bossRingActive(this.depth, Boolean(enemy.group.userData.enraged))
            ? this.depth === 2 ? "KEEPER · ASHEN" : "KEEPER · ENRAGED"
            : "KEEPER"
        : enemy.kind === "rival"
          ? enemy.extractProgress > 0
            ? `EXTRACTING · ${Math.round((enemy.extractProgress / RIVAL_EXTRACTION_SECONDS) * 100)}%`
            : `${enemy.rivalArchetype === "marauder" ? "HOSTILE MARAUDER" : "HOSTILE SKIRMISHER"}${enemy.crippled ? " · CRIPPLED" : ""}`
          : enemy.crippled ? "CRYPT THREAT · CRIPPLED" : "CRYPT THREAT";
    this.threatHud.dataset.kind = enemy.kind;
    this.threatHud.classList.add("visible");
  }

  private checkpointRaid(): void {
    const saved = this.options.onCheckpoint?.(this.depth, this.kills, { ...this.killsByKind }, this.unseenStrikes) ?? true;
    this.journalHud.textContent = saved ? "journal secure" : "journal write failed · do not refresh";
    this.journalHud.classList.toggle("failed", !saved);
  }

  private recordUnseenStrike(enemy: Enemy): boolean {
    if (!markUnseenStrike(this.markedUnseenThreats, enemy)) return false;
    this.unseenStrikes += 1;
    this.updateStealthProgress();
    this.checkpointRaid();
    return true;
  }

  private updateEnemies(delta: number): void {
    const player = this.camera.position;
    for (const enemy of this.enemies) {
      if (this.ended) return;
      if (!enemy.alive) continue;
      enemy.cooldown = Math.max(0, enemy.cooldown - delta);
      enemy.stagger = Math.max(0, enemy.stagger - delta);
      enemy.pathTimer = Math.max(0, enemy.pathTimer - delta);
      enemy.tollCooldown = Math.max(0, enemy.tollCooldown - delta);
      enemy.group.scale.set(
        THREE.MathUtils.lerp(enemy.group.scale.x, enemy.baseScale, delta * 7),
        THREE.MathUtils.lerp(enemy.group.scale.y, enemy.baseScale, delta * 7),
        THREE.MathUtils.lerp(enemy.group.scale.z, enemy.baseScale, delta * 7),
      );
      enemy.group.rotation.x = THREE.MathUtils.lerp(enemy.group.rotation.x, 0, delta * 8);
      if (enemy.kind === "rival" && this.updateRivalExtraction(enemy, delta)) continue;
      const toPlayerX = player.x - enemy.group.position.x;
      const toPlayerZ = player.z - enemy.group.position.z;
      const distance = Math.hypot(toPlayerX, toPlayerZ);
      const awareness = passiveAwarenessRange(
        this.torchLit,
        this.crouching,
        this.sprinting,
        this.moving,
        equippedPower(this.options.equipped, "armor"),
      );
      if (this.phaseElapsed() >= depthRules(this.depth).spawnGrace && this.concealmentTimer <= 0 && distance < awareness && dungeonLineOfSight(
        { x: player.x, z: player.z },
        { x: enemy.group.position.x, z: enemy.group.position.z },
      )) enemy.alerted = true;
      if (!enemy.alerted && enemy.kind === "rival" && this.updateRivalSkirmish(enemy, delta)) continue;
      if (!enemy.alerted && enemy.kind === "rival" && this.updateRivalScavenging(enemy, delta)) continue;
      if (!enemy.alerted) {
        enemy.group.rotation.y += Math.sin(this.elapsed * 0.35 + enemy.phase) * delta * 0.15;
        continue;
      }
      if (distance > 15) {
        enemy.windup = 0;
        enemy.windupFacing = undefined;
        continue;
      }
      const hasSight = dungeonLineOfSight(
        { x: player.x, z: player.z },
        { x: enemy.group.position.x, z: enemy.group.position.z },
        0.12,
      );
      if (enemy.kind === "boss" && bossRingActive(this.depth, Boolean(enemy.group.userData.enraged))) {
        if (enemy.tollWindup > 0) {
          enemy.tollWindup = Math.max(0, enemy.tollWindup - delta);
          const progress = 1 - enemy.tollWindup / enemy.tollWindupDuration;
          if (enemy.tollRing) {
            enemy.tollRing.visible = true;
            enemy.tollRing.material.opacity = 0.08 + progress * 0.28;
          }
          this.showThreatVitals(enemy);
          if (enemy.tollWindup === 0) {
            this.resolveBossToll(enemy, distance, hasSight);
            if (this.ended) return;
          }
          continue;
        }
        if (enemy.tollCooldown <= 0 && enemy.windup <= 0 && enemy.stagger <= 0 && hasSight && distance <= 7.2) {
          enemy.tollWindup = enemy.tollWindupDuration;
          enemy.cooldown = Math.max(enemy.cooldown, enemy.tollWindupDuration);
          if (enemy.tollRing) {
            enemy.tollRing.visible = true;
            enemy.tollRing.material.opacity = 0.08;
          }
          this.feed(`${this.depth === 2 ? "ASH RING" : "CHAIN RING"} MARKED · crowd the keeper or flee beyond the red band`, "danger");
          this.audio.tone(82, 0.36, "sawtooth", 0.11);
          continue;
        }
      }
      if (enemy.windup > 0) {
        enemy.windup = Math.max(0, enemy.windup - delta);
        const windupProgress = enemy.windupDuration > 0 ? enemy.windup / enemy.windupDuration : 0;
        enemy.group.rotation.x = -0.2 * windupProgress;
        enemy.group.scale.set(enemy.baseScale * 0.94, enemy.baseScale * 1.08, enemy.baseScale * 0.94);
        if (enemy.windup > 0) continue;

        const rangedAttack = enemy.attackStyle === "ranged";
        const pattern = enemyAttackPattern(enemy.kind, Boolean(enemy.group.userData.enraged), rangedAttack);
        enemy.cooldown = pattern.recovery;
        enemy.group.rotation.x = 0.18;
        enemy.group.scale.set(enemy.baseScale * 1.12, enemy.baseScale * 0.9, enemy.baseScale * 1.12);
        const attackRange = enemy.kind === "boss" && rangedAttack
          ? 7.2
          : enemy.kind === "rival" && enemy.attackStyle === "melee" ? 1.9 : enemy.range;
        const facingCommittedTarget = enemyStrikeFacesTarget(enemy.windupFacing, { x: toPlayerX, z: toPlayerZ }, rangedAttack);
        enemy.windupFacing = undefined;
        const missReason = enemyStrikeMissReason(distance, attackRange + 0.25, hasSight, facingCommittedTarget);
        if (missReason) {
          const defense = missReason === "cover" ? "COVER HELD" : missReason === "evaded" ? "EVADED" : "OUTRANGED";
          this.feed(`${defense} · ${enemy.name}'s committed strike misses`, "system");
          continue;
        }

        if (enemy.kind === "rival" && enemy.attackStyle === "ranged") this.spawnRivalKnife(enemy);
        if (enemy.kind === "boss" && rangedAttack) this.spawnBossChain(enemy);
        const guardFacing = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        const facingThreat = guardFacesThreat(
          { x: guardFacing.x, z: guardFacing.z },
          { x: enemy.group.position.x - player.x, z: enemy.group.position.z - player.z },
        );
        const guardingAttack = this.blocking && facingThreat;
        const parried = enemy.kind !== "boss" && guardingAttack && this.blockAge < 0.24;
        if (parried) {
          enemy.stagger = 1.0;
          this.drainGuard(5);
          if (riposteDamageMultiplier(this.options.classId, RIPOSTE_DURATION_SECONDS) > 1) this.riposteTimer = RIPOSTE_DURATION_SECONDS;
          this.feed(`PARRIED · ${enemy.name} is exposed${this.riposteTimer > 0 ? " · riposte ready" : ""}`, "system");
          this.audio.tone(780, 0.12, "square", 0.13);
        } else {
          const reduction = guardingAttack ? (this.options.classId === "hexbound" ? 0.45 : 0.72) : 0;
          const attackDamage = enemy.kind === "boss" && rangedAttack
            ? Math.round(enemy.damage * 0.68)
            : enemy.kind === "rival" && enemy.attackStyle === "melee" ? Math.round(enemy.damage * 0.75) : enemy.damage;
          this.hurt(attackDamage * (1 - reduction), enemy.name, true, { x: enemy.group.position.x, z: enemy.group.position.z });
          if (this.ended) return;
          if (guardingAttack) this.drainGuard(attackDamage * 0.75);
        }
        continue;
      }
      const tactic = enemy.kind === "rival" ? rivalTactic(distance, hasSight, enemy.rivalArchetype) : undefined;
      const keeperTactic = enemy.kind === "boss" ? bossTactic(distance, hasSight, Boolean(enemy.group.userData.enraged)) : undefined;
      if (tactic === "retreat" && enemy.stagger <= 0) {
        enemy.path = [];
        enemy.group.lookAt(player.x, enemy.group.position.y, player.z);
        const step = enemy.speed * 0.82 * delta;
        const retreatX = enemy.group.position.x - (toPlayerX / distance) * step;
        const retreatZ = enemy.group.position.z - (toPlayerZ / distance) * step;
        const movedX = !this.collidesEnemy(enemy, retreatX, enemy.group.position.z);
        if (movedX) enemy.group.position.x = retreatX;
        const movedZ = !this.collidesEnemy(enemy, enemy.group.position.x, retreatZ);
        if (movedZ) enemy.group.position.z = retreatZ;
        if (!movedX && !movedZ) {
          const side = enemy.id % 2 === 0 ? 1 : -1;
          const strafeX = enemy.group.position.x + (toPlayerZ / distance) * step * side;
          const strafeZ = enemy.group.position.z - (toPlayerX / distance) * step * side;
          if (!this.collidesEnemy(enemy, strafeX, enemy.group.position.z)) enemy.group.position.x = strafeX;
          if (!this.collidesEnemy(enemy, enemy.group.position.x, strafeZ)) enemy.group.position.z = strafeZ;
        }
        enemy.group.position.y = this.enemyStepHeight(enemy);
        continue;
      }
      if (keeperTactic === "chain" && enemy.cooldown <= 0 && enemy.stagger <= 0) {
        enemy.attackStyle = "ranged";
        enemy.group.lookAt(player.x, enemy.group.position.y, player.z);
        const pattern = enemyAttackPattern("boss", Boolean(enemy.group.userData.enraged), true);
        enemy.windup = pattern.windup;
        enemy.windupDuration = pattern.windup;
        enemy.windupFacing = { x: toPlayerX, z: toPlayerZ };
        this.feed("CHAIN LASH · break sight, retreat, or raise your guard", "danger");
        this.showDirectionalCue(enemy.group.position, "CHAIN", pattern.windup + 0.18, "warning");
        this.audio.tone(52, 0.22, "sawtooth", 0.11);
        continue;
      }
      if ((distance > enemy.range || !hasSight) && enemy.stagger <= 0) {
        if (hasSight) {
          enemy.path = [];
        } else if (enemy.pathTimer <= 0 || enemy.path.length === 0) {
          enemy.path = dungeonPath(
            { x: enemy.group.position.x, z: enemy.group.position.z },
            { x: player.x, z: player.z },
            enemy.kind === "boss" ? 0.44 : 0.3,
          );
          enemy.pathTimer = 0.65 + (enemy.id % 4) * 0.12;
        }
        while (enemy.path[0] && Math.hypot(
          enemy.path[0].x - enemy.group.position.x,
          enemy.path[0].z - enemy.group.position.z,
        ) < 0.4) enemy.path.shift();
        const waypoint = hasSight ? { x: player.x, z: player.z } : enemy.path[0];
        if (!waypoint) continue;
        const movementX = waypoint.x - enemy.group.position.x;
        const movementZ = waypoint.z - enemy.group.position.z;
        const movementLength = Math.hypot(movementX, movementZ);
        if (movementLength <= 0.001) continue;
        enemy.group.lookAt(waypoint.x, enemy.group.position.y, waypoint.z);
        const stepScale = (enemy.speed * delta) / movementLength;
        const nextX = enemy.group.position.x + movementX * stepScale;
        if (!this.collidesEnemy(enemy, nextX, enemy.group.position.z)) enemy.group.position.x = nextX;
        const nextZ = enemy.group.position.z + movementZ * stepScale;
        if (!this.collidesEnemy(enemy, enemy.group.position.x, nextZ)) enemy.group.position.z = nextZ;
        enemy.group.position.y = this.enemyStepHeight(enemy);
      } else if (enemy.cooldown <= 0 && enemy.stagger <= 0) {
        if (enemy.kind === "rival") {
          if (tactic !== "throw" && tactic !== "melee") continue;
          enemy.attackStyle = tactic === "throw" ? "ranged" : "melee";
        } else if (enemy.kind === "boss") {
          enemy.attackStyle = "melee";
        }
        enemy.group.lookAt(player.x, enemy.group.position.y, player.z);
        const pattern = enemyAttackPattern(enemy.kind, Boolean(enemy.group.userData.enraged), false);
        enemy.windup = pattern.windup;
        enemy.windupDuration = pattern.windup;
        enemy.windupFacing = { x: toPlayerX, z: toPlayerZ };
        this.showDirectionalCue(enemy.group.position, enemy.attackStyle === "ranged" ? "MISSILE" : "STRIKE", pattern.windup + 0.18, "warning");
        this.audio.tone(enemy.kind === "boss" ? 58 : 110, 0.08, "square", 0.04);
      }
    }
  }

  private resolveBossToll(enemy: Enemy, distance: number, hasSight: boolean): void {
    enemy.tollCooldown = bossRingCooldown(this.depth, Boolean(enemy.group.userData.enraged));
    if (enemy.tollRing) {
      enemy.tollRing.visible = false;
      enemy.tollRing.material.opacity = 0;
    }
    this.audio.tone(42, 0.48, "square", 0.14);
    if (!bossTollHits(distance, hasSight)) {
      this.feed("CHAIN RING PASSES · safe stone holds", "system");
      return;
    }
    const guardFacing = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const facingThreat = guardFacesThreat(
      { x: guardFacing.x, z: guardFacing.z },
      { x: enemy.group.position.x - this.camera.position.x, z: enemy.group.position.z - this.camera.position.z },
    );
    const guarded = this.blocking && facingThreat;
    const damage = bossTollDamage(enemy.damage, guarded);
    this.hurt(damage, `${enemy.name}'s chain ring`, true, { x: enemy.group.position.x, z: enemy.group.position.z });
    if (this.ended) return;
    if (guarded) {
      this.drainGuard(14);
      if (this.guardBreakTimer <= 0) this.feed("CHAIN RING GUARDED · the impact drains your footing", "system");
    }
  }

  private updateRivalScavenging(enemy: Enemy, delta: number): boolean {
    let target: Pickup | undefined;
    let nearest = 8.5;
    for (const pickup of this.pickups) {
      if (pickup.collected || !canRivalScavenge(enemy.carriedLoot, pickup.item)) continue;
      const distance = Math.hypot(
        pickup.group.position.x - enemy.group.position.x,
        pickup.group.position.z - enemy.group.position.z,
      );
      if (distance >= nearest || !dungeonLineOfSight(
        { x: enemy.group.position.x, z: enemy.group.position.z },
        { x: pickup.group.position.x, z: pickup.group.position.z },
        0.12,
      )) continue;
      nearest = distance;
      target = pickup;
    }
    if (!target) return false;
    if (nearest <= 0.72) {
      target.collected = true;
      target.group.visible = false;
      enemy.carriedLoot.push(target.item);
      const satchel = enemy.group.getObjectByName("rivalSatchel");
      if (satchel) satchel.visible = true;
      this.feed(`RIVAL SCAVENGER · ${target.item.name} taken`, "rival");
      this.audio.tone(155, 0.12, "square", 0.06);
      return true;
    }
    const movementX = target.group.position.x - enemy.group.position.x;
    const movementZ = target.group.position.z - enemy.group.position.z;
    const movementLength = Math.hypot(movementX, movementZ);
    if (movementLength <= 0.001) return true;
    enemy.group.lookAt(target.group.position.x, enemy.group.position.y, target.group.position.z);
    const stepScale = (enemy.speed * 0.72 * delta) / movementLength;
    const nextX = enemy.group.position.x + movementX * stepScale;
    if (!this.collidesEnemy(enemy, nextX, enemy.group.position.z)) enemy.group.position.x = nextX;
    const nextZ = enemy.group.position.z + movementZ * stepScale;
    if (!this.collidesEnemy(enemy, enemy.group.position.x, nextZ)) enemy.group.position.z = nextZ;
    enemy.group.position.y = this.enemyStepHeight(enemy);
    return true;
  }

  private updateRivalSkirmish(rival: Enemy, delta: number): boolean {
    let target: Enemy | undefined;
    let nearest = Number.POSITIVE_INFINITY;
    for (const candidate of this.enemies) {
      if (candidate === rival || !candidate.alive || candidate.alerted || candidate.kind === "rival" || candidate.kind === "boss") continue;
      const distance = Math.hypot(
        candidate.group.position.x - rival.group.position.x,
        candidate.group.position.z - rival.group.position.z,
      );
      if (distance >= nearest || rivalDungeonTactic(candidate.kind, distance, dungeonLineOfSight(
        { x: rival.group.position.x, z: rival.group.position.z },
        { x: candidate.group.position.x, z: candidate.group.position.z },
        0.12,
      )) === "ignore") continue;
      nearest = distance;
      target = candidate;
    }
    if (!target) return false;
    const tactic = rivalDungeonTactic(target.kind, nearest, true);
    rival.group.lookAt(target.group.position.x, rival.group.position.y, target.group.position.z);
    if (tactic === "approach") {
      const movementX = target.group.position.x - rival.group.position.x;
      const movementZ = target.group.position.z - rival.group.position.z;
      const movementLength = Math.hypot(movementX, movementZ);
      const stepScale = movementLength > 0.001 ? (rival.speed * 0.72 * delta) / movementLength : 0;
      const nextX = rival.group.position.x + movementX * stepScale;
      if (!this.collidesEnemy(rival, nextX, rival.group.position.z)) rival.group.position.x = nextX;
      const nextZ = rival.group.position.z + movementZ * stepScale;
      if (!this.collidesEnemy(rival, rival.group.position.x, nextZ)) rival.group.position.z = nextZ;
      rival.group.position.y = this.enemyStepHeight(rival);
      return true;
    }
    if (tactic !== "clash") return false;
    target.group.lookAt(rival.group.position.x, target.group.position.y, rival.group.position.z);
    const rivalReady = rival.cooldown <= 0 && rival.stagger <= 0;
    const threatReady = target.cooldown <= 0 && target.stagger <= 0;
    if (rivalReady) {
      rival.cooldown = enemyAttackPattern("rival").recovery;
      rival.group.scale.set(rival.baseScale * 1.1, rival.baseScale * 0.92, rival.baseScale * 1.1);
      this.damageEnemy(target, dungeonCrossfireDamage(rival.damage, target.kind), false, false, false, false, false, false, false);
    }
    if (threatReady && target.alive && rival.alive) {
      target.cooldown = enemyAttackPattern(target.kind).recovery;
      target.group.scale.set(target.baseScale * 1.1, target.baseScale * 0.92, target.baseScale * 1.1);
      this.damageEnemy(rival, dungeonCrossfireDamage(target.damage, "rival"), false, false, false, false, false, false, false);
    }
    return true;
  }

  private updateRivalExtraction(enemy: Enemy, delta: number): boolean {
    if (!rivalShouldExtract(this.portalUnlocked, enemy.carriedLoot)) {
      enemy.extractProgress = 0;
      enemy.extractAnnounced = false;
      return false;
    }
    const distance = Math.hypot(
      this.portal.position.x - enemy.group.position.x,
      this.portal.position.z - enemy.group.position.z,
    );
    const atPassage = distance <= 1.45 && dungeonLineOfSight(
      { x: enemy.group.position.x, z: enemy.group.position.z },
      { x: this.portal.position.x, z: this.portal.position.z },
      0.12,
    );
    if (atPassage && enemy.stagger <= 0) {
      enemy.path = [];
      enemy.group.lookAt(this.portal.position.x, enemy.group.position.y, this.portal.position.z);
      if (!enemy.extractAnnounced) {
        enemy.extractAnnounced = true;
        this.feed(`RIVAL OPENING PASSAGE · stop them or lose ${enemy.carriedLoot.length} stolen relic${enemy.carriedLoot.length === 1 ? "" : "s"}`, "rival");
        this.showDirectionalCue(enemy.group.position, "RIVAL EXIT", RIVAL_EXTRACTION_SECONDS, "warning");
        this.audio.tone(235, 0.22, "square", 0.09);
      }
      enemy.extractProgress = advanceRivalExtraction(enemy.extractProgress, delta, true);
      this.showThreatVitals(enemy);
      if (enemy.extractProgress >= RIVAL_EXTRACTION_SECONDS) {
        const stolen = enemy.carriedLoot.length;
        enemy.carriedLoot = [];
        enemy.alive = false;
        enemy.group.visible = false;
        this.feed(`RIVAL EXTRACTED · ${stolen} stolen relic${stolen === 1 ? " is" : "s are"} gone`, "rival");
        this.audio.portal();
      }
      return true;
    }
    enemy.extractProgress = advanceRivalExtraction(enemy.extractProgress, delta, false);
    enemy.extractAnnounced = false;
    if (enemy.stagger > 0) return true;
    if (enemy.pathTimer <= 0 || enemy.path.length === 0) {
      enemy.path = dungeonPath(
        { x: enemy.group.position.x, z: enemy.group.position.z },
        { x: this.portal.position.x, z: this.portal.position.z },
        0.3,
      );
      enemy.pathTimer = 0.45;
    }
    while (enemy.path[0] && Math.hypot(
      enemy.path[0].x - enemy.group.position.x,
      enemy.path[0].z - enemy.group.position.z,
    ) < 0.4) enemy.path.shift();
    const waypoint = enemy.path[0] ?? this.portal.position;
    const movementX = waypoint.x - enemy.group.position.x;
    const movementZ = waypoint.z - enemy.group.position.z;
    const movementLength = Math.hypot(movementX, movementZ);
    if (movementLength <= 0.001) return true;
    enemy.group.lookAt(waypoint.x, enemy.group.position.y, waypoint.z);
    const stepScale = (enemy.speed * 0.92 * delta) / movementLength;
    const nextX = enemy.group.position.x + movementX * stepScale;
    if (!this.collidesEnemy(enemy, nextX, enemy.group.position.z)) enemy.group.position.x = nextX;
    const nextZ = enemy.group.position.z + movementZ * stepScale;
    if (!this.collidesEnemy(enemy, enemy.group.position.x, nextZ)) enemy.group.position.z = nextZ;
    enemy.group.position.y = this.enemyStepHeight(enemy);
    return true;
  }

  private collidesEnemy(movingEnemy: Enemy, x: number, z: number): boolean {
    const radius = movingEnemy.kind === "boss" ? 0.44 : 0.3;
    if (this.walls.some((wall) => Math.abs(x - wall.x) < wall.halfW + radius && Math.abs(z - wall.z) < wall.halfD + radius)) return true;
    return this.enemies.some((other) =>
      other !== movingEnemy &&
      other.alive &&
      circlesOverlap(
        { x, z },
        radius,
        { x: other.group.position.x, z: other.group.position.z },
        other.kind === "boss" ? 0.44 : 0.3,
      ),
    );
  }

  private enemyStepHeight(enemy: Enemy): number {
    return this.options.preferences.reducedMotion ? 0 : Math.sin(this.elapsed * 7 + enemy.phase) * 0.025;
  }

  private hurt(amount: number, source: string, physical = true, sourcePosition?: Vec2, independentPulse = false): void {
    if ((!independentPulse && this.damageCooldown > 0) || this.ended) return;
    const channelBroken = this.interactionHold > 0;
    const remedyInterrupted = Boolean(this.remedyItemId);
    if (!independentPulse) this.damageCooldown = 0.18;
    if (channelBroken) {
      this.resetInteractionChannel();
      this.interactHeld = false;
      this.descendHeld = false;
    }
    if (remedyInterrupted) this.resetRemedyUse();
    const appliedDamage = physicalDamageAfterArmor(amount, physical ? this.loadoutBonuses.armor : 0);
    this.health = Math.max(0, this.health - appliedDamage);
    this.vignette = 1;
    this.damageOverlay.classList.remove("pulse");
    void this.damageOverlay.offsetWidth;
    this.damageOverlay.classList.add("pulse");
    if (sourcePosition) this.showDirectionalCue(sourcePosition, "IMPACT", 1.15, "impact");
    this.audio.danger();
    this.feed(`${source} wounds you for ${Math.round(appliedDamage)}.${channelBroken ? " CHANNEL BROKEN." : ""}${remedyInterrupted ? " REMEDY INTERRUPTED." : ""}`, "danger");
    if (this.health <= 0) this.finish(source === "the dark" ? "darkness" : "slain");
  }

  private drainGuard(amount: number): void {
    const safeAmount = Number.isFinite(amount) ? Math.max(0, amount) : 0;
    this.stamina = Math.max(0, this.stamina - safeAmount);
    if (this.stamina > 0 || !this.blocking) return;
    this.blocking = false;
    this.blockAge = 0;
    this.guardBreakTimer = guardBreakDuration(this.options.classId);
    this.feed(`GUARD BROKEN · ${this.guardBreakTimer.toFixed(1)}s stagger`, "danger");
    this.audio.tone(72, 0.24, "sawtooth", 0.1);
  }

  private showDirectionalCue(sourcePosition: Vec2, label: string, duration: number, phase: "warning" | "impact"): void {
    if (phase === "warning" && this.damageDirectionHud.dataset.phase === "impact" && this.damageDirectionTimer > 0.35) return;
    const cue = directionalCue(
      this.yaw,
      { x: this.camera.position.x, z: this.camera.position.z },
      sourcePosition,
      label,
    );
    this.damageDirectionHud.textContent = cue.text;
    this.damageDirectionHud.dataset.direction = cue.direction.toLowerCase();
    this.damageDirectionHud.dataset.phase = phase;
    this.damageDirectionTimer = Math.max(0.1, Number.isFinite(duration) ? duration : 0.1);
    this.damageDirectionHud.classList.add("visible");
  }

  private useConsumable(): void {
    if (this.paused || this.ended) return;
    if (this.remedyBlocks("REMEDY")) return;
    if (this.blocking || delverRecoveryActive(this.attackCooldown, this.swingClock, this.dodgeCooldown, this.guardBreakTimer, false) || this.interactionHold > 0) {
      this.feed("REMEDY BLOCKED · free your hands and recover first", "system");
      return;
    }
    const items = this.availableConsumables();
    this.selectedConsumableId = resolveConsumableId(items, this.selectedConsumableId);
    const selected = items.find((item) => item.id === this.selectedConsumableId);
    if (!selected) {
      this.feed("No remedy in your unsecured haul.", "danger");
      return;
    }
    if (!this.consumableCanBenefit(selected)) {
      this.feed(`${selected.name} cannot restore anything right now. Press C to choose another remedy.`, "system");
      return;
    }
    this.remedyItemId = selected.id;
    this.remedyName = selected.name;
    this.remedyTimer = Math.max(0.2, consumableUseDuration(selected) * this.loadoutBonuses.interactionDurationMultiplier);
    this.concealmentTimer = 0;
    this.feed(`TREATING · ${selected.name} · ${this.remedyTimer.toFixed(1)}s`, "system");
    this.audio.tone(205, 0.08, "sine", 0.045);
  }

  private consumableCanBenefit(item: Item): boolean {
    const effect = consumableEffect(item);
    return Boolean(effect && (
      this.health < this.maxHealth ||
      (effect.stamina > 0 && this.stamina < this.definition.maxStamina) ||
      (effect.spellCharges > 0 && this.options.classId === "hexbound" && this.spellCharges < this.maxSpellCharges) ||
      (effect.torchFuel > 0 && this.torchFuel < MAX_TORCH_FUEL_SECONDS)
    ));
  }

  private completeConsumableUse(): void {
    const itemId = this.remedyItemId;
    const items = this.availableConsumables();
    const consumable = items.find((item) => item.id === itemId);
    this.resetRemedyUse();
    if (!consumable) {
      this.feed("REMEDY LOST · the treatment could not finish", "danger");
      return;
    }
    const nextId = items.length > 1 ? nextConsumableId(items, consumable.id) : undefined;
    const recoveredIndex = this.raidLoot.findIndex((item) => item.id === consumable.id && item.kind === "consumable");
    const packedIndex = recoveredIndex >= 0 ? -1 : this.carriedConsumables.findIndex((item) => item.id === consumable.id);
    const recovered = recoveredIndex >= 0 ? this.raidLoot.splice(recoveredIndex, 1)[0] : undefined;
    const packed = packedIndex >= 0 ? this.carriedConsumables.splice(packedIndex, 1)[0] : undefined;
    const spent = recovered ?? packed;
    if (!spent) return;
    this.selectedConsumableId = nextId;
    if (packed) this.consumedIds.push(packed.id);
    const effect = consumableEffect(spent);
    if (!effect) return;
    this.health = Math.min(this.maxHealth, this.health + effect.health);
    this.stamina = Math.min(this.definition.maxStamina, this.stamina + effect.stamina);
    if (this.options.classId === "hexbound") this.spellCharges = Math.min(this.maxSpellCharges, this.spellCharges + effect.spellCharges);
    if (effect.torchFuel > 0) {
      this.torchFuel = addTorchFuel(this.torchFuel, effect.torchFuel);
      this.torchLit = true;
      this.delverTorch.intensity = 5.2;
    }
    this.feed(`${spent.name} · ${effect.description.toLowerCase()}.`, "loot");
    this.audio.loot();
  }

  private resetRemedyUse(): void {
    this.remedyItemId = undefined;
    this.remedyName = "";
    this.remedyTimer = 0;
  }

  private remedyBlocks(action: string): boolean {
    if (!this.remedyItemId) return false;
    this.feed(`${action} BLOCKED · treating ${this.remedyName} · ${this.remedyTimer.toFixed(1)}s`, "system");
    return true;
  }

  private occupiedHandsBlock(action: string): boolean {
    const lock = delverActionLock(this.blocking, this.attackCooldown, this.dodgeCooldown, this.guardBreakTimer, this.interactionHold);
    if (!lock) return false;
    const reason = lock === "guard_broken"
      ? `guard broken ${this.guardBreakTimer.toFixed(1)}s`
      : lock === "guarding"
        ? "lower your guard"
        : lock === "action_recovery"
          ? `action recovery ${this.attackCooldown.toFixed(1)}s`
          : lock === "sidestep_recovery"
            ? `sidestep recovery ${this.dodgeCooldown.toFixed(1)}s`
            : "finish or release the ritual";
    this.feed(`${action} BLOCKED · ${reason}`, "system");
    return true;
  }

  private availableConsumables(): Item[] {
    return consumablesInUseOrder(this.raidLoot, this.carriedConsumables);
  }

  private cycleConsumable(): void {
    if (this.remedyBlocks("REMEDY")) return;
    const items = this.availableConsumables();
    this.selectedConsumableId = nextConsumableId(items, this.selectedConsumableId);
    const selected = items.find((item) => item.id === this.selectedConsumableId);
    this.feed(selected ? `Remedy readied · ${selected.name}` : "No remedy to ready.", selected ? "system" : "danger");
  }

  private throwItem(): void {
    if (this.paused || this.ended) return;
    if (this.remedyBlocks("THROW")) return;
    if (this.occupiedHandsBlock("THROW")) return;
    const items = this.availableThrowables();
    this.selectedThrowableId = resolveThrowableId(items, this.selectedThrowableId);
    const selected = items.find((item) => item.id === this.selectedThrowableId);
    if (!selected) {
      this.feed("No throwing weapon in your unsecured haul.", "danger");
      return;
    }
    const nextId = items.length > 1 ? nextThrowableId(items, selected.id) : undefined;
    const recoveredIndex = this.raidLoot.findIndex((item) => item.id === selected.id && item.kind === "throwable");
    const packedIndex = recoveredIndex >= 0 ? -1 : this.carriedThrowables.findIndex((item) => item.id === selected.id);
    const recovered = recoveredIndex >= 0 ? this.raidLoot.splice(recoveredIndex, 1)[0] : undefined;
    const packed = packedIndex >= 0 ? this.carriedThrowables.splice(packedIndex, 1)[0] : undefined;
    const thrown = recovered ?? packed;
    if (!thrown) return;
    this.selectedThrowableId = nextId;
    if (packed) this.consumedIds.push(packed.id);
    this.attackCooldown = 0.45;
    this.concealmentTimer = 0;
    this.audio.attack();

    const cameraPosition = this.camera.position.clone();
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    let best: Enemy | undefined;
    let bestDistance = 10;
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const targetHeight = enemy.kind === "crawler" || enemy.kind === "mimic" ? 0.72 : enemy.kind === "boss" ? 1.55 : 1.12;
      const toEnemy = enemy.group.position.clone().add(new THREE.Vector3(0, targetHeight, 0)).sub(cameraPosition);
      const distance = toEnemy.length();
      const visible = dungeonLineOfSight(
        { x: cameraPosition.x, z: cameraPosition.z },
        { x: enemy.group.position.x, z: enemy.group.position.z },
        0.12,
      );
      if (distance <= bestDistance && visible && toEnemy.normalize().dot(forward) > 0.978) {
        best = enemy;
        bestDistance = distance;
      }
    }
    this.spawnThrowableTrail(cameraPosition, forward, bestDistance);
    if (!best) {
      this.feed(`${thrown.name} vanishes into the dark.`, "system");
      return;
    }

    const headHeight = best.kind === "crawler" || best.kind === "mimic" ? 0.72 : best.kind === "boss" ? 2.35 : 1.82;
    const toHead = best.group.position.clone().add(new THREE.Vector3(0, headHeight, 0)).sub(cameraPosition).normalize();
    const headshot = toHead.dot(forward) > 0.991;
    const damage = Math.round(
      throwableDamage(thrown)
      * (headshot ? 1.35 : 1)
      * (best.kind === "rival" ? 1 : this.loadoutBonuses.undeadDamageMultiplier),
    );
    const unseenStrike = this.recordUnseenStrike(best);
    this.damageEnemy(best, damage, headshot, false, false, false, true, true, true, unseenStrike);
  }

  private availableThrowables(): Item[] {
    return throwablesInUseOrder(this.raidLoot, this.carriedThrowables);
  }

  private cycleThrowable(): void {
    if (this.remedyBlocks("THROW")) return;
    const items = this.availableThrowables();
    this.selectedThrowableId = nextThrowableId(items, this.selectedThrowableId);
    const selected = items.find((item) => item.id === this.selectedThrowableId);
    this.feed(selected ? `Throw readied · ${selected.name} · ${throwableDamage(selected)} damage` : "No throwing weapon to ready.", selected ? "system" : "danger");
  }

  private spawnThrowableTrail(start: THREE.Vector3, forward: THREE.Vector3, distance: number): void {
    const knifeMaterial = material(0xb7aea1, 0x34231d);
    const knife = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.055, Math.max(0.3, distance)), knifeMaterial);
    knife.position.copy(start).add(forward.clone().multiplyScalar(distance / 2));
    knife.quaternion.copy(this.camera.quaternion);
    this.scene.add(knife);
    this.lifecycleTimers.schedule(() => {
      this.scene.remove(knife);
      knife.geometry.dispose();
      knifeMaterial.dispose();
    }, 85);
  }

  private useClassAbility(): void {
    if (this.remedyBlocks("ABILITY")) return;
    if (this.occupiedHandsBlock("ABILITY")) return;
    if (this.abilityCooldown > 0) {
      this.feed(`${CLASS_ABILITIES[this.options.classId].name} returns in ${Math.ceil(this.abilityCooldown)}s.`, "system");
      return;
    }
    const ability = CLASS_ABILITIES[this.options.classId];
    if (this.options.classId === "vanguard") {
      if (this.health >= this.maxHealth && this.stamina >= this.definition.maxStamina) {
        this.feed("Iron rally is already at full strength.", "system");
        return;
      }
      this.health = Math.min(this.maxHealth, this.health + 18);
      this.stamina = Math.min(this.definition.maxStamina, this.stamina + 45);
      this.feed("IRON RALLY · vigor and stamina restored", "system");
    } else if (this.options.classId === "cutpurse") {
      this.concealmentTimer = 4;
      for (const enemy of this.enemies) {
        if (!enemy.alive || enemy.group.position.distanceTo(this.camera.position) <= 3.5) continue;
        enemy.alerted = false;
        enemy.windup = 0;
        enemy.path = [];
      }
      this.feed("SMOKE STEP · distant pursuit loses your trail", "system");
    } else if (this.options.classId === "hexbound") {
      if (this.spellCharges >= this.maxSpellCharges) {
        this.feed("Spell memory is already full.", "system");
        return;
      }
      if (this.health <= 12) {
        this.feed("Blood memory demands more vigor than remains.", "danger");
        return;
      }
      this.health -= 12;
      this.vignette = Math.max(this.vignette, 0.48);
      this.spellCharges = Math.min(this.maxSpellCharges, this.spellCharges + 2);
      this.feed("BLOOD MEMORY · two ash charges return", "danger");
    } else if (this.options.classId === "reaver") {
      if (this.health <= 12) {
        this.feed("Blood rage demands more vigor than remains.", "danger");
        return;
      }
      this.health -= 12;
      this.vignette = Math.max(this.vignette, 0.65);
      this.rageTimer = 6;
      this.feed("BLOOD RAGE · strike damage surges for 6s", "danger");
    } else if (this.options.classId === "ranger") {
      this.quickdrawTimer = 7;
      this.feed("QUICKDRAW · arrow cadence surges for 7s", "system");
    } else if (this.options.classId === "shapeshifter") {
      this.wildshapeTimer = 8;
      this.stamina = Math.min(this.definition.maxStamina, this.stamina + 20);
      this.feed("WILDSHAPE · claw, cadence, and stride surge for 8s", "system");
    } else if (this.options.classId === "cleric") {
      const nearby = this.enemies.filter((enemy) =>
        enemy.alive &&
        sanctuaryDamage(enemy.kind) > 0 &&
        enemy.group.position.distanceTo(this.camera.position) <= 5 &&
        dungeonLineOfSight(
          { x: this.camera.position.x, z: this.camera.position.z },
          { x: enemy.group.position.x, z: enemy.group.position.z },
          0.12,
        ),
      );
      if (nearby.length === 0 && this.health >= this.maxHealth && this.stamina >= this.definition.maxStamina) {
        this.feed("Sanctuary finds neither wound nor nearby crypt thing.", "system");
        return;
      }
      this.health = Math.min(this.maxHealth, this.health + 22);
      this.stamina = Math.min(this.definition.maxStamina, this.stamina + 20);
      for (const enemy of [...nearby]) this.damageEnemy(enemy, sanctuaryDamage(enemy.kind), false, false);
      this.feed(`SANCTUARY · restored${nearby.length ? ` · ${nearby.length} threat${nearby.length === 1 ? "" : "s"} seared` : ""}`, "system");
    } else {
      const nearby = this.enemies.filter((enemy) =>
        enemy.alive &&
        enemy.group.position.distanceTo(this.camera.position) <= 6.5 &&
        dungeonLineOfSight(
          { x: this.camera.position.x, z: this.camera.position.z },
          { x: enemy.group.position.x, z: enemy.group.position.z },
          0.12,
        ),
      );
      if (nearby.length === 0 && this.stamina >= this.definition.maxStamina) {
        this.feed("Rousing discord finds neither pursuit nor lost breath.", "system");
        return;
      }
      this.stamina = Math.min(this.definition.maxStamina, this.stamina + 30);
      for (const enemy of nearby) {
        enemy.alerted = true;
        enemy.windup = 0;
        enemy.cooldown = Math.max(enemy.cooldown, 0.8);
        enemy.stagger = Math.max(enemy.stagger, minstrelStagger(enemy.kind));
      }
      this.feed(`ROUSING DISCORD · breath restored${nearby.length ? ` · ${nearby.length} threat${nearby.length === 1 ? "" : "s"} staggered` : ""}`, "system");
    }
    this.abilityCooldown = ability.cooldown;
    this.audio.portal();
  }

  private updateZone(_delta: number): void {
    const floorRules = depthRules(this.depth);
    const floorElapsed = this.phaseElapsed();
    const zone = zoneState(floorElapsed, floorRules.duration, this.portalSite);
    const distance = distanceFromZoneCenter({ x: this.camera.position.x, z: this.camera.position.z }, zone);
    const outsideDistance = distanceOutsideZone({ x: this.camera.position.x, z: this.camera.position.z }, zone);
    const zoneCopy = this.mount.querySelector<HTMLElement>(".zone-copy");
    if (zoneCopy) {
      zoneCopy.textContent = outsideDistance > 0
        ? `DARK · ${Math.ceil(outsideDistance)}m out · ${cardinalDirection(directionToZoneCenter(this.camera.position, zone))} to safety`
        : floorElapsed < floorRules.spawnGrace
        ? `warding veil ${Math.ceil(floorRules.spawnGrace - floorElapsed)}s`
        : zone.progress === 0
          ? "darkness dormant"
          : `safe reach ${Math.round(zone.radius)}m`;
      zoneCopy.classList.toggle("outside", outsideDistance > 0);
    }
    if (!this.spawnGraceAnnounced && floorElapsed >= floorRules.spawnGrace) {
      this.spawnGraceAnnounced = true;
      this.feed("The warding veil gutters. The crypt can hear you now.", "danger");
    }
    if (distance > zone.radius) {
      this.vignette = Math.max(this.vignette, 0.68);
      if (darknessPulseReady(outsideDistance, this.darknessPulseTimer)) {
        this.darknessPulseTimer = DARKNESS_PULSE_SECONDS;
        this.hurt(5, "the dark", false, undefined, true);
      }
    } else this.darknessPulseTimer = 0;
    const shell = this.mount.querySelector<HTMLElement>(".raid-shell");
    shell?.style.setProperty("--darkness", String(Math.max(this.vignette, distance > zone.radius ? 0.85 : zone.progress * 0.26)));
  }

  private updateInteraction(delta: number): void {
    let prompt = "";
    let interactive: "pickup" | "chest" | "campfire" | "shrine" | "false_wall" | "portal" | undefined;
    let targetPickup: Pickup | undefined;
    let targetChest: Chest | undefined;
    let nearest = 2.6;
    const facing3 = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const origin = { x: this.camera.position.x, z: this.camera.position.z };
    const facing = { x: facing3.x, z: facing3.z };
    const targetDistance = (position: THREE.Vector3, maxDistance = 2.6) => targetDistanceInView(
      origin,
      facing,
      { x: position.x, z: position.z },
      maxDistance,
    );

    for (const pickup of this.pickups) {
      if (pickup.collected) continue;
      const distance = targetDistance(pickup.group.position);
      if (distance < nearest) {
        nearest = distance;
        targetPickup = pickup;
        interactive = "pickup";
      }
    }
    for (const chest of this.chests) {
      if (chest.opened) continue;
      const distance = targetDistance(chest.group.position);
      if (distance < nearest) {
        nearest = distance;
        targetChest = chest;
        interactive = "chest";
      }
    }
    const campfireDistance = targetDistance(this.campfire.position);
    if (!this.campfireUsed && campfireDistance < nearest) {
      nearest = campfireDistance;
      interactive = "campfire";
    }
    const shrineDistance = targetDistance(this.shrine.position);
    if (!this.shrineUsed && shrineDistance < nearest) {
      nearest = shrineDistance;
      interactive = "shrine";
    }
    const falseWallDistance = this.falseWallOpened ? Number.POSITIVE_INFINITY : targetDistance(this.falseWall.position, 2.35);
    if (falseWallDistance < nearest) {
      nearest = falseWallDistance;
      interactive = "false_wall";
    }
    const portalDistance = this.portalUnlocked ? targetDistance(this.portal.position, 3.1) : Number.POSITIVE_INFINITY;
    if (Number.isFinite(portalDistance) && (interactive === undefined || portalDistance < nearest)) {
      nearest = portalDistance;
      interactive = "portal";
    }

    if (interactive === "pickup" && targetPickup) prompt = canAddToHaul(this.raidLoot, targetPickup.item)
      ? `[ E ] TAKE ${targetPickup.item.rarity.toUpperCase()} ${targetPickup.item.name.toUpperCase()} · ${pickupDecision(targetPickup.item, this.options.equipped)}`
      : "HAUL FULL · [ G ] DROP THE LEAST VALUABLE ITEM";
    if (interactive === "chest") prompt = "[ E ] SEARCH IRONBOUND COFFER";
    if (interactive === "campfire") prompt = "[ HOLD E ] REST · RESTORE VIGOR AND SPELL MEMORY";
    if (interactive === "shrine") {
      const exchange = dropLeastValuable(this.raidLoot).dropped;
      prompt = `[ E ] PAY 18 VIGOR FOR TWO RELICS · [ R ] ${exchange ? `OFFER ${exchange.name.toUpperCase()} FOR ONE DEEPER ROLL` : "NEEDS ORDINARY HAUL"}`;
    }
    if (interactive === "false_wall") prompt = "[ HOLD E ] TRACE THE MORTAR SEAM";
    const redDepthAvailable = interactive === "portal" && this.depth === 1 && this.bossKilled;
    if (interactive === "portal") prompt = redDepthAvailable
      ? "[ HOLD E ] EXTRACT BLUE · [ HOLD R ] DESCEND RED"
      : "[ HOLD E ] OPEN THE BLUE PASSAGE";
    this.promptHud.textContent = prompt;
    this.promptHud.classList.toggle("visible", Boolean(prompt));

    let descending = redDepthAvailable && this.descendHeld;
    const interactTargeted = interactive === "portal" || interactive === "campfire" || interactive === "false_wall";
    const moving = this.keys.has("KeyW") || this.keys.has("KeyA") || this.keys.has("KeyS") || this.keys.has("KeyD");
    const activeTargeted = this.interactionInput === "descend" ? redDepthAvailable : interactTargeted;
    const activeInterruption = this.interactionInput ? channelInterruptionReason({
      targeted: activeTargeted,
      moving,
      guarding: this.blocking,
      recovering: delverRecoveryActive(this.attackCooldown, this.swingClock, this.dodgeCooldown, this.guardBreakTimer, Boolean(this.remedyItemId)),
      damaged: this.damageCooldown > 0,
    }) : undefined;
    if (this.interactionHold > 0 && activeInterruption) this.breakInteractionChannel(activeInterruption);

    descending = redDepthAvailable && this.descendHeld;
    const candidateInput = this.interactionInput
      ? this.interactionInput === "descend"
        ? descending ? "descend" : undefined
        : this.interactHeld && interactTargeted ? "interact" : undefined
      : descending ? "descend" : this.interactHeld && interactTargeted ? "interact" : undefined;
    const candidateInterruption = candidateInput ? channelInterruptionReason({
      targeted: true,
      moving,
      guarding: this.blocking,
      recovering: delverRecoveryActive(this.attackCooldown, this.swingClock, this.dodgeCooldown, this.guardBreakTimer, Boolean(this.remedyItemId)),
      damaged: this.damageCooldown > 0,
    }) : undefined;
    const channeling = Boolean(candidateInput && !candidateInterruption);
    if (channeling && !this.interactionInput) this.interactionInput = candidateInput;
    descending = candidateInput === "descend";
    if (candidateInput && candidateInterruption) {
      const instruction = candidateInterruption === "moving" ? "STAND STILL" : candidateInterruption === "guarding" ? "LOWER GUARD" : "WAIT FOR RECOVERY";
      this.promptHud.textContent = `${prompt} · ${instruction}`;
    }
    const channelDuration = (descending ? 2.4 : interactive === "campfire" ? 2.2 : interactive === "false_wall" ? 1.45 : 1.8) * this.loadoutBonuses.interactionDurationMultiplier;
    this.interactionHold = continuousHold(this.interactionHold, delta, channeling);
    this.extractProgress.style.width = `${Math.min(100, (this.interactionHold / channelDuration) * 100)}%`;
    this.extractProgress.parentElement?.classList.toggle("visible", channeling);

    if (!this.interactHeld && !this.descendHeld) return;
    if (interactive === "pickup" && targetPickup) {
      this.collectPickup(targetPickup);
      this.interactHeld = false;
    } else if (interactive === "chest" && targetChest) {
      this.openChest(targetChest);
      this.interactHeld = false;
    } else if (interactive === "campfire") {
      if (this.interactionHold >= channelDuration) {
        this.useCampfire();
        this.interactHeld = false;
        this.resetInteractionChannel();
      }
    } else if (interactive === "shrine") {
      this.useShrine(this.descendHeld ? "exchange" : "blood");
      this.interactHeld = false;
      this.descendHeld = false;
    } else if (interactive === "false_wall") {
      if (this.interactionHold >= channelDuration) {
        this.openFalseWall();
        this.interactHeld = false;
        this.resetInteractionChannel();
      }
    } else if (interactive === "portal") {
      if (this.interactionHold >= channelDuration) {
        if (descending) this.descendDeeper();
        else if (this.interactHeld) this.finish("extracted");
      }
    }
  }

  private resetInteractionChannel(): void {
    this.interactionHold = 0;
    this.interactionInput = undefined;
  }

  private breakInteractionChannel(reason: ChannelInterruptionReason | "released"): boolean {
    if (this.interactionHold <= 0) return false;
    const message = reason === "released"
      ? "CHANNEL RELEASED · progress lost"
      : reason === "target_lost"
        ? "CHANNEL BROKEN · face the ritual and remain close"
        : reason === "moving"
          ? "CHANNEL BROKEN · stand still"
          : reason === "guarding"
            ? "CHANNEL BROKEN · lower your guard"
            : reason === "recovering"
              ? "CHANNEL BROKEN · finish the current recovery"
              : "CHANNEL BROKEN · the wound breaks your focus";
    this.resetInteractionChannel();
    this.interactHeld = false;
    this.descendHeld = false;
    this.feed(message, reason === "released" ? "system" : "danger");
    this.audio.tone(reason === "released" ? 125 : 72, 0.12, "square", 0.07);
    return true;
  }

  private collectPickup(pickup: Pickup): void {
    if (this.occupiedHandsBlock("LOOT")) return;
    if (!canAddToHaul(this.raidLoot, pickup.item)) {
      this.feed(`HAUL FULL · drop something before taking ${pickup.item.name}`, "danger");
      return;
    }
    pickup.collected = true;
    pickup.group.visible = false;
    this.raidLoot.push(pickup.item);
    if (pickup.item.kind === "sigil") {
      this.sigils += 1;
      if (this.sigils >= 2) this.unlockPortal();
    }
    this.audio.loot();
    this.feed(`${pickup.item.rarity} ${pickup.item.name} secured for now.`, "loot");
  }

  private dropLowestHaul(): void {
    if (this.remedyBlocks("DROP")) return;
    if (this.occupiedHandsBlock("DROP")) return;
    const { kept, dropped } = dropLeastValuable(this.raidLoot);
    if (!dropped) {
      this.feed("There is no unsecured haul to drop.", "system");
      return;
    }
    this.raidLoot.splice(0, this.raidLoot.length, ...kept);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).setY(0).normalize();
    const position = this.camera.position.clone().add(forward.multiplyScalar(1.15));
    position.y = 0.55;
    this.spawnPickup(dropped, position);
    this.feed(`${dropped.name} dropped from the haul.`, "system");
  }

  private openChest(chest: Chest): void {
    if (this.occupiedHandsBlock("COFFER")) return;
    chest.opened = true;
    if (chest.mimic) {
      chest.group.visible = false;
      this.spawnEnemy("mimic", chest.group.position.x, chest.group.position.z);
      const mimic = this.enemies.at(-1);
      if (mimic) {
        mimic.alerted = true;
        mimic.cooldown = 0.35;
      }
      this.feed("THE COFFER HAS TEETH · the mimic wakes", "danger");
      this.audio.danger();
      return;
    }
    const lid = chest.group.getObjectByName("lid");
    if (lid) {
      lid.rotation.x = -1.1;
      lid.position.y = 0.65;
      lid.position.z = -0.22;
    }
    const origin = chest.group.position.clone();
    const depthBonus = chest.depthBonus + this.raidRules.lootDepthBonus + depthRules(this.depth).lootDepthBonus;
    this.spawnPickup(createLoot(Math.random, depthBonus), origin.clone().add(new THREE.Vector3(-0.45, 0, 0.7)));
    this.spawnPickup(createLoot(Math.random, depthBonus), origin.clone().add(new THREE.Vector3(0.45, 0, 0.7)));
    this.feed("The coffer coughs up two pieces.", "loot");
    this.audio.loot();
  }

  private useCampfire(): void {
    this.campfireUsed = true;
    this.health = Math.min(this.maxHealth, this.health + 52);
    this.spellCharges = this.maxSpellCharges;
    this.stamina = this.definition.maxStamina;
    this.torchFuel = MAX_TORCH_FUEL_SECONDS;
    this.torchLit = true;
    this.delverTorch.intensity = 5.2;
    for (const enemy of this.enemies) {
      if (enemy.alive && enemy.group.position.distanceTo(this.campfire.position) < 14) enemy.alerted = true;
    }
    this.feed("Memory returns. Every nearby thing heard the rest.", "system");
    this.audio.portal();
  }

  private useShrine(offering: ShrineOffering): void {
    if (this.occupiedHandsBlock("RELIQUARY")) return;
    const rules = shrineOfferingRules(offering);
    let surrendered: Item | undefined;
    if (offering === "exchange") {
      const exchange = dropLeastValuable(this.raidLoot);
      if (!exchange.dropped) {
        this.feed("The reliquary demands an ordinary piece of unsecured haul.", "danger");
        return;
      }
      surrendered = exchange.dropped;
      this.raidLoot.splice(0, this.raidLoot.length, ...exchange.kept);
    } else if (this.health <= rules.healthCost || this.damageCooldown > 0) {
      this.feed("The reliquary rejects weak or freshly spilled blood.", "danger");
      return;
    }
    this.shrineUsed = true;
    if (rules.healthCost > 0) this.hurt(rules.healthCost, "the blood reliquary", false);
    const rune = this.shrine.getObjectByName("bloodRune") as THREE.Mesh | undefined;
    if (rune?.material instanceof THREE.MeshStandardMaterial) rune.material.emissiveIntensity = 0.08;
    const light = this.shrine.getObjectByName("shrineLight") as THREE.PointLight | undefined;
    if (light) light.intensity = 0;
    const origin = this.shrine.position.clone();
    const depthBonus = rules.lootDepthBonus + this.raidRules.lootDepthBonus + depthRules(this.depth).lootDepthBonus;
    for (let index = 0; index < rules.rewardCount; index += 1) {
      const z = rules.rewardCount === 1 ? 0 : index === 0 ? -0.48 : 0.48;
      this.spawnPickup(createLoot(Math.random, depthBonus), origin.clone().add(new THREE.Vector3(1, 0, z)));
    }
    for (const enemy of this.enemies) {
      if (enemy.alive && enemy.group.position.distanceTo(this.shrine.position) < rules.alertRadius) enemy.alerted = true;
    }
    this.feed(surrendered
      ? `${surrendered.name} burns away. The reliquary answers with a deeper relic.`
      : "The reliquary opens. Something in the crypt answers.", "loot");
    this.audio.portal();
  }

  private openFalseWall(): void {
    if (this.falseWallOpened) return;
    this.falseWallOpened = true;
    if (this.falseWallCollider) {
      const colliderIndex = this.walls.indexOf(this.falseWallCollider);
      if (colliderIndex >= 0) this.walls.splice(colliderIndex, 1);
      this.falseWallCollider = undefined;
    }
    this.falseWall.visible = false;
    this.resetInteractionChannel();
    for (const enemy of this.enemies) {
      if (enemy.alive && enemy.group.position.distanceTo(this.falseWall.position) < 12) enemy.alerted = true;
    }
    this.feed("FALSE STONE YIELDS · a blood-lit alcove opens", "loot");
    this.audio.portal();
  }

  private unlockPortal(): void {
    this.portalUnlocked = true;
    this.audio.portal();
    this.feed(`${this.depth === 2 ? "ASHEN" : "BLUE"} PASSAGE UNSEALED · ${this.portalSite.x < 0 ? "southwest" : "southeast"} reliquary`, "system");
    this.portalAnnounced = true;
    const portalMaterial = this.portalCore.material as THREE.MeshBasicMaterial;
    portalMaterial.opacity = 0.72;
    const light = this.portal.getObjectByName("portalLight") as THREE.PointLight | undefined;
    if (light) light.intensity = 2.8;
  }

  private revealRedDepth(): void {
    const ringMaterial = this.redDepthRing.material as THREE.MeshBasicMaterial;
    ringMaterial.opacity = 0.72;
  }

  private descendDeeper(): void {
    if (this.depth !== 1 || !this.bossKilled || !this.portalUnlocked) return;
    this.depth = 2;
    this.checkpointRaid();
    this.depthStartedAt = this.elapsed;
    this.sigils = 0;
    this.portalUnlocked = false;
    this.portalAnnounced = false;
    this.spawnGraceAnnounced = false;
    this.resetInteractionChannel();
    this.interactHeld = false;
    this.descendHeld = false;
    this.clearHeldInputs();
    this.clearPlayerProjectiles();

    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      enemy.alive = false;
      enemy.group.visible = false;
    }
    for (const pickup of this.pickups) {
      if (pickup.collected) continue;
      pickup.collected = true;
      pickup.group.visible = false;
    }
    for (const chest of this.chests) {
      chest.opened = true;
      chest.group.visible = false;
    }
    for (const trap of this.traps) {
      trap.cooldown = 0;
      trap.active = 0;
    }
    for (const trap of this.dartTraps) {
      trap.cooldown = 0;
      trap.windup = 0;
      trap.portMaterial.emissiveIntensity = 0.15;
    }

    const portalMaterial = this.portalCore.material as THREE.MeshBasicMaterial;
    portalMaterial.opacity = 0.05;
    (this.redDepthRing.material as THREE.MeshBasicMaterial).opacity = 0;
    const portalLight = this.portal.getObjectByName("portalLight") as THREE.PointLight | undefined;
    if (portalLight) portalLight.intensity = 0;

    this.camera.position.set(DUNGEON.playerStart.x, PLAYER_HEIGHT, DUNGEON.playerStart.z);
    this.yaw = 0;
    this.pitch = 0;
    this.camera.rotation.set(0, 0, 0);
    this.scene.background = new THREE.Color(0x100504);
    this.scene.fog = new THREE.FogExp2(0x150807, 0.052);
    this.renderer.setClearColor(0x100504);
    this.delverTorch.color.setHex(0xff8a55);

    for (const vent of ASH_VENTS) this.createAshVent(vent.x, vent.z, vent.delay);
    for (const enemy of ASHEN_ENEMIES) {
      const position = encounterPosition(enemy, this.encountersMirrored);
      this.spawnEnemy(enemy.kind, position.x, position.z);
    }
    for (const chest of ASHEN_CHESTS) {
      const position = encounterPosition(chest, this.encountersMirrored);
      this.createChest(position.x, position.z, chest.depthBonus, chest.mimic ?? false);
    }

    const contractLabel = this.mount.querySelector<HTMLElement>(".contract-panel .eyebrow");
    if (contractLabel) contractLabel.textContent = "ASHEN DEPTH · RED DESCENT";
    this.feed("ASHEN DEPTH · the old floor seals above you", "danger");
    this.audio.danger();
  }

  private animateWorld(delta: number): void {
    const reducedMotion = this.options.preferences.reducedMotion;
    const reducedFlashes = this.options.preferences.reducedFlashes;
    this.scene.traverse((object) => {
      if (object.userData.torchLight) {
        const light = object as THREE.PointLight;
        light.intensity = reducedFlashes ? 1.55 : 1.55 + Math.sin(this.elapsed * 13 + Number(object.userData.phase)) * 0.28;
      }
      if (object.userData.flamePhase !== undefined) {
        object.scale.y = reducedMotion ? 1 : 0.92 + Math.sin(this.elapsed * 17 + Number(object.userData.flamePhase)) * 0.17;
      }
    });
    this.pickups.forEach((pickup) => {
      if (pickup.collected) return;
      if (!reducedMotion) pickup.group.rotation.y += delta * 1.5;
      pickup.group.position.y = reducedMotion ? 0.54 : 0.54 + Math.sin(this.elapsed * 2.5 + pickup.phase) * 0.08;
    });
    if (!reducedMotion) {
      this.portal.rotation.z += delta * (this.portalUnlocked ? 0.24 : 0.035);
      this.redDepthRing.rotation.z -= delta * 0.65;
    }
    if (this.depth === 1 && this.bossKilled) {
      (this.redDepthRing.material as THREE.MeshBasicMaterial).opacity = reducedMotion || reducedFlashes ? 0.6 : 0.52 + Math.sin(this.elapsed * 4.2) * 0.18;
    }
    if (this.portalUnlocked) {
      const portalMaterial = this.portalCore.material as THREE.MeshBasicMaterial;
      portalMaterial.opacity = reducedMotion || reducedFlashes ? 0.66 : 0.58 + Math.sin(this.elapsed * 3.5) * 0.14;
      this.portal.scale.setScalar(reducedMotion ? 1 : 1 + Math.sin(this.elapsed * 2.1) * 0.025);
    }
    const swingProgress = this.swingClock > 0 ? 1 - this.swingClock / this.swingDuration : 0;
    if (this.swingClock > 0) {
      const arc = Math.sin(swingProgress * Math.PI);
      if (this.swingDirection === "OVERHEAD") this.weapon.rotation.x = -0.25 - arc * 1.25;
      if (this.swingDirection === "SWEEP") this.weapon.rotation.y = 0.05 - arc * 1.55;
      if (this.swingDirection === "THRUST") this.weapon.position.z = -1.05 - arc * 0.72;
    } else {
      this.weapon.rotation.x = THREE.MathUtils.lerp(this.weapon.rotation.x, -0.25, delta * 13);
      this.weapon.rotation.y = THREE.MathUtils.lerp(this.weapon.rotation.y, 0.05, delta * 13);
      this.weapon.position.z = THREE.MathUtils.lerp(this.weapon.position.z, -1.05, delta * 13);
    }
    this.shield.position.z = THREE.MathUtils.lerp(this.shield.position.z, this.blocking ? -0.55 : -1.1, delta * 12);
    this.shield.position.x = THREE.MathUtils.lerp(this.shield.position.x, this.blocking ? -0.18 : -0.72, delta * 12);
    const wildshapeScale = this.wildshapeTimer > 0 ? 1.14 : 1;
    this.weapon.scale.setScalar(THREE.MathUtils.lerp(this.weapon.scale.x, wildshapeScale, delta * 8));
  }

  private updateHud(): void {
    this.healthFill.style.width = `${Math.max(0, (this.health / this.maxHealth) * 100)}%`;
    this.staminaFill.style.width = `${(this.stamina / this.definition.maxStamina) * 100}%`;
    this.staminaFill.parentElement?.classList.toggle("broken", this.guardBreakTimer > 0);
    this.spellFill.style.width = `${this.options.classId === "hexbound" ? (this.spellCharges / this.maxSpellCharges) * 100 : 100}%`;
    this.spellFill.parentElement?.classList.toggle("inactive", this.options.classId !== "hexbound");
    if (this.options.classId === "hexbound") {
      const spell = HEX_SPELLS[this.selectedSpell];
      this.spellLabelHud.textContent = `MEMORY · ${spell.name.toUpperCase()}`;
      this.spellFill.style.background = `#${spell.color.toString(16).padStart(6, "0")}`;
    }
    const floorRules = depthRules(this.depth);
    const remaining = floorRules.duration - this.phaseElapsed();
    this.raidClock.textContent = formatTime(remaining);
    this.raidClock.classList.toggle("urgent", remaining < 45);
    const carried = haulCount(this.raidLoot);
    this.lootHud.textContent = `${carried} / ${HAUL_CAPACITY} slots · ${treasureGoldTotal(this.raidLoot)}g`;
    this.objectiveHud.textContent = this.portalUnlocked
      ? this.depth === 2 ? "ASHEN PASSAGE OPEN" : "BLUE PASSAGE OPEN"
      : `${this.depth === 2 ? "ASHEN" : "WARDEN"} SIGILS ${this.sigils} / 2`;
    const ability = CLASS_ABILITIES[this.options.classId];
    this.abilityHud.textContent = this.rageTimer > 0
      ? `${ability.name} · ${Math.ceil(this.rageTimer)}s RAGING`
      : this.quickdrawTimer > 0
        ? `${ability.name} · ${Math.ceil(this.quickdrawTimer)}s RAPID`
        : this.wildshapeTimer > 0
          ? `${ability.name} · ${Math.ceil(this.wildshapeTimer)}s CHANGED`
      : this.abilityCooldown > 0 ? `${ability.name} · ${Math.ceil(this.abilityCooldown)}s` : ability.name;
    const consumables = this.availableConsumables();
    this.selectedConsumableId = resolveConsumableId(consumables, this.selectedConsumableId);
    const selectedConsumable = consumables.find((item) => item.id === this.selectedConsumableId);
    this.consumableHud.textContent = this.remedyItemId
      ? `Treating ${this.remedyName} · ${this.remedyTimer.toFixed(1)}s`
      : selectedConsumable
      ? `${selectedConsumable.name} · ${consumables.length} left · C cycle`
      : "No remedy · C cycle";
    const throwables = this.availableThrowables();
    this.selectedThrowableId = resolveThrowableId(throwables, this.selectedThrowableId);
    const selectedThrowable = throwables.find((item) => item.id === this.selectedThrowableId);
    this.throwableHud.textContent = selectedThrowable
      ? `${selectedThrowable.name} · ${throwableDamage(selectedThrowable)} dmg · ${throwables.length} left · B cycle`
      : "No throwing weapon · B cycle";
    this.torchHud.textContent = `${this.torchLit ? "Hood" : "Unhood"} torch · ${Math.ceil(this.torchFuel)}s`;
    this.updateStealthProgress();
    this.updateStealthCue(Math.max(this.definition.reach, selectedThrowable ? 10 : 0));
    this.updateWayfinder();
    const strikeStamina = attackStaminaCost(this.options.classId, this.attackDirection);
    const combatOverride = this.guardBreakTimer > 0 || Boolean(this.remedyItemId) || this.attackCooldown > 0 || this.dodgeCooldown > 0 || this.riposteTimer > 0;
    const strikeExhausted = !combatOverride && this.stamina < strikeStamina;
    this.directionHud.textContent = this.guardBreakTimer > 0
      ? `GUARD BROKEN · ${this.guardBreakTimer.toFixed(1)}s`
      : this.remedyItemId
        ? `TREATING · ${this.remedyTimer.toFixed(1)}s`
      : this.pendingStrike
        ? `${this.pendingStrike.direction} COMMITTED · ${this.pendingStrike.impactRemaining.toFixed(1)}s TO IMPACT`
      : this.attackCooldown > 0
        ? `ACTION RECOVERY · ${this.attackCooldown.toFixed(1)}s · GUARD LOCKED`
      : this.dodgeCooldown > 0
        ? `SIDESTEP RECOVERY · ${this.dodgeCooldown.toFixed(1)}s · HANDS LOCKED`
      : this.riposteTimer > 0
        ? `RIPOSTE · ${this.riposteTimer.toFixed(1)}s`
        : `${this.attackDirection} · ${strikeExhausted ? "NEED" : "COST"} ${strikeStamina} STA`;
    this.directionHud.classList.toggle("active", combatOverride || strikeExhausted || this.mouseAccumulator.x !== 0 || this.mouseAccumulator.y !== 0);
    this.directionHud.classList.toggle("danger", this.guardBreakTimer > 0 || strikeExhausted);
    this.damageDirectionHud.classList.toggle("visible", this.damageDirectionTimer > 0);
    this.threatHud.classList.toggle("visible", this.threatTimer > 0);
    if (!this.portalAnnounced && this.phaseElapsed() > floorRules.duration * 0.43 && this.sigils < 2) {
      this.portalAnnounced = true;
      this.feed("The dark advances. Wardens carry what the passage needs.", "danger");
    }
  }

  private updateStealthProgress(): void {
    const noise = this.sprinting ? "sprint loud" : this.crouching && this.moving ? "crouch quiet" : this.moving ? "walk steady" : "still";
    this.stealthHud.textContent = `unseen marks ${Math.min(QUIET_KNIVES_TARGET, this.unseenStrikes)} / ${QUIET_KNIVES_TARGET} · ${noise}`;
  }

  private updateStealthCue(maxReach: number): void {
    const cameraPosition = this.camera.position;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    let target: Enemy | undefined;
    let closest = Number.POSITIVE_INFINITY;
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const targetHeight = enemy.kind === "crawler" || enemy.kind === "mimic" ? 0.72 : enemy.kind === "boss" ? 1.55 : 1.12;
      const toEnemy = enemy.group.position.clone().add(new THREE.Vector3(0, targetHeight, 0)).sub(cameraPosition);
      const distance = toEnemy.length();
      if (distance > maxReach || distance >= closest || toEnemy.normalize().dot(forward) <= 0.985) continue;
      if (!dungeonLineOfSight(
        { x: cameraPosition.x, z: cameraPosition.z },
        { x: enemy.group.position.x, z: enemy.group.position.z },
      )) continue;
      target = enemy;
      closest = distance;
    }
    if (!target) {
      this.stealthCueHud.classList.remove("visible");
      delete this.stealthCueHud.dataset.state;
      this.stealthCueHud.textContent = "";
      return;
    }
    const cue = unseenStrikeCue(this.markedUnseenThreats, target);
    this.stealthCueHud.textContent = cue.label;
    this.stealthCueHud.dataset.state = cue.state;
    this.stealthCueHud.classList.add("visible");
  }

  private updateWayfinder(): void {
    const facing = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    this.compassHeadingHud.textContent = cardinalDirection({ x: facing.x, z: facing.z });

    let target: THREE.Vector3 | undefined;
    let label = "WARDEN";
    const looseSigil = this.pickups.find((pickup) => !pickup.collected && pickup.item.kind === "sigil");
    const recovery = recoveryNeed(
      this.health,
      this.maxHealth,
      this.stamina,
      this.definition.maxStamina,
      this.spellCharges,
      this.options.classId === "hexbound",
      this.torchFuel,
    );
    if (looseSigil) {
      target = looseSigil.group.position;
      label = "SIGIL";
    } else if (this.portalUnlocked) {
      target = this.portal.position;
      label = "PASSAGE";
    } else if (!this.campfireUsed && recovery) {
      target = this.campfire.position;
      label = `CAMPFIRE ${recovery}`;
    } else {
      const livingWardens = this.enemies.filter((enemy) => enemy.alive && enemy.kind === "warden");
      livingWardens.sort((left, right) => left.group.position.distanceToSquared(this.camera.position) - right.group.position.distanceToSquared(this.camera.position));
      target = livingWardens[0]?.group.position;
    }

    if (!target) {
      this.wayfinderHud.textContent = "SEARCH THE CRYPT";
      return;
    }
    const delta = { x: target.x - this.camera.position.x, z: target.z - this.camera.position.z };
    this.wayfinderHud.textContent = `${label} · ${cardinalDirection(delta)} ${Math.round(Math.hypot(delta.x, delta.z))}m`;
  }

  private feed(message: string, tone: "system" | "danger" | "combat" | "loot" | "rival"): void {
    this.feedHud.textContent = message;
    this.feedHud.dataset.tone = tone;
    this.feedHud.classList.remove("show");
    void this.feedHud.offsetWidth;
    this.feedHud.classList.add("show");
    this.messageTimer = 3.4;
  }

  private finish(reason: RaidEndReason): void {
    if (this.ended) return;
    this.ended = true;
    this.invalidatePointerLockRequest();
    this.paused = true;
    this.audio.pause();
    if (document.pointerLockElement === this.renderer.domElement) void document.exitPointerLock();
    const result: RaidResult = {
      reason,
      raidMode: this.options.raidMode,
      depthReached: this.depth,
      classId: this.options.classId,
      loot: [...this.raidLoot],
      equippedIds: this.options.equipped.map((item) => item.id),
      consumedIds: [...this.consumedIds],
      kills: this.kills,
      killsByKind: { ...this.killsByKind },
      elapsed: this.elapsed,
      goldFound: treasureGoldTotal(this.raidLoot),
      bossKilled: this.bossKilled,
      unseenStrikes: this.unseenStrikes,
      finishedAt: Date.now(),
      variationSeed: this.variationSeed,
    };
    this.lifecycleTimers.schedule(() => this.options.onFinish(result), 260);
  }

  private resize(): void {
    const width = Math.max(1, this.mount.clientWidth);
    const height = Math.max(1, this.mount.clientHeight);
    if (this.renderScale === 0) this.renderScale = initialRenderScale(width);
    this.renderScale = Math.min(maximumRenderScale(width), this.renderScale);
    this.renderer.setSize(Math.floor(width * this.renderScale), Math.floor(height * this.renderScale), false);
    this.renderer.domElement.style.width = `${width}px`;
    this.renderer.domElement.style.height = `${height}px`;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.queueFrame();
  }

  destroy(): void {
    this.ended = true;
    this.invalidatePointerLockRequest();
    cancelAnimationFrame(this.animationFrame);
    this.lifecycleTimers.cancelAll();
    this.resizeObserver.disconnect();
    document.removeEventListener("keydown", this.onKeyDown);
    document.removeEventListener("keyup", this.onKeyUp);
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("mousedown", this.onMouseDown);
    document.removeEventListener("mouseup", this.onMouseUp);
    document.removeEventListener("pointerlockchange", this.onPointerLockChange);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    window.removeEventListener("blur", this.onWindowBlur);
    this.renderer.domElement.removeEventListener("webglcontextlost", this.onContextLost);
    this.renderer.domElement.removeEventListener("webglcontextrestored", this.onContextRestored);
    this.renderer.domElement.removeEventListener("contextmenu", this.onContextMenu);
    this.renderer.domElement.removeEventListener("click", this.requestPointerLock);
    this.resumeButton.removeEventListener("click", this.requestPointerLock);
    this.abandonButton.removeEventListener("click", this.onAbandonRaid);
    this.audio.stop();
    this.clearPlayerProjectiles();
    disposeSceneResources(this.scene);
    this.renderer.renderLists.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.mount.innerHTML = "";
  }
}
