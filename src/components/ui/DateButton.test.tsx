import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { formatSessionDate } from "../../lib/dates";
import { DateButton } from "./DateButton";

describe("DateButton", () => {
  it("shows the day the way the device writes it, not as a form field", () => {
    render(<DateButton label="Date" value="2026-11-04" onChange={vi.fn()} />);
    expect(screen.getByText(formatSessionDate("2026-11-04"))).toBeInTheDocument();
    expect(screen.getByLabelText("Date")).toHaveValue("2026-11-04");
  });

  it("reports a picked day", () => {
    const onChange = vi.fn();
    render(<DateButton label="Date" value="2026-11-04" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-10-31" } });
    expect(onChange).toHaveBeenCalledWith("2026-10-31");
  });

  it("never empties the day, as a session always has one", () => {
    const onChange = vi.fn();
    render(<DateButton label="Date" value="2026-11-04" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "" } });
    expect(onChange).not.toHaveBeenCalled();
  });
});
