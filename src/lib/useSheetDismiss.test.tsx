import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { useSheetDismiss } from "./useSheetDismiss";

function Dialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { dismiss, panelStyle, exiting } = useSheetDismiss(onClose, "center");
  if (!open) return null;
  return (
    <div data-testid="panel" style={panelStyle} data-exiting={exiting}>
      <button onClick={() => dismiss()}>Cancel</button>
    </div>
  );
}

describe("useSheetDismiss", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("a reopened dialog is visible and dismissable again", () => {
    const onClose = vi.fn();
    const { rerender } = render(<Dialog open onClose={onClose} />);

    fireEvent.click(screen.getByText("Cancel"));
    act(() => void vi.advanceTimersByTime(300));
    expect(onClose).toHaveBeenCalledTimes(1);

    // Parent keeps the hook mounted and only flips `open`, the exit state must
    // have reset, or the panel comes back transparent and scaled down.
    rerender(<Dialog open={false} onClose={onClose} />);
    rerender(<Dialog open onClose={onClose} />);

    const panel = screen.getByTestId("panel");
    expect(panel.getAttribute("data-exiting")).toBe("false");
    expect(panel.style.opacity).toBe("");
    expect(panel.style.transform).toBe("");

    fireEvent.click(screen.getByText("Cancel"));
    act(() => void vi.advanceTimersByTime(300));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  describe("dragged as a UIKit sheet is (ADR-229)", () => {
    function Sheet({ onClose }: { onClose: () => void }) {
      const { panelStyle, backdropStyle, dragHandlers, bodyDragRef } = useSheetDismiss(onClose);
      return (
        <div>
          <div data-testid="backdrop" style={backdropStyle} />
          <div data-testid="panel" style={panelStyle}>
            <div data-testid="handle" {...dragHandlers} />
            <div data-testid="body" ref={bodyDragRef} style={{ overflowY: "auto" }} />
          </div>
        </div>
      );
    }

    // jsdom has no PointerEvent, and a plain Event drops the position.
    beforeAll(() => {
      if (!("PointerEvent" in window)) {
        class PointerEventStandIn extends MouseEvent {
          pointerId: number;
          constructor(type: string, init: PointerEventInit = {}) {
            super(type, init);
            this.pointerId = init.pointerId ?? 1;
          }
        }
        Object.assign(window, { PointerEvent: PointerEventStandIn });
      }
    });

    let clock = 0;
    beforeEach(() => {
      clock = 1000;
      vi.spyOn(performance, "now").mockImplementation(() => clock);
      // jsdom has no setPointerCapture.
      HTMLElement.prototype.setPointerCapture ??= () => {};
    });
    afterEach(() => vi.restoreAllMocks());

    const pointer = (el: HTMLElement, type: string, y: number) =>
      fireEvent[type as "pointerDown"](el, { clientY: y, pointerId: 1 });

    it("closes on a short fast flick, which a distance alone would not", () => {
      const onClose = vi.fn();
      render(<Sheet onClose={onClose} />);
      const handle = screen.getByTestId("handle");
      pointer(handle, "pointerDown", 100);
      clock += 16;
      pointer(handle, "pointerMove", 120);
      clock += 16;
      pointer(handle, "pointerMove", 150); // 50px, well short of 96, at ~1.9px/ms
      fireEvent.pointerUp(handle, { pointerId: 1 });
      act(() => void vi.advanceTimersByTime(300));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("springs back from a slow short drag, and from one that stopped before lifting", () => {
      const onClose = vi.fn();
      render(<Sheet onClose={onClose} />);
      const handle = screen.getByTestId("handle");
      pointer(handle, "pointerDown", 100);
      clock += 200;
      pointer(handle, "pointerMove", 150);
      fireEvent.pointerUp(handle, { pointerId: 1 });
      pointer(handle, "pointerDown", 100);
      clock += 16;
      pointer(handle, "pointerMove", 150);
      clock += 300; // held still before lifting
      fireEvent.pointerUp(handle, { pointerId: 1 });
      act(() => void vi.advanceTimersByTime(300));
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByTestId("panel").style.transform).toBe("");
    });

    it("gives a little and no more when dragged upward, and lifts the dim as it is pulled down", () => {
      render(<Sheet onClose={vi.fn()} />);
      const handle = screen.getByTestId("handle");
      pointer(handle, "pointerDown", 500);
      clock += 16;
      pointer(handle, "pointerMove", 100);
      const up = Number(/translateY\((-?[\d.]+)px\)/.exec(screen.getByTestId("panel").style.transform)?.[1]);
      expect(up).toBeLessThan(0);
      expect(up).toBeGreaterThanOrEqual(-24);
      clock += 16;
      pointer(handle, "pointerMove", 700);
      expect(Number(screen.getByTestId("backdrop").style.opacity)).toBeLessThan(1);
    });

    it("moves the sheet when the body is pulled down from its top, and leaves a scrolled body alone", () => {
      const onClose = vi.fn();
      render(<Sheet onClose={onClose} />);
      const body = screen.getByTestId("body");
      const touch = (type: string, y: number) =>
        fireEvent[type as "touchStart"](body, { touches: [{ clientY: y }] });

      Object.defineProperty(body, "scrollTop", { value: 40, configurable: true });
      touch("touchStart", 100);
      clock += 16;
      touch("touchMove", 220);
      expect(screen.getByTestId("panel").style.transform).toBe("");
      fireEvent.touchEnd(body);

      Object.defineProperty(body, "scrollTop", { value: 0, configurable: true });
      touch("touchStart", 100);
      clock += 16;
      touch("touchMove", 160);
      clock += 16;
      touch("touchMove", 260);
      expect(screen.getByTestId("panel").style.transform).toMatch(/translateY\(/);
      fireEvent.touchEnd(body);
      act(() => void vi.advanceTimersByTime(300));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});

