import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ActiveGameScorer } from "./ActiveGameScorer";
import type { Frame, PinNumber } from "../types/bowling";

/** The commit button reads "Next", with what it would record bracketed under
 *  it; the accessible name carries that outcome as "Next (Strike)". */
const RECORD_SHOT = /^Next( \(|$)/;

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
    fireEvent.click(screen.getAllByRole("button", { name: /^Frame 1, shot 1:/ })[0]);

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

    fireEvent.click(screen.getAllByRole("button", { name: /^Frame 1, shot 1:/ })[0]);
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

/**
 * The prompt guards a finished game the bowler has moved on from. The answer is
 * remembered per game for as long as the app is open, so each case here needs a
 * game of its own.
 */
describe("ActiveGameScorer completed-game edit prompt", () => {
  beforeEach(() => vi.clearAllMocks());

  it("prompts instead of applying a pin tap on a completed game", () => {
    const onFrameComplete = vi.fn();
    render(
      <ActiveGameScorer gameKey={101} initialFrames={perfectGame()} onFrameComplete={onFrameComplete} />
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
      <ActiveGameScorer gameKey={102} initialFrames={perfectGame()} onFrameComplete={onFrameComplete} />
    );

    tapPin(1);
    confirmEdit();
    await waitFor(() => expect(prompt()).toBeNull());

    // Unlocked, the tap now reaches the recorded shot, which raises the
    // edit-a-recorded-shot confirm of its own.
    tapPin(1);
    confirmEdit();
    await waitFor(() => expect(onFrameComplete).toHaveBeenCalled());

    // Still unlocked, a second edit does not re-prompt for the game.
    tapPin(2);
    expect(prompt()).toBeNull();
  });

  it("re-prompts on the next attempt after cancelling, and writes nothing", async () => {
    const onFrameComplete = vi.fn();
    render(
      <ActiveGameScorer gameKey={103} initialFrames={perfectGame()} onFrameComplete={onFrameComplete} />
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
      <ActiveGameScorer gameKey={104} initialFrames={perfectGame()} onFrameComplete={onFrameComplete} />
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

    fireEvent.click(screen.getByRole("button", { name: RECORD_SHOT }));
    await waitFor(() => expect(onFrameComplete).toHaveBeenCalled());
    const frame = onFrameComplete.mock.calls[0][0] as Frame;
    expect(frame.shots[0].pocket_hit).toBe(true);
  });

  it("hides the toggle on a spare attempt, which has no pocket to hit", async () => {
    render(<ActiveGameScorer gameKey={1} />);

    tapPin(10);
    expect(pocketChip()).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: RECORD_SHOT }));
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
  const next = () => fireEvent.click(screen.getByRole("button", { name: RECORD_SHOT }));

  /** Leave one pin standing on the first ball of frame 1. */
  function leaveOnePin(pin: number) {
    tapPin(pin);
    next();
  }

  it("offers to save the line after a spare is missed, not only after it is made", async () => {
    render(<ActiveGameScorer gameKey={1} initialFrames={[]} />);
    await waitFor(() => expect(screen.getByRole("button", { name: RECORD_SHOT })).toBeTruthy());

    leaveOnePin(6);
    expect(savePrompt()).toBeNull();

    // Second ball leaves the 6 standing again: the spare is missed.
    next();
    await waitFor(() => expect(savePrompt()).not.toBeNull());
  });

  it("offers nothing on a strike, which leaves nothing to shoot at", async () => {
    render(<ActiveGameScorer gameKey={1} initialFrames={[]} />);
    await waitFor(() => expect(screen.getByRole("button", { name: RECORD_SHOT })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Strike" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Strike" })).toBeTruthy());
    expect(savePrompt()).toBeNull();
  });

  it("dismisses without saving, and stays dismissed for that shot", async () => {
    render(<ActiveGameScorer gameKey={1} initialFrames={[]} />);
    await waitFor(() => expect(screen.getByRole("button", { name: RECORD_SHOT })).toBeTruthy());

    leaveOnePin(6);
    next();
    await waitFor(() => expect(savePrompt()).not.toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(savePrompt()).toBeNull();
  });
});

