import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ActiveGameScorer } from "./ActiveGameScorer";
import type { Frame, PinNumber } from "../types/bowling";

vi.mock("../services/ballRepository", () => ({
  getBalls: () => Promise.resolve([]),
  getSpareLinesAll: () => Promise.resolve([]),
  findSpareLineByPins: () => undefined,
  getSpareLineByPins: () => Promise.resolve(undefined)
}));

// jsdom has no Pointer Capture API; PinGrid's drag gesture calls it.
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}

const NONE: PinNumber[] = [];

/** A strike in every frame, a complete game (10th has three strikes). */
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
    expect(screen.getByRole("button", { name: /view intended line/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /view actual line/i })).toBeInTheDocument();
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

  // The confirm dialog animates out before it unmounts, so its disappearance
  // is awaited rather than asserted on the same tick as the click.
  it("edits freely after confirming", async () => {
    const onFrameComplete = vi.fn();
    render(
      <ActiveGameScorer gameKey={1} initialFrames={perfectGame()} onFrameComplete={onFrameComplete} />
    );

    tapPin(1);
    confirmEdit();
    await waitFor(() => expect(prompt()).toBeNull());

    tapPin(1);
    expect(onFrameComplete).toHaveBeenCalled();

    // Still unlocked, a second edit does not re-prompt.
    tapPin(2);
    expect(prompt()).toBeNull();
  });

  it("re-prompts on the next attempt after cancelling, and writes nothing", async () => {
    const onFrameComplete = vi.fn();
    render(
      <ActiveGameScorer gameKey={1} initialFrames={perfectGame()} onFrameComplete={onFrameComplete} />
    );

    tapPin(1);
    cancelEdit();
    await waitFor(() => expect(prompt()).toBeNull());
    expect(onFrameComplete).not.toHaveBeenCalled();

    tapPin(1);
    expect(prompt()).not.toBeNull();
    expect(onFrameComplete).not.toHaveBeenCalled();
  });

  // iOS Safari focuses a form control on tap even when the pointerdown was
  // preventDefault()ed, so the veto does not keep focus off a locked field. A
  // field that holds focus asks to edit again the moment the overlay restores
  // focus on close, which put the prompt in a loop that only "Edit" escaped.
  it("does not let a locked field take focus, so cancelling stays cancelled", async () => {
    const onFrameComplete = vi.fn();
    render(
      <ActiveGameScorer gameKey={1} initialFrames={perfectGame()} onFrameComplete={onFrameComplete} />
    );

    const stance = screen.getAllByRole("textbox")[0] as HTMLInputElement;
    stance.focus();
    expect(document.activeElement).not.toBe(stance);
    expect(prompt()).toBeNull();

    // The deliberate tap still raises it, exactly once, and cancelling sticks.
    tapPin(1);
    expect(prompt()).not.toBeNull();
    cancelEdit();
    await waitFor(() => expect(prompt()).toBeNull());

    stance.focus();
    expect(prompt()).toBeNull();
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

describe("pocket toggle (ADR-046)", () => {
  const pocketChip = () =>
    screen.queryByRole("button", { name: /^(Pocket hit|Not a pocket hit)$/ });

  it("records the strike button as a pocket hit", async () => {
    const onFrameComplete = vi.fn();
    render(<ActiveGameScorer gameKey={1} onFrameComplete={onFrameComplete} />);

    fireEvent.click(screen.getByRole("button", { name: "Strike" }));

    await waitFor(() => expect(onFrameComplete).toHaveBeenCalled());
    const frame = onFrameComplete.mock.calls[0][0] as Frame;
    expect(frame.shots[0].pocket_hit).toBe(true);
  });

  it("follows the leave, and records the bowler's flip instead when they flip it", async () => {
    const onFrameComplete = vi.fn();
    render(<ActiveGameScorer gameKey={1} onFrameComplete={onFrameComplete} />);

    // A 3-pin leave is not a pocket hit for a right-hander.
    tapPin(3);
    await waitFor(() => expect(pocketChip()).toHaveAccessibleName("Not a pocket hit"));

    // The bowler disagrees: they saw it hit the pocket and the 3 stood.
    fireEvent.click(pocketChip()!);
    expect(pocketChip()).toHaveAccessibleName("Pocket hit");

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(onFrameComplete).toHaveBeenCalled());
    const frame = onFrameComplete.mock.calls[0][0] as Frame;
    expect(frame.shots[0].pocket_hit).toBe(true);
  });

  it("hides the toggle on a spare attempt, which has no pocket to hit", async () => {
    render(<ActiveGameScorer gameKey={1} />);

    tapPin(10);
    expect(pocketChip()).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(pocketChip()).toBeNull());
  });
});

describe("start lane", () => {
  it("names the frame the lane chips describe", () => {
    // A game that starts on 8 lights lane 7 on the even frames. Without the
    // frame beside it, that reads as a contradiction of the lane editor.
    render(
      <ActiveGameScorer
        gameKey={1}
        game={{ lanes: ["7", "8"], start_lane: "8" }}
        mode="session"
        onEditLanes={() => {}}
      />
    );
    expect(screen.getByText("F1")).toBeInTheDocument();
  });

  it("names the lane frame 1 was bowled on, per game", () => {
    render(
      <ActiveGameScorer
        gameKey={1}
        game={{ lanes: ["7", "8"], start_lane: "8" }}
        mode="session"
        onEditLanes={() => {}}
      />
    );
    // The house flips the start each game; when it does not, this is what has
    // to be corrected, so it is readable without opening the editor.
    expect(
      screen.getByRole("button", { name: "Edit game lanes. Frame 1 starts on lane 8" })
    ).toBeInTheDocument();
  });

  it("says nothing about a start lane on a single-lane game", () => {
    render(
      <ActiveGameScorer
        gameKey={1}
        game={{ lanes: ["7"] }}
        mode="session"
        onEditLanes={() => {}}
      />
    );
    expect(screen.getByRole("button", { name: "Edit game lanes" })).toBeInTheDocument();
  });
});

describe("capturing a spare line (ADR-054)", () => {
  const savePrompt = () => screen.queryByText(/^Save this as your line for/);
  const next = () => fireEvent.click(screen.getByRole("button", { name: /^Next$/ }));

  /** Leave one pin standing on the first ball of frame 1. */
  function leaveOnePin(pin: number) {
    tapPin(pin);
    next();
  }

  it("offers to save the line after a spare is missed, not only after it is made", async () => {
    render(<ActiveGameScorer gameKey={1} initialFrames={[]} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /^Next$/ })).toBeTruthy());

    leaveOnePin(6);
    expect(savePrompt()).toBeNull();

    // Second ball leaves the 6 standing again: the spare is missed.
    next();
    await waitFor(() => expect(savePrompt()).not.toBeNull());
  });

  it("offers nothing on a strike, which leaves nothing to shoot at", async () => {
    render(<ActiveGameScorer gameKey={1} initialFrames={[]} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /^Next$/ })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Strike" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Strike" })).toBeTruthy());
    expect(savePrompt()).toBeNull();
  });

  it("dismisses without saving, and stays dismissed for that shot", async () => {
    render(<ActiveGameScorer gameKey={1} initialFrames={[]} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /^Next$/ })).toBeTruthy());

    leaveOnePin(6);
    next();
    await waitFor(() => expect(savePrompt()).not.toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(savePrompt()).toBeNull();
  });
});
