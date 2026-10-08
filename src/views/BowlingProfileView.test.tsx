import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BowlingProfileView } from "./BowlingProfileView";
import { db } from "../db/bowlingDb";
import { DEFAULT_DRIFT_MODEL, type DriftModel } from "../lib/driftModel";
import { getGripStyle, getPap, setGripStyle, setPap } from "../services/bowlingRepository";
import { findGuide } from "../lib/guides";

const renderPrefs = (onOpenGuide = vi.fn()) => {
  render(
    <BowlingProfileView
      handedness="right"
      onHandednessChange={vi.fn()}
      driftModel={DEFAULT_DRIFT_MODEL}
      onDriftModelChange={vi.fn()}
      onOpenGuide={onOpenGuide}
    />
  );
};

describe("BowlingProfileView", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("holds hand and grip, and the numbers only the lane view and the Layouts page read", () => {
    renderPrefs();
    expect(screen.getAllByRole("group", { name: "Handedness" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "One-handed" })).toBeInTheDocument();
    expect(screen.getByText("Release offset")).toBeInTheDocument();
    expect(screen.getByText("Drift")).toBeInTheDocument();
  });

  it("answers the grip, one-handed until told otherwise", async () => {
    renderPrefs();
    expect(screen.getByRole("button", { name: "One-handed" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Two-handed" }));
    await waitFor(async () => expect(await getGripStyle()).toBe("2h"));
  });

  it("fills the grip from what was saved", async () => {
    await setGripStyle("2h");
    renderPrefs();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Two-handed" })).toHaveAttribute("aria-pressed", "true")
    );
  });

  it("keeps the long explanation in a guide, one tap away", () => {
    const openGuide = vi.fn();
    renderPrefs(openGuide);
    fireEvent.click(screen.getByRole("button", { name: "Why it matters" }));
    expect(openGuide).toHaveBeenCalled();
    // What a two-handed grip changes, and what it leaves alone, still says so.
    const text = JSON.stringify(findGuide("your-settings")?.body);
    expect(text).toMatch(/without a thumb hole/i);
  });

  it("edits the same stored PAP the Layouts page does", async () => {
    await setPap({ over: 4, up: 0.5 });
    renderPrefs();
    await waitFor(() =>
      expect((screen.getByLabelText("Over") as HTMLSelectElement).value).toBe("4")
    );
    fireEvent.change(screen.getByLabelText("Over"), { target: { value: "5" } });
    await waitFor(async () => expect(await getPap()).toEqual({ over: 5, up: 0.5 }));
  });

  it("offers no reset, because a measured PAP is not a thing to put back", async () => {
    // It used to. "Reset to default" on a measurement taken off a thrown shot
    // in a pro shop is a control whose only outcome is losing it: the app's
    // default is a plausible axis, not the bowler's, so restoring it is not
    // undoing anything. The fields themselves are the way to change it.
    await setPap({ over: 2, up: -1 });
    renderPrefs();
    await waitFor(() =>
      expect((screen.getByLabelText("Over") as HTMLSelectElement).value).toBe("2")
    );
    expect(screen.queryByRole("button", { name: /reset/i })).not.toBeInTheDocument();
  });

  it("reads each PAP measurement as one line, with no heading band above it", async () => {
    await setPap({ over: 5.5, up: -0.5 });
    renderPrefs();
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
    renderPrefs();
    await waitFor(() =>
      expect((screen.getByLabelText("Up or down fraction") as HTMLSelectElement).value).toBe("4")
    );
    fireEvent.change(screen.getByLabelText("Up or down direction"), { target: { value: "down" } });
    // Not a negative zero, which is the whole reason the direction is its own
    // control rather than a minus on the whole inches.
    await waitFor(async () => expect(await getPap()).toEqual({ over: 5, up: -0.5 }));
  });

  it("sets the zone edges on the lane, with no board fields beside it", () => {
    const onChange = vi.fn();
    render(<BowlingProfileView handedness="right" onHandednessChange={vi.fn()} onOpenGuide={vi.fn()} driftModel={DEFAULT_DRIFT_MODEL} onDriftModelChange={onChange} />);
    expect(screen.queryByText("Ends at board")).not.toBeInTheDocument();
    expect(screen.queryByText("Starts at board")).not.toBeInTheDocument();
    expect(screen.queryByText(/← left/)).not.toBeInTheDocument();

    // Board 1 is on the right for a right-hander, so the right arrow walks the
    // outside edge toward it.
    const outside = screen.getByRole("slider", { name: "Outside zone ends at board" });
    expect(outside).toHaveAttribute("aria-valuenow", "14");
    fireEvent.keyDown(outside, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_DRIFT_MODEL, outside_max: 13.5 });

    const inside = screen.getByRole("slider", { name: "Inside zone starts at board" });
    fireEvent.keyDown(inside, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_DRIFT_MODEL, inside_min: 25.5 });
  });

  it("drags the nearer edge to the board under the finger", () => {
    const onChange = vi.fn();
    render(<BowlingProfileView handedness="left" onHandednessChange={vi.fn()} onOpenGuide={vi.fn()} driftModel={DEFAULT_DRIFT_MODEL} onDriftModelChange={onChange} />);
    const lane = screen.getByRole("group", { name: /Approach board diagram/ });
    // 390 wide on screen, 10 px a board. A left-hander's board 1 is on the left.
    lane.getBoundingClientRect = () => ({ left: 0, width: 390, top: 0, height: 168, right: 390, bottom: 168, x: 0, y: 0, toJSON: () => ({}) });
    // jsdom's PointerEvent drops clientX, so the pointer events go in as mouse
    // events under the pointer type names, which is what React listens for.
    fireEvent(lane, new MouseEvent("pointerdown", { bubbles: true, clientX: 100 }));
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_DRIFT_MODEL, outside_max: 10 });
    // Nearer the inside edge (board 24 on the left-hander's side), it moves that one.
    fireEvent(lane, new MouseEvent("pointerup", { bubbles: true }));
    fireEvent(lane, new MouseEvent("pointerdown", { bubbles: true, clientX: 270 }));
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_DRIFT_MODEL, inside_min: 28 });
  });

  it("keeps the middle zone open however far an edge is pushed", () => {
    const onChange = vi.fn();
    const model: DriftModel = { ...DEFAULT_DRIFT_MODEL, outside_max: 23, inside_min: 25 };
    render(<BowlingProfileView handedness="right" onHandednessChange={vi.fn()} onOpenGuide={vi.fn()} driftModel={model} onDriftModelChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("slider", { name: "Outside zone ends at board" }), { key: "ArrowLeft" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("says each zone's drift in a sentence under its row", () => {
    render(
      <BowlingProfileView
        handedness="right"
        onHandednessChange={vi.fn()}
        onOpenGuide={vi.fn()}
        driftModel={{ ...DEFAULT_DRIFT_MODEL, drift: { outside: 2, middle: 0, inside: -1 } }}
        onDriftModelChange={vi.fn()}
      />
    );
    expect(screen.getByText(/You drift 2 boards \w+ when your stance is on boards 1 to 14\./)).toBeInTheDocument();
    expect(screen.getByText("You do not drift when your stance is on boards 14.5 to 24.5.")).toBeInTheDocument();
    expect(screen.getByText(/You drift 1 board \w+ when your stance is on boards 25 to 39\./)).toBeInTheDocument();
  });
});