/**
 * A button that commits a shot has to say what it is about to commit. It used
 * to say "Next" whatever was on the deck, so the only way to check a count
 * before recording it was to count the pins again.
 */
describe("what the commit button says it will record", () => {
  /** A game one ball in, so the deck is a partial rack the second ball plays. */
  function openTenPinLeave(): Frame[] {
    return [
      {
        game_id: 1,
        frame_number: 1,
        shots: [{ pins_standing: [10] }],
        is_strike: false,
        is_spare: false
      }
    ];
  }

  it('reads "Next" over "Strike" on a full deck', () => {
    render(<ActiveGameScorer gameKey="label-fresh" />);

    const commit = screen.getByRole("button", { name: RECORD_SHOT });
    expect(commit).toHaveTextContent("Next");
    // Bracketed, so the two read as a button and a note rather than as the
    // phrase "Next Strike".
    expect(commit).toHaveTextContent("(Strike)");
  });

  it('names the count as "Hit 0" when nothing on the deck would go down', () => {
    render(<ActiveGameScorer gameKey="label-gutter" />);

    // Shot 1 starts all-down and pins are tapped up, so standing all ten is a
    // ball that knocked nothing over.
    for (let pin = 1; pin <= 10; pin += 1) tapPin(pin);

    expect(screen.getByRole("button", { name: RECORD_SHOT })).toHaveTextContent("(Hit 0)");
  });

  it("names the count of a partial first ball", () => {
    render(<ActiveGameScorer gameKey="label-count" />);

    tapPin(7);
    tapPin(10);

    expect(screen.getByRole("button", { name: RECORD_SHOT })).toHaveTextContent("(Hit 8)");
  });

  it('reads "Spare" once the leave is cleared, and the count until then', () => {
    render(<ActiveGameScorer gameKey="label-spare" initialFrames={openTenPinLeave()} />);

    // Shot 2 starts pins-up: the 10 pin is standing, so leaving it alone is a
    // miss and knocking it down is the spare.
    expect(screen.getByRole("button", { name: RECORD_SHOT })).toHaveTextContent("(Hit 0)");

    tapPin(10);
    expect(screen.getByRole("button", { name: RECORD_SHOT })).toHaveTextContent("(Spare)");
  });
});

/**
 * Changing something already on the card asks first. The question is per visit
 * to a shot, not per tap: a bowler correcting a pin has already answered it.
 */
