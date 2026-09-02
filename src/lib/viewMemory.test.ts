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

  it("keeps rendering what it is told, write after write", () => {
    // The regression this exists for: a filter chip whose x did nothing. The
    // store took the write and told its listener, and the view went on
    // rendering the old value, so the chip stayed, and the next tap wrote the
    // same value and changed nothing at all.
    const { result } = renderHook(() => useRememberedState("tab:alley", ""));

    for (const value of ["Alpha", "", "Beta", "", "Alpha"]) {
      act(() => result.current[1](value));
      expect(result.current[0]).toBe(value);
    }
  });

  it("tells every mounted reader of a key, not just the first", () => {
    const a = renderHook(() => useRememberedState("tab:shared", ""));
    const b = renderHook(() => useRememberedState("tab:shared", ""));

    act(() => a.result.current[1]("Chameleon"));
    expect(b.result.current[0]).toBe("Chameleon");

    act(() => b.result.current[1](""));
    expect(a.result.current[0]).toBe("");
  });

  it("still reaches a reader that arrived after another one left", () => {
    // The listener set used to be dropped from the map when it emptied, so a
    // later subscriber got a different set from the one an earlier cleanup
    // still held.
    const first = renderHook(() => useRememberedState("tab:churn", ""));
    first.unmount();

    const second = renderHook(() => useRememberedState("tab:churn", ""));
    act(() => second.result.current[1]("Main Street"));
    expect(second.result.current[0]).toBe("Main Street");
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
