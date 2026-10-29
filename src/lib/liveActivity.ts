import type { Frame, Game, Session } from "../types/bowling";
import { calculateGameScore } from "./scoring";
import { hydrateFrameController, submitShot } from "./frameController";
import { getFrameShotSymbols, rollingTotalForCell } from "./scoreDisplay";
import { DEFAULT_PALETTE, PALETTES, type PaletteId } from "./palette";
import { alleyLabel } from "./sessionLabels";
import { readThemePreference, type ThemePreference } from "./theme";

/**
 * What the iPhone's Lock Screen and Dynamic Island show of a game being scored
 * (ADR-221, `ios/App/HeadpinLiveActivity`).
 *
 * The page does all the bowling. This turns a game's frames into strings the
 * phone only has to draw: the same marks and running totals the scorecard
 * shows, from the same functions, so the Lock Screen cannot disagree with the
 * card about a spare. Pure and small on purpose: ActivityKit refuses a state
 * over 4 KB, and a full game here is about 0.6 KB.
 */

/** One frame as the card draws it. Frames 1 to 9 have two boxes (a strike is
 *  written in the second, as the card does) and the tenth three. A box not yet
 *  bowled is an empty string. */
export interface LiveActivityFrame {
  marks: string[];
  /** The running total under the frame, or "" while it is not scored. */
  score: string;
}

export interface LiveActivityState {
  /** What the session is: its event ("Tuesday league", "Practice"), else its
   *  alley. Never empty. */
  label: string;
  /** The bowling centre, when it is not already the label. */
  location: string;
  game: number;
  /** The running total, as the card's header shows it. */
  total: number;
  /** The frame being bowled, 1 to 10. The tenth once the game is over. */
  frame: number;
  /** Every ball is recorded. */
  done: boolean;
  /** The highest score still possible, or null once the game is over. */
  max: number | null;
  /** Always ten. */
  frames: LiveActivityFrame[];
  /** The accent the app is showing: the bowler's palette, or Felt while Pro is
   *  not open (ADR-164). */
  palette: PaletteId;
  /** The app's own light or dark choice, or "system" to follow the phone. */
  theme: ThemePreference;
}

/** The app's colors, as the Lock Screen should draw them. */
export interface LiveActivityAppearance {
  palette: PaletteId;
  theme: ThemePreference;
}

const DEFAULT_APPEARANCE: LiveActivityAppearance = { palette: DEFAULT_PALETTE, theme: "system" };

/**
 * The palette and theme the app is showing now. The palette is read off
 * `<html>`, not from storage, because that is the one Pro has let through
 * (`useAppliedPalette`): a refunded Pro shows Felt here as in the app.
 */
export function currentAppearance(): LiveActivityAppearance {
  try {
    const shown = document.documentElement.dataset.palette;
    const palette = PALETTES.find((p) => p.id === shown)?.id ?? DEFAULT_PALETTE;
    return { palette, theme: readThemePreference() };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export interface LiveActivityPayload {
  gameId: number;
  state: LiveActivityState;
}

/** A label is one line on a Lock Screen. */
const LABEL_MAX = 40;

function clip(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > LABEL_MAX ? `${trimmed.slice(0, LABEL_MAX - 1).trimEnd()}…` : trimmed;
}

/** Whether a game has a ball in it: nothing to show on the Lock Screen before. */
export function hasRecordedBall(frames: Frame[]): boolean {
  return frames.some((f) => f.shots.length > 0);
}

/**
 * The highest the game can still finish on: every ball from here a strike or a
 * spare clearing the deck. Found by bowling it out through the same state
 * machine the scorer uses, so the tenth frame's extra balls and the bonuses
 * count exactly as they will.
 */
export function maxPossibleScore(frames: Frame[]): number {
  let state = hydrateFrameController(frames);
  // 21 balls is the most a game holds; the bound only guards a loop.
  for (let i = 0; i < 21 && !state.isComplete; i += 1) {
    state = submitShot(state, []).state;
  }
  return calculateGameScore(state.frames).total;
}

/**
 * The payload for a game, or null while there is nothing to show (no ball
 * recorded yet).
 */
export function buildLiveActivityState(
  session: Pick<Session, "alley_name" | "description">,
  game: Pick<Game, "game_number">,
  frames: Frame[],
  appearance: LiveActivityAppearance = DEFAULT_APPEARANCE
): LiveActivityState | null {
  if (!hasRecordedBall(frames)) return null;

  const score = calculateGameScore(frames);
  const controller = hydrateFrameController(frames);
  const done = controller.isComplete;

  const cells: LiveActivityFrame[] = Array.from({ length: 10 }, (_, index) => {
    const frameNumber = index + 1;
    const frame = frames.find((f) => f.frame_number === frameNumber);
    const boxes = frameNumber === 10 ? 3 : 2;
    const marks = Array.from({ length: boxes }, () => "");
    if (!frame || frame.shots.length === 0) return { marks, score: "" };
    getFrameShotSymbols(frame).forEach((symbol, i) => {
      if (i < boxes) marks[i] = symbol;
    });
    const rolling = rollingTotalForCell({
      frameNumber,
      frame,
      score: score.frames.find((f) => f.frame_number === frameNumber),
      gameTotal: score.total,
      gameComplete: done
    });
    return { marks, score: rolling === null ? "" : String(rolling) };
  });

  const event = session.description?.trim() ?? "";
  const alley = session.alley_name?.trim() ?? "";
  return {
    label: clip(event || alleyLabel(session.alley_name)),
    // The alley is the label itself when there is no event to name.
    location: event ? clip(alley) : "",
    game: game.game_number,
    total: score.total,
    frame: done ? 10 : Math.min(10, controller.currentFrameNumber),
    done,
    max: done ? null : maxPossibleScore(frames),
    frames: cells,
    palette: appearance.palette,
    theme: appearance.theme
  };
}
