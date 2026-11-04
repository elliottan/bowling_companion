import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { stepValue } from "../../lib/stepValue";
import { Stepper } from "./Stepper";

describe("stepValue", () => {
  it("steps on the grid from a value that is on it", () => {
    expect(stepValue(15, 0.5, 1, 1, 39)).toBe(15.5);
    expect(stepValue(15, 0.5, -1, 1, 39)).toBe(14.5);
  });

  it("lands on the grid from a typed value that is off it", () => {
    expect(stepValue(15.3, 0.5, 1, 1, 39)).toBe(15.5);
    expect(stepValue(15.3, 0.5, -1, 1, 39)).toBe(15);
  });

  it("stops at the ends of the range", () => {
    expect(stepValue(39, 0.5, 1, 1, 39)).toBe(39);
    expect(stepValue(1, 1, -1, 1, 70)).toBe(1);
    expect(stepValue(80, 1, -1, 1, 70)).toBe(70);
  });

  it("does not drift off the grid over many half steps", () => {
    let v = 1;
    for (let i = 0; i < 60; i++) v = stepValue(v, 0.5, 1, 1, 50);
    expect(v).toBe(31);
  });
});

describe("Stepper", () => {
  const renderStepper = (value: number | undefined, onChange = vi.fn()) => {
    render(<Stepper label="Stance" value={value} onChange={onChange} min={1} max={39} step={0.5} start={20} />);
    return onChange;
  };

  it("steps down and up", () => {
    const onChange = renderStepper(10);
    fireEvent.click(screen.getByRole("button", { name: "Decrease Stance" }));
    expect(onChange).toHaveBeenLastCalledWith(9.5);
    fireEvent.click(screen.getByRole("button", { name: "Increase Stance" }));
    expect(onChange).toHaveBeenLastCalledWith(10.5);
  });

  it("starts an empty field at its start, from either half", () => {
    const onChange = renderStepper(undefined);
    fireEvent.click(screen.getByRole("button", { name: "Decrease Stance" }));
    expect(onChange).toHaveBeenLastCalledWith(20);
  });

  it("dims the half at its end of the range", () => {
    renderStepper(39);
    expect(screen.getByRole("button", { name: "Increase Stance" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Decrease Stance" })).toBeEnabled();
  });
});
