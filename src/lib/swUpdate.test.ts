import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  applyUpdate,
  checkForUpdate,
  dismissUpdate,
  initForegroundUpdateCheck,
  isStaleShellError,
  resetUpdateState,
  setNeedsRefresh,
  setRegistration,
  setUpdateFn,
  setUpdateSafe,
  subscribeNeedsRefresh
} from "./swUpdate";

describe("swUpdate", () => {
  beforeEach(() => {
    resetUpdateState();
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

describe("applying an update by itself", () => {
  beforeEach(() => resetUpdateState());

  it("applies as soon as the app is somewhere a reload costs nothing", () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    setUpdateFn(fn);

    setUpdateSafe(true);
    expect(fn).not.toHaveBeenCalled();

    setNeedsRefresh(true);
    expect(fn).toHaveBeenCalledWith(true);
  });

  it("holds while the app is mid-entry, then applies on the way out", () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    setUpdateFn(fn);

    setUpdateSafe(false);
    setNeedsRefresh(true);
    expect(fn).not.toHaveBeenCalled();

    setUpdateSafe(true);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("applies once per page, however many times it becomes safe again", () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    setUpdateFn(fn);

    setNeedsRefresh(true);
    setUpdateSafe(true);
    setUpdateSafe(false);
    setUpdateSafe(true);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("still applies after the toast is dismissed: the x hides the toast, not the update", () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    setUpdateFn(fn);
    const listener = vi.fn();
    subscribeNeedsRefresh(listener);

    setUpdateSafe(false);
    setNeedsRefresh(true);
    dismissUpdate();
    expect(listener).toHaveBeenLastCalledWith(false);

    setUpdateSafe(true);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("shows the toast again when a newer worker arrives after a dismissal", () => {
    const listener = vi.fn();
    subscribeNeedsRefresh(listener);

    setNeedsRefresh(true);
    dismissUpdate();
    expect(listener).toHaveBeenLastCalledWith(false);

    setNeedsRefresh(true);
    expect(listener).toHaveBeenLastCalledWith(true);
  });
});

describe("checking for an update", () => {
  beforeEach(() => resetUpdateState());

  it("does nothing when no registration has arrived yet", async () => {
    await expect(checkForUpdate()).resolves.toBeUndefined();
  });

  it("asks the registration, and swallows a failed check", async () => {
    const update = vi.fn().mockRejectedValue(new Error("offline"));
    setRegistration({ update } as unknown as ServiceWorkerRegistration);

    await expect(checkForUpdate()).resolves.toBeUndefined();
    expect(update).toHaveBeenCalled();
  });

  it("checks when the page becomes visible, and not when it is hidden", () => {
    const update = vi.fn().mockResolvedValue(undefined);
    setRegistration({ update } as unknown as ServiceWorkerRegistration);

    let visibility = "hidden";
    const listeners: Array<() => void> = [];
    const doc = {
      get visibilityState() {
        return visibility;
      },
      addEventListener: (_: string, fn: () => void) => listeners.push(fn),
      removeEventListener: vi.fn()
    } as unknown as Document;

    const stop = initForegroundUpdateCheck(doc);
    listeners.forEach((fn) => fn());
    expect(update).not.toHaveBeenCalled();

    visibility = "visible";
    listeners.forEach((fn) => fn());
    expect(update).toHaveBeenCalledTimes(1);

    stop();
    expect(doc.removeEventListener).toHaveBeenCalled();
  });
});

describe("isStaleShellError", () => {
  it("names the failures a shell older than its database throws", () => {
    for (const name of ["VersionError", "DatabaseClosedError", "UnknownError"]) {
      const err = new Error("nope");
      err.name = name;
      expect(isStaleShellError(err)).toBe(true);
    }
  });

  it("leaves an ordinary crash to the crash screen", () => {
    expect(isStaleShellError(new TypeError("x is not a function"))).toBe(false);
    expect(isStaleShellError("a string")).toBe(false);
  });
});
