import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BowlingProfileView } from "./BowlingProfileView";
import { db } from "../db/bowlingDb";
import { DEFAULT_DRIFT_MODEL, type DriftModel } from "../lib/driftModel";
import { getGripStyle, getPap, setGripStyle, setPap } from "../services/bowlingRepository";

const renderPrefs = () => {
  render(
    <BowlingProfileView
      handedness="right"
      onHandednessChange={vi.fn()}
      driftModel={DEFAULT_DRIFT_MODEL}
      onDriftModelChange={vi.fn()}
    />
  );
};

/** The page as the bowler meets it: pushed from Settings, with its nav bar, and
 *  read-only until the pencil. */
function renderPage(props: Partial<React.ComponentProps<typeof BowlingProfileView>> = {}) {
  const handlers = { onHandednessChange: vi.fn(), onDriftModelChange: vi.fn(), onBack: vi.fn() };
  render(
    <BowlingProfileView
      handedness="right"
      driftModel={DEFAULT_DRIFT_MODEL}
      {...handlers}
      {...props}
    />
  );
  return handlers;
}

const edit = () => fireEvent.click(screen.getByRole("button", { name: "Edit bowling profile" }));
const save = () => fireEvent.click(screen.getByRole("button", { name: "Save bowling profile" }));

describe("BowlingProfileView", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("holds hand and grip, and the numbers only the lane view and the Layouts page read", () => {
    renderPage();
    edit();
    expect(screen.getAllByRole("group", { name: "Handedness" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "One-handed" })).toBeInTheDocument();
    expect(screen.getByText("Release offset")).toBeInTheDocument();
    expect(screen.getByText("Drift")).toBeInTheDocument();
  });

  it("reads as plain values, with nothing that looks like a field, until the pencil", async () => {
    await setPap({ over: 5.5, up: -0.5 });
    renderPage();
    expect(screen.getByText("Right-handed")).toBeInTheDocument();
    expect(screen.getByText("One-handed")).toBeInTheDocument();
    await screen.findByText(/5 1\/2 over, 1\/2 down/);
    expect(screen.getByText(/^6 boards$/)).toBeInTheDocument();
    // No control of any kind to tap, scroll over or mistake for one.
    expect(screen.queryByRole("button", { name: "Two-handed" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Handedness" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Over")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Increase release offset" })).not.toBeInTheDocument();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    // The drift zones read as sentences.
    expect(screen.getAllByText(/You (do not drift|drift)/).length).toBe(3);
  });

  it("answers the grip, one-handed until told otherwise, once saved", async () => {
    renderPage();
    edit();
    expect(screen.getByRole("button", { name: "One-handed" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Two-handed" }));
    // Not written until the tick.
    expect(await getGripStyle()).not.toBe("2h");
    save();
    await waitFor(async () => expect(await getGripStyle()).toBe("2h"));
  });

  it("turns the controls on with the pencil, and swaps it for the tick", () => {
    renderPage();
    expect(screen.queryByRole("button", { name: "Save bowling profile" })).not.toBeInTheDocument();

    edit();
    expect(screen.getByRole("button", { name: "Two-handed" })).toBeEnabled();
    expect(screen.getByLabelText("Over")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Save bowling profile" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit bowling profile" })).not.toBeInTheDocument();
  });

  it("writes nothing until the tick, and the tick puts it back to reading", async () => {
    const { onHandednessChange, onDriftModelChange } = renderPage();
    edit();
    fireEvent.click(screen.getByRole("button", { name: "Left-handed" }));
    fireEvent.click(screen.getByRole("button", { name: "Increase release offset" }));
    expect(onHandednessChange).not.toHaveBeenCalled();
    expect(onDriftModelChange).not.toHaveBeenCalled();

    save();
    await waitFor(() => expect(onHandednessChange).toHaveBeenCalledWith("left"));
    expect(onDriftModelChange).toHaveBeenCalledWith({
      ...DEFAULT_DRIFT_MODEL,
      release_offset: DEFAULT_DRIFT_MODEL.release_offset + 0.5
    });
    expect(await screen.findByRole("button", { name: "Edit bowling profile" })).toBeInTheDocument();
  });

  it("drops what was changed if the page is left without the tick", async () => {
    const first = renderPage();
    edit();
    fireEvent.click(screen.getByRole("button", { name: "Two-handed" }));
    first.onBack.mockClear();
    cleanup();

    renderPage();
    expect(screen.getByText("One-handed")).toBeInTheDocument();
    expect(await getGripStyle()).not.toBe("2h");
  });

  it("fills the grip from what was saved", async () => {
    await setGripStyle("2h");
    renderPage();
    expect(await screen.findByText("Two-handed")).toBeInTheDocument();
    edit();
    expect(screen.getByRole("button", { name: "Two-handed" })).toHaveAttribute("aria-pressed", "true");
  });

  it("has no guide behind it: what matters is said under the heading it belongs to", () => {
    renderPrefs();
    expect(screen.queryByRole("button", { name: "Why it matters" })).not.toBeInTheDocument();
    expect(screen.getByText("Switching flips every board number. Saved sessions keep theirs.")).toBeInTheDocument();
  });

  it("keeps the picture of the line fields out of the page, behind an info button", async () => {
    renderPrefs();
    expect(screen.queryByRole("img", { name: /intended stance 24/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "About release offset" }));
    expect(screen.getByRole("dialog", { name: "Your line" })).toBeInTheDocument();
    const figures = screen.getAllByRole("img", { name: /intended stance 24 and target 10/ });
    expect(figures.map((f) => f.getAttribute("src"))).toEqual([
      "/help/line-panel-light.png",
      "/help/line-panel-dark.png"
    ]);
    expect(screen.getByText("Picture from score entry")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Done|Close/ }));
    return waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Your line" })).not.toBeInTheDocument()
    );
  });

  it("opens the same explanation from the drift heading", () => {
    renderPrefs();
    fireEvent.click(screen.getByRole("button", { name: "About drift" }));
    expect(screen.getByRole("dialog", { name: "Your line" })).toBeInTheDocument();
  });

  it("edits the same stored PAP the Layouts page does", async () => {
    await setPap({ over: 4, up: 0.5 });
    renderPage();
    edit();
    await waitFor(() =>
      expect((screen.getByLabelText("Over") as HTMLSelectElement).value).toBe("4")
    );
    fireEvent.change(screen.getByLabelText("Over"), { target: { value: "5" } });
    save();
    await waitFor(async () => expect(await getPap()).toEqual({ over: 5, up: 0.5 }));
  });

  it("offers no reset, because a measured PAP is not a thing to put back", async () => {
    // It used to. "Reset to default" on a measurement taken off a thrown shot
    // in a pro shop is a control whose only outcome is losing it: the app's
    // default is a plausible axis, not the bowler's, so restoring it is not
    // undoing anything. The fields themselves are the way to change it.
    await setPap({ over: 2, up: -1 });
    renderPage();
    edit();
    await waitFor(() =>
      expect((screen.getByLabelText("Over") as HTMLSelectElement).value).toBe("2")
    );
    expect(screen.queryByRole("button", { name: /reset/i })).not.toBeInTheDocument();
  });

  it("reads each PAP measurement as one line, with no heading band above it", async () => {
    await setPap({ over: 5.5, up: -0.5 });
    renderPage();
    edit();
    await waitFor(() =>
      expect((screen.getByLabelText("Over") as HTMLSelectElement).value).toBe("5")
    );
    // The number, its fraction, then what it is: "5 1/2 over", "1/2 down". The
    // labels used to sit in a band above each row, naming two things the row
    // already says, at the cost of two bands of a phone screen.
    expect((screen.getByLabelText("Over fraction") as HTMLSelectElement).value).toBe("4");
    expect((screen.getByLabelText("Up or down direction") as HTMLSelectElement).value).toBe("down");
    expect(screen.queryByText("Up or down", { selector: "span" })).not.toBeInTheDocument();
  });

  it("keeps the sign on the whole measurement, so half an inch down is reachable", async () => {
    await setPap({ over: 5, up: 0.5 });
    renderPage();
    edit();
    await waitFor(() =>
      expect((screen.getByLabelText("Up or down fraction") as HTMLSelectElement).value).toBe("4")
    );
    fireEvent.change(screen.getByLabelText("Up or down direction"), { target: { value: "down" } });
    save();
    // Not a negative zero, which is the whole reason the direction is its own
    // control rather than a minus on the whole inches.
    await waitFor(async () => expect(await getPap()).toEqual({ over: 5, up: -0.5 }));
  });

  it("sets the zone edges on the lane once editing, with no board fields beside it", () => {
    const { onDriftModelChange: onChange } = renderPage();
    expect(screen.queryByText("Ends at board")).not.toBeInTheDocument();
    expect(screen.queryByText("Starts at board")).not.toBeInTheDocument();
    expect(screen.queryByText(/← left/)).not.toBeInTheDocument();
    // Reading, the edges are not handles at all.
    expect(screen.queryByRole("slider", { name: "Outside zone ends at board" })).not.toBeInTheDocument();

    edit();
    // Board 1 is on the right for a right-hander, so the right arrow walks the
    // outside edge toward it.
    const outside = screen.getByRole("slider", { name: "Outside zone ends at board" });
    expect(outside).toHaveAttribute("aria-valuenow", "14");
    fireEvent.keyDown(outside, { key: "ArrowRight" });
    const inside = screen.getByRole("slider", { name: "Inside zone starts at board" });
    fireEvent.keyDown(inside, { key: "ArrowLeft" });
    save();
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_DRIFT_MODEL, outside_max: 13.5, inside_min: 25.5 });
  });

  it("drags the nearer edge to the board under the finger", () => {
    const { onDriftModelChange: onChange } = renderPage({ handedness: "left" });
    edit();
    const lane = screen.getByRole("group", { name: /Approach board diagram/ });
    // 390 wide on screen, 10 px a board. A left-hander's board 1 is on the left.
    lane.getBoundingClientRect = () => ({ left: 0, width: 390, top: 0, height: 168, right: 390, bottom: 168, x: 0, y: 0, toJSON: () => ({}) });
    // jsdom's PointerEvent drops clientX, so the pointer events go in as mouse
    // events under the pointer type names, which is what React listens for.
    fireEvent(lane, new MouseEvent("pointerdown", { bubbles: true, clientX: 100 }));
    // Nearer the inside edge (board 24 on the left-hander's side), it moves that one.
    fireEvent(lane, new MouseEvent("pointerup", { bubbles: true }));
    fireEvent(lane, new MouseEvent("pointerdown", { bubbles: true, clientX: 270 }));
    save();
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_DRIFT_MODEL, outside_max: 10, inside_min: 28 });
  });

  it("keeps the middle zone open however far an edge is pushed", () => {
    const model: DriftModel = { ...DEFAULT_DRIFT_MODEL, outside_max: 23, inside_min: 25 };
    const { onDriftModelChange: onChange } = renderPage({ driftModel: model });
    edit();
    fireEvent.keyDown(screen.getByRole("slider", { name: "Outside zone ends at board" }), { key: "ArrowLeft" });
    save();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("says each zone's drift in a sentence under its row", () => {
    render(
      <BowlingProfileView
        handedness="right"
        onHandednessChange={vi.fn()}
       
        driftModel={{ ...DEFAULT_DRIFT_MODEL, drift: { outside: 2, middle: 0, inside: -1 } }}
        onDriftModelChange={vi.fn()}
      />
    );
    expect(screen.getByText(/You drift 2 boards \w+ when your stance is on boards 1 to 14\./)).toBeInTheDocument();
    expect(screen.getByText("You do not drift when your stance is on boards 14.5 to 24.5.")).toBeInTheDocument();
    expect(screen.getByText(/You drift 1 board \w+ when your stance is on boards 25 to 39\./)).toBeInTheDocument();
  });
});
