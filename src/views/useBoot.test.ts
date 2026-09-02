import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BOOT_TIMEOUT_MS, useBoot } from "./useBoot";
import { db } from "../db/bowlingDb";
import { createSession, setHandedness } from "../services/bowlingRepository";

describe("useBoot", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("opens an empty device with nothing to resume and no history", async () => {
    const { result } = renderHook(() => useBoot(false));

    await waitFor(() => expect(result.current.booted).toBe(true));
    expect(result.current.handednessKnown).toBe(true);
    expect(result.current.handedness).toBeNull();
    expect(result.current.hasSavedData).toBe(false);
    expect(result.current.resumable).toBeNull();
  });

  it("reads the stored handedness and the history in one gate", async () => {
    await setHandedness("left");
    await createSession({ date: "2026-05-27", alley_name: "Boot Lanes" });

    const { result } = renderHook(() => useBoot(false));

    await waitFor(() => expect(result.current.booted).toBe(true));
    expect(result.current.handedness).toBe("left");
    expect(result.current.hasSavedData).toBe(true);
  });

  it("leaves the resume read out when the URL already named a screen", async () => {
    const { result } = renderHook(() => useBoot(true));

    await waitFor(() => expect(result.current.booted).toBe(true));
    expect(result.current.resumable).toBeNull();
  });

  /**
   * A read that never settles must not hold the app shut. It opens anyway, with
   * `handednessKnown` false, which is what keeps "Start fresh" away from a
   * bowler who does have history.
   */
  it("releases after the timeout when a read hangs, without claiming the hand is unknown", async () => {
    vi.useFakeTimers();
    vi.spyOn(db.settings, "get").mockReturnValue(
      new Promise(() => {}) as ReturnType<typeof db.settings.get>
    );

    const { result } = renderHook(() => useBoot(false));
    expect(result.current.booted).toBe(false);

    // Past the deadline rather than exactly on it: the state lands in a
    // microtask after the timer fires, and asserting on the same tick is a race
    // that only loses under load.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BOOT_TIMEOUT_MS + 50);
    });

    expect(result.current.booted).toBe(true);
    expect(result.current.handednessKnown).toBe(false);
    expect(result.current.handedness).toBeNull();
  });

  it("surfaces a stale shell rather than opening onto an empty app", async () => {
    const versionError = new Error("newer version exists");
    versionError.name = "VersionError";
    vi.spyOn(db.settings, "get").mockRejectedValue(versionError);

    const { result } = renderHook(() => useBoot(false));

    await waitFor(() => expect(result.current.booted).toBe(true));
    expect(result.current.error?.name).toBe("VersionError");
  });
});
