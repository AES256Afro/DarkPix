import * as THREE from "three";
import { AudioDirector } from "./audio";
import { attackDamage, classAbilityDamageMultiplier, enemyAttackPattern, guardDrainPerSecond, guardFacesThreat, healthPercent, rivalTactic, trapDamageAgainstThreat, type ThreatKind } from "./combat";
import { CLASSES, CLASS_ABILITIES, RARITY_COLOR, classPerkBonuses, createBossLoot, createLoot, createSigil, formatTime, progressionBonuses, type ClassPerkBonuses } from "./data";
import { DUNGEON, dungeonLineOfSight, dungeonPath } from "./dungeon";
import { depthRules } from "./depth";
import { HAUL_CAPACITY, canAddToHaul, dropLeastValuable, haulCount, treasureGold } from "./haul";
import { equippedPower, loadoutStats, physicalDamageAfterArmor, type LoadoutStats } from "./loadout";
import { cardinalDirection, circlesOverlap } from "./navigation";
import { raidRules, type RaidRules } from "./raid";
import { adaptiveRenderScale, initialRenderScale, maximumRenderScale } from "./resolution";
import { disposeSceneResources } from "./resources";
import { continuousHold, targetDistanceInView } from "./targeting";
import type { ClassId, DungeonDepth, GamePreferences, Item, RaidEndReason, RaidMode, RaidResult, Vec2 } from "./types";
import { distanceFromZoneCenter, zoneState } from "./zone";

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
  stagger: number;
  alerted: boolean;
  alive: boolean;
  phase: number;
  baseScale: number;
  path: Vec2[];
  pathTimer: number;
  attackStyle: "melee" | "ranged";
  crippled: boolean;
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

export interface DarkPixGameOptions {
  classId: ClassId;
  classLevel: number;
  raidMode: RaidMode;
  equipped: Item[];
  preferences: GamePreferences;
  onFinish: (result: RaidResult) => void;
}

