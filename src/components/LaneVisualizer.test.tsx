import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HandednessContext } from "../lib/handednessContext";
import { DriftModelContext } from "../lib/driftModelContext";
import { DEFAULT_DRIFT_MODEL } from "../lib/driftModel";
import { LaneVisualizer } from "./LaneVisualizer";
import { boardToX, feetToY, xToBoard } from "../lib/laneGeometry";

function renderViz(props: Partial<React.ComponentProps<typeof LaneVisualizer>> = {}) {
  return render(
    <HandednessContext.Provider value="right">
      <LaneVisualizer line={{ laydown: 18, target: 10, breakpoint: 6 }} onClose={() => {}} {...props} />
    </HandednessContext.Provider>
  );
}

describe("LaneVisualizer", () => {
  it("renders a dialog with the lane surface and a close button", () => {
    renderViz();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByLabelText(/close/i)).toBeTruthy();
    expect(document.querySelector('[data-role="ball-path"]')).not.toBeNull();
  });

  it("starts in the bowler view and exposes a Top-down toggle", () => {
    renderViz();
    const stage = document.querySelector('[data-role="tilt-stage"]') as HTMLElement;
    expect(stage.style.transform).toContain("rotateX");
    expect(screen.getByRole("button", { name: /top-down/i })).toBeTruthy();
  });

  it("close button fires onClose", () => {
    const onClose = vi.fn();
    renderViz({ onClose });
    fireEvent.click(screen.getByLabelText(/close/i));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("LaneVisualizer editing", () => {
  it("renders a draggable handle per peg, including the breakpoint (ADR-026)", () => {
    const onChange = vi.fn();
    render(
      <HandednessContext.Provider value="right">
        <LaneVisualizer line={{ laydown: 18, target: 10, breakpoint: 6 }} onClose={() => {}} onChange={onChange} />
      </HandednessContext.Provider>
    );
    const keys = [...document.querySelectorAll('[data-role="handle"]')].map((c) => c.getAttribute("data-key"));
    expect(keys).toEqual(["laydown", "target", "breakpoint", "final"]);
  });

  it("spare mode has a draggable breakpoint handle too (ADR-026)", () => {
    const onChange = vi.fn();
    render(
      <HandednessContext.Provider value="right">
        <LaneVisualizer line={{ laydown: 18, target: 10 }} leave={[10]} spare onClose={() => {}} onChange={onChange} />
      </HandednessContext.Provider>
    );
    const keys = [...document.querySelectorAll('[data-role="handle"]')].map((c) => c.getAttribute("data-key"));
    expect(keys).toContain("breakpoint");
  });

  it("hook sliders are the same pair in strike and spare mode (ADR-026)", () => {
    const onChange = vi.fn();
    const { unmount } = render(
      <HandednessContext.Provider value="right">
        <LaneVisualizer line={{ laydown: 18, target: 10, breakpoint: 6 }} onClose={() => {}} onChange={onChange} />
      </HandednessContext.Provider>
    );
    fireEvent.click(screen.getByLabelText(/hook options/i));
    expect(screen.getByText(/hook start/i)).toBeTruthy();
    expect(screen.getByText(/hook length/i)).toBeTruthy();
    expect(screen.queryByText(/breakpoint distance/i)).toBeNull();
    unmount();
    render(
      <HandednessContext.Provider value="right">
        <LaneVisualizer line={{ laydown: 18, target: 10 }} leave={[10]} spare onClose={() => {}} onChange={onChange} />
      </HandednessContext.Provider>
    );
    fireEvent.click(screen.getByLabelText(/hook options/i));
    expect(screen.getByText(/hook start/i)).toBeTruthy();
    expect(screen.getByText(/hook length/i)).toBeTruthy();
  });

  it("renders no handles in read-only mode (no onChange)", () => {
    render(
      <HandednessContext.Provider value="right">
        <LaneVisualizer line={{ laydown: 18, target: 10, breakpoint: 6 }} onClose={() => {}} />
      </HandednessContext.Provider>
    );
    expect(document.querySelectorAll('[data-role="handle"]').length).toBe(0);
  });

  it("computes board from x via the geometry inverse", () => {
    const x = boardToX(12, "right");
    expect(Math.round(xToBoard(x, "right"))).toBe(12);
    expect(feetToY(15)).toBeGreaterThan(0);
  });

  it("stays top-down after a handle drag — no tilt restore (ADR-025)", () => {
    (Element.prototype as unknown as { setPointerCapture?: () => void }).setPointerCapture ??= () => {};
    const onChange = vi.fn();
    render(
      <HandednessContext.Provider value="right">
        <LaneVisualizer line={{ laydown: 18, target: 10, breakpoint: 6 }} onClose={() => {}} onChange={onChange} />
      </HandednessContext.Provider>
    );
    const handle = document.querySelector('[data-role="handle"][data-key="target"]')!;
    // A real drag (past the tap deadzone) — a bare tap toggles a lock instead
    // and deliberately leaves the camera alone (ADR-028).
    fireEvent.pointerDown(handle, { clientX: 0, clientY: 0 });
    // jsdom has no PointerEvent — a MouseEvent with the pointermove type keeps
    // `buttons` intact so the drag guard sees a held button.
    fireEvent(handle, new MouseEvent("pointermove", { bubbles: true, buttons: 1, clientX: 12, clientY: 0 }));
    fireEvent.pointerUp(handle);
    const stage = document.querySelector('[data-role="tilt-stage"]') as HTMLElement;
    expect(stage.style.transform).toContain("rotateX(0deg)");
    // The drag did not toggle a lock.
    expect(handle.getAttribute("data-locked")).toBe("false");
  });

  it("a peg tap keeps the bowler-view tilt (only a drag snaps flat, ADR-028)", () => {
    (Element.prototype as unknown as { setPointerCapture?: () => void }).setPointerCapture ??= () => {};
    const onChange = vi.fn();
    render(
      <HandednessContext.Provider value="right">
        <LaneVisualizer line={{ laydown: 18, target: 10, breakpoint: 6 }} onClose={() => {}} onChange={onChange} />
      </HandednessContext.Provider>
    );
    const handle = document.querySelector('[data-role="handle"][data-key="target"]')!;
    fireEvent.pointerDown(handle, { clientX: 0, clientY: 0 });
    fireEvent.pointerUp(handle);
    const stage = document.querySelector('[data-role="tilt-stage"]') as HTMLElement;
    expect(stage.style.transform).toContain("rotateX(50deg)");
    expect(handle.getAttribute("data-locked")).toBe("true");
  });

  it("shows a Pocket chip when the strike final is off the pocket, snapping it back", () => {
    const onChange = vi.fn();
    render(
      <HandednessContext.Provider value="right">
        <LaneVisualizer line={{ laydown: 18, target: 10, breakpoint: 6, final_board: 12 }} onClose={() => {}} onChange={onChange} />
      </HandednessContext.Provider>
    );
    fireEvent.click(screen.getByRole("button", { name: /pocket/i }));
    expect(onChange.mock.lastCall![0].final_board).toBe(17.5);
  });

  it("lateral arrows are screen-spatial: ◀ raises the board for a right-hander", () => {
    const onChange = vi.fn();
    render(
      <HandednessContext.Provider value="right">
        <LaneVisualizer line={{ laydown: 18, target: 10, breakpoint: 6 }} onClose={() => {}} onChange={onChange} />
      </HandednessContext.Provider>
    );
    fireEvent.click(screen.getByLabelText("Target left"));
    expect(onChange.mock.lastCall![0].target).toBe(10.5);
  });

  it("strike mode seeds a missing laydown from stance via the drift model (ADR-030)", () => {
    const onChange = vi.fn();
    render(
      <HandednessContext.Provider value="right">
        <DriftModelContext.Provider value={DEFAULT_DRIFT_MODEL}>
          <LaneVisualizer line={{ stance: 20, target: 10, breakpoint: 6 }} onClose={() => {}} onChange={onChange} />
        </DriftModelContext.Provider>
      </HandednessContext.Provider>
    );
    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls[0][0]).toMatchObject({ stance: 20, laydown: 14 });
  });

  it("tapping a peg toggles a hard lock (ADR-028)", () => {
    (Element.prototype as unknown as { setPointerCapture?: () => void }).setPointerCapture ??= () => {};
    const onChange = vi.fn();
    render(
      <HandednessContext.Provider value="right">
        <LaneVisualizer line={{ laydown: 18, target: 10, breakpoint: 6 }} onClose={() => {}} onChange={onChange} />
      </HandednessContext.Provider>
    );
    const handle = document.querySelector('[data-role="handle"][data-key="target"]')!;
    fireEvent.pointerDown(handle);
    fireEvent.pointerUp(handle);
    expect(handle.getAttribute("data-locked")).toBe("true");
    // Locked ⇒ its stepper is read-only (tapping it releases the peg instead of
    // typing) and edits that would move it are rejected.
    expect((screen.getByLabelText("Target") as HTMLInputElement).readOnly).toBe(true);
    fireEvent.pointerDown(handle);
    fireEvent.pointerUp(handle);
    expect(handle.getAttribute("data-locked")).toBe("false");
  });

  it("opens with defaultLocks applied and releases a peg when its stepper is tapped (ADR-032)", () => {
    (Element.prototype as unknown as { setPointerCapture?: () => void }).setPointerCapture ??= () => {};
    render(
      <HandednessContext.Provider value="right">
        <LaneVisualizer
          line={{ slide: 24, laydown: 18, target: 10, breakpoint: 6 }}
          onClose={() => {}}
          onChange={vi.fn()}
          defaultLocks={["laydown", "target"]}
        />
      </HandednessContext.Provider>
    );

    const target = screen.getByLabelText("Target") as HTMLInputElement;
    const laydown = screen.getByLabelText("Laydown") as HTMLInputElement;
    expect(target.readOnly).toBe(true);
    expect(laydown.readOnly).toBe(true);
    // Final stays free — otherwise nothing could be dragged.
    expect((screen.getByLabelText("Final") as HTMLInputElement).readOnly).toBe(false);

    fireEvent.focus(target);
    expect((screen.getByLabelText("Target") as HTMLInputElement).readOnly).toBe(false);
  });

  it("draws the slide tick from an actual line's own slide board (ADR-032)", () => {
    const { container } = render(
      <HandednessContext.Provider value="right">
        <DriftModelContext.Provider value={DEFAULT_DRIFT_MODEL}>
          <LaneVisualizer
            line={{ slide: 24, laydown: 18, target: 10, breakpoint: 6 }}
            onClose={() => {}}
            onChange={vi.fn()}
          />
        </DriftModelContext.Provider>
      </HandednessContext.Provider>
    );
    const tick = container.querySelector('[data-role="slide-tick"] circle');
    expect(tick).not.toBeNull();
    expect(Number(tick!.getAttribute("cx"))).toBeCloseTo(boardToX(24, "right"), 5);
  });
});
