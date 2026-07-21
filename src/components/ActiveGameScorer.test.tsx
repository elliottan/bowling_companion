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

const prompt = () => screen.queryByText("Edit this completed game?");
const confirmEdit = () => fireEvent.click(screen.getByRole("button", { name: "Edit" }));
const cancelEdit = () => fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

describe("ActiveGameScorer line inputs (ADR-032)", () => {
  /** A game with one recorded shot selected, so the detail panel shows it. */
  function openFrames(actual?: Record<string, number>): Frame[] {
    return [
      {
        game_id: 1,
        frame_number: 1,
        shots: [
          {
            pins_standing: [7] as PinNumber[],
            intended: { stance: 24, target: 10 },
            ...(actual ? { actual } : {})
          }
        ],
        is_strike: false,
        is_spare: false
      }
    ];
  }

  it("labels the intended line Stance/Target and the actual line Slide/Target", () => {
    render(<ActiveGameScorer gameKey={1} initialFrames={openFrames()} />);

    // Headings stay visible whether or not the box is filled.
    expect(screen.getAllByText("Stance").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Slide").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Target").length).toBe(2);
    // Placeholders spell the word out rather than "S" / "T".
    expect(screen.getAllByLabelText("Slide").length).toBe(1);
    expect(screen.getAllByLabelText("Stance").length).toBe(1);
  });

  it("offers a visualiser for both lines", () => {
    render(<ActiveGameScorer gameKey={1} initialFrames={openFrames()} />);
    expect(screen.getByRole("button", { name: /view intended line/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /view actual line/i })).toBeTruthy();
  });

  it("shows a legacy actual stance as a derived slide without rewriting the shot", () => {
    const onFrameComplete = vi.fn();
    // Default model: zero drift, so slide === stance.
    render(
      <ActiveGameScorer
        gameKey={1}
        initialFrames={openFrames({ stance: 21, target: 12 })}
        onFrameComplete={onFrameComplete}
      />
    );

    // The panel follows the cursor; select the recorded shot to review it.
    fireEvent.click(screen.getAllByRole("button", { name: "View frame 1 shot 1" })[0]);

    const slide = screen.getByLabelText("Slide") as HTMLInputElement;
    expect(slide.value).toBe("21");
    // Nothing is persisted just by looking at it.
    expect(onFrameComplete).not.toHaveBeenCalled();
  });

  it("writes slide + derived laydown when the actual foul-line board is typed", () => {
    const onFrameComplete = vi.fn();
    render(
      <ActiveGameScorer gameKey={1} initialFrames={openFrames()} onFrameComplete={onFrameComplete} />
    );

    fireEvent.click(screen.getAllByRole("button", { name: "View frame 1 shot 1" })[0]);
    fireEvent.change(screen.getByLabelText("Slide"), { target: { value: "24" } });

    expect(onFrameComplete).toHaveBeenCalled();
    const calls = onFrameComplete.mock.calls;
    const frame = calls[calls.length - 1][0] as Frame;
    const actual = frame.shots[0].actual!;
    expect(actual.slide).toBe(24);
    // DEFAULT_DRIFT_MODEL.release_offset === 6.
    expect(actual.laydown).toBe(18);
    expect(actual.stance).toBeUndefined();
  });
});

describe("ActiveGameScorer completed-game edit prompt", () => {
  beforeEach(() => vi.clearAllMocks());

  it("prompts instead of applying a pin tap on a completed game", () => {
    const onFrameComplete = vi.fn();
    render(
      <ActiveGameScorer gameKey={1} initialFrames={perfectGame()} onFrameComplete={onFrameComplete} />
    );

    expect(prompt()).toBeNull();
    tapPin(1);

    expect(prompt()).not.toBeNull();
    expect(onFrameComplete).not.toHaveBeenCalled();
  });

  it("edits freely after confirming", () => {
    const onFrameComplete = vi.fn();
    render(
      <ActiveGameScorer gameKey={1} initialFrames={perfectGame()} onFrameComplete={onFrameComplete} />
    );

    tapPin(1);
    confirmEdit();
    expect(prompt()).toBeNull();

    tapPin(1);
    expect(onFrameComplete).toHaveBeenCalled();

    // Still unlocked — a second edit does not re-prompt.
    tapPin(2);
    expect(prompt()).toBeNull();
  });

  it("re-prompts on the next attempt after cancelling, and writes nothing", () => {
    const onFrameComplete = vi.fn();
    render(
      <ActiveGameScorer gameKey={1} initialFrames={perfectGame()} onFrameComplete={onFrameComplete} />
    );

    tapPin(1);
    cancelEdit();
    expect(prompt()).toBeNull();
    expect(onFrameComplete).not.toHaveBeenCalled();

    tapPin(1);
    expect(prompt()).not.toBeNull();
    expect(onFrameComplete).not.toHaveBeenCalled();
  });

  it("re-locks when the game changes, even after an earlier confirm", () => {
    const frames = perfectGame();
    const { rerender } = render(<ActiveGameScorer gameKey={1} initialFrames={frames} />);

    tapPin(1);
    confirmEdit();

    // Away to another game and back.
    rerender(<ActiveGameScorer gameKey={2} initialFrames={frames} />);
    rerender(<ActiveGameScorer gameKey={1} initialFrames={frames} />);

    tapPin(1);
    expect(prompt()).not.toBeNull();
  });

  it("never prompts on a game still in progress", () => {
    const onFrameComplete = vi.fn();
    render(
      <ActiveGameScorer
        gameKey={1}
        initialFrames={perfectGame().slice(0, 3)}
        onFrameComplete={onFrameComplete}
      />
    );

    tapPin(1);
    expect(prompt()).toBeNull();
  });
});
