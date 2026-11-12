import { afterEach, describe, expect, it, vi } from "vitest";
import { createMicrophoneCapture } from "../microphoneCapture";

const audioStream = () => {
  const track = Object.assign(new EventTarget(), { readyState: "live", stop: vi.fn() });
  return { track, stream: { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream };
};

const microphoneDevices = (getUserMedia: ReturnType<typeof vi.fn>) => Object.assign(new EventTarget(), { getUserMedia }) as unknown as MediaDevices;
afterEach(() => vi.useRealTimers());

describe("persistent microphone capture", () => {
  it("recovers a lost device and ignores unrelated changes while healthy", async () => {
    vi.useFakeTimers();
    const first = audioStream(), second = audioStream(), onStream = vi.fn();
    const getUserMedia = vi.fn().mockResolvedValueOnce(first.stream).mockResolvedValueOnce(second.stream);
    const devices = microphoneDevices(getUserMedia);
    const capture = createMicrophoneCapture({ devices, deviceId: "usb-mixer", onStream });
    await vi.advanceTimersByTimeAsync(0);
    devices.dispatchEvent(new Event("devicechange"));
    await vi.advanceTimersByTimeAsync(1000);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    first.track.readyState = "ended";
    first.track.dispatchEvent(new Event("ended"));
    await vi.advanceTimersByTimeAsync(200);
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(getUserMedia.mock.calls[1][0].audio).toMatchObject({ deviceId: { exact: "usb-mixer" }, echoCancellation: false, noiseSuppression: false, autoGainControl: false });
    expect(onStream).toHaveBeenLastCalledWith(second.stream);
    capture.stop();
    expect(second.track.stop).toHaveBeenCalledTimes(1);
  });

  it("retries temporarily missing devices but stops when disabled", async () => {
    vi.useFakeTimers();
    const recovered = audioStream();
    const getUserMedia = vi.fn().mockRejectedValueOnce(new DOMException("Unavailable", "NotFoundError")).mockResolvedValueOnce(recovered.stream);
    const capture = createMicrophoneCapture({ devices: microphoneDevices(getUserMedia), onStream: vi.fn() });
    await vi.advanceTimersByTimeAsync(2000);
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    capture.stop();
    await vi.advanceTimersByTimeAsync(10000);
    expect(getUserMedia).toHaveBeenCalledTimes(2);
  });

  it("does not repeatedly request denied permission and stops late streams", async () => {
    vi.useFakeTimers();
    const denied = vi.fn().mockRejectedValue(new DOMException("Denied", "NotAllowedError"));
    const capture = createMicrophoneCapture({ devices: microphoneDevices(denied), onStream: vi.fn() });
    await vi.advanceTimersByTimeAsync(10000);
    expect(denied).toHaveBeenCalledTimes(1);
    capture.stop();
    const late = audioStream();
    let resolveCapture: (stream: MediaStream) => void = () => undefined;
    const getUserMedia = vi.fn(() => new Promise<MediaStream>(resolve => { resolveCapture = resolve; }));
    const onStream = vi.fn();
    const pending = createMicrophoneCapture({ devices: microphoneDevices(getUserMedia), onStream });
    pending.stop();
    resolveCapture(late.stream);
    await vi.advanceTimersByTimeAsync(0);
    expect(late.track.stop).toHaveBeenCalledTimes(1);
    expect(onStream).not.toHaveBeenCalled();
  });
});
