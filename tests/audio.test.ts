import { describe, expect, it, vi } from "vitest";
import { AudioDirector } from "../src/game/audio";

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
});
