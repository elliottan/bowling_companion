import { afterEach, describe, expect, it, vi } from "vitest";
import { registerPushExit, swipeBack } from "./backGesture";
import { registerSheet } from "./sheetBackStack";

describe("swipeBack", () => {
  afterEach(() => vi.restoreAllMocks());

  it("asks the screen in front to leave, and leaves history to it", () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const under = vi.fn();
    const front = vi.fn();
    const offUnder = registerPushExit(under);
    const offFront = registerPushExit(front);

    swipeBack();
    expect(front).toHaveBeenCalledTimes(1);
    expect(under).not.toHaveBeenCalled();
    expect(back).not.toHaveBeenCalled();

    offFront();
    swipeBack();
    expect(under).toHaveBeenCalledTimes(1);
    offUnder();
  });

  it("goes back through history when no pushed screen is open", () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    swipeBack();
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("leaves a sheet in front of a pushed screen to history, which closes it", () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const push = vi.fn();
    const offPush = registerPushExit(push);
    const offSheet = registerSheet({ close: vi.fn() });

    swipeBack();
    expect(push).not.toHaveBeenCalled();
    expect(back).toHaveBeenCalledTimes(1);

    offSheet();
    offPush();
  });
});
