import { describe, expect, it, beforeEach, vi } from "vitest";
import { afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  clearViewMemory,
  rememberScroll,
  rememberedScroll,
  restoreScroll,
  setRemembered,
  useRememberedState
} from "./viewMemory";

describe("useRememberedState", () => {
  beforeEach(clearViewMemory);

  it("comes back to what it was after the view is unmounted and mounted again", () => {
    const first = renderHook(() => useRememberedState("tab:filter", ""));
    act(() => first.result.current[1]("Serangoon"));
    first.unmount();

    const second = renderHook(() => useRememberedState("tab:filter", ""));
    expect(second.result.current[0]).toBe("Serangoon");
  });

  it("keeps each key apart, and falls back to the initial value for a new one", () => {
    const a = renderHook(() => useRememberedState("a", 1));
    act(() => a.result.current[1](9));
    const b = renderHook(() => useRememberedState("b", 1));
    expect(b.result.current[0]).toBe(1);
  });

  it("starts clean once memory is dropped, the way a reload does", () => {
    const first = renderHook(() => useRememberedState("tab:pane", "sessions"));
    act(() => first.result.current[1]("stats"));
    first.unmount();
    clearViewMemory();

    const second = renderHook(() => useRememberedState("tab:pane", "sessions"));
    expect(second.result.current[0]).toBe("sessions");
  });
});

describe("scroll memory", () => {
  beforeEach(clearViewMemory);

  it("reads back what was parked, and zero for somewhere never visited", () => {
    rememberScroll("view:history", 480);
    expect(rememberedScroll("view:history")).toBe(480);
    expect(rememberedScroll("view:spares")).toBe(0);
  });
});

/** A scroller that clamps, the way a real one does: you cannot scroll past the
 *  content it has so far. `grow` is the list arriving from the database. */
function clampingScroller(limit: number) {
  const el = document.createElement("div");
  let max = limit;
  let top = 0;
  Object.defineProperty(el, "scrollTop", {
    get: () => top,
    set: (v: number) => {
      top = Math.min(v, max);
    }
  });
  return { el, grow: (to: number) => (max = to) };
}

describe("restoreScroll", () => {
  beforeEach(() => {
    clearViewMemory();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it("keeps trying until the content it has to scroll through has arrived", () => {
    rememberScroll("history:0", 250);
    const { el, grow } = clampingScroller(0);
    restoreScroll(el, "history:0");
    // Nothing loaded yet, so the assignment clamped to the top.
    expect(el.scrollTop).toBe(0);

    grow(900);
    vi.advanceTimersByTime(100);
    expect(el.scrollTop).toBe(250);
  });

  it("gives up rather than polling forever behind a view that never fills", () => {
    rememberScroll("history:0", 250);
    const { el, grow } = clampingScroller(0);
    restoreScroll(el, "history:0");
    vi.advanceTimersByTime(5000);

    grow(900);
    vi.advanceTimersByTime(1000);
    expect(el.scrollTop).toBe(0);
  });

  it("stops when the effect that started it is torn down", () => {
    rememberScroll("history:0", 250);
    const { el, grow } = clampingScroller(0);
    restoreScroll(el, "history:0")();

    grow(900);
    vi.advanceTimersByTime(1000);
    expect(el.scrollTop).toBe(0);
  });
});

describe("setRemembered", () => {
  it("hands a value to a key this caller does not read", () => {
    const { result } = renderHook(() => useRememberedState("history:metric", "average"));
    expect(result.current[0]).toBe("average");

    act(() => setRemembered("history:metric", "carryPct"));
    expect(result.current[0]).toBe("carryPct");
  });

  it("does nothing when the value has not changed", () => {
    let renders = 0;
    renderHook(() => {
      renders++;
      return useRememberedState("plan:probe", "same");
    });
    const before = renders;
    act(() => setRemembered("plan:probe", "same"));
    expect(renders).toBe(before);
  });

  it("reaches a key nothing has mounted yet", () => {
    setRemembered("plan:unmounted", "set first");
    const { result } = renderHook(() => useRememberedState("plan:unmounted", "default"));
    expect(result.current[0]).toBe("set first");
  });
});
