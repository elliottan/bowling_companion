import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { LayoutLabView } from "./LayoutLabView";

const renderLab = () => {
  const onBack = vi.fn();
  render(<LayoutLabView onBack={onBack} />);
  return { onBack };
};

/** The range input behind a slider's visible label. Found by role, because
 *  "Pin buffer" also names a readout further down the screen. */
const slider = (name: RegExp | string) =>
  screen.getByRole("slider", { name }) as HTMLInputElement;

/** The "45 x 4 1/2 x 45" readout, whatever it currently says. */
// Both names appear twice on screen, once as the system toggle's button and
// once as the readout's label, so the readouts are found by their label span.
const readout = (label: string) =>
  within(screen.getByText(label, { selector: "span" }).closest("div") as HTMLElement).getByText(/ x /)
    .textContent;

const dualAngle = () => readout("Dual angle");
const vlsReadout = () => readout("Storm VLS");

describe("LayoutLabView", () => {
  it("opens on the benchmark layout, in both notations", () => {
    renderLab();
    expect(dualAngle()).toBe("45 x 4 1/2 x 45");
    // The asymmetric default has a 6 3/4" pin-to-PSA, so the middle number is
    // there and the layout is three numbers.
    expect(vlsReadout()?.split(" x ")).toHaveLength(3);
  });

  it("moves the layout when a slider moves, and both notations follow", () => {
    renderLab();
    fireEvent.change(slider(/VAL angle/i), { target: { value: "70" } });
    expect(dualAngle()).toBe("45 x 4 1/2 x 70");
    // A bigger VAL angle is a bigger pin buffer, which is the VLS third number.
    expect(vlsReadout()).toBe("4 1/2 x 3 7/8 x 4 1/8");
  });

  it("drops the VLS middle number on a symmetric ball, which has no PSA", () => {
    renderLab();
    fireEvent.click(screen.getByRole("button", { name: "Symmetric" }));
    expect(vlsReadout()?.split(" x ")).toHaveLength(2);
    expect(screen.getByText(/only moves the CG/i)).toBeInTheDocument();
  });

  it("applies a preset and says what it is for", () => {
    renderLab();
    fireEvent.click(screen.getByRole("button", { name: "Pin down" }));
    expect(dualAngle()).toBe("70 x 4 1/2 x 70");
    expect(screen.getByText(/smoothest shape/i)).toBeInTheDocument();
  });

  it("warns on the lane, not after the fact, when the pin-to-PAP lands in the do-not-use band", () => {
    renderLab();
    fireEvent.change(slider(/Pin to PAP/i), { target: { value: "3" } });
    expect(screen.getByText(/thumb hole/i)).toBeInTheDocument();
  });

  it("edits the layout through the VLS numbers and converts back", () => {
    renderLab();
    fireEvent.click(screen.getByRole("button", { name: "Storm VLS" }));
    fireEvent.change(slider(/Pin buffer/i), { target: { value: "4.125" } });
    // Near enough the 70 degree VAL angle the slider above reached, arrived at
    // from the other side, but a degree off it rather than exactly on it. That
    // is the systems disagreeing about resolution, not a conversion error: a
    // pin buffer is quoted to the eighth, and at a 4 1/2" pin-to-PAP one eighth
    // of buffer is about one degree of VAL angle. Anything asking for an exact
    // round trip through the written numbers is asking for precision the
    // notation does not carry.
    expect(dualAngle()).toMatch(/^45 x 4 1\/2 x (70|71)$/);
  });

  it("reads the motion out in words as well as bars", () => {
    renderLab();
    fireEvent.change(slider(/VAL angle/i), { target: { value: "85" } });
    expect(screen.getByText(/arcs smoothly through the breakpoint/i)).toBeInTheDocument();
    fireEvent.change(slider(/VAL angle/i), { target: { value: "5" } });
    expect(screen.getByText(/snaps hard off the friction/i)).toBeInTheDocument();
  });

  it("resets back to the benchmark", () => {
    renderLab();
    fireEvent.click(screen.getByRole("button", { name: "Short pin" }));
    expect(dualAngle()).not.toBe("45 x 4 1/2 x 45");
    fireEvent.click(screen.getByRole("button", { name: /reset/i }));
    expect(dualAngle()).toBe("45 x 4 1/2 x 45");
  });

  it("draws a ball that describes itself, since the picture carries the point", () => {
    renderLab();
    const ball = screen.getByRole("img", { name: /bowling ball showing a 45 by 4.50 inch by 45 dual angle/i });
    expect(ball).toBeInTheDocument();
    expect(ball.getAttribute("aria-label")).toMatch(/Drag the ball, or use the arrow keys/);
  });

  it("turns the ball with the arrow keys, so the far side is reachable without a pointer", () => {
    renderLab();
    const ball = screen.getByRole("img", { name: /bowling ball/i });
    const before = ball.innerHTML;
    fireEvent.keyDown(ball, { key: "ArrowRight" });
    expect(ball.innerHTML).not.toBe(before);
    fireEvent.keyDown(ball, { key: "Home" });
    fireEvent.keyDown(ball, { key: "ArrowDown" });
    // An unhandled key leaves it where it is.
    const settled = ball.innerHTML;
    fireEvent.keyDown(ball, { key: "a" });
    expect(ball.innerHTML).toBe(settled);
  });

  it("moves the grip under the layout when the PAP measurement changes", () => {
    renderLab();
    const ball = screen.getByRole("img", { name: /bowling ball/i });
    const before = ball.innerHTML;
    fireEvent.change(screen.getByLabelText("Over"), { target: { value: "3" } });
    expect(ball.innerHTML).not.toBe(before);
    // The layout numbers themselves are untouched: a PAP is the bowler, not the drill.
    expect(dualAngle()).toBe("45 x 4 1/2 x 45");
  });

  it("takes a PAP as whole inches and a fraction, never as a decimal", () => {
    renderLab();
    const whole = screen.getByLabelText("Over") as HTMLInputElement;
    // The default PAP is 5" over, which is 5 and no fraction.
    expect(whole.value).toBe("5");
    expect((screen.getByLabelText("Over fraction") as HTMLSelectElement).value).toBe("0");

    // A typed decimal point cannot land in the field at all: it is filtered to
    // digits, so "3.5" is read as the whole inches 35 and clamped to the max.
    fireEvent.change(whole, { target: { value: "3.5" } });
    expect(whole.value).toBe("6");
  });

  it("offers only the eighths as fractions, with blank for a whole inch", () => {
    renderLab();
    const options = Array.from(
      (screen.getByLabelText("Over fraction") as HTMLSelectElement).options
    ).map((o) => o.text);
    expect(options).toEqual(["", "1/8", "1/4", "3/8", "1/2", "5/8", "3/4", "7/8"]);
  });

  it("combines the whole and the fraction into one measurement", () => {
    renderLab();
    const ball = () => screen.getByRole("img", { name: /bowling ball/i }).innerHTML;
    fireEvent.change(screen.getByLabelText("Over"), { target: { value: "4" } });
    const atFourInches = ball();
    fireEvent.change(screen.getByLabelText("Over fraction"), { target: { value: "4" } });
    // 4 1/2 is not 4, so the grip moved.
    expect(ball()).not.toBe(atFourInches);
  });

  it("puts the sign on the whole measurement, so a PAP below the midline is reachable", () => {
    renderLab();
    const ball = () => screen.getByRole("img", { name: /bowling ball/i }).innerHTML;
    fireEvent.change(screen.getByLabelText("Up or down"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("Up or down fraction"), { target: { value: "4" } });
    const halfUp = ball();
    // Half an inch DOWN is a different axis, and cannot be written as a
    // negative zero, which is the whole reason the direction is its own control.
    fireEvent.click(screen.getByRole("button", { name: "Down" }));
    expect(ball()).not.toBe(halfUp);
  });

  it("leads with the PAP, which every other number is measured against", () => {
    renderLab();
    const headings = screen.getAllByRole("heading").map((h) => h.textContent);
    expect(headings[0]).toBe("Layout lab");
    expect(headings[1]).toBe("Your PAP");
  });

  it("goes back", async () => {
    const { onBack } = renderLab();
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    // PushScreen defers the callback until its exit animation finishes.
    await waitFor(() => expect(onBack).toHaveBeenCalled());
  });
});
