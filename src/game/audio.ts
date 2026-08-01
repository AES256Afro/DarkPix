export class AudioDirector {
  private context?: AudioContext;
  private master?: GainNode;
  private drone?: OscillatorNode;

  start(): void {
    if (this.context) {
      void this.context.resume();
      return;
    }
    const AudioContextConstructor = window.AudioContext;
    this.context = new AudioContextConstructor();
    this.master = this.context.createGain();
    this.master.gain.value = 0.18;
    this.master.connect(this.context.destination);
    this.drone = this.context.createOscillator();
    const droneGain = this.context.createGain();
    this.drone.type = "sawtooth";
    this.drone.frequency.value = 43;
    droneGain.gain.value = 0.018;
    this.drone.connect(droneGain).connect(this.master);
    this.drone.start();
  }

  tone(frequency: number, duration = 0.09, type: OscillatorType = "square", volume = 0.11): void {
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
    this.drone?.stop();
    void this.context?.close();
    this.context = undefined;
    this.master = undefined;
    this.drone = undefined;
  }
}
