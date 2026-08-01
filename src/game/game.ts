import * as THREE from "three";
import { AudioDirector } from "./audio";
import { CLASSES, RARITY_COLOR, createLoot, createSigil, formatTime } from "./data";
import type { ClassId, Item, RaidEndReason, RaidResult } from "./types";

interface WallCollider {
  x: number;
  z: number;
  halfW: number;
  halfD: number;
}

interface Enemy {
  id: number;
  group: THREE.Group;
  kind: "skeleton" | "crawler" | "warden" | "rival";
  name: string;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  range: number;
  cooldown: number;
  stagger: number;
  alerted: boolean;
  alive: boolean;
  phase: number;
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
}

export interface DarkPixGameOptions {
  classId: ClassId;
  equipped: Item[];
  onFinish: (result: RaidResult) => void;
}

const WORLD_SIZE = 44;
const RAID_DURATION = 210;
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
  private readonly audio = new AudioDirector();
  private readonly keys = new Set<string>();
  private readonly walls: WallCollider[] = [];
  private readonly enemies: Enemy[] = [];
  private readonly pickups: Pickup[] = [];
  private readonly chests: Chest[] = [];
  private readonly raidLoot: Item[] = [];
  private readonly weapon = new THREE.Group();
  private readonly shield = new THREE.Group();
  private readonly portal = new THREE.Group();
  private readonly portalCore = new THREE.Mesh();
  private readonly campfire = new THREE.Group();
  private readonly resizeObserver: ResizeObserver;
  private healthFill!: HTMLElement;
  private staminaFill!: HTMLElement;
  private spellFill!: HTMLElement;
  private raidClock!: HTMLElement;
  private lootHud!: HTMLElement;
  private objectiveHud!: HTMLElement;
  private promptHud!: HTMLElement;
  private feedHud!: HTMLElement;
  private directionHud!: HTMLElement;
  private lockOverlay!: HTMLElement;
  private damageOverlay!: HTMLElement;
  private extractProgress!: HTMLElement;
  private animationFrame = 0;
  private enemyId = 0;
  private elapsed = 0;
  private health: number;
  private stamina: number;
  private spellCharges = 6;
  private kills = 0;
  private goldFound = 0;
  private sigils = 0;
  private portalUnlocked = false;
  private portalAnnounced = false;
  private campfireUsed = false;
  private ended = false;
  private paused = true;
  private blocking = false;
  private blockAge = 0;
  private attackCooldown = 0;
  private swingClock = 0;
  private footstepClock = 0;
  private damageCooldown = 0;
  private interactHeld = false;
  private extractHold = 0;
  private attackDirection: "OVERHEAD" | "THRUST" | "SWEEP" = "THRUST";
  private mouseAccumulator = { x: 0, y: 0 };
  private yaw = 0;
  private pitch = 0;
  private messageTimer = 0;
  private vignette = 0;

  constructor(mount: HTMLElement, options: DarkPixGameOptions) {
    this.mount = mount;
    this.options = options;
    this.definition = CLASSES[options.classId];
    const armorBonus = options.equipped.filter((item) => item.kind === "armor").reduce((sum, item) => sum + item.power, 0);
    this.health = this.definition.maxHealth + armorBonus;
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
      <div class="raid-shell" data-class="${this.options.classId}">
        <div class="render-host"></div>
        <div class="pixel-grid" aria-hidden="true"></div>
        <div class="darkness-vignette" aria-hidden="true"></div>
        <div class="damage-flash" aria-hidden="true"></div>
        <div class="raid-hud">
          <div class="hud-top">
            <section class="contract-panel">
              <span class="eyebrow">CRYPT OF THE PALE TOLL</span>
              <strong class="raid-clock">3:30</strong>
              <span class="zone-copy">darkness dormant</span>
            </section>
            <div class="compass"><span>W</span><strong>⊙</strong><span>E</span></div>
            <section class="objective-panel">
              <span class="eyebrow">CONTRACT</span>
              <strong class="objective-copy">WARDEN SIGILS 0 / 2</strong>
              <span>unseal an extraction</span>
            </section>
          </div>
          <div class="event-feed" role="status"></div>
          <div class="crosshair" aria-hidden="true"><i></i><b></b><em></em><span></span></div>
          <div class="attack-direction">THRUST</div>
          <div class="interaction-prompt"></div>
          <div class="extract-meter"><i></i></div>
          <div class="hud-bottom">
            <section class="vitals">
              <div class="portrait-rune">${this.options.classId === "vanguard" ? "V" : this.options.classId === "cutpurse" ? "C" : "H"}</div>
              <div class="bars">
                <div class="bar health"><i></i><span>VIGOR</span></div>
                <div class="bar stamina"><i></i><span>STAMINA</span></div>
                <div class="bar spells"><i></i><span>MEMORY</span></div>
              </div>
            </section>
            <section class="quick-slots">
              <div><kbd>1</kbd><span class="slot-icon weapon-icon"></span><small>${this.definition.weapon}</small></div>
              <div><kbd>F</kbd><span class="slot-icon potion-icon"></span><small>Coagulation draught</small></div>
              <div><kbd>E</kbd><span class="slot-icon hand-icon"></span><small>Interact / extract</small></div>
            </section>
            <section class="haul-panel">
              <span class="eyebrow">UNSECURED HAUL</span>
              <strong class="loot-count">0 items · 0g</strong>
              <span>death takes all</span>
            </section>
          </div>
        </div>
        <button class="lock-overlay" type="button">
          <span class="sigil-mark">DP</span>
          <strong>ENTER THE CRYPT</strong>
          <small>Click to bind the cursor</small>
          <span class="control-line">WASD move · mouse look · LMB strike · RMB guard · E interact · F heal · Shift sprint</span>
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
    this.directionHud = this.mount.querySelector<HTMLElement>(".attack-direction")!;
    this.lockOverlay = this.mount.querySelector<HTMLElement>(".lock-overlay")!;
    this.damageOverlay = this.mount.querySelector<HTMLElement>(".damage-flash")!;
    this.extractProgress = this.mount.querySelector<HTMLElement>(".extract-meter i")!;
  }

  private configureRenderer(): void {
    this.renderer.setClearColor(0x050606);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = "game-canvas";
    this.scene.background = new THREE.Color(0x050606);
    this.scene.fog = new THREE.FogExp2(0x050707, 0.04);
    this.camera.rotation.order = "YXZ";
    this.camera.position.set(0, PLAYER_HEIGHT, 17.4);
    this.scene.add(this.camera);
    const delverTorch = new THREE.SpotLight(0xffb267, 5.2, 18, Math.PI / 3.8, 0.7, 1.25);
    delverTorch.position.set(0.28, 0.05, 0.1);
    delverTorch.target.position.set(0, -0.12, -1);
    this.camera.add(delverTorch, delverTorch.target);
  }

  private createWorld(): void {
    const floorTexture = pixelTexture("#282622", "#39352e", "#171817");
    floorTexture.repeat.set(11, 11);
    const wallTexture = pixelTexture("#302e2b", "#413d37", "#1a1b1a", true);
    wallTexture.repeat.set(3, 2);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 1, 1),
      new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 1, color: 0x77736b }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.userData.solid = true;
    this.scene.add(floor);

    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE),
      new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 1, side: THREE.DoubleSide }),
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = 4.2;
    this.scene.add(ceiling);

    const wallMat = new THREE.MeshStandardMaterial({ map: wallTexture, roughness: 0.96, color: 0x8b8479 });
    this.addWall(0, -22, 44, 1, wallMat);
    this.addWall(0, 22, 44, 1, wallMat);
    this.addWall(-22, 0, 1, 44, wallMat);
    this.addWall(22, 0, 1, 44, wallMat);
    this.addWall(-10, 14, 1, 15, wallMat);
    this.addWall(-10, -13, 1, 13, wallMat);
    this.addWall(10, 15, 1, 13, wallMat);
    this.addWall(10, -12, 1, 16, wallMat);
    this.addWall(-19, 7, 6, 1, wallMat);
    this.addWall(-12, 7, 4, 1, wallMat);
    this.addWall(12, 7, 4, 1, wallMat);
    this.addWall(19, 7, 6, 1, wallMat);
    this.addWall(-19, -7, 6, 1, wallMat);
    this.addWall(-12, -7, 4, 1, wallMat);
    this.addWall(12, -7, 4, 1, wallMat);
    this.addWall(19, -7, 6, 1, wallMat);
    this.addWall(-4, 3, 12, 1, wallMat);
    this.addWall(5, -3, 11, 1, wallMat);

    for (const [x, z] of [[-19, 19], [19, 19], [-19, -19], [19, -19], [-8, 5], [8, -5]] as const) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 4, 1.1), wallMat);
      pillar.position.set(x, 2, z);
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      this.scene.add(pillar);
      this.walls.push({ x, z, halfW: 0.55, halfD: 0.55 });
    }

    const torches: Array<[number, number, number]> = [
      [-7, 18, 0], [7, 18, 0], [-18, 10, Math.PI / 2], [18, 10, -Math.PI / 2],
      [-7, 1.5, 0], [7, -1.5, Math.PI], [-18, -12, Math.PI / 2], [18, -12, -Math.PI / 2],
      [0, -20.5, Math.PI],
    ];
    torches.forEach(([x, z, rotation], index) => this.addTorch(x, z, rotation, index));

    this.createCampfire(-16, 15);
    this.createPortal(16, -16);
    this.createChest(-16, 11, 0.01);
    this.createChest(16, 12, 0.03);
    this.createChest(-16, -15, 0.08);
    this.createChest(4, -16, 0.12);

    this.spawnEnemy("crawler", -5, 12);
    this.spawnEnemy("skeleton", 5, 9);
    this.spawnEnemy("warden", -16, -11);
    this.spawnEnemy("warden", 15, 2);
    this.spawnEnemy("skeleton", 4, -11);
    this.spawnEnemy("crawler", -4, -17);
    this.spawnEnemy("rival", 14, -12);

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

  private createChest(x: number, z: number, depthBonus: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0.42, z);
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.65, 0.7), material(0x4b2d18));
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.24, 0.74), material(0x66401f));
    lid.position.y = 0.42;
    lid.name = "lid";
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.92, 0.76), material(0x554a3a));
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.24, 0.12), material(0xb07b34));
    lock.position.set(0, 0.22, 0.4);
    group.add(base, lid, band, lock);
    group.traverse((object) => {
      object.castShadow = true;
      object.receiveShadow = true;
    });
    this.scene.add(group);
    this.chests.push({ group, opened: false, depthBonus });
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
    this.portal.add(this.portalCore);
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
    const isCrawler = kind === "crawler";
    const isRival = kind === "rival";
    const isWarden = kind === "warden";
    const bone = material(isRival ? 0x513542 : isWarden ? 0xc2b07f : isCrawler ? 0x695d4d : 0x9c9687);
    const dark = material(isRival ? 0x251720 : 0x27251f);
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
    group.traverse((object) => {
      object.castShadow = true;
      object.userData.enemyId = id;
    });
    this.scene.add(group);
    const stats = kind === "warden"
      ? { hp: 115, speed: 1.35, damage: 24, range: 1.7, name: "Ossuary warden" }
      : kind === "rival"
        ? { hp: 88, speed: 2.2, damage: 19, range: 1.55, name: "Rival delver" }
        : kind === "crawler"
          ? { hp: 38, speed: 2.65, damage: 12, range: 1.15, name: "Grave crawler" }
          : { hp: 64, speed: 1.55, damage: 17, range: 1.55, name: "Hollow legionary" };
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
      stagger: 0,
      alerted: false,
      alive: true,
      phase: Math.random() * Math.PI * 2,
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
    this.renderer.domElement.addEventListener("click", this.requestPointerLock);
    this.lockOverlay.addEventListener("click", this.requestPointerLock);
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    this.keys.add(event.code);
    if (event.code === "KeyE") this.interactHeld = true;
    if (event.code === "KeyF" && !event.repeat) this.usePotion();
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
    if (event.code === "KeyE") {
      this.interactHeld = false;
      this.extractHold = 0;
    }
  };

  private onMouseMove = (event: MouseEvent): void => {
    if (document.pointerLockElement !== this.renderer.domElement || this.ended) return;
    this.yaw -= event.movementX * 0.0023;
    this.pitch -= event.movementY * 0.0021;
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

  private onPointerLockChange = (): void => {
    this.paused = document.pointerLockElement !== this.renderer.domElement;
    this.lockOverlay.classList.toggle("hidden", !this.paused || this.ended);
    if (!this.paused) {
      this.audio.start();
      this.clock.getDelta();
    }
  };

  private requestPointerLock = (): void => {
    if (this.ended) return;
    this.paused = false;
    this.lockOverlay.classList.add("hidden");
    this.audio.start();
    this.clock.getDelta();
    const pointerLockRequest = this.renderer.domElement.requestPointerLock();
    void pointerLockRequest.catch(() => {
      this.feed("Pointer lock unavailable. Keyboard controls remain active.", "system");
    });
  };

  private frame = (): void => {
    this.animationFrame = requestAnimationFrame(this.frame);
    const delta = Math.min(this.clock.getDelta(), 0.05);
    if (!this.paused && !this.ended) this.update(delta);
    this.animateWorld(delta);
    this.renderer.render(this.scene, this.camera);
  };

  private update(delta: number): void {
    this.elapsed += delta;
    this.attackCooldown = Math.max(0, this.attackCooldown - delta);
    this.swingClock = Math.max(0, this.swingClock - delta);
    this.damageCooldown = Math.max(0, this.damageCooldown - delta);
    this.messageTimer = Math.max(0, this.messageTimer - delta);
    this.blockAge += this.blocking ? delta : 0;
    this.vignette = Math.max(0, this.vignette - delta * 1.8);
    this.updateMovement(delta);
    this.updateEnemies(delta);
    this.updateZone(delta);
    this.updateInteraction(delta);
    this.updateHud();

    if (this.elapsed >= RAID_DURATION) this.finish("darkness");
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
    const speed = this.definition.speed * sprintMultiplier * blockMultiplier;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const dx = (input.x * cos - input.y * sin) * speed * delta;
    const dz = (-input.x * sin - input.y * cos) * speed * delta;
    this.tryMove(dx, dz);
    if (sprinting) this.stamina = Math.max(0, this.stamina - delta * (this.options.classId === "cutpurse" ? 17 : 24));
    else if (!this.blocking) this.stamina = Math.min(this.definition.maxStamina, this.stamina + delta * 19);

    if (moving) {
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

  private attack(): void {
    if (this.attackCooldown > 0 || this.blocking || this.stamina < 8) return;
    if (this.options.classId === "hexbound" && this.spellCharges <= 0) {
      this.feed("Your spell memory is ash. Find the campfire.", "danger");
      return;
    }
    this.attackCooldown = this.definition.attackDelay;
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
      if (distance <= this.definition.reach && toEnemy.normalize().dot(forward) > cone && distance < bestDistance) {
        best = enemy;
        bestDistance = distance;
      }
    }
    if (!best) {
      if (this.options.classId === "hexbound") this.spawnSpellTrail(cameraPosition, forward, this.definition.reach);
      return;
    }

    let damage = this.definition.damage + this.options.equipped.filter((item) => item.kind === "weapon").reduce((sum, item) => sum + item.power, 0);
    if (this.attackDirection === "OVERHEAD") damage *= 1.18;
    if (this.attackDirection === "THRUST") damage *= 1.08;
    if (this.options.classId === "cutpurse" && !best.alerted) damage *= 2;
    if (this.pitch < -0.12 && !best.kind.includes("crawler")) damage *= 1.35;
    this.damageEnemy(best, Math.round(damage));
    if (this.options.classId === "hexbound") this.spawnSpellTrail(cameraPosition, forward, bestDistance);
    this.mouseAccumulator.x = 0;
    this.mouseAccumulator.y = 0;
  }

  private spawnSpellTrail(start: THREE.Vector3, forward: THREE.Vector3, distance: number): void {
    const bolt = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, Math.max(0.2, distance)), material(0x5ce3d9, 0x38c9c1));
    bolt.position.copy(start).add(forward.clone().multiplyScalar(distance / 2));
    bolt.quaternion.copy(this.camera.quaternion);
    this.scene.add(bolt);
    window.setTimeout(() => {
      this.scene.remove(bolt);
      bolt.geometry.dispose();
    }, 80);
  }

  private damageEnemy(enemy: Enemy, amount: number): void {
    enemy.hp -= amount;
    enemy.alerted = true;
    enemy.stagger = 0.18;
    this.audio.hit();
    this.feed(`${enemy.name} takes ${amount}.`, enemy.kind === "rival" ? "rival" : "combat");
    enemy.group.scale.set(1.14, 0.9, 1.14);
    if (enemy.hp > 0) return;
    enemy.alive = false;
    this.kills += 1;
    enemy.group.rotation.z = 1.2;
    enemy.group.position.y = -0.55;
    this.feed(`${enemy.name} falls.`, enemy.kind === "rival" ? "rival" : "loot");
    const drop = enemy.kind === "warden" ? createSigil() : createLoot(Math.random, enemy.kind === "rival" ? 0.12 : 0.03);
    this.spawnPickup(drop, enemy.group.position.clone());
  }

  private updateEnemies(delta: number): void {
    const player = this.camera.position;
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      enemy.cooldown = Math.max(0, enemy.cooldown - delta);
      enemy.stagger = Math.max(0, enemy.stagger - delta);
      enemy.group.scale.lerp(new THREE.Vector3(1, 1, 1), delta * 7);
      const toPlayer = new THREE.Vector3(player.x - enemy.group.position.x, 0, player.z - enemy.group.position.z);
      const distance = toPlayer.length();
      if (distance < 10.5) enemy.alerted = true;
      if (!enemy.alerted) {
        enemy.group.rotation.y += Math.sin(this.elapsed * 0.35 + enemy.phase) * delta * 0.15;
        continue;
      }
      if (distance > 15) continue;
      enemy.group.lookAt(player.x, enemy.group.position.y, player.z);
      if (distance > enemy.range && enemy.stagger <= 0) {
        const step = toPlayer.normalize().multiplyScalar(enemy.speed * delta);
        const nextX = enemy.group.position.x + step.x;
        const nextZ = enemy.group.position.z + step.z;
        if (!this.collidesEnemy(nextX, nextZ)) {
          enemy.group.position.x = nextX;
          enemy.group.position.z = nextZ;
        }
        enemy.group.position.y = Math.sin(this.elapsed * 7 + enemy.phase) * 0.025;
      } else if (distance <= enemy.range && enemy.cooldown <= 0 && enemy.stagger <= 0) {
        enemy.cooldown = enemy.kind === "crawler" ? 1.25 : enemy.kind === "warden" ? 1.9 : 1.55;
        const parried = this.blocking && this.blockAge < 0.24;
        if (parried) {
          enemy.stagger = 1.0;
          this.stamina = Math.max(0, this.stamina - 5);
          this.feed(`PARRIED · ${enemy.name} is exposed`, "system");
          this.audio.tone(780, 0.12, "square", 0.13);
        } else {
          const reduction = this.blocking ? (this.options.classId === "hexbound" ? 0.45 : 0.72) : 0;
          this.hurt(enemy.damage * (1 - reduction), enemy.name);
          if (this.blocking) this.stamina = Math.max(0, this.stamina - enemy.damage * 0.75);
        }
      }
    }
  }

  private collidesEnemy(x: number, z: number): boolean {
    return this.walls.some((wall) => Math.abs(x - wall.x) < wall.halfW + 0.3 && Math.abs(z - wall.z) < wall.halfD + 0.3);
  }

  private hurt(amount: number, source: string): void {
    if (this.damageCooldown > 0 || this.ended) return;
    this.damageCooldown = 0.18;
    this.health = Math.max(0, this.health - amount);
    this.vignette = 1;
    this.damageOverlay.classList.remove("pulse");
    void this.damageOverlay.offsetWidth;
    this.damageOverlay.classList.add("pulse");
    this.audio.danger();
    this.feed(`${source} wounds you for ${Math.round(amount)}.`, "danger");
    if (this.health <= 0) this.finish(source === "the dark" ? "darkness" : "slain");
  }

  private usePotion(): void {
    if (this.paused || this.ended || this.health >= this.definition.maxHealth) return;
    const potionIndex = this.raidLoot.findIndex((item) => item.kind === "consumable");
    if (potionIndex < 0) {
      this.feed("No draught in your unsecured haul.", "danger");
      return;
    }
    const [potion] = this.raidLoot.splice(potionIndex, 1);
    this.health = Math.min(this.definition.maxHealth, this.health + 36);
    this.feed(`${potion?.name ?? "Draught"} restores 36 vigor.`, "loot");
    this.audio.loot();
  }

  private updateZone(delta: number): void {
    const progress = THREE.MathUtils.clamp((this.elapsed - 20) / (RAID_DURATION - 20), 0, 1);
    const safeRadius = THREE.MathUtils.lerp(31, 6.2, progress);
    const distance = Math.hypot(this.camera.position.x, this.camera.position.z);
    const zoneCopy = this.mount.querySelector<HTMLElement>(".zone-copy");
    if (zoneCopy) zoneCopy.textContent = progress === 0 ? "darkness dormant" : `safe reach ${Math.round(safeRadius)}m`;
    if (distance > safeRadius) {
      this.vignette = Math.max(this.vignette, 0.68);
      if (this.damageCooldown <= 0) this.hurt(delta * 23, "the dark");
    }
    const shell = this.mount.querySelector<HTMLElement>(".raid-shell");
    shell?.style.setProperty("--darkness", String(Math.max(this.vignette, distance > safeRadius ? 0.85 : progress * 0.26)));
  }

  private updateInteraction(delta: number): void {
    let prompt = "";
    let interactive: "pickup" | "chest" | "campfire" | "portal" | undefined;
    let targetPickup: Pickup | undefined;
    let targetChest: Chest | undefined;
    let nearest = 2.6;

    for (const pickup of this.pickups) {
      if (pickup.collected) continue;
      const distance = pickup.group.position.distanceTo(this.camera.position);
      if (distance < nearest) {
        nearest = distance;
        targetPickup = pickup;
        interactive = "pickup";
      }
    }
    for (const chest of this.chests) {
      if (chest.opened) continue;
      const distance = chest.group.position.distanceTo(this.camera.position);
      if (distance < nearest) {
        nearest = distance;
        targetChest = chest;
        interactive = "chest";
      }
    }
    if (!this.campfireUsed && this.campfire.position.distanceTo(this.camera.position) < nearest) {
      nearest = this.campfire.position.distanceTo(this.camera.position);
      interactive = "campfire";
    }
    if (this.portalUnlocked && this.portal.position.distanceTo(this.camera.position) < 3.1) {
      interactive = "portal";
    }

    if (interactive === "pickup" && targetPickup) prompt = `[ E ] TAKE ${targetPickup.item.rarity.toUpperCase()} ${targetPickup.item.name.toUpperCase()}`;
    if (interactive === "chest") prompt = "[ E ] SEARCH IRONBOUND COFFER";
    if (interactive === "campfire") prompt = "[ E ] REST · RESTORE VIGOR AND SPELL MEMORY";
    if (interactive === "portal") prompt = "[ HOLD E ] OPEN THE BLUE PASSAGE";
    this.promptHud.textContent = prompt;
    this.promptHud.classList.toggle("visible", Boolean(prompt));

    if (!this.interactHeld) return;
    if (interactive === "pickup" && targetPickup) {
      this.collectPickup(targetPickup);
      this.interactHeld = false;
    } else if (interactive === "chest" && targetChest) {
      this.openChest(targetChest);
      this.interactHeld = false;
    } else if (interactive === "campfire") {
      this.useCampfire();
      this.interactHeld = false;
    } else if (interactive === "portal") {
      this.extractHold += delta;
      this.extractProgress.style.width = `${Math.min(100, (this.extractHold / 1.8) * 100)}%`;
      this.extractProgress.parentElement?.classList.add("visible");
      if (this.extractHold >= 1.8) this.finish("extracted");
    }
  }

  private collectPickup(pickup: Pickup): void {
    pickup.collected = true;
    pickup.group.visible = false;
    this.raidLoot.push(pickup.item);
    if (pickup.item.kind === "sigil") {
      this.sigils += 1;
      if (this.sigils >= 2) this.unlockPortal();
    } else if (pickup.item.kind === "treasure") {
      const coins = Math.max(3, Math.floor(pickup.item.value * 0.35));
      this.goldFound += coins;
    }
    this.audio.loot();
    this.feed(`${pickup.item.rarity} ${pickup.item.name} secured for now.`, "loot");
  }

  private openChest(chest: Chest): void {
    chest.opened = true;
    const lid = chest.group.getObjectByName("lid");
    if (lid) {
      lid.rotation.x = -1.1;
      lid.position.y = 0.65;
      lid.position.z = -0.22;
    }
    const origin = chest.group.position.clone();
    this.spawnPickup(createLoot(Math.random, chest.depthBonus), origin.clone().add(new THREE.Vector3(-0.45, 0, 0.7)));
    this.spawnPickup(createLoot(Math.random, chest.depthBonus), origin.clone().add(new THREE.Vector3(0.45, 0, 0.7)));
    this.feed("The coffer coughs up two pieces.", "loot");
    this.audio.loot();
  }

  private useCampfire(): void {
    this.campfireUsed = true;
    this.health = Math.min(this.definition.maxHealth, this.health + 52);
    this.spellCharges = 6;
    this.stamina = this.definition.maxStamina;
    this.feed("You rest once. Footsteps echo while memory returns.", "system");
    this.audio.portal();
  }

  private unlockPortal(): void {
    this.portalUnlocked = true;
    this.audio.portal();
    this.feed("BLUE PASSAGE UNSEALED · southeast reliquary", "system");
    this.portalAnnounced = true;
    const portalMaterial = this.portalCore.material as THREE.MeshBasicMaterial;
    portalMaterial.opacity = 0.72;
    const light = this.portal.getObjectByName("portalLight") as THREE.PointLight | undefined;
    if (light) light.intensity = 2.8;
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
    const healthMax = this.definition.maxHealth + this.options.equipped.filter((item) => item.kind === "armor").reduce((sum, item) => sum + item.power, 0);
    this.healthFill.style.width = `${Math.max(0, (this.health / healthMax) * 100)}%`;
    this.staminaFill.style.width = `${(this.stamina / this.definition.maxStamina) * 100}%`;
    this.spellFill.style.width = `${this.options.classId === "hexbound" ? (this.spellCharges / 6) * 100 : 100}%`;
    this.spellFill.parentElement?.classList.toggle("inactive", this.options.classId !== "hexbound");
    this.raidClock.textContent = formatTime(RAID_DURATION - this.elapsed);
    this.raidClock.classList.toggle("urgent", RAID_DURATION - this.elapsed < 45);
    this.lootHud.textContent = `${this.raidLoot.length} item${this.raidLoot.length === 1 ? "" : "s"} · ${this.goldFound}g`;
    this.objectiveHud.textContent = this.portalUnlocked ? "BLUE PASSAGE OPEN" : `WARDEN SIGILS ${this.sigils} / 2`;
    this.directionHud.textContent = this.attackDirection;
    this.directionHud.classList.toggle("active", this.mouseAccumulator.x !== 0 || this.mouseAccumulator.y !== 0);
    if (!this.interactHeld || !this.portalUnlocked) {
      this.extractProgress.style.width = "0%";
      this.extractProgress.parentElement?.classList.remove("visible");
    }
    if (!this.portalAnnounced && this.elapsed > 90 && this.sigils < 2) {
      this.portalAnnounced = true;
      this.feed("The dark advances. Wardens carry what the passage needs.", "danger");
    }
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
    if (document.pointerLockElement === this.renderer.domElement) void document.exitPointerLock();
    const result: RaidResult = {
      reason,
      classId: this.options.classId,
      loot: [...this.raidLoot],
      equippedIds: this.options.equipped.map((item) => item.id),
      kills: this.kills,
      elapsed: this.elapsed,
      goldFound: this.goldFound,
    };
    window.setTimeout(() => this.options.onFinish(result), 260);
  }

  private resize(): void {
    const width = Math.max(1, this.mount.clientWidth);
    const height = Math.max(1, this.mount.clientHeight);
    const renderScale = width < 700 ? 0.72 : 0.82;
    this.renderer.setSize(Math.floor(width * renderScale), Math.floor(height * renderScale), false);
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
    this.renderer.domElement.removeEventListener("click", this.requestPointerLock);
    this.lockOverlay.removeEventListener("click", this.requestPointerLock);
    this.audio.stop();
    this.renderer.dispose();
    this.mount.innerHTML = "";
  }
}
