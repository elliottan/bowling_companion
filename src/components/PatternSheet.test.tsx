import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PatternSheet } from "./PatternSheet";
import { CHROMIUM_6742 } from "../lib/oilPattern.fixture";

const chromium = { id: 1, name: "Chromium 6742", passes: CHROMIUM_6742 };

describe("PatternSheet", () => {
  it("leads with the numbers a sheet leads with", () => {
    render(<PatternSheet pattern={chromium} onClose={() => {}} />);
    expect(screen.getByText("42 ft")).toBeInTheDocument();
    expect(screen.getByText("25.56 mL")).toBeInTheDocument();
    // Twice on screen, and legitimately: the headline ratio, and the outside
    // track zone that happens to carry the same figure.
    expect(screen.getAllByText("6.71:1").length).toBeGreaterThan(0);
    expect(screen.getByText("Challenge")).toBeInTheDocument();
    expect(screen.getByText("15.41 / 10.15 mL")).toBeInTheDocument();
  });

  it("draws a bar per board of the lane", () => {
    const { container } = render(<PatternSheet pattern={chromium} onClose={() => {}} />);
    expect(container.querySelectorAll('[data-role="board-bar"]')).toHaveLength(39);
  });

  it("prints the track zone ratios the sheet prints", () => {
    render(<PatternSheet pattern={chromium} onClose={() => {}} />);
    expect(screen.getByText("3L-7L")).toBeInTheDocument();
    expect(screen.getAllByText("6.71:1").length).toBeGreaterThan(1);
  });

  it("lists every pass, in the sheet's own board notation", () => {
    render(<PatternSheet pattern={chromium} onClose={() => {}} />);
    expect(screen.getByText(/Forward passes/i)).toBeInTheDocument();
    expect(screen.getByText(/Reverse passes/i)).toBeInTheDocument();
    expect(screen.getAllByText("2L to 2R").length).toBeGreaterThan(0);
  });

  // A pattern of the bowler's own has no table, and the sheet says so rather
  // than drawing an empty graph.
  it("says there is nothing to show for a pattern with no load table", () => {
    render(<PatternSheet pattern={{ id: 2, name: "Thursday", distance: 40 }} onClose={() => {}} />);
    expect(screen.getByText(/40 ft\. This pattern has no load table/i)).toBeInTheDocument();
    expect(screen.queryByText(/Forward passes/i)).toBeNull();
  });

  it("closes", () => {
    const onClose = vi.fn();
    render(<PatternSheet pattern={chromium} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText(/close/i));
    expect(onClose).toHaveBeenCalled();
  });
});
