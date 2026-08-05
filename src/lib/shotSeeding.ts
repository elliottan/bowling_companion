import { freshRackSeedShot, lineHasValue, sameBallSeedLine } from "./lanes";
import type { Ball, Frame, Game, LineSpec, PinNumber, Shot, SpareLine } from "../types/bowling";

/**
 * What a new shot starts with: which ball is selected, what the Intended line
 * box is prefilled with, and whether that line was a guess.
 *
 * This is the carry-forward rule set (ADR-017 priority, ADR-029 across games,
 * ADR-035 auto-filled lines), and it used to live inside an effect in
 * `ActiveGameScorer`, where it could only be exercised by driving the whole
 * app. It reads nothing and writes nothing: the scorer hands it the game and
 * applies what comes back.
 */

type GameLanes = Pick<Game, "lanes" | "start_lane" | "lane_number">;

export interface ShotSeedInput {
  /** 1-based shot within the frame, as the frame controller counts it. */
  currentShot: number;
  currentFrameNumber: number;
  /** Pins available to this shot: fewer than 10 means a spare attempt. */
  availablePins: PinNumber[];
  /** Frames recorded in THIS game so far. */
  frames: Frame[];
  /** Shots already thrown in the current frame. */
  currentFrameShots: Shot[];
  game?: GameLanes;
  /** Earlier games this session, oldest first, with their lane config. */
  previousGames?: Array<{ game: GameLanes; frames: Frame[] }>;
  /** Frames from OTHER games this session, for the spare-line lookup. */
  sessionFrames?: Frame[];
  balls: Ball[];
  spareLines: SpareLine[];
}

export interface ShotSeed {
  ballId?: number;
  intended?: LineSpec;
  notes: string;
  /** The line is this ball's history rather than a real carry-forward, so a
   *  later ball change may replace it (ADR-035). */
  autoFilled: boolean;
}

const pinsKey = (p: PinNumber[]) => [...p].sort((a, b) => a - b).join(",");

/**
 * The intended line of the most recent earlier spare attempt this session that
 * faced the same leave. Non-10th frames only, keyed by the standing pins.
 */
export function sessionSpareIntended(frames: Frame[], leave: PinNumber[]): LineSpec | undefined {
  const key = pinsKey(leave);
  let found: LineSpec | undefined;
  for (const f of frames) {
    if (f.frame_number === 10) continue;
    const [first, second] = f.shots;
    if (!first || !second) continue;
    if (pinsKey(first.pins_standing) !== key) continue;
    if (lineHasValue(second.intended)) found = second.intended;
  }
  return found;
}

/** The saved spare line for a leave, if one exists. */
export function savedSpareLine(
  spareLines: SpareLine[],
  leave: PinNumber[]
): SpareLine | undefined {
  const key = pinsKey(leave);
  return spareLines.find((sl) => pinsKey(sl.pins) === key);
}

/**
 * The line this ball was last thrown on, used when nothing was carried
 * forward. Returns the line and whether it was a guess, which is what decides
 * if a later ball change may overwrite it.
 */
export function seedLineForBall(
  input: Pick<ShotSeedInput, "currentFrameNumber" | "frames" | "game" | "previousGames">,
  ballId: number | undefined,
  currentFrameShots: Shot[]
): { intended?: LineSpec; autoFilled: boolean } {
  const found = sameBallSeedLine(
    ballId,
    input.game,
    input.currentFrameNumber,
    currentFrameShots,
    input.frames,
    input.previousGames ?? []
  );
  return found ? { intended: { ...found }, autoFilled: true } : { autoFilled: false };
}

/** A carry-forward or spare line wins; an empty one falls back to ball history. */
function resolveIntended(
  input: ShotSeedInput,
  preset: LineSpec | undefined,
  ballId: number | undefined,
  currentFrameShots: Shot[]
): { intended?: LineSpec; autoFilled: boolean } {
  if (lineHasValue(preset)) return { intended: preset, autoFilled: false };
  return seedLineForBall(input, ballId, currentFrameShots);
}

export function seedForShot(input: ShotSeedInput): ShotSeed {
  const { currentShot, currentFrameNumber, availablePins, frames, currentFrameShots } = input;
  const previousGames = input.previousGames ?? [];

  // First ball: carry line, ball and notes from the previous same-lane frame in
  // this game, else from the previous game on the same lane, else nothing.
  if (currentShot === 1) {
    const prev = freshRackSeedShot(input.game, currentFrameNumber, [], frames, previousGames);
    return {
      ballId: prev?.ball_id,
      notes: prev?.notes ?? "",
      ...resolveIntended(input, prev?.intended, prev?.ball_id, [])
    };
  }

  // True second ball (a spare attempt): the spare ball if one is configured,
  // else shot one's ball. The line comes from this session's attempt at the
  // same leave, else the saved spare line for it.
  if (availablePins.length < 10) {
    const spareBall = input.balls.find((b) => b.is_spare_ball);
    const ballId = spareBall?.id ?? currentFrameShots[0]?.ball_id;

    const sessionLine = sessionSpareIntended(
      [...(input.sessionFrames ?? []), ...frames],
      availablePins
    );
    const saved = savedSpareLine(input.spareLines, availablePins)?.line;
    // Only the two boards a spare line stores are carried; anything else on it
    // belongs to the shot it was recorded from.
    const savedLine = saved
      ? {
          ...(saved.stance != null && { stance: saved.stance }),
          ...(saved.target != null && { target: saved.target })
        }
      : undefined;
    const preset =
      (sessionLine && { ...sessionLine }) ??
      (savedLine && Object.keys(savedLine).length ? savedLine : undefined);

    return {
      ballId,
      notes: "",
      ...resolveIntended(input, preset, ballId, currentFrameShots)
    };
  }

  // Fresh-rack bonus ball (the 10th after a strike or spare): carry from the
  // most recent fresh-rack shot (ADR-029).
  const prev = freshRackSeedShot(
    input.game,
    currentFrameNumber,
    currentFrameShots,
    frames,
    previousGames
  );
  return {
    ballId: prev?.ball_id,
    notes: "",
    ...resolveIntended(input, prev?.intended, prev?.ball_id, currentFrameShots)
  };
}
