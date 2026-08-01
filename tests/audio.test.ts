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
    const audio = new AudioDirector(true, () => undefined);
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
    const audio = new AudioDirector(true, factory);
    audio.start();
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
});
