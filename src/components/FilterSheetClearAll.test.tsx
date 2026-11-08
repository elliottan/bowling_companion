import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PatternFilterSheet } from "./PatternFilterSheet";
import { SpareFilterBar } from "./SpareFilterBar";
import type { SpareFilters } from "../lib/useSpareFilters";
import { NO_PATTERN_FILTERS } from "../lib/patternFilters";

/**
 * Every filter sheet clears from its leading corner, where the X would be,
 * and never from a line at its foot (ADR-256). Dimmed with nothing to clear.
 */

/** The Clear all control is in the sheet's bar, before its title. */
function expectLeading(sheet: HTMLElement, title: string) {
  const clear = within(sheet).getByRole("button", { name: "Clear all" });
  const heading = within(sheet).getByRole("heading", { name: title });
  expect(clear.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  return clear;
}

function spareState(over: Partial<SpareFilters> = {}): SpareFilters {
  return {
    filters: new Set(),
    toggle: vi.fn(),
    pins: new Set(),
    setPins: vi.fn(),
    exact: false,
    setExact: vi.fn(),
    active: false,
    clear: vi.fn(),
    ...over
  };
}

describe("a filter sheet's Clear all", () => {
  it("clears the picked pins from the pins sheet's corner", () => {
    const state = spareState({ pins: new Set([10]), active: true });
    render(<SpareFilterBar state={state} label="Filter leaves" pinsOpen onPinsOpenChange={vi.fn()} />);

    const clear = expectLeading(screen.getByRole("dialog", { name: "Pins" }), "Pins");
    fireEvent.click(clear);
    expect(state.setPins).toHaveBeenCalledWith([]);
    // Nothing at the foot any more.
    expect(screen.queryByRole("button", { name: "Clear pins" })).not.toBeInTheDocument();
  });

  it("is dimmed in the pins sheet with no pin picked", () => {
    render(<SpareFilterBar state={spareState()} label="Filter leaves" pinsOpen onPinsOpenChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Clear all" })).toBeDisabled();
  });

  it("clears the oil pattern filters from the sheet's corner", () => {
    const onChange = vi.fn();
    render(
      <PatternFilterSheet
        filters={{ shapes: new Set(["sport"]), minFeet: null, maxFeet: null }}
        onChange={onChange}
        bounds={{ min: 30, max: 50 }}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(expectLeading(screen.getByRole("dialog", { name: "Filters" }), "Filters"));
    expect(onChange).toHaveBeenCalledWith(NO_PATTERN_FILTERS);
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
  });
});
