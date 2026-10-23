import { afterEach, describe, expect, it, vi } from "vitest";
import { cancelBack, dragBack, registerPushExit, swipeBack } from "./backGesture";
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

describe("dragBack", () => {
  afterEach(() => vi.restoreAllMocks());

  function panel() {
    const el = document.createElement("div");
    el.style.transition = "transform 280ms ease";
    return el;
  }

  it("moves the screen in front with the finger, with no lag", () => {
    const front = panel();
    const off = registerPushExit(vi.fn(), () => front);
    dragBack(120);
    expect(front.style.transform).toBe("translateX(120px)");
    expect(front.style.transition).toBe("none");
    dragBack(-20);
    expect(front.style.transform).toBe("translateX(0px)");
    cancelBack();
    off();
  });

  it("slides back to rest when let go short", () => {
    const front = panel();
    const off = registerPushExit(vi.fn(), () => front);
    dragBack(80);
    cancelBack();
    expect(front.style.transform).toBe("");
    expect(front.style.transition).toBe("transform 280ms ease");
    off();
  });

  it("hands the slide back before the screen leaves from where it was let go", () => {
    vi.spyOn(window.history, "back").mockImplementation(() => {});
    const front = panel();
    const exit = vi.fn(() => {
      expect(front.style.transition).toBe("transform 280ms ease");
      expect(front.style.transform).toBe("translateX(200px)");
    });
    const off = registerPushExit(exit, () => front);
    dragBack(200);
    swipeBack();
    expect(exit).toHaveBeenCalledTimes(1);
    off();
  });

  it("leaves a pushed screen alone while a sheet is in front of it", () => {
    const front = panel();
    const offPush = registerPushExit(vi.fn(), () => front);
    const offSheet = registerSheet({ close: vi.fn() });
    dragBack(100);
    expect(front.style.transform).toBe("");
    offSheet();
    offPush();
  });
});
