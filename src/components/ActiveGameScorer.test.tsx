import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ActiveGameScorer } from "./ActiveGameScorer";
import type { Frame, PinNumber } from "../types/bowling";

vi.mock("../services/ballRepository", () => ({
  getBalls: () => Promise.resolve([]),
  getSpareLineByPins: () => Promise.resolve(undefined)
}));

// jsdom has no Pointer Capture API; PinGrid's drag gesture calls it.
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}

const NONE: PinNumber[] = [];

/** A strike in every frame — a complete game (10th has three strikes). */
function perfectGame(): Frame[] {
  const frames: Frame[] = [];
  for (let n = 1; n <= 9; n += 1) {
    frames.push({
      game_id: 1,
      frame_number: n,
      shots: [{ pins_standing: NONE }],
      is_strike: true,
      is_spare: false
    });
  }
  frames.push({
    game_id: 1,
    frame_number: 10,
    shots: [{ pins_standing: NONE }, { pins_standing: NONE }, { pins_standing: NONE }],
    is_strike: true,
    is_spare: false
  });
  return frames;
}

function tapPin(pin: number) {
  const button = screen.getByRole("button", { name: new RegExp(`^Pin ${pin} `) });
  fireEvent.pointerDown(button);
  fireEvent.pointerUp(button);
}

describe("ActiveGameScorer completed-game lock", () => {
  beforeEach(() => vi.clearAllMocks());

  it("opens a completed game view-only and ignores pin taps", () => {
    const onFrameComplete = vi.fn();
    render(
      <ActiveGameScorer gameKey={1} initialFrames={perfectGame()} onFrameComplete={onFrameComplete} />
    );

    expect(screen.getByText("Viewing")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();

    tapPin(1);
    expect(onFrameComplete).not.toHaveBeenCalled();
  });

  it("accepts pin edits after Edit is pressed", () => {
    const onFrameComplete = vi.fn();
    render(
      <ActiveGameScorer gameKey={1} initialFrames={perfectGame()} onFrameComplete={onFrameComplete} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByText("Editing")).toBeTruthy();

    tapPin(1);
    expect(onFrameComplete).toHaveBeenCalled();
  });

  it("re-locks when the game changes", () => {
    const frames = perfectGame();
    const { rerender } = render(<ActiveGameScorer gameKey={1} initialFrames={frames} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByText("Editing")).toBeTruthy();

    rerender(<ActiveGameScorer gameKey={2} initialFrames={frames} />);
    expect(screen.getByText("Viewing")).toBeTruthy();
  });

  it("leaves an in-progress game unlocked with no lock bar", () => {
    const onFrameComplete = vi.fn();
    render(
      <ActiveGameScorer
        gameKey={1}
        initialFrames={perfectGame().slice(0, 3)}
        onFrameComplete={onFrameComplete}
      />
    );

    expect(screen.queryByText("Viewing")).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });
});
