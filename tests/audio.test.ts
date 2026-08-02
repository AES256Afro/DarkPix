import { describe, expect, it, vi } from "vitest";
import { AudioDirector, footstepCadenceCrossed } from "../src/game/audio";

function audioHarness() {
  const master = { gain: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() };
  const droneGain = { gain: { value: 0 }, connect: vi.fn(() => master), disconnect: vi.fn() };
  const frequency = { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
  const oscillator = { start: vi.fn(), stop: vi.fn(), frequency };
  const oscillators: Array<{
    type: string;
    frequency: typeof frequency;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    onended: (() => void) | null;
  }> = [];
  const createOscillator = () => {
    const node = {
      type: "sine",
      frequency,
      connect: vi.fn(() => droneGain),
      disconnect: vi.fn(),
      start: oscillator.start,
      stop: oscillator.stop,
      onended: null as (() => void) | null,
    };
    oscillators.push(node);
    return node;
  };
  const context = {
    state: "suspended",
    currentTime: 4,
    destination: {},
    createGain: vi.fn()
      .mockReturnValueOnce(master)
      .mockReturnValueOnce(droneGain)
      .mockReturnValue({ gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn(() => master), disconnect: vi.fn() }),
    createOscillator: vi.fn(createOscillator),
    resume: vi.fn(async () => undefined),
    suspend: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  };
  return { context, master, droneGain, oscillator, oscillators };
}

describe("raid audio lifecycle", () => {
  it("emits one movement cue only when accumulated distance crosses a stride", () => {
    expect(footstepCadenceCrossed(1.2, 1.7, 1.6)).toBe(true);
    expect(footstepCadenceCrossed(1.7, 2.9, 1.6)).toBe(false);
    expect(footstepCadenceCrossed(3.1, 3.3, 1.6)).toBe(true);
    expect(footstepCadenceCrossed(2, 1, 1.6)).toBe(false);
  });

  it("quietly disables audio when no browser context is available", () => {
    const audio = new AudioDirector(true, 1, () => undefined);
    expect(() => {
      audio.start();
      audio.tone(200);
      audio.pause();
      audio.stop();
    }).not.toThrow();
  });

  it("contains an audio-context factory that disappears during startup", () => {
    const audio = new AudioDirector(true, 1, () => { throw new Error("audio API unavailable"); });
    expect(() => audio.start()).not.toThrow();
  });

  it("disconnects a partially created persistent graph when startup fails", () => {
    const harness = audioHarness();
    harness.oscillator.start.mockImplementationOnce(() => { throw new Error("audio device lost"); });
    const audio = new AudioDirector(true, 1, () => harness.context as unknown as AudioContext);
    expect(() => audio.start()).not.toThrow();
    expect(harness.oscillator.stop).toHaveBeenCalledOnce();
    expect(harness.oscillators[0]?.disconnect).toHaveBeenCalledOnce();
    expect(harness.droneGain.disconnect).toHaveBeenCalledOnce();
    expect(harness.master.disconnect).toHaveBeenCalledOnce();
    expect(harness.context.close).toHaveBeenCalledOnce();
  });

  it("starts, pauses, resumes, and disconnects the persistent drone", () => {
    const harness = audioHarness();
    const factory = vi.fn(() => harness.context as unknown as AudioContext);
    const audio = new AudioDirector(true, 0.5, factory);
    audio.start();
    expect(harness.master.gain.value).toBe(0.09);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(harness.oscillator.start).toHaveBeenCalledOnce();
    expect(harness.context.resume).toHaveBeenCalledOnce();
    harness.context.state = "running";
    audio.pause();
    expect(harness.context.suspend).toHaveBeenCalledOnce();
    harness.context.state = "suspended";
    audio.start();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(harness.context.resume).toHaveBeenCalledTimes(2);
    audio.stop();
    expect(harness.oscillator.stop).toHaveBeenCalledOnce();
    expect(harness.droneGain.disconnect).toHaveBeenCalledOnce();
    expect(harness.master.disconnect).toHaveBeenCalledOnce();
    expect(harness.context.close).toHaveBeenCalledOnce();
  });

  it("clamps malformed master gain before creating browser audio", () => {
    const loud = audioHarness();
    new AudioDirector(true, 99, () => loud.context as unknown as AudioContext).start();
    expect(loud.master.gain.value).toBe(0.18);
    const fallback = audioHarness();
    new AudioDirector(true, Number.NaN, () => fallback.context as unknown as AudioContext).start();
    expect(fallback.master.gain.value).toBe(0.18);
  });

  it("makes crouched steps quieter and armored sprint steps heavier", () => {
    const harness = audioHarness();
    const audio = new AudioDirector(true, 1, () => harness.context as unknown as AudioContext);
    audio.start();
    harness.context.state = "running";
    audio.footstep(true, false, 0);
    expect(harness.oscillator.frequency.setValueAtTime).toHaveBeenLastCalledWith(112, 4);
    audio.footstep(false, true, 20);
    expect(harness.oscillator.frequency.setValueAtTime).toHaveBeenLastCalledWith(48, 4);
  });

  it("distinguishes an occluded rival from a heavy keeper step", () => {
    const harness = audioHarness();
    const audio = new AudioDirector(true, 1, () => harness.context as unknown as AudioContext);
    audio.start();
    harness.context.state = "running";
    audio.threatFootstep("rival", 8);
    expect(harness.oscillator.frequency.setValueAtTime).toHaveBeenLastCalledWith(74, 4);
    audio.threatFootstep("boss", 4);
    expect(harness.oscillator.frequency.setValueAtTime).toHaveBeenLastCalledWith(42, 4);
  });

  it("cancels queued feedback when the raid pauses or stops", () => {
    vi.useFakeTimers();
    try {
      const harness = audioHarness();
      const audio = new AudioDirector(true, 1, () => harness.context as unknown as AudioContext);
      audio.start();
      harness.context.state = "running";
      audio.loot();
      expect(harness.context.createOscillator).toHaveBeenCalledTimes(2);
      audio.pause();
      vi.advanceTimersByTime(200);
      expect(harness.context.createOscillator).toHaveBeenCalledTimes(2);

      harness.context.state = "suspended";
      audio.start();
      audio.portal();
      expect(harness.context.createOscillator).toHaveBeenCalledTimes(3);
      vi.advanceTimersByTime(160);
      expect(harness.context.createOscillator).toHaveBeenCalledTimes(4);
      audio.stop();
      audio.loot();
      vi.runAllTimers();
      expect(harness.context.createOscillator).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops and disconnects active transient tones when the raid pauses", () => {
    const harness = audioHarness();
    const audio = new AudioDirector(true, 1, () => harness.context as unknown as AudioContext);
    audio.start();
    harness.context.state = "running";
    audio.attack();
    const transient = harness.oscillators[1]!;
    expect(transient.stop).toHaveBeenCalledTimes(1);
    audio.pause();
    expect(transient.stop).toHaveBeenCalledTimes(2);
    expect(transient.disconnect).toHaveBeenCalledOnce();
  });

  it("disconnects a transient tone when the browser rejects its start", () => {
    const harness = audioHarness();
    const audio = new AudioDirector(true, 1, () => harness.context as unknown as AudioContext);
    audio.start();
    harness.context.state = "running";
    const broken = {
      ...harness.oscillators[0]!,
      connect: vi.fn(() => harness.droneGain),
      disconnect: vi.fn(),
      start: vi.fn(() => { throw new Error("audio device lost"); }),
      stop: vi.fn(),
      onended: null,
    };
    harness.context.createOscillator.mockImplementationOnce(() => broken);
    expect(() => audio.attack()).not.toThrow();
    expect(broken.stop).toHaveBeenCalledOnce();
    expect(broken.disconnect).toHaveBeenCalledOnce();
  });

  it("rebuilds audio after the browser closes its context", () => {
    const first = audioHarness();
    const second = audioHarness();
    const factory = vi.fn()
      .mockReturnValueOnce(first.context as unknown as AudioContext)
      .mockReturnValueOnce(second.context as unknown as AudioContext);
    const audio = new AudioDirector(true, 1, factory);
    audio.start();
    first.context.state = "closed";
    audio.start();
    expect(factory).toHaveBeenCalledTimes(2);
    expect(first.master.disconnect).toHaveBeenCalledOnce();
    expect(second.oscillator.start).toHaveBeenCalledOnce();
  });

  it("ignores an old resume failure after a newer playback request", async () => {
    const harness = audioHarness();
    let rejectFirstResume: (reason?: unknown) => void = () => undefined;
    harness.context.resume = vi.fn()
      .mockImplementationOnce(() => new Promise<void>((_resolve, reject) => {
        rejectFirstResume = reject;
      }))
      .mockResolvedValue(undefined);
    const audio = new AudioDirector(true, 1, () => harness.context as unknown as AudioContext);
    audio.start();
    audio.attack();
    const transient = harness.oscillators[1]!;
    audio.pause();
    audio.start();
    rejectFirstResume(new Error("superseded browser request"));
    await Promise.resolve();
    expect(transient.stop).toHaveBeenCalledTimes(2);
    expect(transient.disconnect).toHaveBeenCalledOnce();
    audio.attack();
    expect(harness.context.createOscillator).toHaveBeenCalledTimes(3);
  });
});
