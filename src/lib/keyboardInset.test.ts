// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { isTypingField, keyboardInsets, NO_KEYBOARD, revealField, watchKeyboardInsets } from "./keyboardInset";

describe("keyboardInsets", () => {
  it("is the strip under the visible part while a field has focus", () => {
    expect(keyboardInsets(844, { height: 508, offsetTop: 0 }, true)).toEqual({ bottom: 336, top: 0 });
  });

  it("counts what iOS panned off the top to reach the field", () => {
    expect(keyboardInsets(844, { height: 508, offsetTop: 40 }, true)).toEqual({ bottom: 296, top: 40 });
  });

  it("is nothing without a focused field, whatever the viewport says", () => {
    expect(keyboardInsets(844, { height: 508, offsetTop: 0 }, false)).toEqual(NO_KEYBOARD);
  });

  it("is nothing where the view shrinks for the keyboard, as the apps' does", () => {
    expect(keyboardInsets(508, { height: 508, offsetTop: 0 }, true)).toEqual(NO_KEYBOARD);
  });

  it("is nothing for a sliver that is not a keyboard, or with no visual viewport", () => {
    expect(keyboardInsets(844, { height: 800, offsetTop: 0 }, true)).toEqual(NO_KEYBOARD);
    expect(keyboardInsets(844, null, true)).toEqual(NO_KEYBOARD);
  });
});

describe("isTypingField", () => {
  const input = (type: string) => Object.assign(document.createElement("input"), { type });

  it("is a text box, a number box or a text area, and not a control without keys", () => {
    expect(isTypingField(input("text"))).toBe(true);
    expect(isTypingField(input("search"))).toBe(true);
    expect(isTypingField(document.createElement("textarea"))).toBe(true);
    expect(isTypingField(input("range"))).toBe(false);
    expect(isTypingField(input("checkbox"))).toBe(false);
    expect(isTypingField(document.createElement("select"))).toBe(false);
    expect(isTypingField(document.createElement("button"))).toBe(false);
    expect(isTypingField(null)).toBe(false);
  });
});

/** A visual viewport that a test can resize, as a keyboard would. */
function fakeViewport(height: number) {
  const target = new EventTarget();
  return Object.assign(target, { height, offsetTop: 0 });
}

describe("watchKeyboardInsets", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("publishes the keyboard's height while a field has focus, and drops it when the field is left", () => {
    vi.useFakeTimers();
    const vv = fakeViewport(844);
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(844);
    Object.defineProperty(window, "visualViewport", { value: vv, configurable: true });
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 0);
    const stop = watchKeyboardInsets(window);
    const root = document.documentElement;

    const field = document.createElement("input");
    document.body.append(field);
    field.focus();
    vv.height = 500;
    vv.dispatchEvent(new Event("resize"));
    expect(root.style.getPropertyValue("--keyboard-inset")).toBe("344px");

    field.blur();
    vi.advanceTimersByTime(100);
    expect(root.style.getPropertyValue("--keyboard-inset")).toBe("0px");

    stop();
    expect(root.style.getPropertyValue("--keyboard-inset")).toBe("");
  });
});

describe("revealField", () => {
  it("scrolls a field under the keyboard into sight, and leaves one already in sight", () => {
    const vv = { height: 500, offsetTop: 0 };
    const win = { visualViewport: vv, innerHeight: 844 } as unknown as Window;
    const field = document.createElement("input");
    const scroll = vi.fn();
    field.scrollIntoView = scroll;

    vi.spyOn(field, "getBoundingClientRect").mockReturnValue({ top: 600, bottom: 644 } as DOMRect);
    revealField(win, field);
    expect(scroll).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

    scroll.mockClear();
    vi.spyOn(field, "getBoundingClientRect").mockReturnValue({ top: 200, bottom: 244 } as DOMRect);
    revealField(win, field);
    expect(scroll).not.toHaveBeenCalled();
  });
});
