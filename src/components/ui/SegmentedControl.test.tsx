import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { SegmentedControl } from "./SegmentedControl";

const options = [
  { value: "a", label: "A" },
  { value: "b", label: "B" }
] as const;

describe("SegmentedControl", () => {
  it("presses exactly one segment, and reports the other as unpressed", () => {
    render(<SegmentedControl label="Pick" value="a" options={options} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "A" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "B" })).toHaveAttribute("aria-pressed", "false");
  });

  it("presses nothing when the question has not been answered yet", () => {
    // A real state on the first run: the track still says exactly one of these
    // is the answer, without claiming one already is.
    render(<SegmentedControl label="Pick" value={null} options={options} onChange={vi.fn()} />);
    for (const name of ["A", "B"]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute("aria-pressed", "false");
    }
  });

  it("draws 32pt by default and 44pt in a header row, beside the round buttons (ADR-251)", () => {
    const { unmount } = render(<SegmentedControl label="Pick" value="a" options={options} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "A" })).toHaveClass("h-8");
    unmount();
    render(<SegmentedControl label="Pick" value="a" options={options} onChange={vi.fn()} size="bar" />);
    expect(screen.getByRole("button", { name: "A" })).toHaveClass("h-11");
    expect(screen.getByRole("button", { name: "A" })).not.toHaveClass("h-8");
  });

  it("reports the choice", () => {
    const onChange = vi.fn();
    render(<SegmentedControl label="Pick" value="a" options={options} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "B" }));
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("speaks the full word where the visible label is an abbreviation", () => {
    render(
      <SegmentedControl
        label="Hand"
        value="left"
        options={[
          { value: "left", label: "L", srLabel: "Left" },
          { value: "right", label: "R", srLabel: "Right" }
        ]}
        onChange={vi.fn()}
      />
    );
    // Shortening the track to fit a dense row never shortens what it means.
    expect(screen.getByRole("button", { name: "Left" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "L" })).not.toBeInTheDocument();
  });

  it("draws at UIKit's 32pt, and still carries a 44pt hit region", () => {
    render(<SegmentedControl label="Pick" value="a" options={options} onChange={vi.fn()} />);
    const segment = screen.getByRole("button", { name: "A" });
    // One size, as UIKit has one (ADR-228)...
    expect(segment.className).toContain("h-8");
    // ...and 44pt to the finger regardless, which is the floor the primitive
    // exists to hold. A smaller track that dropped this would be a tap target
    // shrunk by a restyle.
    expect(segment.className).toContain("after:h-11");
  });

  describe("under a finger (ADR-200)", () => {
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

    const three = [
      { value: "last10", label: "Last 10" },
      { value: "months3", label: "3 mo" },
      { value: "all", label: "All" }
    ] as const;

    function renderTrack(onChange = vi.fn()) {
      render(<SegmentedControl label="Range" value="last10" options={three} onChange={onChange} />);
      const track = screen.getByRole("group", { name: "Range" });
      // 300px wide from x=0: a segment every 100px.
      track.getBoundingClientRect = () => ({ left: 0, width: 300, top: 0, height: 40, right: 300, bottom: 40, x: 0, y: 0, toJSON: () => ({}) });
      return { track, onChange };
    }

    it("follows a slide across the track and chooses where the finger lifts, once", () => {
      const { track, onChange } = renderTrack();
      fireEvent.pointerDown(track, { clientX: 50, pointerId: 1 });
      fireEvent.pointerMove(track, { clientX: 150, pointerId: 1 });
      fireEvent.pointerMove(track, { clientX: 250, pointerId: 1 });
      // Nothing is chosen on the way across.
      expect(onChange).not.toHaveBeenCalled();
      fireEvent.pointerUp(track, { clientX: 250, pointerId: 1 });
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith("all");
    });

    it("chooses nothing when a scroll takes the finger", () => {
      const { track, onChange } = renderTrack();
      fireEvent.pointerDown(track, { clientX: 250, pointerId: 1 });
      fireEvent.pointerCancel(track, { pointerId: 1 });
      expect(onChange).not.toHaveBeenCalled();
    });

    it("ignores the click a finger's tap ends with, having chosen on its lift", () => {
      const { track, onChange } = renderTrack();
      fireEvent.pointerDown(track, { clientX: 150, pointerId: 1 });
      fireEvent.pointerUp(track, { clientX: 150, pointerId: 1 });
      fireEvent.click(screen.getByRole("button", { name: "3 mo" }), { detail: 1 });
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith("months3");
    });
  });
});
