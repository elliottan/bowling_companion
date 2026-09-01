import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { nextHidden, useHideOnScroll } from "./useHideOnScroll";

describe("nextHidden", () => {
  it("shows the header at the top of the list, whatever the direction", () => {
    expect(nextHidden(true, 0, 400)).toBe(false);
    expect(nextHidden(true, 24, 0)).toBe(false);
  });

  it("hides it on the way down", () => {
    expect(nextHidden(false, 200, 100)).toBe(true);
  });

  it("brings it back on the way up", () => {
    expect(nextHidden(true, 100, 200)).toBe(false);
  });

  it("ignores movement too small to be a decision", () => {
    // A momentum scroll reports single pixels; acting on those would flip the
    // header back and forth the whole way down.
    expect(nextHidden(true, 205, 200)).toBe(true);
    expect(nextHidden(false, 200, 205)).toBe(false);
  });
});

describe("useHideOnScroll", () => {
  /** A scroller the hook can bind to, with a scrollTop that can be driven. */
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

  it("hides on the way down and comes back on the way up", () => {
    const el = scroller();
    const { result } = renderHook(() => useHideOnScroll({ current: el }));

    expect(result.current).toBe(false);

    scrollTo(el, 300);
    expect(result.current).toBe(true);

    scrollTo(el, 100);
    expect(result.current).toBe(false);
  });

  it("shows again at the top of the list", () => {
    const el = scroller();
    const { result } = renderHook(() => useHideOnScroll({ current: el }));

    scrollTo(el, 300);
    expect(result.current).toBe(true);

    scrollTo(el, 0);
    expect(result.current).toBe(false);
  });

  it("stops listening when the view goes away", () => {
    const el = scroller();
    const remove = vi.spyOn(el, "removeEventListener");
    const { unmount } = renderHook(() => useHideOnScroll({ current: el }));

    unmount();
    expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function));
  });

  it("does nothing without a scroller to bind to", () => {
    const { result } = renderHook(() => useHideOnScroll({ current: null }));
    expect(result.current).toBe(false);
  });
});
