import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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

  it("draws shorter when dense, and still carries a 44pt hit region", () => {
    const { rerender } = render(
      <SegmentedControl label="Pick" value="a" options={options} onChange={vi.fn()} />
    );
    expect(screen.getByRole("button", { name: "A" }).className).toContain("h-10");

    rerender(<SegmentedControl dense label="Pick" value="a" options={options} onChange={vi.fn()} />);
    const segment = screen.getByRole("button", { name: "A" });
    // 36px drawn, so two can stack in a dense panel...
    expect(segment.className).toContain("h-9");
    expect(segment.className).not.toContain("h-10");
    // ...and 44pt to the finger regardless, which is the floor the primitive
    // exists to hold. A dense variant that dropped this would be a tap target
    // shrunk by a styling prop.
    expect(segment.className).toContain("after:h-11");
  });
});
