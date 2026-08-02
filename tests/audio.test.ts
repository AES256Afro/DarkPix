import { describe, expect, it, vi } from "vitest";
import { AudioDirector, footstepCadenceCrossed } from "../src/game/audio";

function audioHarness() {
  const master = { gain: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() };
  const droneGain = { gain: { value: 0 }, connect: vi.fn(() => master), disconnect: vi.fn() };
  const oscillator = {
    type: "sine",
    frequency: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    connect: vi.fn(() => droneGain),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null as (() => void) | null,
  };
  const context = {
    state: "suspended",
    currentTime: 4,
    destination: {},
    createGain: vi.fn()
      .mockReturnValueOnce(master)
      .mockReturnValueOnce(droneGain)
      .mockReturnValue({ gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn(() => master), disconnect: vi.fn() }),
    createOscillator: vi.fn(() => oscillator),
    resume: vi.fn(async () => undefined),
    suspend: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  };
  return { context, master, droneGain, oscillator };
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
    audio.pause();
    audio.start();
    rejectFirstResume(new Error("superseded browser request"));
    await Promise.resolve();
    audio.attack();
    expect(harness.context.createOscillator).toHaveBeenCalledTimes(2);
  });
});