describe("confirming a change to a recorded shot", () => {
  const editPrompt = () => screen.queryByText("Edit this recorded shot?");

  /** One open frame, so the game is live and nothing is locked. */
  function openFrame(): Frame[] {
    return [
      {
        game_id: 1,
        frame_number: 1,
        shots: [{ pins_standing: [10] as PinNumber[] }, { pins_standing: [10] as PinNumber[] }],
        is_strike: false,
        is_spare: false
      }
    ];
  }

  function selectFirstShot() {
    fireEvent.click(screen.getAllByRole("button", { name: /^Frame 1, shot 1:/ })[0]);
  }

  it("never asks while a new shot is being entered", () => {
    render(<ActiveGameScorer gameKey="confirm-live" onFrameComplete={vi.fn()} />);

    tapPin(1);
    tapPin(2);

    expect(editPrompt()).toBeNull();
  });

  it("asks before a pin tap rewrites a recorded shot, and writes nothing until it is answered", () => {
    const onFrameComplete = vi.fn();
    render(
      <ActiveGameScorer gameKey="confirm-pins" initialFrames={openFrame()} onFrameComplete={onFrameComplete} />
    );

    selectFirstShot();
    tapPin(7);

    expect(editPrompt()).not.toBeNull();
    expect(onFrameComplete).not.toHaveBeenCalled();
  });

  it("asks once per visit, not once per tap", async () => {
    const onFrameComplete = vi.fn();
    render(
      <ActiveGameScorer gameKey="confirm-once" initialFrames={openFrame()} onFrameComplete={onFrameComplete} />
    );

    selectFirstShot();
    tapPin(7);
    confirmEdit();
    await waitFor(() => expect(editPrompt()).toBeNull());
    await waitFor(() => expect(onFrameComplete).toHaveBeenCalled());

    tapPin(9);
    expect(editPrompt()).toBeNull();
  });

  it("asks again after the cursor has been away and come back", async () => {
    render(
      <ActiveGameScorer gameKey="confirm-revisit" initialFrames={openFrame()} onFrameComplete={vi.fn()} />
    );

    selectFirstShot();
    tapPin(7);
    confirmEdit();
    await waitFor(() => expect(editPrompt()).toBeNull());

    // Away to the second shot of the frame, then back to the first.
    fireEvent.click(screen.getAllByRole("button", { name: /^Frame 1, shot 2:/ })[0]);
    selectFirstShot();
    tapPin(9);

    expect(editPrompt()).not.toBeNull();
  });

  it("leaves the recorded shot alone when the question is cancelled", async () => {
    const onFrameComplete = vi.fn();
    render(
      <ActiveGameScorer gameKey="confirm-cancel" initialFrames={openFrame()} onFrameComplete={onFrameComplete} />
    );

    selectFirstShot();
    tapPin(7);
    cancelEdit();

    await waitFor(() => expect(editPrompt()).toBeNull());
    expect(onFrameComplete).not.toHaveBeenCalled();
  });

  it("asks before Strike marks a recorded shot", () => {
    render(
      <ActiveGameScorer gameKey="confirm-strike" initialFrames={openFrame()} onFrameComplete={vi.fn()} />
    );

    selectFirstShot();
    fireEvent.click(screen.getByRole("button", { name: "Strike" }));

    expect(editPrompt()).not.toBeNull();
  });
});

/** Undo is wired only where there is somewhere to write it (ADR-079). */
describe("undo", () => {
  it("offers nothing to undo on an untouched game", () => {
    render(<ActiveGameScorer gameKey="undo-empty" onUndoShot={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Undo last shot" })).toBeNull();
  });

  it("takes the last shot back and hands the caller the frame to rewrite", async () => {
    const onUndoShot = vi.fn();
    render(
      <ActiveGameScorer
        gameKey="undo-one"
        initialFrames={[
          {
            game_id: 1,
            frame_number: 1,
            shots: [{ pins_standing: [10] }],
            is_strike: false,
            is_spare: false
          }
        ]}
        onUndoShot={onUndoShot}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Undo last shot" }));
    // Undo takes a recorded ball back, so it asks first.
    expect(screen.getByText("Undo the last shot?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    await waitFor(() => expect(onUndoShot).toHaveBeenCalledTimes(1));
    expect(onUndoShot.mock.calls[0][0]).toMatchObject({
      deletedFrameNumber: 1,
      changedFrame: null
    });
    // Back to the first ball of the first frame, with nothing left to undo.
    expect(screen.queryByRole("button", { name: "Undo last shot" })).toBeNull();
  });

  it("leaves the card alone when the undo question is cancelled", async () => {
    const onUndoShot = vi.fn();
    render(
      <ActiveGameScorer
        gameKey="undo-cancel"
        initialFrames={[
          {
            game_id: 1,
            frame_number: 1,
            shots: [{ pins_standing: [10] as PinNumber[] }],
            is_strike: false,
            is_spare: false
          }
        ]}
        onUndoShot={onUndoShot}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Undo last shot" }));
    cancelEdit();

    await waitFor(() => expect(screen.queryByText("Undo the last shot?")).toBeNull());
    expect(onUndoShot).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Undo last shot" })).toBeInTheDocument();
  });

  it("stays available on a finished game, which is when it is wanted most", () => {
    render(
      <ActiveGameScorer gameKey="undo-done" initialFrames={perfectGame()} onUndoShot={vi.fn()} />
    );

    expect(screen.getByRole("button", { name: "Undo last shot" })).toBeInTheDocument();
  });
});
