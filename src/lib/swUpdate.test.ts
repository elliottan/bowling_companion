import { describe, it, expect, vi, beforeEach } from "vitest";
import { applyUpdate, setNeedsRefresh, setUpdateFn, subscribeNeedsRefresh } from "./swUpdate";

describe("swUpdate", () => {
  beforeEach(() => {
    // Reset shared module state between tests.
    setNeedsRefresh(false);
    setUpdateFn(() => Promise.resolve());
  });

  it("replays the current flag immediately on subscribe", () => {
    setNeedsRefresh(true);
    const listener = vi.fn();
    subscribeNeedsRefresh(listener);
    expect(listener).toHaveBeenCalledWith(true);
  });

  it("notifies subscribers when the flag changes", () => {
    const listener = vi.fn();
    subscribeNeedsRefresh(listener);
    listener.mockClear();

    setNeedsRefresh(true);
    expect(listener).toHaveBeenCalledWith(true);

    setNeedsRefresh(false);
    expect(listener).toHaveBeenCalledWith(false);
  });

  it("stops notifying after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeNeedsRefresh(listener);
    listener.mockClear();

    unsubscribe();
    setNeedsRefresh(true);
    expect(listener).not.toHaveBeenCalled();
  });

  it("applyUpdate calls through to the registered update function with reload=true", async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    setUpdateFn(fn);

    await applyUpdate();
    expect(fn).toHaveBeenCalledWith(true);
  });
});
