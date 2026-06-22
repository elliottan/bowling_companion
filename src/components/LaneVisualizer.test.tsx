import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HandednessContext } from "../lib/handednessContext";
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

  it("starts angled and exposes a Top-down toggle", () => {
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
  it("shows draggable handles only when editable and top-down", () => {
    const onChange = vi.fn();
    render(
      <HandednessContext.Provider value="right">
        <LaneVisualizer line={{ laydown: 18, target: 10, breakpoint: 6 }} onClose={() => {}} onChange={onChange} />
      </HandednessContext.Provider>
    );
    expect(document.querySelectorAll('[data-role="handle"]').length).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: /top-down/i }));
    expect(document.querySelectorAll('[data-role="handle"]').length).toBeGreaterThan(0);
  });

  it("computes board from x via the geometry inverse", () => {
    const x = boardToX(12, "right");
    expect(Math.round(xToBoard(x, "right"))).toBe(12);
    expect(feetToY(15)).toBeGreaterThan(0);
  });
});
