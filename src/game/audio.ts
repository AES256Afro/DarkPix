import type { ThreatKind } from "./types";

export type AudioContextFactory = () => AudioContext | undefined;

export function footstepCadenceCrossed(previousDistance: number, currentDistance: number, strideLength: number): boolean {
  if (!Number.isFinite(previousDistance) || !Number.isFinite(currentDistance) || !Number.isFinite(strideLength) || previousDistance < 0 || currentDistance < previousDistance || strideLength <= 0) return false;
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
  private readonly activeTones = new Map<OscillatorNode, GainNode>();
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
    this.clearActiveTones();
    if (this.context && this.context.state !== "closed") {
      void this.context.suspend().catch(() => undefined);
    }
  }

  tone(frequency: number, duration = 0.09, type: OscillatorType = "square", volume = 0.11): void {
    if (!this.enabled || !this.playbackAllowed) return;
    if (!this.context || !this.master) return;
    let oscillator: OscillatorNode | undefined;
    let gain: GainNode | undefined;
    try {
      const now = this.context.currentTime;
      oscillator = this.context.createOscillator();
      gain = this.context.createGain();
      const toneOscillator = oscillator;
      const toneGain = gain;
      toneOscillator.type = type;
      toneOscillator.frequency.setValueAtTime(frequency, now);
      toneOscillator.frequency.exponentialRampToValueAtTime(Math.max(24, frequency * 0.7), now + duration);
      toneGain.gain.setValueAtTime(volume, now);
      toneGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      toneOscillator.connect(toneGain).connect(this.master);
      const release = () => {
        this.activeTones.delete(toneOscillator);
        toneOscillator.disconnect();
        toneGain.disconnect();
      };
      toneOscillator.onended = release;
      this.activeTones.set(toneOscillator, toneGain);
      toneOscillator.start(now);
      toneOscillator.stop(now + duration);
    } catch {
      if (oscillator) {
        this.activeTones.delete(oscillator);
        oscillator.onended = null;
        try {
          oscillator.stop();
        } catch {
          // A partially started oscillator may reject an explicit stop.
        }
        oscillator.disconnect();
      }
      gain?.disconnect();
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

  threatFootstep(kind: ThreatKind, distance: number): void {
    const safeDistance = Number.isFinite(distance) ? Math.min(16, Math.max(0, distance)) : 16;
    const frequency = kind === "boss" ? 42 : kind === "rival" ? 74 : kind === "crawler" ? 118 : kind === "mimic" ? 92 : 64;
    const presence = 1 - safeDistance / 20;
    this.tone(frequency, kind === "boss" ? 0.11 : 0.07, kind === "rival" ? "triangle" : "square", 0.012 + presence * (kind === "boss" ? 0.055 : 0.038));
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
    this.clearActiveTones();
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
      this.clearActiveTones();
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

  private clearActiveTones(): void {
    for (const [oscillator, gain] of this.activeTones) {
      oscillator.onended = null;
      try {
        oscillator.stop();
      } catch {
        // The tone may already have ended while the page was losing focus.
      }
      oscillator.disconnect();
      gain.disconnect();
    }
    this.activeTones.clear();
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
