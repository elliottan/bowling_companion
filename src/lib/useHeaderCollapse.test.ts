import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { nextOffset, useHeaderCollapse } from "./useHeaderCollapse";

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

describe("useHeaderCollapse", () => {
  function scroller() {
    const el = document.createElement("div");
    document.body.append(el);
    return el;
  }

  function scrollTo(el: HTMLElement, top: number) {
    act(() => {
      el.scrollTop = top;
      el.dispatchEvent(new Event("scroll"));
    });
  }

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
