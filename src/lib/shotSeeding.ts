import {
  freshRackSeedShot,
  freshRackShotIndices,
  lastFreshRackBallId,
  lineHasValue,
  sameBallSeedLine
} from "./lanes";
import { isPocketLeave } from "./pins";
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
 * faced the same leave, keyed by the standing pins.
 *
 * A spare attempt is the ball after a fresh-rack ball that left pins, which is
 * what makes the 10th frame readable here too (ADR-101). It used to be skipped
 * outright, because `shots[0]` is not the leave `shots[1]` faces once the first
 * ball strikes, so the 11th and 12th balls were the only spare attempts in a
 * session whose line was never remembered: shoot the 10-pin in the 10th, and the
 * next game opened that leave with nothing in the box.
 *
 * `ballId` narrows it to attempts thrown with that ball, which is what a ball
 * change at a leave asks for: a plastic spare ball and a hooking strike ball
 * want different boards at the same pin, and `spare_lines` cannot say so (its
 * rows are keyed by the leave alone). Session history can. Attempts that name
 * no ball match any of them, unless `strict`.
 */
export function sessionSpareIntended(
  frames: Frame[],
  leave: PinNumber[],
  ballId?: number,
  strict = false
): LineSpec | undefined {
  const key = pinsKey(leave);
  let found: LineSpec | undefined;
  for (const f of frames) {
    for (const i of freshRackShotIndices(f.shots)) {
      const rack = f.shots[i];
      const attempt = f.shots[i + 1];
      if (!attempt || rack.pins_standing.length === 0) continue;
      if (pinsKey(rack.pins_standing) !== key) continue;
      // An attempt tagged with a DIFFERENT ball is not this ball's line. An
      // untagged one still is: it is the only record of that leave there is, and
      // dropping it would silently stop seeding for anyone who does not pick a
      // ball per shot.
      // `strict` drops the untagged ones too, for a strike ball: an untagged
      // attempt was most likely thrown with the spare ball, and its boards are
      // the ones a strike ball must not inherit (ADR-113).
      if (ballId != null && attempt.ball_id !== ballId && (strict || attempt.ball_id != null)) continue;
      if (lineHasValue(attempt.intended)) found = attempt.intended;
    }
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
 * ball has no line on record.
 *
 * On a full rack this is `sameBallSeedLine`: this frame, then this lane, then
 * the pair's other lane, newest first (ADR-035's precedence, unchanged).
 *
 * At a leave it depends on the kind of ball (ADR-113, replacing ADR-053's
 * steps 3 and 4 for a strike ball):
 *
 * - a spare ball, or no ball: this ball's own attempt at this leave this
 *   session, then the leave's saved line, then the strike ball thrown at the
 *   rack moved by the leave's strike move (ADR-125), then the ball's own
 *   strike line;
 * - a strike ball: this ball's own attempt at this leave this session, then its
 *   strike line moved by the leave's `strike_offset`, then its strike line as
 *   is. Never the leave's saved line: that was recorded off a spare ball thrown
 *   straight, and a hooking ball on those boards misses the pin.
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

  /** The strike ball that was thrown at the rack this leave came from, on the
   *  line it threw, moved by `offset`. Nothing when that ball is not a strike
   *  ball or has no line on record. */
  const rackBallMove = (offset: { stance?: number; target?: number } | undefined) => {
    const rackBallId = lastFreshRackBallId(
      input.currentFrameNumber,
      currentFrameShots,
      input.frames,
      input.previousGames ?? []
    );
    if (rackBallId == null || ballKind(input.balls ?? [], rackBallId) !== "strike") return undefined;
    const line = sameBallSeedLine(
      rackBallId,
      input.game,
      input.currentFrameNumber,
      currentFrameShots,
      input.frames,
      input.previousGames ?? []
    );
    if (!line) return undefined;
    return (offset && applyOffset(line, offset)) ?? { ...line };
  };

  // A pocket leave (the 1 and 5 standing) is a strike-ball shot on the strike
  // line, with any ball (ADR-123).
  if (!leave || leave.length === 0 || leave.length >= 10 || isPocketLeave(leave)) {
    return ownStrikeLine();
  }

  const isStrikeBall = ballKind(input.balls ?? [], ballId) === "strike";
  const own = sessionSpareIntended(
    [...(input.sessionFrames ?? []), ...input.frames],
    leave,
    ballId,
    isStrikeBall
  );
  if (own) return { ...own };

  const saved = savedSpareLine(input.spareLines ?? [], leave);
  if (isStrikeBall) {
    if (saved?.strike_offset) {
      const moved = applyOffset(ownStrikeLine(), saved.strike_offset);
      if (moved) return moved;
    }
    return ownStrikeLine();
  }

  // A spare ball with no line saved for this leave starts from the strike ball
  // that was thrown at the rack: its line, moved by the leave's strike move
  // when there is one (ADR-125). Only then does it fall back to its own strike
  // line, ADR-035's last resort, for a ball thrown at a full rack that no
  // strike ball was.
  return spareLineBoards(saved) ?? rackBallMove(saved?.strike_offset) ?? ownStrikeLine();
}

/** Which kind of ball an id names: a spare ball, a strike ball (any ball not
 *  marked as a spare ball), or nothing known. */
export function ballKind(balls: Ball[], ballId: number | undefined): "spare" | "strike" | undefined {
  if (ballId == null) return undefined;
  return balls.find((b) => b.id === ballId)?.is_spare_ball ? "spare" : "strike";
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
  // A copy, never the stored object: a seed that is the previous shot's own
  // line is a value React cannot tell apart from "unchanged" (B1, ADR-113).
  if (lineHasValue(preset)) return { intended: { ...preset! } };
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

  // First ball (ADR-113): the ball is the last one thrown at a full rack this
  // session, on any lane, and the line is that ball's own line, this lane
  // first. Notes still come from the previous frame on this lane. With no ball
  // on record, the same-lane frame's line carries as it always has, which is
  // what keeps seeding alive for a bowler who never picks a ball.
  if (currentShot === 1) {
    const prev = freshRackSeedShot(input.game, currentFrameNumber, [], frames, previousGames);
    const ballId = lastFreshRackBallId(currentFrameNumber, [], frames, previousGames);
    return {
      ballId,
      notes: prev?.notes ?? "",
      ...resolveIntended(input, ballId == null ? prev?.intended : undefined, ballId, [])
    };
  }

  // True second ball (a spare attempt): the spare ball if one is configured,
  // else shot one's ball. The line comes from this session's attempt at the
  // same leave, else the saved spare line for it.
  // A pocket leave is not a spare attempt here: it falls through to the
  // fresh-rack rule below, so it opens with the ball and line just thrown at the
  // full rack (ADR-123).
  if (availablePins.length < 10 && !isPocketLeave(availablePins)) {
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

  // Fresh-rack bonus ball (the 10th after a strike or spare), or a pocket leave:
  // the same rule, and the ball thrown at the last full rack in this frame comes
  // first.
  const prev = freshRackSeedShot(
    input.game,
    currentFrameNumber,
    currentFrameShots,
    frames,
    previousGames
  );
  const ballId = lastFreshRackBallId(currentFrameNumber, currentFrameShots, frames, previousGames);
  return {
    ballId,
    notes: "",
    ...resolveIntended(
      input,
      ballId == null ? prev?.intended : undefined,
      ballId,
      currentFrameShots
    )
  };
}
