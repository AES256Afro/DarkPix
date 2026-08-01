export type AudioContextFactory = () => AudioContext | undefined;

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

  constructor(
    private readonly enabled = true,
    private readonly contextFactory: AudioContextFactory = createBrowserAudioContext,
  ) {}

  start(): void {
    if (!this.enabled) return;
    if (this.context) {
      if (this.context.state !== "closed") void this.context.resume().catch(() => undefined);
      return;
    }
    const context = this.contextFactory();
    if (!context) return;
    try {
      const master = context.createGain();
      master.gain.value = 0.18;
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
      if (context.state !== "running") void context.resume().catch(() => undefined);
    } catch {
      void context.close().catch(() => undefined);
    }
  }

  pause(): void {
    if (this.context?.state === "running") void this.context.suspend().catch(() => undefined);
  }

  tone(frequency: number, duration = 0.09, type: OscillatorType = "square", volume = 0.11): void {
    if (!this.enabled) return;
    if (!this.context || !this.master) return;
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
  }

  attack(): void {
    this.tone(115, 0.12, "sawtooth", 0.1);
  }

  hit(): void {
    this.tone(62, 0.16, "square", 0.16);
  }

  loot(): void {
    this.tone(390, 0.08, "sine", 0.12);
    window.setTimeout(() => this.tone(585, 0.12, "sine", 0.1), 65);
  }

  portal(): void {
    this.tone(180, 0.35, "sine", 0.12);
    window.setTimeout(() => this.tone(360, 0.5, "sine", 0.1), 160);
  }

  danger(): void {
    this.tone(52, 0.45, "sawtooth", 0.08);
  }

  stop(): void {
    try {
      this.drone?.stop();
    } catch {
      // The context may already have ended after a browser lifecycle interruption.
    }
    this.drone?.disconnect();
    this.droneGain?.disconnect();
    this.master?.disconnect();
    void this.context?.close().catch(() => undefined);
    this.context = undefined;
    this.master = undefined;
    this.drone = undefined;
    this.droneGain = undefined;
  }
}
