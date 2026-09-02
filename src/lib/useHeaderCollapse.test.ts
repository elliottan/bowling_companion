import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { nextOffset, scrollPosition, useHeaderCollapse } from "./useHeaderCollapse";

const MAX = 100;

describe("nextOffset", () => {
  it("moves the header by exactly what the scroll moved", () => {
    expect(nextOffset(0, 30, 0, MAX)).toBe(30);
    expect(nextOffset(30, 55, 30, MAX)).toBe(55);
  });

  it("returns it by the first movement back, without waiting for the top", () => {
    expect(nextOffset(80, 300, 320, MAX)).toBe(60);
    // Even a single pixel: the header follows the finger rather than a rule.
    expect(nextOffset(60, 299, 300, MAX)).toBe(59);
  });

  it("stops at its own height and at nothing", () => {
    expect(nextOffset(90, 500, 300, MAX)).toBe(MAX);
    expect(nextOffset(10, 0, 300, MAX)).toBe(0);
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

  it("does not collapse when an overscroll bounce springs back to the top", () => {
    const el = scroller();
    const { result } = renderHook(() => useHeaderCollapse({ current: el }, MAX));

    scrollTo(el, 300);
    expect(result.current).toBe(MAX);

    // Read back to the top: the header is fully returned.
    scrollTo(el, 0);
    expect(result.current).toBe(0);

    // The finger keeps pulling past the top, then the spring lets go. Neither
    // half of that bounce is a scroll, so the header must not move.
    scrollTo(el, -60);
    expect(result.current).toBe(0);
    scrollTo(el, 0);
    expect(result.current).toBe(0);
  });

  it("does not collapse when a bounce springs back from past the bottom", () => {
    const el = scroller(1000, 800);
    const { result } = renderHook(() => useHeaderCollapse({ current: el }, MAX));

    scrollTo(el, 200);
    expect(result.current).toBe(MAX);

    scrollTo(el, 150);
    expect(result.current).toBe(50);

    // Back down to the real end of the list: a genuine scroll, so it collapses.
    scrollTo(el, 200);
    expect(result.current).toBe(MAX);

    // Now the finger drags past the end and the spring lets go. Neither half of
    // that bounce is a scroll, so the header must not move.
    scrollTo(el, 260);
    expect(result.current).toBe(MAX);
    scrollTo(el, 200);
    expect(result.current).toBe(MAX);
  });

  it("tracks the scroll down and back up", () => {
    const el = scroller();
    const { result } = renderHook(() => useHeaderCollapse({ current: el }, MAX));

    expect(result.current).toBe(0);

    scrollTo(el, 40);
    expect(result.current).toBe(40);

    scrollTo(el, 25);
    expect(result.current).toBe(25);
  });

  it("never parks the header higher than the row can go", () => {
    const el = scroller();
    const { result, rerender } = renderHook(({ max }) => useHeaderCollapse({ current: el }, max), {
      initialProps: { max: MAX }
    });

    scrollTo(el, 100);
    expect(result.current).toBe(100);

    // A filter chip is removed and the row is shorter than the offset it holds.
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
