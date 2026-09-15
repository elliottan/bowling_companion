import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { LayoutLabView } from "./LayoutLabView";
import { db } from "../db/bowlingDb";
import { getPap, setHandedness, setPap } from "../services/bowlingRepository";
import { decodeLayoutParams } from "../lib/layoutShare";

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

/** Open the preset menu, which hangs off the named button under the Layout
 *  heading rather than off the nav bar's More. */
const openMenu = () =>
  fireEvent.click(screen.getByRole("button", { name: /^Preset,/ }));

describe("LayoutLabView", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    window.history.replaceState({}, "", "/score");
  });

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
    // The marker the drilling angle measures to is the CG on a symmetric ball,
    // and the ball says so where the marker is drawn.
    const svg = screen.getByRole("img", { name: /bowling ball/i });
    const texts = Array.from(svg.querySelectorAll("text")).map((t) => (t.textContent ?? "").trim());
    expect(texts).toContain("CG");
  });

  it("applies a preset from the preset menu", () => {
    renderLab();
    openMenu();
    // The screen opens on the benchmark, which is itself a preset, so switching
    // presets loses nothing and goes straight through.
    fireEvent.click(screen.getByRole("button", { name: "Pin down" }));
    expect(dualAngle()).toBe("70 x 4 1/2 x 70");
  });

  it("asks before a preset throws away numbers the bowler typed", async () => {
    renderLab();
    // Move off every preset, so there is custom work on screen.
    fireEvent.change(slider(/VAL angle/i), { target: { value: "62" } });
    openMenu();
    fireEvent.click(screen.getByRole("button", { name: "Pin down" }));

    // Nothing has changed yet: the dialog names both layouts and waits.
    expect(dualAngle()).toBe("45 x 4 1/2 x 62");
    // The pushed screen is itself a dialog, so the confirm is found by its own
    // title rather than by role alone.
    const dialog = screen
      .getByText(/Use the pin down layout\?/i)
      .closest('[role="dialog"]') as HTMLElement;
    expect(dialog).toBeTruthy();
    // It names what is being lost and what replaces it, so the answer is a
    // decision rather than a guess.
    expect(dialog.textContent).toContain("45 x 4 1/2 x 62");
    expect(dialog.textContent).toContain("70 x 4 1/2 x 70");

    fireEvent.click(screen.getByRole("button", { name: "Replace" }));
    // ConfirmDialog commits through its own dismiss, which waits for the exit.
    await waitFor(() => expect(dualAngle()).toBe("70 x 4 1/2 x 70"));
  });

  it("does not ask when the layout on screen is already a preset", () => {
    renderLab();
    openMenu();
    fireEvent.click(screen.getByRole("button", { name: "Early roll" }));
    // Straight through, no dialog: switching between presets discards nothing
    // that took work, and a dialog whose answer is always yes teaches people to
    // dismiss dialogs unread.
    expect(screen.queryByText(/Use the/i)).not.toBeInTheDocument();
    expect(dualAngle()).toBe("35 x 4 x 35");
  });

  it("keeps the layout when the preset confirm is cancelled", async () => {
    renderLab();
    fireEvent.change(slider(/VAL angle/i), { target: { value: "62" } });
    openMenu();
    fireEvent.click(screen.getByRole("button", { name: "Short pin" }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() => expect(screen.queryByText(/Use the/i)).not.toBeInTheDocument());
    expect(dualAngle()).toBe("45 x 4 1/2 x 62");
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
    openMenu();
    fireEvent.click(screen.getByRole("button", { name: "Short pin" }));
    expect(dualAngle()).not.toBe("45 x 4 1/2 x 45");
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
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
    const whole = screen.getByLabelText("Over") as HTMLSelectElement;
    // The default PAP is 5" over, which is 5 and no fraction.
    expect(whole.value).toBe("5");
    expect((screen.getByLabelText("Over fraction") as HTMLSelectElement).value).toBe("0");

    // A decimal cannot be entered at all, because the whole inches are a list
    // of the seven a PAP can be rather than a box to type in.
    expect(Array.from(whole.options).map((o) => o.text)).toEqual([
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6"
    ]);
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
    fireEvent.change(screen.getByLabelText("Up or down direction"), {
      target: { value: "down" }
    });
    expect(ball()).not.toBe(halfUp);
  });

  it("leads with the PAP, which every other number is measured against", () => {
    renderLab();
    const headings = screen.getAllByRole("heading").map((h) => h.textContent);
    expect(headings[0]).toBe("Layout lab");
    expect(headings[1]).toBe("Your PAP");
  });

  it("puts each angle at its own vertex, not both in the middle of the ball", () => {
    renderLab();
    const svg = screen.getByRole("img", { name: /bowling ball/i });
    const texts = Array.from(svg.querySelectorAll("text"));
    const at = (starts: string) => {
      const t = texts.find((n) => (n.textContent ?? "").trim().startsWith(starts));
      return { x: Number(t?.getAttribute("x")), y: Number(t?.getAttribute("y")) };
    };
    const gap = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.hypot(a.x - b.x, a.y - b.y);

    const pin = at("Pin");
    const pap = at("PAP");
    const drill = texts.find((n) => (n.textContent ?? "").includes("DRILL"));
    const val = texts.find((n) => (n.textContent ?? "").includes("VAL"));
    const drillAt = { x: Number(drill?.getAttribute("x")), y: Number(drill?.getAttribute("y")) };
    const valAt = { x: Number(val?.getAttribute("x")), y: Number(val?.getAttribute("y")) };

    // The drilling angle is measured at the pin and the VAL angle at the PAP,
    // so each label must sit by the vertex it belongs to. Both wedges open
    // inward along the pin-to-PAP line, so a label placed too far out along its
    // own bisector walks toward the other one until the two huddle in the
    // middle of the ball and neither reads as belonging anywhere.
    expect(gap(drillAt, pin)).toBeLessThan(gap(drillAt, pap));
    expect(gap(valAt, pap)).toBeLessThan(gap(valAt, pin));

    // And they stay apart from each other by more than either is from its own
    // vertex, which is what "one angle at each corner" looks like numerically.
    expect(gap(drillAt, valAt)).toBeGreaterThan(gap(drillAt, pin));
    expect(gap(drillAt, valAt)).toBeGreaterThan(gap(valAt, pap));
  });

  it("names each angle, so which is which does not depend on the colour", () => {
    renderLab();
    const svg = screen.getByRole("img", { name: /bowling ball/i });
    const all = Array.from(svg.querySelectorAll("text")).map((t) => (t.textContent ?? "").trim());
    expect(all.some((t) => t.includes("DRILL"))).toBe(true);
    expect(all.some((t) => t.includes("VAL"))).toBe(true);
  });

  it("fills the PAP and the hand from the bowler's own settings", async () => {
    await setPap({ over: 4.25, up: -0.25 });
    await setHandedness("left");
    renderLab();

    await waitFor(() =>
      expect((screen.getByRole("combobox", { name: "Over" }) as HTMLSelectElement).value).toBe("4")
    );
    expect((screen.getByLabelText("Over fraction") as HTMLSelectElement).value).toBe("2");
    // Below the midline, which is what the stored negative means.
    expect((screen.getByLabelText("Up or down direction") as HTMLSelectElement).value).toBe("down");
    expect(screen.getByRole("button", { name: "Left" })).toHaveAttribute("aria-pressed", "true");
  });

  it("saves the PAP back, because it is the bowler's measurement and not this screen's", async () => {
    renderLab();
    fireEvent.change(screen.getByRole("combobox", { name: "Over" }), { target: { value: "4" } });
    await waitFor(async () => expect(await getPap()).toEqual({ over: 4, up: 0.5 }));
  });

  it("mirrors the whole layout for a left-hander", () => {
    renderLab();
    const ball = () => screen.getByRole("img", { name: /bowling ball/i }).innerHTML;
    const right = ball();
    fireEvent.click(screen.getByRole("button", { name: "Left" }));
    // Same three numbers, opposite side of the ball.
    expect(ball()).not.toBe(right);
    expect(dualAngle()).toBe("45 x 4 1/2 x 45");
  });

  it("shows the ball's own pin-to-PSA distance on the line it measures", () => {
    renderLab();
    const svg = screen.getByRole("img", { name: /bowling ball/i });
    const texts = Array.from(svg.querySelectorAll("text")).map((t) => (t.textContent ?? "").trim());
    // 6 3/4" is the asymmetric default, and it is the one number in the drawing
    // the driller does not choose.
    expect(texts).toContain('6 3/4"');
  });

  it("carries no chip row under the ball, and no flare rings on it", () => {
    renderLab();
    // The ball is dragged, which is the gesture everyone tries: the chips that
    // jumped the camera to each landmark were a second way to do it, and the
    // flare rings are what the layout produces rather than part of it.
    expect(screen.queryByRole("button", { name: "Flare rings" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "PAP" })).not.toBeInTheDocument();
  });

  it("keeps each slider's explanation in a popup behind its own label", () => {
    renderLab();
    const hint = /Sets the flare/i;
    expect(screen.queryByText(hint)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Pin to PAP/i }));
    expect(screen.getByText(hint)).toBeVisible();
    // Dismissable, rather than a line that stays and pushes the sliders below
    // it down the screen.
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByText(hint)).not.toBeInTheDocument();
  });

  it("shares a link that reopens the same layout", async () => {
    const written: string[] = [];
    Object.assign(navigator, {
      clipboard: { writeText: (t: string) => (written.push(t), Promise.resolve()) }
    });
    renderLab();
    fireEvent.change(slider(/VAL angle/i), { target: { value: "30" } });
    // Its own button in the nav bar, beside More: sharing the layout is what
    // this screen is for once the numbers are right.
    fireEvent.click(screen.getByRole("button", { name: /share layout/i }));

    await waitFor(() => expect(written).toHaveLength(1));
    const url = written[0];
    expect(url).toContain("#/home/layout-lab");
    const decoded = decodeLayoutParams(url.slice(url.indexOf("?"), url.indexOf("#")));
    expect(decoded?.layout.valAngle).toBe(30);
    expect(decoded?.layout.pinToPap).toBe(4.5);
  });

  it("opens on a shared layout, overriding the bowler's own PAP and hand", async () => {
    await setPap({ over: 5, up: 0.5 });
    await setHandedness("right");
    window.history.replaceState({}, "", "/score?da=70&ptp=5&val=30&hand=left&over=4&up=0&core=asym");
    renderLab();

    expect(dualAngle()).toBe("70 x 5 x 30");
    expect(screen.getByRole("button", { name: "Left" })).toHaveAttribute("aria-pressed", "true");
    expect((screen.getByRole("combobox", { name: "Over" }) as HTMLSelectElement).value).toBe("4");
  });

  it("never saves a PAP that arrived in somebody else's link", async () => {
    window.history.replaceState({}, "", "/score?da=45&ptp=4.5&val=45&over=3&up=0");
    renderLab();
    fireEvent.change(screen.getByRole("combobox", { name: "Over" }), { target: { value: "2" } });
    // The bowler's own stored axis is untouched: a shared layout is a thing to
    // look at, not a measurement of the person looking at it.
    await waitFor(() => expect(dualAngle()).toBe("45 x 4 1/2 x 45"));
    expect(await getPap()).toBeNull();
  });

  it("offers the settings that hold the hand and the PAP, behind More", () => {
    const onOpenSettings = vi.fn();
    render(<LayoutLabView onBack={vi.fn()} onOpenSettings={onOpenSettings} />);
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(onOpenSettings).toHaveBeenCalled();
  });

  it("puts the bowler's own PAP back with the reset beside it", async () => {
    await setPap({ over: 3, up: 0 });
    renderLab();
    await waitFor(() =>
      expect((screen.getByLabelText("Over") as HTMLSelectElement).value).toBe("3")
    );
    fireEvent.click(screen.getByRole("button", { name: /reset PAP and hand/i }));
    // Back to the app's default axis, and saved, because the PAP is the
    // bowler's measurement wherever it is edited from.
    await waitFor(() => expect(getPap()).resolves.toEqual({ over: 5, up: 0.5 }));
    expect((screen.getByLabelText("Over") as HTMLSelectElement).value).toBe("5");
  });

  it("goes back", async () => {
    const { onBack } = renderLab();
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    // PushScreen defers the callback until its exit animation finishes.
    await waitFor(() => expect(onBack).toHaveBeenCalled());
  });
});
