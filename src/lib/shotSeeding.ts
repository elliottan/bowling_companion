import {
  freshRackSeedShot,
  freshRackShotIndices,
  lastFreshRackBallId,
  lineHasValue,
  sameBallSeedLine
} from "./lanes";
import { isPocketLeave } from "./pins";
import { hasLine, hasMove } from "./spareLines";
import type {
  Ball,
  Frame,
  Game,
  LineSpec,
  PinNumber,
  Session,
  SessionSummary,
  Shot,
  SpareLine
} from "../types/bowling";

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
  /** Frames from earlier sessions at the same alley on the same oil pattern,
   *  oldest first: where a leave this session has no attempt at looks next
   *  (ADR-140). */
  earlierSessionFrames?: Frame[];
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
  return latestSpareIntended(frames, new Set([pinsKey(leave)]), ballId, strict);
}

/**
 * `sessionSpareIntended` over a set of leaves: the newest attempt at any of
 * them. The set is a leave and the leaves that share its saved spare line
 * (`sameLineLeaves`), so a move made at the 6 is where the 6-10 starts too.
 */
function latestSpareIntended(
  frames: Frame[],
  keys: Set<string>,
  ballId?: number,
  strict = false
): LineSpec | undefined {
  let found: LineSpec | undefined;
  for (const f of frames) {
    for (const i of freshRackShotIndices(f.shots)) {
      const rack = f.shots[i];
      const attempt = f.shots[i + 1];
      if (!attempt || rack.pins_standing.length === 0) continue;
      if (!keys.has(pinsKey(rack.pins_standing))) continue;
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

/**
 * Every frame from the sessions before this one at the same alley on the same
 * oil pattern, oldest session first, so the newest attempt is the one found
 * (ADR-140). A spare line is a house and a pattern's answer, so a different
 * pattern at the same house, or the same pattern somewhere else, is not one.
 * A session with no pattern matches only others with none. With no alley named
 * there is no house to match, and nothing comes back.
 */
export function earlierSessionFrames(
  history: SessionSummary[],
  current: Pick<Session, "id" | "date" | "alley_name" | "oil_pattern_id">
): Frame[] {
  const alley = current.alley_name.trim().toLowerCase();
  if (!alley) return [];
  return history
    .filter(
      ({ session: s }) =>
        s.id !== current.id &&
        s.date <= current.date &&
        s.alley_name.trim().toLowerCase() === alley &&
        s.oil_pattern_id === current.oil_pattern_id
    )
    .sort((a, b) => a.session.date.localeCompare(b.session.date) || (a.session.id ?? 0) - (b.session.id ?? 0))
    .flatMap(({ games }) =>
      [...games]
        .sort((a, b) => a.game_number - b.game_number)
        .flatMap((g) => (g as Game & { frames?: Frame[] }).frames ?? [])
    );
}

/**
 * A leave and every leave saved with the same spare ball line as it: the same
 * stance and target, which is what puts them on one row of the Spare lines
 * screen. These are one shot, so an adjustment made at any of them this session
 * is the line for all of them (ADR-140). A leave with no saved boards is a set
 * of one.
 */
export function sameLineLeaves(spareLines: SpareLine[], leave: PinNumber[]): Set<string> {
  const keys = new Set([pinsKey(leave)]);
  const saved = savedSpareLine(spareLines, leave);
  if (!hasLine(saved)) return keys;
  const boards = (sl: SpareLine) => `${sl.line?.stance ?? "-"}|${sl.line?.target ?? "-"}`;
  const mine = boards(saved!);
  for (const sl of spareLines) {
    if (hasLine(sl) && boards(sl) === mine) keys.add(pinsKey(sl.pins));
  }
  return keys;
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
 * - a spare ball, or no ball: this ball's newest attempt this session at this
 *   leave or one saved on the same line, then the same from earlier sessions
 *   at this alley on this pattern (ADR-140), then the leave's saved line, then the line the strike ball threw
 *   at the rack (ADR-125), then the ball's own strike line. A leave saved with
 *   only a strike move gives it nothing past its own attempt (ADR-132);
 * - a strike ball: this ball's own attempt at this leave this session, then its
 *   strike line moved by the leave's `strike_offset`, then its strike line as
 *   is. Never the leave's saved line: that was recorded off a spare ball thrown
 *   straight, and a hooking ball on those boards misses the pin.
 */
export function lineForBall(
  input: Pick<ShotSeedInput, "currentFrameNumber" | "frames" | "game" | "previousGames"> &
    Partial<Pick<ShotSeedInput, "sessionFrames" | "earlierSessionFrames" | "spareLines" | "balls">>,
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
   *  line it threw. Nothing when that ball is not a strike ball or has no line
   *  on record. */
  const rackBallLine = () => {
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
    return line ? { ...line } : undefined;
  };

  // A pocket leave (the 1 and 5 standing) is a strike-ball shot on the strike
  // line, with any ball (ADR-123).
  if (!leave || leave.length === 0 || leave.length >= 10 || isPocketLeave(leave)) {
    return ownStrikeLine();
  }

  const isStrikeBall = ballKind(input.balls ?? [], ballId) === "strike";
  // The newest attempt this session, at this leave or, for a spare ball, at
  // any leave saved on the same line (ADR-140). Then the newest one from an
  // earlier session at this alley on this pattern. A strike ball reads its own
  // attempts at this exact leave only: the rows are spare ball lines.
  const leaves = isStrikeBall
    ? new Set([pinsKey(leave)])
    : sameLineLeaves(input.spareLines ?? [], leave);
  const own =
    latestSpareIntended(
      [...(input.sessionFrames ?? []), ...input.frames],
      leaves,
      ballId,
      isStrikeBall
    ) ?? latestSpareIntended(input.earlierSessionFrames ?? [], leaves, ballId, isStrikeBall);
  if (own) return { ...own };

  const saved = savedSpareLine(input.spareLines ?? [], leave);
  if (isStrikeBall) {
    if (saved?.strike_offset) {
      const moved = applyOffset(ownStrikeLine(), saved.strike_offset);
      if (moved) return moved;
    }
    return ownStrikeLine();
  }

  // A leave answered only by a strike ball move is shot with the strike ball
  // (ADR-132). Its boards are a hooking ball's, so a spare ball picked there by
  // hand gets nothing to aim at but its own attempt, above.
  if (hasMove(saved) && !hasLine(saved)) return undefined;

  // A spare ball with nothing saved for this leave starts from the strike ball
  // that was thrown at the rack, on the line it threw (ADR-125). Only then does
  // it fall back to its own strike line, ADR-035's last resort, for a ball
  // thrown at a full rack that no strike ball was.
  return spareLineBoards(saved) ?? rackBallLine() ?? ownStrikeLine();
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
  // A leave whose only answer is a strike ball move is the exception (ADR-132):
  // it is shot with the strike ball thrown at the rack, so that ball opens.
  // A pocket leave is not a spare attempt here: it falls through to the
  // fresh-rack rule below, so it opens with the ball and line just thrown at the
  // full rack (ADR-123).
  if (availablePins.length < 10 && !isPocketLeave(availablePins)) {
    const spareBall = input.balls.find((b) => b.is_spare_ball);
    const saved = savedSpareLine(input.spareLines ?? [], availablePins);
    const rackBallId = lastFreshRackBallId(currentFrameNumber, currentFrameShots, frames, previousGames);
    const strikeBallMove =
      hasMove(saved) && !hasLine(saved) && ballKind(input.balls, rackBallId) === "strike";
    const ballId = strikeBallMove ? rackBallId : (spareBall?.id ?? currentFrameShots[0]?.ball_id);

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