const PLAYER_HEIGHT = 1.67;
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
  private readonly keys = new Set<string>();
  private readonly walls: WallCollider[] = [];
  private readonly enemies: Enemy[] = [];
  private readonly pickups: Pickup[] = [];
  private readonly chests: Chest[] = [];
  private readonly traps: FloorTrap[] = [];
  private readonly raidLoot: Item[] = [];
  private readonly carriedConsumables: Item[];
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
  private readonly resizeObserver: ResizeObserver;
  private readonly maxHealth: number;
  private readonly damageBonus: number;
  private readonly perkBonuses: ClassPerkBonuses;
  private readonly loadoutBonuses: LoadoutStats;
  private readonly raidRules: RaidRules;
  private readonly maxSpellCharges: number;
  private healthFill!: HTMLElement;
  private staminaFill!: HTMLElement;
  private spellFill!: HTMLElement;
  private raidClock!: HTMLElement;
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
  private damageOverlay!: HTMLElement;
  private extractProgress!: HTMLElement;
  private abilityHud!: HTMLElement;
  private animationFrame = 0;
  private enemyId = 0;
  private elapsed = 0;
  private health: number;
  private stamina: number;
  private spellCharges: number;
  private kills = 0;
  private goldFound = 0;
  private bossKilled = false;
  private readonly consumedIds: string[] = [];
  private sigils = 0;
  private portalUnlocked = false;
  private portalAnnounced = false;
  private spawnGraceAnnounced = false;
  private campfireUsed = false;
  private shrineUsed = false;
  private ended = false;
  private paused = true;
  private contextLost = false;
  private blocking = false;
  private blockAge = 0;
  private attackCooldown = 0;
  private swingClock = 0;
  private footstepClock = 0;
  private damageCooldown = 0;
  private interactHeld = false;
  private descendHeld = false;
  private interactionHold = 0;
  private attackDirection: "OVERHEAD" | "THRUST" | "SWEEP" = "THRUST";
  private mouseAccumulator = { x: 0, y: 0 };
  private yaw = 0;
  private pitch = 0;
  private messageTimer = 0;
  private threatTimer = 0;
  private vignette = 0;
  private torchLit = true;
  private abilityCooldown = 0;
  private concealmentTimer = 0;
  private rageTimer = 0;
  private renderScale = 0;
  private frameTimeTotal = 0;
  private frameSamples = 0;
  private resolutionTimer = 0;
  private depth: DungeonDepth = 1;
  private depthStartedAt = 0;

  constructor(mount: HTMLElement, options: DarkPixGameOptions) {
    this.mount = mount;
    this.options = options;
    this.audio = new AudioDirector(!options.preferences.muted);
    this.raidRules = raidRules(options.raidMode);
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
    this.animationFrame = requestAnimationFrame(this.frame);
  }

  private createShell(): void {
    this.mount.innerHTML = `
      <div class="raid-shell ${this.options.preferences.reducedMotion ? "reduced-motion" : ""}" data-class="${this.options.classId}" data-raid-mode="${this.options.raidMode}">
        <div class="render-host"></div>
        <div class="pixel-grid" aria-hidden="true"></div>
        <div class="darkness-vignette" aria-hidden="true"></div>
        <div class="damage-flash" aria-hidden="true"></div>
        <div class="raid-hud">
          <div class="hud-top">
            <section class="contract-panel">
              <span class="eyebrow">${this.options.raidMode === "high_toll" ? "HIGH TOLL CONTRACT" : "CRYPT OF THE PALE TOLL"}</span>
              <strong class="raid-clock">3:30</strong>
              <span class="zone-copy">darkness dormant</span>
            </section>
            <div class="compass"><span class="compass-heading">N</span><strong class="wayfinder">WARDEN · SEEK</strong><span>⌖</span></div>
            <section class="objective-panel">
              <span class="eyebrow">CONTRACT</span>
              <strong class="objective-copy">WARDEN SIGILS 0 / 2</strong>
              <span>unseal an extraction</span>
            </section>
          </div>
          <div class="event-feed" role="status"></div>
          <div class="threat-vitals" aria-live="polite"><strong></strong><div><i></i></div><small></small></div>
          <div class="crosshair" aria-hidden="true"><i></i><b></b><em></em><span></span></div>
          <div class="attack-direction">THRUST</div>
          <div class="interaction-prompt"></div>
          <div class="extract-meter"><i></i></div>
          <div class="hud-bottom">
            <section class="vitals">
              <div class="portrait-rune">${this.options.classId === "vanguard" ? "V" : this.options.classId === "cutpurse" ? "C" : this.options.classId === "hexbound" ? "H" : "R"}</div>
              <div class="bars">
                <div class="bar health"><i></i><span>VIGOR</span></div>
                <div class="bar stamina"><i></i><span>STAMINA</span></div>
                <div class="bar spells"><i></i><span>MEMORY</span></div>
              </div>
            </section>
            <section class="quick-slots">
              <div class="ability-slot"><kbd>Q</kbd><span class="slot-icon ability-icon"></span><small>${CLASS_ABILITIES[this.options.classId].name}</small></div>
              <div><kbd>F</kbd><span class="slot-icon potion-icon"></span><small>${this.carriedConsumables.length ? `Packed draught ×${this.carriedConsumables.length}` : "Recovered draught"}</small></div>
              <div><kbd>G</kbd><span class="slot-icon hand-icon"></span><small>Drop lowest haul</small></div>
              <div><kbd>E</kbd><span class="slot-icon hand-icon"></span><small>Interact / extract</small></div>
              <div><kbd>T</kbd><span class="slot-icon torch-icon"></span><small>Hood the torch</small></div>
            </section>
            <section class="haul-panel">
              <span class="eyebrow">UNSECURED HAUL</span>
              <strong class="loot-count">0 / ${HAUL_CAPACITY} slots · 0g</strong>
              <span>death takes all</span>
            </section>
          </div>
        </div>
        <button class="lock-overlay" type="button">
          <span class="sigil-mark">DP</span>
          <strong>ENTER THE CRYPT</strong>
          <small>Click to bind the cursor</small>
          <span class="control-line">WASD move · mouse look · LMB strike · RMB guard · E interact · R red descent · F heal · G drop · T torch · Shift sprint</span>
        </button>
      </div>`;
    const host = this.mount.querySelector<HTMLElement>(".render-host");
    if (!host) throw new Error("Game render host was not created");
    host.appendChild(this.renderer.domElement);
    this.healthFill = this.mount.querySelector<HTMLElement>(".health i")!;
    this.staminaFill = this.mount.querySelector<HTMLElement>(".stamina i")!;
    this.spellFill = this.mount.querySelector<HTMLElement>(".spells i")!;
    this.raidClock = this.mount.querySelector<HTMLElement>(".raid-clock")!;
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
    this.damageOverlay = this.mount.querySelector<HTMLElement>(".damage-flash")!;
    this.extractProgress = this.mount.querySelector<HTMLElement>(".extract-meter i")!;
    this.abilityHud = this.mount.querySelector<HTMLElement>(".ability-slot small")!;
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

    for (const { x, z } of DUNGEON.pillars) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 4, 1.1), wallMat);
      pillar.position.set(x, 2, z);
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      this.scene.add(pillar);
      this.walls.push({ x, z, halfW: 0.55, halfD: 0.55 });
    }

    DUNGEON.torches.forEach(({ x, z, rotation }, index) => this.addTorch(x, z, rotation, index));
    this.createCampfire(DUNGEON.campfire.x, DUNGEON.campfire.z);
    this.createShrine(DUNGEON.shrine.x, DUNGEON.shrine.z);
    this.createPortal(DUNGEON.portal.x, DUNGEON.portal.z);
    DUNGEON.chests.forEach((chest) => this.createChest(chest.x, chest.z, chest.depthBonus, chest.mimic ?? false));
    DUNGEON.traps.forEach((trap) => this.createTrap(trap.x, trap.z, trap.damage));
    DUNGEON.enemies.forEach((enemy) => this.spawnEnemy(enemy.kind, enemy.x, enemy.z));

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
    this.scene.add(group);
    const baseStats = kind === "boss"
      ? { hp: 245, speed: 1.12, damage: 31, range: 2.15, name: "The Tollkeeper" }
      : kind === "warden"
      ? { hp: 115, speed: 1.35, damage: 24, range: 1.7, name: "Ossuary warden" }
      : kind === "rival"
        ? { hp: 88, speed: 2.05, damage: 16, range: 6.5, name: "Rival delver" }
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
    });
  }

  private spawnPickup(item: Item, position: THREE.Vector3): void {
    const group = new THREE.Group();
    const color = new THREE.Color(RARITY_COLOR[item.rarity]);
    const geometry = item.kind === "sigil" ? new THREE.TorusGeometry(0.25, 0.08, 4, 8) : new THREE.BoxGeometry(0.34, 0.34, 0.34);
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
    this.lockOverlay.addEventListener("click", this.requestPointerLock);
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (this.paused || this.ended) return;
    this.keys.add(event.code);
    if (event.code === "KeyE") this.interactHeld = true;
    if (event.code === "KeyR") this.descendHeld = true;
    if (event.code === "KeyF" && !event.repeat) this.usePotion();
    if (event.code === "KeyG" && !event.repeat) this.dropLowestHaul();
    if (event.code === "KeyQ" && !event.repeat) this.useClassAbility();
    if (event.code === "KeyT" && !event.repeat) this.toggleTorch();
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
    if (event.code === "KeyE") {
      this.interactHeld = false;
      this.interactionHold = 0;
    }
    if (event.code === "KeyR") {
      this.descendHeld = false;
      this.interactionHold = 0;
    }
  };

  private onMouseMove = (event: MouseEvent): void => {
    if (document.pointerLockElement !== this.renderer.domElement || this.ended) return;
    this.yaw -= event.movementX * 0.0023 * this.options.preferences.mouseSensitivity;
    this.pitch -= event.movementY * 0.0021 * this.options.preferences.mouseSensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.35, 1.35);
    this.mouseAccumulator.x += event.movementX;
    this.mouseAccumulator.y += event.movementY;
    if (Math.abs(this.mouseAccumulator.y) > Math.abs(this.mouseAccumulator.x) * 1.15 && Math.abs(this.mouseAccumulator.y) > 18) {
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
      this.blocking = true;
      this.blockAge = 0;
    }
  };

  private onMouseUp = (event: MouseEvent): void => {
    if (event.button === 2) this.blocking = false;
  };

  private onContextMenu = (event: MouseEvent): void => event.preventDefault();

  private onPointerLockChange = (): void => {
    if (this.contextLost) {
      this.paused = true;
      this.lockOverlay.classList.remove("hidden");
      return;
    }
    this.paused = document.pointerLockElement !== this.renderer.domElement;
    if (this.paused) {
      this.clearHeldInputs();
      this.audio.pause();
    }
    this.lockOverlay.classList.toggle("hidden", !this.paused || this.ended);
    if (!this.paused) {
      this.audio.start();
      this.clock.getDelta();
    }
  };

  private clearHeldInputs(): void {
    this.keys.clear();
    this.blocking = false;
    this.blockAge = 0;
    this.interactHeld = false;
    this.descendHeld = false;
    this.interactionHold = 0;
    this.mouseAccumulator.x = 0;
    this.mouseAccumulator.y = 0;
  }

  private pauseForFocusLoss(): void {
    if (this.ended) return;
    this.paused = true;
    this.clearHeldInputs();
    this.audio.pause();
    this.lockOverlay.classList.remove("hidden");
    if (document.pointerLockElement === this.renderer.domElement) void document.exitPointerLock();
  }

  private onWindowBlur = (): void => this.pauseForFocusLoss();

  private onVisibilityChange = (): void => {
    if (document.hidden) this.pauseForFocusLoss();
  };

  private setLockOverlayCopy(title: string, detail: string): void {
    const titleElement = this.lockOverlay.querySelector<HTMLElement>("strong");
    const detailElement = this.lockOverlay.querySelector<HTMLElement>("small");
    if (titleElement) titleElement.textContent = title;
    if (detailElement) detailElement.textContent = detail;
  }

  private onContextLost = (event: Event): void => {
    event.preventDefault();
    if (this.ended) return;
    this.contextLost = true;
    this.paused = true;
    this.clearHeldInputs();
    this.audio.pause();
    this.setLockOverlayCopy("REKINDLING THE CRYPT", "The renderer was interrupted. Waiting for the torch to return.");
    this.lockOverlay.classList.remove("hidden");
    if (document.pointerLockElement === this.renderer.domElement) void document.exitPointerLock();
  };

  private onContextRestored = (): void => {
    if (this.ended) return;
    this.contextLost = false;
    this.paused = true;
    this.setLockOverlayCopy("RETURN TO THE CRYPT", "Renderer restored. Click to bind the cursor again.");
    this.lockOverlay.classList.remove("hidden");
    this.feed("The torch catches. The crypt is visible again.", "system");
  };

  private requestPointerLock = (): void => {
    if (this.ended || this.contextLost) return;
    if (typeof this.renderer.domElement.requestPointerLock !== "function") {
      this.paused = true;
      this.clearHeldInputs();
      this.audio.pause();
      this.setLockOverlayCopy("CURSOR RITUAL FAILED", "This browser cannot bind a first-person cursor. Return to the lobby and use a desktop browser.");
      this.lockOverlay.classList.remove("hidden");
      return;
    }
    this.paused = false;
    this.lockOverlay.classList.add("hidden");
    this.audio.start();
    this.clock.getDelta();
    try {
      const pointerLockRequest = this.renderer.domElement.requestPointerLock();
      void pointerLockRequest.catch(() => this.handlePointerLockFailure());
    } catch {
      this.handlePointerLockFailure();
    }
  };

  private handlePointerLockFailure(): void {
    this.paused = true;
    this.clearHeldInputs();
    this.audio.pause();
    this.setLockOverlayCopy("CURSOR UNBOUND", "Click to try again. If the browser keeps refusing, allow pointer lock for this site.");
    this.lockOverlay.classList.remove("hidden");
    this.feed("The browser refused pointer lock. The raid remains paused.", "system");
  }

  private frame = (): void => {
    this.animationFrame = requestAnimationFrame(this.frame);
    const delta = Math.min(this.clock.getDelta(), 0.05);
    if (!this.paused && !this.ended) this.update(delta);
    this.updateAdaptiveResolution(delta);
    this.animateWorld(delta);
    this.renderer.render(this.scene, this.camera);
  };

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
    this.attackCooldown = Math.max(0, this.attackCooldown - delta);
    this.abilityCooldown = Math.max(0, this.abilityCooldown - delta);
    this.concealmentTimer = Math.max(0, this.concealmentTimer - delta);
    this.rageTimer = Math.max(0, this.rageTimer - delta);
    this.swingClock = Math.max(0, this.swingClock - delta);
    this.damageCooldown = Math.max(0, this.damageCooldown - delta);
    this.messageTimer = Math.max(0, this.messageTimer - delta);
    this.threatTimer = Math.max(0, this.threatTimer - delta);
    this.blockAge += this.blocking ? delta : 0;
    this.vignette = Math.max(0, this.vignette - delta * 1.8);
    this.updateMovement(delta);
    this.updateTraps(delta);
    this.updateEnemies(delta);
    this.updateZone(delta);
    this.updateInteraction(delta);
    this.updateHud();

    if (this.phaseElapsed() >= depthRules(this.depth).duration) this.finish("darkness");
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
    const sprinting = moving && this.keys.has("ShiftLeft") && this.stamina > 1 && !this.blocking;
    const sprintMultiplier = sprinting ? (this.options.classId === "cutpurse" ? 1.65 : 1.48) : 1;
    const blockMultiplier = this.blocking ? 0.55 : 1;
    const speed = this.definition.speed * this.loadoutBonuses.movementMultiplier * sprintMultiplier * blockMultiplier;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const dx = (input.x * cos - input.y * sin) * speed * delta;
    const dz = (-input.x * sin - input.y * cos) * speed * delta;
    this.tryMove(dx, dz);
    if (sprinting) {
      this.stamina = Math.max(0, this.stamina - delta * (this.options.classId === "cutpurse" ? 17 : 24) * this.perkBonuses.sprintCostMultiplier);
    } else if (this.blocking) {
      this.stamina = Math.max(0, this.stamina - delta * guardDrainPerSecond(this.options.classId) * this.perkBonuses.guardUpkeepMultiplier);
      if (this.stamina <= 0) {
        this.blocking = false;
        this.blockAge = 0;
        this.feed("GUARD BROKEN · recover your footing", "danger");
        this.audio.tone(72, 0.24, "sawtooth", 0.1);
      }
    } else {
      this.stamina = Math.min(this.definition.maxStamina, this.stamina + delta * 19);
    }

    if (moving && !this.options.preferences.reducedMotion) {
      this.footstepClock += delta * speed;
      this.camera.position.y = PLAYER_HEIGHT + Math.sin(this.footstepClock * 2.25) * 0.035;
    } else {
      this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, PLAYER_HEIGHT, delta * 7);
    }
    this.camera.rotation.set(this.pitch, this.yaw, 0);
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
    this.torchLit = !this.torchLit;
    this.delverTorch.intensity = this.torchLit ? 5.2 : 0;
    this.feed(this.torchLit ? "Torch unhooded. You see farther, and so do they." : "Torch hooded. Stay close to the stones.", "system");
    this.audio.tone(this.torchLit ? 310 : 140, 0.12, "sine", 0.08);
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
        this.hurt(trap.damage, "a floor trap");
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

  private attack(): void {
    if (this.attackCooldown > 0 || this.blocking || this.stamina < 8) return;
    if (this.options.classId === "hexbound" && this.spellCharges <= 0) {
      this.feed("Your spell memory is ash. Find the campfire.", "danger");
      return;
    }
    this.attackCooldown = this.definition.attackDelay;
    this.concealmentTimer = 0;
    this.swingClock = Math.min(0.42, this.definition.attackDelay * 0.72);
    this.stamina = Math.max(0, this.stamina - (this.options.classId === "hexbound" ? 5 : 10));
    if (this.options.classId === "hexbound") this.spellCharges -= 1;
    this.audio.attack();

    const cameraPosition = this.camera.position;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    let best: Enemy | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const toEnemy = enemy.group.position.clone().add(new THREE.Vector3(0, 1.1, 0)).sub(cameraPosition);
      const distance = toEnemy.length();
      const cone = this.options.classId === "hexbound" ? 0.965 : this.attackDirection === "SWEEP" ? 0.72 : 0.86;
      const visible = dungeonLineOfSight(
        { x: cameraPosition.x, z: cameraPosition.z },
        { x: enemy.group.position.x, z: enemy.group.position.z },
      );
      if (distance <= this.definition.reach && visible && toEnemy.normalize().dot(forward) > cone && distance < bestDistance) {
        best = enemy;
        bestDistance = distance;
      }
    }
    if (!best) {
      if (this.options.classId === "hexbound") this.spawnSpellTrail(cameraPosition, forward, this.definition.reach);
      this.mouseAccumulator.x = 0;
      this.mouseAccumulator.y = 0;
      return;
    }

    const headHeight = best.kind === "crawler" || best.kind === "mimic" ? 0.72 : best.kind === "boss" ? 2.35 : 1.82;
    const toHead = best.group.position.clone().add(new THREE.Vector3(0, headHeight, 0)).sub(cameraPosition).normalize();
    const headshot = toHead.dot(forward) > (this.options.classId === "hexbound" ? 0.992 : 0.975);
    const limbHit = !headshot && this.attackDirection === "SWEEP" && this.options.classId !== "hexbound";
    const weaponPower = equippedPower(this.options.equipped, "weapon");
    const baseDamage = attackDamage({
      baseDamage: this.definition.damage,
      weaponPower,
      progressionBonus: this.damageBonus,
      direction: this.attackDirection,
      ambush: this.options.classId === "cutpurse" && !best.alerted,
      headshot,
      limb: limbHit,
    });
    const damage = Math.round(
      baseDamage
      * (best.kind === "rival" ? 1 : this.loadoutBonuses.undeadDamageMultiplier)
      * classAbilityDamageMultiplier(this.options.classId, this.rageTimer),
    );
    this.damageEnemy(best, damage, headshot, limbHit);
    if (this.options.classId === "hexbound") this.spawnSpellTrail(cameraPosition, forward, bestDistance);
    this.mouseAccumulator.x = 0;
    this.mouseAccumulator.y = 0;
  }

  private spawnSpellTrail(start: THREE.Vector3, forward: THREE.Vector3, distance: number): void {
    const boltMaterial = material(0x5ce3d9, 0x38c9c1);
    const bolt = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, Math.max(0.2, distance)), boltMaterial);
    bolt.position.copy(start).add(forward.clone().multiplyScalar(distance / 2));
    bolt.quaternion.copy(this.camera.quaternion);
    this.scene.add(bolt);
    window.setTimeout(() => {
      this.scene.remove(bolt);
      bolt.geometry.dispose();
      boltMaterial.dispose();
    }, 80);
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
    window.setTimeout(() => {
      this.scene.remove(knife);
      knife.geometry.dispose();
      knifeMaterial.dispose();
    }, 95);
  }

  private damageEnemy(enemy: Enemy, amount: number, headshot: boolean, limbHit: boolean): void {
    enemy.hp -= amount;
    enemy.alerted = true;
    enemy.stagger = 0.18;
    if (enemy.kind !== "boss" && enemy.windup > 0) {
      enemy.windup = 0;
      enemy.cooldown = Math.max(enemy.cooldown, 0.45);
    }
    this.audio.hit();
    const crippledNow = limbHit && enemy.kind !== "boss" && !enemy.crippled;
    if (crippledNow) {
      enemy.crippled = true;
      enemy.speed *= 0.72;
    }
    this.feed(`${headshot ? "HEADSHOT · " : limbHit ? "LIMB HIT · " : ""}${enemy.name} takes ${amount}.${crippledNow ? " Its stride breaks." : ""}`, enemy.kind === "rival" ? "rival" : "combat");
    enemy.group.scale.set(enemy.baseScale * 1.14, enemy.baseScale * 0.9, enemy.baseScale * 1.14);
    if (enemy.kind === "boss" && enemy.hp > 0 && enemy.hp <= enemy.maxHp / 2 && !enemy.group.userData.enraged) {
      enemy.group.userData.enraged = true;
      enemy.speed *= 1.28;
      enemy.damage = Math.round(enemy.damage * 1.2);
      enemy.cooldown = 0;
      this.feed("THE TOLLKEEPER ENRAGES · its chain quickens", "danger");
      this.audio.tone(46, 0.6, "sawtooth", 0.16);
    }
    if (enemy.hp > 0) {
      this.showThreatVitals(enemy);
      return;
    }
    enemy.alive = false;
    if (enemy.kind === "boss") {
      this.bossKilled = true;
      if (this.depth === 1) this.revealRedDepth();
    }
    this.kills += 1;
    enemy.group.rotation.z = 1.2;
    enemy.group.position.y = -0.55;
    this.feed(`${enemy.name} falls.`, enemy.kind === "rival" ? "rival" : "loot");
    const drop = enemy.kind === "warden"
      ? createSigil()
      : enemy.kind === "boss"
        ? createBossLoot(Math.random, this.raidRules.lootDepthBonus + depthRules(this.depth).lootDepthBonus)
        : createLoot(Math.random, (enemy.kind === "rival" ? 0.12 : enemy.kind === "mimic" ? 0.18 : 0.03) + this.raidRules.lootDepthBonus + depthRules(this.depth).lootDepthBonus);
    this.spawnPickup(drop, enemy.group.position.clone());
    this.showThreatVitals(enemy);
    if (enemy.kind === "boss" && this.depth === 1) {
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
        ? enemy.group.userData.enraged ? "KEEPER · ENRAGED" : "KEEPER"
        : enemy.kind === "rival"
          ? enemy.crippled ? "HOSTILE DELVER · CRIPPLED" : "HOSTILE DELVER"
          : enemy.crippled ? "CRYPT THREAT · CRIPPLED" : "CRYPT THREAT";
    this.threatHud.dataset.kind = enemy.kind;
    this.threatHud.classList.add("visible");
  }

  private updateEnemies(delta: number): void {
    const player = this.camera.position;
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      enemy.cooldown = Math.max(0, enemy.cooldown - delta);
      enemy.stagger = Math.max(0, enemy.stagger - delta);
      enemy.pathTimer = Math.max(0, enemy.pathTimer - delta);
      enemy.group.scale.set(
        THREE.MathUtils.lerp(enemy.group.scale.x, enemy.baseScale, delta * 7),
        THREE.MathUtils.lerp(enemy.group.scale.y, enemy.baseScale, delta * 7),
        THREE.MathUtils.lerp(enemy.group.scale.z, enemy.baseScale, delta * 7),
      );
      enemy.group.rotation.x = THREE.MathUtils.lerp(enemy.group.rotation.x, 0, delta * 8);
      const toPlayerX = player.x - enemy.group.position.x;
      const toPlayerZ = player.z - enemy.group.position.z;
      const distance = Math.hypot(toPlayerX, toPlayerZ);
      const awareness = this.torchLit ? 10.5 : 6.5;
      if (this.phaseElapsed() >= depthRules(this.depth).spawnGrace && this.concealmentTimer <= 0 && distance < awareness && dungeonLineOfSight(
        { x: player.x, z: player.z },
        { x: enemy.group.position.x, z: enemy.group.position.z },
      )) enemy.alerted = true;
      if (!enemy.alerted) {
        enemy.group.rotation.y += Math.sin(this.elapsed * 0.35 + enemy.phase) * delta * 0.15;
        continue;
      }
      if (distance > 15) {
        enemy.windup = 0;
        continue;
      }
      const hasSight = dungeonLineOfSight(
        { x: player.x, z: player.z },
        { x: enemy.group.position.x, z: enemy.group.position.z },
        0.12,
      );
      if (enemy.windup > 0) {
        enemy.windup = Math.max(0, enemy.windup - delta);
        const windupProgress = enemy.windupDuration > 0 ? enemy.windup / enemy.windupDuration : 0;
        enemy.group.rotation.x = -0.2 * windupProgress;
        enemy.group.scale.set(enemy.baseScale * 0.94, enemy.baseScale * 1.08, enemy.baseScale * 0.94);
        if (enemy.windup > 0) continue;

        const pattern = enemyAttackPattern(enemy.kind, Boolean(enemy.group.userData.enraged));
        enemy.cooldown = pattern.recovery;
        enemy.group.rotation.x = 0.18;
        enemy.group.scale.set(enemy.baseScale * 1.12, enemy.baseScale * 0.9, enemy.baseScale * 1.12);
        const attackRange = enemy.kind === "rival" && enemy.attackStyle === "melee" ? 1.9 : enemy.range;
        if (distance > attackRange + 0.25 || !hasSight) continue;

        if (enemy.kind === "rival" && enemy.attackStyle === "ranged") this.spawnRivalKnife(enemy);
        const guardFacing = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        const facingThreat = guardFacesThreat(
          { x: guardFacing.x, z: guardFacing.z },
          { x: enemy.group.position.x - player.x, z: enemy.group.position.z - player.z },
        );
        const guardingAttack = this.blocking && facingThreat;
        const parried = enemy.kind !== "boss" && guardingAttack && this.blockAge < 0.24;
        if (parried) {
          enemy.stagger = 1.0;
          this.stamina = Math.max(0, this.stamina - 5);
          this.feed(`PARRIED · ${enemy.name} is exposed`, "system");
          this.audio.tone(780, 0.12, "square", 0.13);
        } else {
          const reduction = guardingAttack ? (this.options.classId === "hexbound" ? 0.45 : 0.72) : 0;
          const attackDamage = enemy.kind === "rival" && enemy.attackStyle === "melee"
            ? Math.round(enemy.damage * 0.75)
            : enemy.damage;
          this.hurt(attackDamage * (1 - reduction), enemy.name);
          if (guardingAttack) this.stamina = Math.max(0, this.stamina - attackDamage * 0.75);
        }
        continue;
      }
      const tactic = enemy.kind === "rival" ? rivalTactic(distance, hasSight) : undefined;
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
        enemy.group.position.y = Math.sin(this.elapsed * 7 + enemy.phase) * 0.025;
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
        enemy.group.position.y = Math.sin(this.elapsed * 7 + enemy.phase) * 0.025;
      } else if (enemy.cooldown <= 0 && enemy.stagger <= 0) {
        if (enemy.kind === "rival") {
          if (tactic !== "throw" && tactic !== "melee") continue;
          enemy.attackStyle = tactic === "throw" ? "ranged" : "melee";
        }
        enemy.group.lookAt(player.x, enemy.group.position.y, player.z);
        const pattern = enemyAttackPattern(enemy.kind, Boolean(enemy.group.userData.enraged));
        enemy.windup = pattern.windup;
        enemy.windupDuration = pattern.windup;
        this.audio.tone(enemy.kind === "boss" ? 58 : 110, 0.08, "square", 0.04);
      }
    }
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

  private hurt(amount: number, source: string, physical = true): void {
    if (this.damageCooldown > 0 || this.ended) return;
    this.damageCooldown = 0.18;
    this.interactionHold = 0;
    const appliedDamage = physicalDamageAfterArmor(amount, physical ? this.loadoutBonuses.armor : 0);
    this.health = Math.max(0, this.health - appliedDamage);
    this.vignette = 1;
    this.damageOverlay.classList.remove("pulse");
    void this.damageOverlay.offsetWidth;
    this.damageOverlay.classList.add("pulse");
    this.audio.danger();
    this.feed(`${source} wounds you for ${Math.round(appliedDamage)}.`, "danger");
    if (this.health <= 0) this.finish(source === "the dark" ? "darkness" : "slain");
  }

  private usePotion(): void {
    if (this.paused || this.ended || this.health >= this.maxHealth) return;
    const potionIndex = this.raidLoot.findIndex((item) => item.kind === "consumable");
    const recoveredPotion = potionIndex >= 0 ? this.raidLoot.splice(potionIndex, 1)[0] : undefined;
    const packedPotion = recoveredPotion ? undefined : this.carriedConsumables.shift();
    const potion = recoveredPotion ?? packedPotion;
    if (!potion) {
      this.feed("No draught in your unsecured haul.", "danger");
      return;
    }
    if (packedPotion) this.consumedIds.push(packedPotion.id);
    this.health = Math.min(this.maxHealth, this.health + 36);
    this.feed(`${potion.name} restores 36 vigor.`, "loot");
    this.audio.loot();
  }

  private useClassAbility(): void {
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
      this.interactionHold = 0;
      this.vignette = Math.max(this.vignette, 0.48);
      this.spellCharges = Math.min(this.maxSpellCharges, this.spellCharges + 2);
      this.feed("BLOOD MEMORY · two ash charges return", "danger");
    } else {
      if (this.health <= 12) {
        this.feed("Blood rage demands more vigor than remains.", "danger");
        return;
      }
      this.health -= 12;
      this.interactionHold = 0;
      this.vignette = Math.max(this.vignette, 0.65);
      this.rageTimer = 6;
      this.feed("BLOOD RAGE · strike damage surges for 6s", "danger");
    }
    this.abilityCooldown = ability.cooldown;
    this.audio.portal();
  }

  private updateZone(_delta: number): void {
    const floorRules = depthRules(this.depth);
    const floorElapsed = this.phaseElapsed();
    const zone = zoneState(floorElapsed, floorRules.duration);
    const distance = distanceFromZoneCenter({ x: this.camera.position.x, z: this.camera.position.z }, zone);
    const zoneCopy = this.mount.querySelector<HTMLElement>(".zone-copy");
    if (zoneCopy) {
      zoneCopy.textContent = floorElapsed < floorRules.spawnGrace
        ? `warding veil ${Math.ceil(floorRules.spawnGrace - floorElapsed)}s`
        : zone.progress === 0
          ? "darkness dormant"
          : `safe reach ${Math.round(zone.radius)}m`;
    }
    if (!this.spawnGraceAnnounced && floorElapsed >= floorRules.spawnGrace) {
      this.spawnGraceAnnounced = true;
      this.feed("The warding veil gutters. The crypt can hear you now.", "danger");
    }
    if (distance > zone.radius) {
      this.vignette = Math.max(this.vignette, 0.68);
      if (this.damageCooldown <= 0) this.hurt(5, "the dark", false);
    }
    const shell = this.mount.querySelector<HTMLElement>(".raid-shell");
    shell?.style.setProperty("--darkness", String(Math.max(this.vignette, distance > zone.radius ? 0.85 : zone.progress * 0.26)));
  }

  private updateInteraction(delta: number): void {
    let prompt = "";
    let interactive: "pickup" | "chest" | "campfire" | "shrine" | "portal" | undefined;
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
    const portalDistance = this.portalUnlocked ? targetDistance(this.portal.position, 3.1) : Number.POSITIVE_INFINITY;
    if (Number.isFinite(portalDistance) && (interactive === undefined || portalDistance < nearest)) {
      nearest = portalDistance;
      interactive = "portal";
    }

    if (interactive === "pickup" && targetPickup) prompt = canAddToHaul(this.raidLoot, targetPickup.item)
      ? `[ E ] TAKE ${targetPickup.item.rarity.toUpperCase()} ${targetPickup.item.name.toUpperCase()}`
      : "HAUL FULL · [ G ] DROP THE LEAST VALUABLE ITEM";
    if (interactive === "chest") prompt = "[ E ] SEARCH IRONBOUND COFFER";
    if (interactive === "campfire") prompt = "[ HOLD E ] REST · RESTORE VIGOR AND SPELL MEMORY";
    if (interactive === "shrine") prompt = "[ E ] PAY 18 VIGOR TO THE BLOOD RELIQUARY";
    const redDepthAvailable = interactive === "portal" && this.depth === 1 && this.bossKilled;
    if (interactive === "portal") prompt = redDepthAvailable
      ? "[ HOLD E ] EXTRACT BLUE · [ HOLD R ] DESCEND RED"
      : "[ HOLD E ] OPEN THE BLUE PASSAGE";
    this.promptHud.textContent = prompt;
    this.promptHud.classList.toggle("visible", Boolean(prompt));

    const descending = redDepthAvailable && this.descendHeld;
    const channeling = descending || (this.interactHeld && (interactive === "portal" || interactive === "campfire"));
    const channelDuration = (descending ? 2.4 : interactive === "campfire" ? 2.2 : 1.8) * this.loadoutBonuses.interactionDurationMultiplier;
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
      }
    } else if (interactive === "shrine") {
      this.useShrine();
      this.interactHeld = false;
    } else if (interactive === "portal") {
      if (this.interactionHold >= channelDuration) {
        if (descending) this.descendDeeper();
        else if (this.interactHeld) this.finish("extracted");
      }
    }
  }

  private collectPickup(pickup: Pickup): void {
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
    } else if (pickup.item.kind === "treasure") {
      this.goldFound += treasureGold(pickup.item);
    }
    this.audio.loot();
    this.feed(`${pickup.item.rarity} ${pickup.item.name} secured for now.`, "loot");
  }

  private dropLowestHaul(): void {
    const { kept, dropped } = dropLeastValuable(this.raidLoot);
    if (!dropped) {
      this.feed("There is no unsecured haul to drop.", "system");
      return;
    }
    this.raidLoot.splice(0, this.raidLoot.length, ...kept);
    this.goldFound = Math.max(0, this.goldFound - treasureGold(dropped));
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).setY(0).normalize();
    const position = this.camera.position.clone().add(forward.multiplyScalar(1.15));
    position.y = 0.55;
    this.spawnPickup(dropped, position);
    this.feed(`${dropped.name} dropped from the haul.`, "system");
  }

  private openChest(chest: Chest): void {
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
    for (const enemy of this.enemies) {
      if (enemy.alive && enemy.group.position.distanceTo(this.campfire.position) < 14) enemy.alerted = true;
    }
    this.feed("Memory returns. Every nearby thing heard the rest.", "system");
    this.audio.portal();
  }

  private useShrine(): void {
    if (this.health <= 18 || this.damageCooldown > 0) {
      this.feed("The reliquary rejects weak or freshly spilled blood.", "danger");
      return;
    }
    this.shrineUsed = true;
    this.hurt(18, "the blood reliquary", false);
    const rune = this.shrine.getObjectByName("bloodRune") as THREE.Mesh | undefined;
    if (rune?.material instanceof THREE.MeshStandardMaterial) rune.material.emissiveIntensity = 0.08;
    const light = this.shrine.getObjectByName("shrineLight") as THREE.PointLight | undefined;
    if (light) light.intensity = 0;
    const origin = this.shrine.position.clone();
    const depthBonus = 0.16 + this.raidRules.lootDepthBonus + depthRules(this.depth).lootDepthBonus;
    this.spawnPickup(createLoot(Math.random, depthBonus), origin.clone().add(new THREE.Vector3(1, 0, -0.48)));
    this.spawnPickup(createLoot(Math.random, depthBonus), origin.clone().add(new THREE.Vector3(1, 0, 0.48)));
    for (const enemy of this.enemies) {
      if (enemy.alive && enemy.group.position.distanceTo(this.shrine.position) < 16) enemy.alerted = true;
    }
    this.feed("The reliquary opens. Something in the crypt answers.", "loot");
    this.audio.portal();
  }

  private unlockPortal(): void {
    this.portalUnlocked = true;
    this.audio.portal();
    this.feed(`${this.depth === 2 ? "ASHEN" : "BLUE"} PASSAGE UNSEALED · southeast reliquary`, "system");
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
    this.depthStartedAt = this.elapsed;
    this.sigils = 0;
    this.portalUnlocked = false;
    this.portalAnnounced = false;
    this.spawnGraceAnnounced = false;
    this.interactionHold = 0;
    this.interactHeld = false;
    this.descendHeld = false;
    this.clearHeldInputs();

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

    const wave: Array<{ kind: ThreatKind; x: number; z: number }> = [
      { kind: "skeleton", x: -5, z: 12 },
      { kind: "mimic", x: -16, z: 10 },
      { kind: "warden", x: -16, z: -11 },
      { kind: "warden", x: 15, z: 2 },
      { kind: "skeleton", x: 4, z: -11 },
      { kind: "crawler", x: -4, z: -17 },
      { kind: "boss", x: 16, z: -14 },
    ];
    for (const enemy of wave) this.spawnEnemy(enemy.kind, enemy.x, enemy.z);

    const contractLabel = this.mount.querySelector<HTMLElement>(".contract-panel .eyebrow");
    if (contractLabel) contractLabel.textContent = "ASHEN DEPTH · RED DESCENT";
    this.feed("ASHEN DEPTH · the old floor seals above you", "danger");
    this.audio.danger();
  }

  private animateWorld(delta: number): void {
    this.scene.traverse((object) => {
      if (object.userData.torchLight) {
        const light = object as THREE.PointLight;
        light.intensity = 1.55 + Math.sin(this.elapsed * 13 + Number(object.userData.phase)) * 0.28;
      }
      if (object.userData.flamePhase !== undefined) {
        object.scale.y = 0.92 + Math.sin(this.elapsed * 17 + Number(object.userData.flamePhase)) * 0.17;
      }
    });
    this.pickups.forEach((pickup) => {
      if (pickup.collected) return;
      pickup.group.rotation.y += delta * 1.5;
      pickup.group.position.y = 0.54 + Math.sin(this.elapsed * 2.5 + pickup.phase) * 0.08;
    });
    this.portal.rotation.z += delta * (this.portalUnlocked ? 0.24 : 0.035);
    this.redDepthRing.rotation.z -= delta * 0.65;
    if (this.depth === 1 && this.bossKilled) {
      (this.redDepthRing.material as THREE.MeshBasicMaterial).opacity = 0.52 + Math.sin(this.elapsed * 4.2) * 0.18;
    }
    if (this.portalUnlocked) {
      const portalMaterial = this.portalCore.material as THREE.MeshBasicMaterial;
      portalMaterial.opacity = 0.58 + Math.sin(this.elapsed * 3.5) * 0.14;
      this.portal.scale.setScalar(1 + Math.sin(this.elapsed * 2.1) * 0.025);
    }
    const swingProgress = this.swingClock > 0 ? 1 - this.swingClock / Math.min(0.42, this.definition.attackDelay * 0.72) : 0;
    if (this.swingClock > 0) {
      const arc = Math.sin(swingProgress * Math.PI);
      if (this.attackDirection === "OVERHEAD") this.weapon.rotation.x = -0.25 - arc * 1.25;
      if (this.attackDirection === "SWEEP") this.weapon.rotation.y = 0.05 - arc * 1.55;
      if (this.attackDirection === "THRUST") this.weapon.position.z = -1.05 - arc * 0.72;
    } else {
      this.weapon.rotation.x = THREE.MathUtils.lerp(this.weapon.rotation.x, -0.25, delta * 13);
      this.weapon.rotation.y = THREE.MathUtils.lerp(this.weapon.rotation.y, 0.05, delta * 13);
      this.weapon.position.z = THREE.MathUtils.lerp(this.weapon.position.z, -1.05, delta * 13);
    }
    this.shield.position.z = THREE.MathUtils.lerp(this.shield.position.z, this.blocking ? -0.55 : -1.1, delta * 12);
    this.shield.position.x = THREE.MathUtils.lerp(this.shield.position.x, this.blocking ? -0.18 : -0.72, delta * 12);
  }

  private updateHud(): void {
    this.healthFill.style.width = `${Math.max(0, (this.health / this.maxHealth) * 100)}%`;
    this.staminaFill.style.width = `${(this.stamina / this.definition.maxStamina) * 100}%`;
    this.spellFill.style.width = `${this.options.classId === "hexbound" ? (this.spellCharges / this.maxSpellCharges) * 100 : 100}%`;
    this.spellFill.parentElement?.classList.toggle("inactive", this.options.classId !== "hexbound");
    const floorRules = depthRules(this.depth);
    const remaining = floorRules.duration - this.phaseElapsed();
    this.raidClock.textContent = formatTime(remaining);
    this.raidClock.classList.toggle("urgent", remaining < 45);
    const carried = haulCount(this.raidLoot);
    this.lootHud.textContent = `${carried} / ${HAUL_CAPACITY} slots · ${this.goldFound}g`;
    this.objectiveHud.textContent = this.portalUnlocked
      ? this.depth === 2 ? "ASHEN PASSAGE OPEN" : "BLUE PASSAGE OPEN"
      : `${this.depth === 2 ? "ASHEN" : "WARDEN"} SIGILS ${this.sigils} / 2`;
    const ability = CLASS_ABILITIES[this.options.classId];
    this.abilityHud.textContent = this.rageTimer > 0
      ? `${ability.name} · ${Math.ceil(this.rageTimer)}s RAGING`
      : this.abilityCooldown > 0 ? `${ability.name} · ${Math.ceil(this.abilityCooldown)}s` : ability.name;
    this.updateWayfinder();
    this.directionHud.textContent = this.attackDirection;
    this.directionHud.classList.toggle("active", this.mouseAccumulator.x !== 0 || this.mouseAccumulator.y !== 0);
    this.threatHud.classList.toggle("visible", this.threatTimer > 0);
    if (!this.portalAnnounced && this.phaseElapsed() > floorRules.duration * 0.43 && this.sigils < 2) {
      this.portalAnnounced = true;
      this.feed("The dark advances. Wardens carry what the passage needs.", "danger");
    }
  }

  private updateWayfinder(): void {
    const facing = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    this.compassHeadingHud.textContent = cardinalDirection({ x: facing.x, z: facing.z });

    let target: THREE.Vector3 | undefined;
    let label = "WARDEN";
    const looseSigil = this.pickups.find((pickup) => !pickup.collected && pickup.item.kind === "sigil");
    if (looseSigil) {
      target = looseSigil.group.position;
      label = "SIGIL";
    } else if (!this.portalUnlocked) {
      const livingWardens = this.enemies.filter((enemy) => enemy.alive && enemy.kind === "warden");
      livingWardens.sort((left, right) => left.group.position.distanceToSquared(this.camera.position) - right.group.position.distanceToSquared(this.camera.position));
      target = livingWardens[0]?.group.position;
    } else {
      target = this.portal.position;
      label = "PASSAGE";
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
      elapsed: this.elapsed,
      goldFound: this.goldFound,
      bossKilled: this.bossKilled,
    };
    window.setTimeout(() => this.options.onFinish(result), 260);
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
  }

  destroy(): void {
    this.ended = true;
    cancelAnimationFrame(this.animationFrame);
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
    this.lockOverlay.removeEventListener("click", this.requestPointerLock);
    this.audio.stop();
    disposeSceneResources(this.scene);
    this.renderer.renderLists.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.mount.innerHTML = "";
  }
}
