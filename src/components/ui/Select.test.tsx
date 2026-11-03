import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Select } from "./Select";

describe("Select (ADR-231)", () => {
  it("is a real select, with the pop-up button's chevrons drawn beside it", () => {
    const onChange = vi.fn();
    const { container } = render(
      <Select aria-label="Alley" value="a" onChange={onChange}>
        <option value="a">A</option>
        <option value="b">B</option>
      </Select>
    );
    const select = screen.getByRole("combobox", { name: "Alley" });
    fireEvent.change(select, { target: { value: "b" } });
    expect(onChange).toHaveBeenCalled();
    // The browser's own arrow is off, so the drawn chevrons are the only one.
    expect(select.className).toContain("appearance-none");
    expect(container.querySelector("svg[aria-hidden='true']")).not.toBeNull();
  });
});
