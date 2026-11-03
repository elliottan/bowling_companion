import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SwipeRow } from "./SwipeRow";

// jsdom has no PointerEvent, and a plain Event drops the position.
beforeAll(() => {
  if (!("PointerEvent" in window)) {
    class PointerEventStandIn extends MouseEvent {
      pointerId: number;
      pointerType: string;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
        this.pointerType = init.pointerType ?? "touch";
      }
    }
    Object.assign(window, { PointerEvent: PointerEventStandIn });
  }
});

let clock = 0;
beforeEach(() => {
  clock = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
});
afterEach(() => vi.restoreAllMocks());

function setup(onAction = vi.fn(), onOpen = vi.fn()) {
  render(
    <SwipeRow actionLabel="Delete" onAction={onAction}>
      <button type="button" onClick={onOpen}>
        Open session
      </button>
    </SwipeRow>
  );
  const row = screen.getByRole("button", { name: "Open session" });
  const content = row.parentElement!;
  return { onAction, onOpen, row, content };
}

/** A slow drag from (x0, y0) by (dx, dy), in steps. */
function drag(el: HTMLElement, dx: number, dy = 0, steps = 5, msPerStep = 40) {
  fireEvent.pointerDown(el, { clientX: 200, clientY: 100, pointerId: 1 });
  for (let i = 1; i <= steps; i++) {
    clock += msPerStep;
    fireEvent.pointerMove(el, { clientX: 200 + (dx * i) / steps, clientY: 100 + (dy * i) / steps, pointerId: 1 });
  }
  clock += 200; // held still before lifting: no flick
  fireEvent.pointerUp(el, { pointerId: 1 });
}

const offsetOf = (el: HTMLElement) => Number(/translateX\((-?[\d.]+)px\)/.exec(el.style.transform)?.[1] ?? 0);

describe("SwipeRow (ADR-233)", () => {
  it("opens on a swipe left, and its action only asks", () => {
    const { onAction, onOpen, content } = setup();
    drag(content, -120);
    expect(offsetOf(content)).toBe(-88);
    // The click a drag would fire opens nothing.
    fireEvent.click(screen.getByRole("button", { name: "Open session" }));
    expect(onOpen).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(offsetOf(content)).toBe(0);
  });

  it("has no full swipe: a long swipe still only rests open", () => {
    const { onAction, content } = setup();
    drag(content, -400);
    expect(offsetOf(content)).toBe(-88);
    expect(onAction).not.toHaveBeenCalled();
  });

  it("springs back from a short slow swipe, and opens on a short quick one", () => {
    const { content } = setup();
    drag(content, -30);
    expect(offsetOf(content)).toBe(0);
    fireEvent.pointerDown(content, { clientX: 200, clientY: 100, pointerId: 1 });
    clock += 16;
    fireEvent.pointerMove(content, { clientX: 185, clientY: 100, pointerId: 1 });
    clock += 16;
    fireEvent.pointerMove(content, { clientX: 165, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(content, { pointerId: 1 });
    expect(offsetOf(content)).toBe(-88);
  });

  it("leaves a scroll alone: a mostly downward move never opens it", () => {
    const { content } = setup();
    drag(content, -40, 120);
    expect(offsetOf(content)).toBe(0);
  });

  it("closes on a tap on the open row, which opens nothing", () => {
    const { onOpen, content, row } = setup();
    drag(content, -120);
    // The click the drag itself fired, swallowed; then the bowler's tap.
    fireEvent.click(row);
    fireEvent.click(row);
    expect(onOpen).not.toHaveBeenCalled();
    expect(offsetOf(content)).toBe(0);
  });

  it("does not swipe right from rest, where the back swipe starts", () => {
    const { content } = setup();
    drag(content, 120);
    expect(offsetOf(content)).toBe(0);
  });

  it("hides the action from a screen reader until it is shown", () => {
    setup();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("draws no action at all when disabled", () => {
    render(
      <SwipeRow actionLabel="Delete" onAction={vi.fn()} disabled>
        <span>Row</span>
      </SwipeRow>
    );
    expect(screen.queryByText("Delete")).toBeNull();
  });
});
