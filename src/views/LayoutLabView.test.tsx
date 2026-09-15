import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { LayoutLabView } from "./LayoutLabView";
import { db } from "../db/bowlingDb";
import {
  getGripStyle,
  getHandedness,
  getPap,
  setGripStyle,
  setHandedness,
  setPap
} from "../services/bowlingRepository";
import { decodeLayoutParams } from "../lib/layoutShare";

/* jsdom has no 2D canvas context and never resolves an `<img>` decode, so the
 * two steps between "the layout on screen" and "a PNG on the phone" cannot run
 * here. They are stubbed at the seam rather than skipped, which leaves the
 * screen's own half, deciding what goes on the card and where it is sent,
 * testable. `lib/shareCard`'s own tests cover the builders underneath. */
const raster = vi.hoisted(() => ({ downloads: [] as string[] }));

vi.mock("../lib/svgImage", () => ({
  svgToImage: () => Promise.reject(new Error("no raster in jsdom"))
}));

vi.mock("../lib/shareCard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/shareCard")>();
  return {
    ...actual,
    renderShareCard: () => Promise.resolve(new Blob(["png"], { type: "image/png" })),
    downloadCardImage: (_blob: Blob, filename: string) => {
      raster.downloads.push(filename);
    }
  };
});

const renderLab = () => {
  const onBack = vi.fn();
  render(<LayoutLabView onBack={onBack} />);
  return { onBack };
};

/** The range input behind a slider's visible label. Found by role, because
 *  "Pin buffer" also names a readout further down the screen. */
const slider = (name: RegExp | string) =>
  screen.getByRole("slider", { name }) as HTMLInputElement;

/** The "45 x 4 1/2 x 45" readout, whatever it currently says. Each notation is
 *  one control now: the box that shows the layout in a notation is the button
 *  that starts editing it in that notation. */
const systemCard = (label: string) =>
  screen.getByRole("button", { name: new RegExp(`^${label}`) });

/* The separators are dimmed, so the reading is spans rather than one text
 * node. Read the card whole and drop its label: what matters is that the three
 * measurements still come out as one string, spaces and all, which is also
 * exactly what the button's accessible name is built from. */
const readout = (label: string) =>
  (systemCard(label).textContent ?? "").replace(label, "").trim();

const dualAngle = () => readout("Dual angle");
const vlsReadout = () => readout("Storm VLS");

/** Open the preset menu, which hangs off the named button on the Layout
 *  heading row rather than off the nav bar's More. */
const openMenu = () =>
  fireEvent.click(screen.getByRole("button", { name: /^Presets,/ }));

