import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  COLLAPSE_THRESHOLD,
  INITIAL_COLLAPSE,
  nextCollapse,
  scrollPosition,
  useHeaderCollapse
} from "./useHeaderCollapse";

const MAX = 100;
const T = COLLAPSE_THRESHOLD;

describe("nextCollapse", () => {
  const open = INITIAL_COLLAPSE;
  const shut = { collapsed: true, travel: 0 };

  it("does not flip on a movement short of the threshold", () => {
    expect(nextCollapse(open, 100 + T - 1, 100)).toEqual({ collapsed: false, travel: T - 1 });
  });

  it("takes the header away once the reader has committed to reading down", () => {
    expect(nextCollapse(open, 100 + T, 100)).toEqual(shut);
  });

  it("banks travel across several small scrolls in the same direction", () => {
    let state = open;
    for (let top = 100; top < 100 + T; top += 4) {
      state = nextCollapse(state, top + 4, top);
    }
    expect(state).toEqual(shut);
  });

  it("forgets the distance covered when the reader turns around", () => {
    const part = nextCollapse(open, 100 + T - 2, 100);
    expect(part.travel).toBe(T - 2);

    // One pixel back the other way, then forward again: the earlier run does
    // not count towards the flip.
    const turned = nextCollapse(part, 100 + T - 3, 100 + T - 2);
    expect(turned).toEqual({ collapsed: false, travel: -1 });
    expect(nextCollapse(turned, 100 + T - 2, 100 + T - 3).collapsed).toBe(false);
  });

  it("brings it back on a deliberate movement up, without reaching the top", () => {
    expect(nextCollapse(shut, 500 - T, 500)).toEqual(open);
    expect(nextCollapse(shut, 500 - T + 1, 500).collapsed).toBe(true);
  });

  it("needs a fresh threshold to come back, not the tail of the flip", () => {
    // The move that took it away banked exactly the threshold and no more.
    const away = nextCollapse(open, 100 + T, 100);
    expect(away.travel).toBe(0);
  });

  it("always shows the header at the top of the list", () => {
    expect(nextCollapse(shut, 0, 40)).toEqual(open);
  });

  it("stays put when the scroll reports no movement", () => {
    const held = { collapsed: true, travel: 5 };
    expect(nextCollapse(held, 200, 200)).toBe(held);
  });

  it("is only ever fully there or fully away", () => {
    let state = INITIAL_COLLAPSE;
    let top = 0;
    for (const step of [9, 31, -4, -60, 7, 200, -13, -11, 3, -400]) {
      const next = Math.max(0, top + step);
      state = nextCollapse(state, next, top);
      top = next;
      expect(typeof state.collapsed).toBe("boolean");
    }
  });
});

describe("scrollPosition", () => {
  function ranged(scrollHeight: number, clientHeight: number, scrollTop: number) {
    const el = document.createElement("div");
    Object.defineProperty(el, "scrollHeight", { value: scrollHeight, configurable: true });
    Object.defineProperty(el, "clientHeight", { value: clientHeight, configurable: true });
    el.scrollTop = scrollTop;
    return el;
  }

  it("reads the position as-is inside the real range", () => {
    expect(scrollPosition(ranged(1000, 800, 120))).toBe(120);
  });

  it("treats a rubber-band pull past the top as being at the top", () => {
    expect(scrollPosition(ranged(1000, 800, -60))).toBe(0);
  });

  it("treats a rubber-band pull past the bottom as being at the bottom", () => {
    expect(scrollPosition(ranged(1000, 800, 260))).toBe(200);
  });

  it("has no range at all when the content fits", () => {
    expect(scrollPosition(ranged(500, 800, 40))).toBe(0);
  });
});

describe("useHeaderCollapse", () => {
  function scroller(scrollHeight = 10000, clientHeight = 800) {
    const el = document.createElement("div");
    Object.defineProperty(el, "scrollHeight", { value: scrollHeight, configurable: true });
    Object.defineProperty(el, "clientHeight", { value: clientHeight, configurable: true });
    document.body.append(el);
    return el;
  }

  function scrollTo(el: HTMLElement, top: number) {
    act(() => {
      el.scrollTop = top;
      el.dispatchEvent(new Event("scroll"));
    });
  }

  it("gives the whole header or none of it, never a fraction", () => {
    const el = scroller();
    const { result } = renderHook(() => useHeaderCollapse({ current: el }, MAX));

    expect(result.current).toBe(0);

    // Short of the threshold: still entirely there.
    scrollTo(el, T - 1);
    expect(result.current).toBe(0);

    // Past it: entirely away, by its whole height rather than by the scroll.
    scrollTo(el, T);
    expect(result.current).toBe(MAX);

    // Reading on does not move it any further, because there is no further.
    scrollTo(el, 900);
    expect(result.current).toBe(MAX);

    // Back the other way: all of it, at once.
    scrollTo(el, 900 - T);
    expect(result.current).toBe(0);
  });

  it("does not flip when an overscroll bounce springs back to the top", () => {
    const el = scroller();
    const { result } = renderHook(() => useHeaderCollapse({ current: el }, MAX));

    scrollTo(el, 300);
    expect(result.current).toBe(MAX);
    scrollTo(el, 0);
    expect(result.current).toBe(0);

    // The finger pulls past the top, then the spring lets go. Neither half of
    // that bounce is a scroll, so the header must not move.
    scrollTo(el, -60);
    expect(result.current).toBe(0);
    scrollTo(el, 0);
    expect(result.current).toBe(0);
  });

  it("does not flip when a bounce springs back from past the bottom", () => {
    const el = scroller(1000, 800);
    const { result } = renderHook(() => useHeaderCollapse({ current: el }, MAX));

    scrollTo(el, 200);
    expect(result.current).toBe(MAX);

    scrollTo(el, 260);
    expect(result.current).toBe(MAX);
    scrollTo(el, 200);
    expect(result.current).toBe(MAX);
  });

  it("returns the header whenever the reader is back at the top", () => {
    const el = scroller();
    const { result } = renderHook(() => useHeaderCollapse({ current: el }, MAX));

    scrollTo(el, 400);
    expect(result.current).toBe(MAX);

    scrollTo(el, 0);
    expect(result.current).toBe(0);
  });

  it("never parks the header higher than the row can go", () => {
    const el = scroller();
    const { result, rerender } = renderHook(({ max }) => useHeaderCollapse({ current: el }, max), {
      initialProps: { max: MAX }
    });

    scrollTo(el, 400);
    expect(result.current).toBe(MAX);

    // A filter chip is removed and the row is shorter than it was.
    rerender({ max: 40 });
    expect(result.current).toBe(40);
  });

  it("stops listening when the view goes away", () => {
    const el = scroller();
    const remove = vi.spyOn(el, "removeEventListener");
    const { unmount } = renderHook(() => useHeaderCollapse({ current: el }, MAX));

    unmount();
    expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function));
  });

  it("does nothing without a scroller to bind to", () => {
    const { result } = renderHook(() => useHeaderCollapse({ current: null }, MAX));
    expect(result.current).toBe(0);
  });
});
