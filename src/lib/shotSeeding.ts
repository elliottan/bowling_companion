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
}

const pinsKey = (p: PinNumber[]) => [...p].sort((a, b) => a - b).join(",");

/**
 * The intended line of the most recent earlier spare attempt this session that
 * faced the same leave. Non-10th frames only, keyed by the standing pins.
 *
 * `ballId` narrows it to attempts thrown with that ball, which is what a ball
 * change at a leave asks for: a plastic spare ball and a hooking strike ball
 * want different boards at the same pin, and `spare_lines` cannot say so (its
 * rows are keyed by the leave alone). Session history can. Attempts that name
 * no ball match any of them.
 */
export function sessionSpareIntended(
  frames: Frame[],
  leave: PinNumber[],
  ballId?: number
): LineSpec | undefined {
  const key = pinsKey(leave);
  let found: LineSpec | undefined;
  for (const f of frames) {
    if (f.frame_number === 10) continue;
    const [first, second] = f.shots;
    if (!first || !second) continue;
    if (pinsKey(first.pins_standing) !== key) continue;
    // An attempt tagged with a DIFFERENT ball is not this ball's line. An
    // untagged one still is: it is the only record of that leave there is, and
    // dropping it would silently stop seeding for anyone who does not pick a
    // ball per shot.
    if (ballId != null && second.ball_id != null && second.ball_id !== ballId) continue;
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
 * The line to show for a ball, which is the whole of the ball-change rule: the
 * box shows the line for the ball that is selected, and `undefined` means this
 * ball has no line on record, so the caller keeps whatever is already there.
 *
 * On a full rack this is `sameBallSeedLine`: this frame, then this lane, then
 * the pair's other lane, newest first (ADR-035's precedence, unchanged).
 *
 * At a leave it is, in order (ADR-052, ADR-053):
 *   1. this ball's own attempt at this leave, this session;
 *   2. for a strike ball, that ball's own strike line moved by the leave's
 *      `strike_offset`, which is why the offset is stored as a move: it lands
 *      wherever you are playing today, with whichever strike ball is up;
 *   3. the leave's absolute line, which was recorded off a spare ball.
 */
export function lineForBall(
  input: Pick<ShotSeedInput, "currentFrameNumber" | "frames" | "game" | "previousGames"> &
    Partial<Pick<ShotSeedInput, "sessionFrames" | "spareLines" | "balls">>,
  ballId: number | undefined,
  currentFrameShots: Shot[],
  leave?: PinNumber[]
): LineSpec | undefined {
  const ownStrikeLine = () => {
    const found = sameBallSeedLine(
      ballId,
      input.game,
      input.currentFrameNumber,
      currentFrameShots,
      input.frames,
      input.previousGames ?? []
    );
    return found ? { ...found } : undefined;
  };

  if (!leave || leave.length === 0 || leave.length >= 10) return ownStrikeLine();

  const own = sessionSpareIntended(
    [...(input.sessionFrames ?? []), ...input.frames],
    leave,
    ballId
  );
  if (own) return { ...own };

  const saved = savedSpareLine(input.spareLines ?? [], leave);
  const ball = input.balls?.find((b) => b.id === ballId);
  const isStrikeBall = ballId != null && ball?.is_spare_ball !== true;
  if (isStrikeBall && saved?.strike_offset) {
    const moved = applyOffset(ownStrikeLine(), saved.strike_offset);
    if (moved) return moved;
  }

  // ADR-035's last resort, kept: with nothing recorded for this leave, a leave
  // shot inherits the ball's own strike line, which is the line you adjust off
  // rather than replace.
  return spareLineBoards(saved) ?? ownStrikeLine();
}

/** A leave's offset moved onto a real strike line. Null when there is no strike
 *  line to move, or when the offset names boards the line does not carry: an
 *  offset is a move off something, and there is nothing to move. */
function applyOffset(
  base: LineSpec | undefined,
  offset: { stance?: number; target?: number }
): LineSpec | undefined {
  if (!base) return undefined;
  const moved: LineSpec = {};
  if (offset.stance != null && base.stance != null) moved.stance = base.stance + offset.stance;
  if (offset.target != null && base.target != null) moved.target = base.target + offset.target;
  return Object.keys(moved).length ? moved : undefined;
}

/** Only the two boards a spare line stores are its own; anything else on it
 *  belongs to the shot it was recorded from. */
function spareLineBoards(entry: SpareLine | undefined): LineSpec | undefined {
  const saved = entry?.line;
  if (!saved) return undefined;
  const boards = {
    ...(saved.stance != null && { stance: saved.stance }),
    ...(saved.target != null && { target: saved.target })
  };
  return Object.keys(boards).length ? boards : undefined;
}

/** A carry-forward or spare line wins; an empty one falls back to ball history. */
function resolveIntended(
  input: ShotSeedInput,
  preset: LineSpec | undefined,
  ballId: number | undefined,
  currentFrameShots: Shot[]
): { intended?: LineSpec } {
  if (lineHasValue(preset)) return { intended: preset };
  const found = sameBallSeedLine(
    ballId,
    input.game,
    input.currentFrameNumber,
    currentFrameShots,
    input.frames,
    input.previousGames ?? []
  );
  return found ? { intended: { ...found } } : {};
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

    // Same resolution a ball change runs, so the line a shot opens with and the
    // line a ball change produces can never disagree.
    return {
      ballId,
      notes: "",
      intended: lineForBall(input, ballId, currentFrameShots, availablePins)
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