describe("LayoutLabView", () => {
  beforeAll(() => {
    // jsdom fetches no resources, so an `<img>` settles neither way and the
    // share card's app mark would hang the preview for its whole timeout. The
    // app already treats a mark it cannot load as no mark; this makes jsdom say
    // so at once instead of waiting to be told.
    class UnloadableImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal("Image", UnloadableImage);
  });

  beforeEach(async () => {
    await db.delete();
    await db.open();
    raster.downloads.length = 0;
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

  it("dims the separators without running the numbers together", () => {
    renderLab();
    const card = systemCard("Dual angle");
    // Dimmed for the eye: the x's are the only repeated shape in the line and
    // at one weight they read as loudly as the measurements.
    const separators = Array.from(card.querySelectorAll("span")).filter(
      (n) => (n.textContent ?? "").trim() === "x"
    );
    expect(separators).toHaveLength(2);
    for (const sep of separators) expect(sep.className).toMatch(/text-ink-tertiary/);

    // Still three measurements to a screen reader, which gets the text content
    // with the styling thrown away. Padding instead of real spaces would look
    // identical and say "45x4 1/2x45".
    expect(card).toHaveAccessibleName("Dual angle 45 x 4 1/2 x 45");
  });

  it("edits the layout through the VLS numbers and converts back", () => {
    renderLab();
    fireEvent.click(systemCard("Storm VLS"));
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

  it("gets back to the benchmark through the presets, which is what reset meant", async () => {
    renderLab();
    openMenu();
    fireEvent.click(screen.getByRole("button", { name: "Short pin" }));
    expect(dualAngle()).not.toBe("45 x 4 1/2 x 45");
    // The separate Reset control is gone: every reset it offered was "go back
    // to the benchmark", and the benchmark is itself a preset, so the two
    // controls were one idea spending two bands of a phone screen.
    expect(screen.queryByRole("button", { name: "Reset" })).not.toBeInTheDocument();
    openMenu();
    fireEvent.click(screen.getByRole("button", { name: "Benchmark" }));
    await waitFor(() => expect(dualAngle()).toBe("45 x 4 1/2 x 45"));
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

  it("offers only the eighths as fractions, with zero for a whole inch", () => {
    renderLab();
    const options = Array.from(
      (screen.getByLabelText("Over fraction") as HTMLSelectElement).options
    ).map((o) => o.text);
    // Zero is a listed option rather than a blank row, which read as a box
    // that had failed to fill itself in.
    expect(options).toEqual(["0", "1/8", "1/4", "3/8", "1/2", "5/8", "3/4", "7/8"]);
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

  it("leads with the bowler, whose axis every other number is measured against", () => {
    renderLab();
    const headings = screen.getAllByRole("heading").map((h) => h.textContent);
    expect(headings[0]).toBe("Layout lab");
    expect(headings[1]).toBe("You");
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

  it("never writes the PAP back, because this screen is a question and not a measurement", async () => {
    await setPap({ over: 5, up: 0.5 });
    renderLab();
    await waitFor(() =>
      expect((screen.getByLabelText("Over") as HTMLSelectElement).value).toBe("5")
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Over" }), { target: { value: "4" } });
    // On screen, because the whole point is seeing what a different axis does.
    await waitFor(() =>
      expect((screen.getByLabelText("Over") as HTMLSelectElement).value).toBe("4")
    );
    // And nowhere else. Turning the PAP down an inch here to see what happens
    // is asking a question, not taking a measurement, and it used to quietly
    // overwrite an axis measured off a thrown shot in a pro shop.
    expect(await getPap()).toEqual({ over: 5, up: 0.5 });
  });

  it("never writes the grip or the hand back either", async () => {
    await setGripStyle("1h");
    await setHandedness("right");
    renderLab();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "One handed" })).toHaveAttribute(
        "aria-pressed",
        "true"
      )
    );

    fireEvent.click(screen.getByRole("button", { name: "Two handed" }));
    fireEvent.click(screen.getByRole("button", { name: "Left" }));
    expect(screen.getByRole("button", { name: "Two handed" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    // The lab seeds from the bowler's settings and that is where it ends: all
    // three answers belong to Settings, and a sandbox that edits them does it
    // from controls giving no hint they reach outside the screen.
    expect(await getGripStyle()).toBe("1h");
    expect(await getHandedness()).toBe("right");
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
    // The nav bar's share is the link now: a layout is a thing to open, not
    // only a thing to look at. The picture is one control along.
    fireEvent.click(screen.getByRole("button", { name: "Share layout" }));
    fireEvent.click(await screen.findByRole("button", { name: "Share link" }));

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

  it("leaves the reader's own axis alone when it opens on somebody else's", async () => {
    await setPap({ over: 5, up: 0.5 });
    window.history.replaceState({}, "", "/score?da=45&ptp=4.5&val=45&over=3&up=0");
    renderLab();
    // The link's axis is what the layout is read against, so it is what shows.
    expect((screen.getByLabelText("Over") as HTMLSelectElement).value).toBe("3");
    fireEvent.change(screen.getByRole("combobox", { name: "Over" }), { target: { value: "2" } });
    // A shared layout is a thing to look at, not a measurement of the person
    // looking at it.
    await waitFor(() => expect(dualAngle()).toBe("45 x 4 1/2 x 45"));
    expect(await getPap()).toEqual({ over: 5, up: 0.5 });
  });

  it("previews the layout as a picture before the link goes anywhere", async () => {
    renderLab();
    fireEvent.click(screen.getByRole("button", { name: "Share layout" }));
    // A link pasted into a chat is a line of text nobody can see, so the card
    // is still drawn and still shown: it is what says what is being sent.
    const dialog = await screen.findByRole("dialog", { name: "Share image" });
    expect(within(dialog).getByRole("button", { name: "Share link" })).toBeInTheDocument();
  });

  it("saves the picture from the preview it is a picture of", async () => {
    renderLab();
    // Saving is a thing to do to the card, not to the screen, so it is not a
    // third glyph in the nav bar: it lives on the preview where the picture
    // actually exists.
    expect(screen.queryByRole("button", { name: "Save image" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Share layout" }));
    const dialog = await screen.findByRole("dialog", { name: "Share image" });
    const save = await within(dialog).findByRole("button", { name: "Save image" });
    // Dead until there is a picture to save, rather than a control that looks
    // live and does nothing while the card is still being drawn.
    await waitFor(() => expect(save).not.toBeDisabled());

    fireEvent.click(save);
    await waitFor(() => expect(raster.downloads).toHaveLength(1));
    // Named after the layout, so two saves do not collide in a folder.
    expect(raster.downloads[0]).toMatch(/^45-x-4-1-2-x-45-.*\.png$/);
    // Straight to the device, and the dialog stays up: saving the picture is
    // not the same act as sending the link, and does not stand in for it.
    expect(within(dialog).getByRole("status").textContent).toMatch(/image saved/i);
    expect(screen.getByRole("dialog", { name: "Share image" })).toBeInTheDocument();
  });

  it("offers the settings that hold the hand and the PAP, behind More", () => {
    const onOpenSettings = vi.fn();
    render(<LayoutLabView onBack={vi.fn()} onOpenSettings={onOpenSettings} />);
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(onOpenSettings).toHaveBeenCalled();
  });

  it("asks before the reset, and names the settings it is resetting to", async () => {
    await setPap({ over: 3, up: 0 });
    window.history.replaceState({}, "", "/score?da=45&ptp=4.5&val=45&over=6&up=0&hand=left");
    renderLab();
    // Somebody else's axis, from their link.
    expect((screen.getByLabelText("Over") as HTMLSelectElement).value).toBe("6");

    fireEvent.click(screen.getByRole("button", { name: /reset to your saved settings/i }));
    // It says what it is resetting *to*, because the person reaching for this
    // is usually reading a shared layout and is about to swap the sender's
    // measurements for their own rather than blank both.
    const dialog = screen
      .getByText(/Use your saved settings\?/i)
      .closest('[role="dialog"]') as HTMLElement;
    expect(dialog.textContent).toMatch(/hand, grip and PAP from your preferences/i);
    expect(dialog.textContent).toMatch(/layout numbers stay as they are/i);

    fireEvent.click(screen.getByRole("button", { name: "Use mine" }));
    await waitFor(() =>
      expect((screen.getByLabelText("Over") as HTMLSelectElement).value).toBe("3")
    );
  });

  it("leaves everything alone when the reset is cancelled", async () => {
    await setPap({ over: 3, up: 0 });
    renderLab();
    await waitFor(() =>
      expect((screen.getByLabelText("Over") as HTMLSelectElement).value).toBe("3")
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Over" }), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: /reset to your saved settings/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() => expect(screen.queryByText(/Use your saved settings/i)).not.toBeInTheDocument());
    expect((screen.getByLabelText("Over") as HTMLSelectElement).value).toBe("6");
  });

  it("opens one-handed when nothing has been chosen", () => {
    renderLab();
    expect(screen.getByRole("button", { name: "One handed" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("fills the grip from settings, and carries it in a shared link", async () => {
    const written: string[] = [];
    Object.assign(navigator, {
      clipboard: { writeText: (t: string) => (written.push(t), Promise.resolve()) }
    });
    await setGripStyle("2h");
    renderLab();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Two handed" })).toHaveAttribute(
        "aria-pressed",
        "true"
      )
    );

    fireEvent.click(screen.getByRole("button", { name: "Share layout" }));
    fireEvent.click(await screen.findByRole("button", { name: "Share link" }));
    await waitFor(() => expect(written).toHaveLength(1));
    const url = written[0];
    expect(decodeLayoutParams(url.slice(url.indexOf("?"), url.indexOf("#")))?.grip).toBe("2h");
  });

  it("leaves the reader's own grip alone when it opens on somebody else's", async () => {
    window.history.replaceState({}, "", "/score?da=45&ptp=4.5&val=45&grip=2h");
    renderLab();
    expect(screen.getByRole("button", { name: "Two handed" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    fireEvent.click(screen.getByRole("button", { name: "One handed" }));
    // A shared layout says who it was drilled for. It does not say who is
    // reading it, so nothing about the reader is written from it.
    await waitFor(() => expect(dualAngle()).toBe("45 x 4 1/2 x 45"));
    expect(await getGripStyle()).toBeNull();
  });

  it("draws the VAL as a line across half the ball, so the angle is measured against something", () => {
    renderLab();
    const svg = screen.getByRole("img", { name: /bowling ball/i });
    // Half a great circle reaches the silhouette on both sides, so its two
    // furthest-apart points are about a ball's diameter apart. A stub hanging
    // off the vertex would be a few pixels long, and the drawing's whole
    // complaint was an angle measured against a line that was not there.
    const points = Array.from(svg.querySelectorAll('polyline[stroke="#38bdf8"]'))
      .flatMap((n) => (n.getAttribute("points") ?? "").split(" "))
      .map((pair) => pair.split(",").map(Number))
      .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
    expect(points.length).toBeGreaterThan(0);
    let widest = 0;
    for (const [ax, ay] of points) {
      for (const [bx, by] of points) widest = Math.max(widest, Math.hypot(ax - bx, ay - by));
    }
    // The ball is drawn at a 110 radius, so a diameter is 220.
    expect(widest).toBeGreaterThan(180);
  });

  it("draws the VLS notation when the VLS numbers are the ones being edited", () => {
    renderLab();
    const texts = () =>
      Array.from(
        screen.getByRole("img", { name: /bowling ball/i }).querySelectorAll("text")
      ).map((t) => (t.textContent ?? "").trim());

    // Dual angle is two angles at two vertices.
    expect(texts().some((t) => t.includes("DRILL"))).toBe(true);

    fireEvent.click(systemCard("Storm VLS"));
    // VLS is three distances, so the drawing measures them instead. Showing
    // wedges while the sliders read inches was the picture answering a
    // different question from the one on screen.
    const after = texts();
    expect(after.some((t) => t.includes("DRILL"))).toBe(false);
    expect(after.some((t) => t.includes("VAL"))).toBe(false);
    expect(after).toContain('4 1/2"');
    // And the ball says so to a screen reader too.
    expect(
      screen.getByRole("img", { name: /Storm VLS layout/i })
    ).toBeInTheDocument();
  });

  it("puts the PSA in the thumb hole on a symmetric ball", () => {
    renderLab();
    fireEvent.click(screen.getByRole("button", { name: "Symmetric" }));
    const svg = screen.getByRole("img", { name: /bowling ball/i });
    const texts = Array.from(svg.querySelectorAll("text")).map((t) => (t.textContent ?? "").trim());
    // A symmetric core has no moulded PSA, so the pro shop names one, and the
    // one it names is the thumb hole. Drawing the CG alone said a symmetric
    // ball has no PSA at all, which is a different and wrong claim.
    expect(texts).toContain("PSA");
    expect(texts).toContain("CG");
    // An asymmetric ball has its own, and does not get a second.
    fireEvent.click(screen.getByRole("button", { name: "Asymmetric" }));
    const asym = Array.from(
      screen.getByRole("img", { name: /bowling ball/i }).querySelectorAll("text")
    ).map((t) => (t.textContent ?? "").trim());
    expect(asym.filter((t) => t === "PSA")).toHaveLength(1);
  });

  it("goes back", async () => {
    const { onBack } = renderLab();
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    // PushScreen defers the callback until its exit animation finishes.
    await waitFor(() => expect(onBack).toHaveBeenCalled());
  });
});
