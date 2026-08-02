export type AudioContextFactory = () => AudioContext | undefined;

export function footstepCadenceCrossed(previousDistance: number, currentDistance: number, strideLength: number): boolean {
  if (![previousDistance, currentDistance, strideLength].every(Number.isFinite) || previousDistance < 0 || currentDistance < previousDistance || strideLength <= 0) return false;
  return Math.floor(previousDistance / strideLength) < Math.floor(currentDistance / strideLength);
}

function createBrowserAudioContext(): AudioContext | undefined {
  if (typeof window === "undefined" || typeof window.AudioContext !== "function") return undefined;
  try {
    return new window.AudioContext();
  } catch {
    return undefined;
  }
}

export class AudioDirector {
  private context?: AudioContext;
  private master?: GainNode;
  private drone?: OscillatorNode;
  private droneGain?: GainNode;
  private playbackAllowed = false;
  private playbackEpoch = 0;
  private readonly delayedTones = new Set<ReturnType<typeof globalThis.setTimeout>>();
  private readonly volume: number;

  constructor(
    private readonly enabled = true,
    volume = 1,
    private readonly contextFactory: AudioContextFactory = createBrowserAudioContext,
  ) {
    this.volume = Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 1;
  }

  start(): void {
    if (!this.enabled) return;
    const epoch = ++this.playbackEpoch;
    if (this.context) {
      if (this.context.state !== "closed") {
        this.playbackAllowed = true;
        this.resumeContext(this.context, epoch);
        return;
      }
      this.releaseGraph();
    }
    const context = this.contextFactory();
    if (!context) return;
    try {
      const master = context.createGain();
      master.gain.value = 0.18 * this.volume;
      master.connect(context.destination);
      const drone = context.createOscillator();
      const droneGain = context.createGain();
      drone.type = "sawtooth";
      drone.frequency.value = 43;
      droneGain.gain.value = 0.018;
      drone.connect(droneGain).connect(master);
      drone.start();
      this.context = context;
      this.master = master;
      this.drone = drone;
      this.droneGain = droneGain;
      this.playbackAllowed = true;
      this.resumeContext(context, epoch);
    } catch {
      this.playbackAllowed = false;
      void context.close().catch(() => undefined);
    }
  }

  pause(): void {
    this.playbackEpoch += 1;
    this.playbackAllowed = false;
    this.clearDelayedTones();
    if (this.context && this.context.state !== "closed") {
      void this.context.suspend().catch(() => undefined);
    }
  }

  tone(frequency: number, duration = 0.09, type: OscillatorType = "square", volume = 0.11): void {
    if (!this.enabled || !this.playbackAllowed) return;
    if (!this.context || !this.master) return;
    try {
      const now = this.context.currentTime;
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, now);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(24, frequency * 0.7), now + duration);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      oscillator.connect(gain).connect(this.master);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
      oscillator.start(now);
      oscillator.stop(now + duration);
    } catch {
      // Browser audio may disappear during a tab or device lifecycle change.
    }
  }

  attack(): void {
    this.tone(115, 0.12, "sawtooth", 0.1);
  }

  footstep(crouching: boolean, sprinting: boolean, armorWeight: number): void {
    const safeArmor = Number.isFinite(armorWeight) ? Math.min(30, Math.max(0, armorWeight)) : 0;
    const frequency = (crouching ? 112 : sprinting ? 62 : 82) - safeArmor * 0.7;
    const volume = (crouching ? 0.018 : sprinting ? 0.05 : 0.03) + safeArmor * 0.0012;
    this.tone(Math.max(35, frequency), crouching ? 0.045 : 0.065, "triangle", Math.min(0.075, volume));
  }

  hit(): void {
    this.tone(62, 0.16, "square", 0.16);
  }

  loot(): void {
    if (!this.playbackAllowed) return;
    this.tone(390, 0.08, "sine", 0.12);
    this.delayTone(() => this.tone(585, 0.12, "sine", 0.1), 65);
  }

  portal(): void {
    if (!this.playbackAllowed) return;
    this.tone(180, 0.35, "sine", 0.12);
    this.delayTone(() => this.tone(360, 0.5, "sine", 0.1), 160);
  }

  danger(): void {
    this.tone(52, 0.45, "sawtooth", 0.08);
  }

  stop(): void {
    this.playbackEpoch += 1;
    this.playbackAllowed = false;
    this.clearDelayedTones();
    try {
      this.drone?.stop();
    } catch {
      // The context may already have ended after a browser lifecycle interruption.
    }
    void this.context?.close().catch(() => undefined);
    this.releaseGraph();
  }

  private resumeContext(context: AudioContext, epoch: number): void {
    if (context.state === "running") return;
    void context.resume().catch(() => {
      if (this.context !== context || this.playbackEpoch !== epoch) return;
      this.playbackAllowed = false;
      this.clearDelayedTones();
    });
  }

  private delayTone(callback: () => void, delay: number): void {
    const timer = globalThis.setTimeout(() => {
      this.delayedTones.delete(timer);
      if (this.playbackAllowed) callback();
    }, delay);
    this.delayedTones.add(timer);
  }

  private clearDelayedTones(): void {
    for (const timer of this.delayedTones) globalThis.clearTimeout(timer);
    this.delayedTones.clear();
  }

  private releaseGraph(): void {
    this.drone?.disconnect();
    this.droneGain?.disconnect();
    this.master?.disconnect();
    this.context = undefined;
    this.master = undefined;
    this.drone = undefined;
    this.droneGain = undefined;
  }
}
