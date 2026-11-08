// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { listenForStatusTap, scrolledAncestor, scrollViewToTop } from "./statusTap";

function scroller(scrollTop: number, overflowY = "auto"): HTMLDivElement {
  const el = document.createElement("div");
  el.style.overflowY = overflowY;
  Object.defineProperty(el, "scrollTop", { value: scrollTop, writable: true, configurable: true });
  return el;
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("scrolledAncestor", () => {
  it("finds the nearest scrolled scroller above the start", () => {
    const outer = scroller(40);
    const inner = scroller(0);
    const row = document.createElement("p");
    inner.append(row);
    outer.append(inner);
    document.body.append(outer);
    expect(scrolledAncestor(row)).toBe(outer);
  });

  it("skips a box that is scrolled but does not scroll", () => {
    const box = scroller(30, "hidden");
    document.body.append(box);
    expect(scrolledAncestor(box)).toBeNull();
  });

  it("is null with nothing to start from", () => {
    expect(scrolledAncestor(null)).toBeNull();
  });
});

describe("scrollViewToTop", () => {
  it("scrolls the list under the middle of the screen to its top", () => {
    const list = scroller(120);
    const scrollTo = vi.fn();
    list.scrollTo = scrollTo;
    document.body.append(list);
    document.elementFromPoint = vi.fn(() => list);
    expect(scrollViewToTop()).toBe(true);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
  });

  it("sets the offset where scrollTo is missing", () => {
    const list = scroller(50);
    (list as { scrollTo?: unknown }).scrollTo = undefined;
    document.body.append(list);
    document.elementFromPoint = vi.fn(() => list);
    expect(scrollViewToTop()).toBe(true);
    expect(list.scrollTop).toBe(0);
  });

  it("does nothing when the list is already at its top", () => {
    const list = scroller(0);
    document.body.append(list);
    document.elementFromPoint = vi.fn(() => list);
    expect(scrollViewToTop()).toBe(false);
  });
});

describe("listenForStatusTap", () => {
  it("scrolls on the native tap, until stopped", () => {
    const list = scroller(80);
    const scrollTo = vi.fn();
    list.scrollTo = scrollTo;
    document.body.append(list);
    document.elementFromPoint = vi.fn(() => list);
    const stop = listenForStatusTap();
    window.dispatchEvent(new Event("statusTap"));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    stop();
    window.dispatchEvent(new Event("statusTap"));
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });
});
