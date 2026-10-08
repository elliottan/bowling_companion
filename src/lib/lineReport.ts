import type { BriefingFilter } from "./briefing";
import { freshRackShotIndices, laneForFrame } from "./lanes";
import { resolvePocketHit } from "./pins";
import { filterSessionsBy } from "./stats";
import type { Ball, Handedness, PinNumber, SessionSummary } from "../types/bowling";

/**
 * What each line did at one alley, ball by ball and shot by shot.
 *
 * The Alley report used to read a ball as one number per alley, which hides the
 * thing a bowler changes most: the same ball one board over is a different
 * shot. This groups every fresh-rack ball by the ball and the exact stance and
 * target it was thrown on, and keeps the shots behind each group so the screen
 * can open them.
 *
 * Lines are never merged. A half board is a line the bowler chose to write
 * down, and rounding it into a neighbour has to pick a side for them.
 *
 * Like `lib/briefing`, this returns counts and never a sentence or a
 * recommendation: a line that struck more may have been thrown later, on a
 * lane that had changed, or after the ball was sanded.
 */

/** Below this a line is marked thin rather than hidden. Most lines are a
 *  handful of balls, and hiding them would hide most of a session. */
export const MIN_LINE_SHOTS = 5;

/** Both sides of a line change need this many balls in the session before the
 *  change is read back. One stray ball on another board is not a move. */
export const MIN_MOVE_SHOTS = 4;

/** Newest first, and capped: the list is what you did lately, not a log. */
export const MAX_MOVES = 6;

export interface LineTally {
  /** Fresh-rack balls. */
  thrown: number;
  pocket: number;
  strikes: number;
  /** Strikes off a pocket hit, the numerator of carry. */
  pocketStrikes: number;
}

export interface LineShot {
  sessionId?: number;
  date: string;
  gameId?: number;
  gameNumber: number;
  frameNumber: number;
  lane?: string;
  pinsStanding: PinNumber[];
  pocket: boolean;
  notes?: string;
}

export interface LineLeave {
  pins: PinNumber[];
  count: number;
}

export interface LineRead extends LineTally {
  /** Stable for a ball and a line, and what the route carries. */
  id: string;
  ballId?: number;
  ballName: string;
  stance?: number;
  target?: number;
  thin: boolean;
  /** What the line left when it did not strike, most often first. */
  leaves: LineLeave[];
  /** Newest session first, in the order thrown inside it. */
  shots: LineShot[];
}

export interface BallRead extends LineTally {
  ballId?: number;
  name: string;
  /** Most thrown first. */
  lines: LineRead[];
}

export interface MoveSide extends LineTally {
  lineId: string;
  stance: number;
  target: number;
}

/** Two lines played with one ball in one session, in the order they were first
 *  thrown, each counted inside that session only. */
export interface LineMove {
  id: string;
  ballName: string;
  date: string;
  from: MoveSide;
  to: MoveSide;
}

export interface LineReport {
  sessions: number;
  shots: number;
  /** Most thrown first. */
  balls: BallRead[];
  moves: LineMove[];
}

/** What a ball is called when a shot names none, or one since deleted. */
export const NO_BALL = "No ball";

export function lineId(ballId: number | undefined, stance?: number, target?: number): string {
  return `${ballId ?? "none"}_${stance ?? ""}_${target ?? ""}`;
}

function emptyTally(): LineTally {
  return { thrown: 0, pocket: 0, strikes: 0, pocketStrikes: 0 };
}

function count(tally: LineTally, shot: LineShot) {
  const struck = shot.pinsStanding.length === 0;
  tally.thrown++;
  if (struck) tally.strikes++;
  if (shot.pocket) tally.pocket++;
  if (shot.pocket && struck) tally.pocketStrikes++;
}

export function buildLineReport(
  sessions: SessionSummary[],
  balls: Ball[],
  filter: BriefingFilter,
  handedness: Handedness = "right"
): LineReport {
  const slice = filterSessionsBy(sessions, {
    alleyName: filter.alley || undefined,
    oilPattern: filter.pattern || undefined
  });
  const newestFirst = [...slice].sort(
    (a, b) =>
      b.session.date.localeCompare(a.session.date) || (b.session.id ?? 0) - (a.session.id ?? 0)
  );
  const nameOf = (ballId: number | undefined) =>
    balls.find((b) => b.id === ballId)?.name ?? NO_BALL;

  const byBall = new Map<number | undefined, BallRead>();
  const byLine = new Map<string, LineRead>();
  const moves: LineMove[] = [];
  let sessionsCounted = 0;
  let shots = 0;

  for (const { session, games } of newestFirst) {
    // This session's own count per line, in the order each was first thrown.
    const inSession = new Map<string, MoveSide & { ballId?: number }>();
    const before = shots;

    for (const game of [...games].sort((a, b) => a.game_number - b.game_number)) {
      for (const frame of [...game.frames].sort((a, b) => a.frame_number - b.frame_number)) {
        const lane = laneForFrame(game, frame.frame_number);
        if (filter.lane && lane !== filter.lane) continue;

        for (const index of freshRackShotIndices(frame.shots)) {
          const raw = frame.shots[index];
          const spec = raw.intended ?? raw.actual;
          const shot: LineShot = {
            sessionId: session.id,
            date: session.date,
            gameId: game.id,
            gameNumber: game.game_number,
            frameNumber: frame.frame_number,
            lane,
            pinsStanding: raw.pins_standing,
            pocket: resolvePocketHit(raw, handedness),
            notes: raw.notes
          };
          shots++;

          let ball = byBall.get(raw.ball_id);
          if (!ball) {
            ball = { ...emptyTally(), ballId: raw.ball_id, name: nameOf(raw.ball_id), lines: [] };
            byBall.set(raw.ball_id, ball);
          }
          count(ball, shot);

          // A ball with no board on record still counts for the ball above. It
          // has no line to sit under.
          if (spec?.stance === undefined && spec?.target === undefined) continue;

          const id = lineId(raw.ball_id, spec.stance, spec.target);
          let line = byLine.get(id);
          if (!line) {
            line = {
              ...emptyTally(),
              id,
              ballId: raw.ball_id,
              ballName: ball.name,
              stance: spec.stance,
              target: spec.target,
              thin: true,
              leaves: [],
              shots: []
            };
            byLine.set(id, line);
            ball.lines.push(line);
          }
          count(line, shot);
          line.shots.push(shot);

          if (spec.stance === undefined || spec.target === undefined) continue;
          let side = inSession.get(id);
          if (!side) {
            side = {
              ...emptyTally(),
              lineId: id,
              ballId: raw.ball_id,
              stance: spec.stance,
              target: spec.target
            };
            inSession.set(id, side);
          }
          count(side, shot);
        }
      }
    }

    if (shots > before) sessionsCounted++;
    const played = [...inSession.values()].filter((s) => s.thrown >= MIN_MOVE_SHOTS);
    for (const ballId of new Set(played.map((s) => s.ballId))) {
      const own = played.filter((s) => s.ballId === ballId);
      for (let i = 1; i < own.length; i++) {
        moves.push({
          id: `${session.id ?? session.date}:${own[i - 1].lineId}>${own[i].lineId}`,
          ballName: nameOf(ballId),
          date: session.date,
          from: own[i - 1],
          to: own[i]
        });
      }
    }
  }

  for (const line of byLine.values()) {
    line.thin = line.thrown < MIN_LINE_SHOTS;
    line.leaves = leavesOf(line.shots);
  }
  const ballReads = [...byBall.values()].sort((a, b) => b.thrown - a.thrown);
  for (const ball of ballReads) ball.lines.sort((a, b) => b.thrown - a.thrown);

  return {
    sessions: sessionsCounted,
    shots,
    balls: ballReads,
    moves: moves.slice(0, MAX_MOVES)
  };
}

function leavesOf(shots: LineShot[]): LineLeave[] {
  const leaves = new Map<string, LineLeave>();
  for (const shot of shots) {
    if (shot.pinsStanding.length === 0) continue;
    const pins = [...shot.pinsStanding].sort((a, b) => a - b);
    const key = pins.join("-");
    const leave = leaves.get(key) ?? { pins, count: 0 };
    leave.count++;
    leaves.set(key, leave);
  }
  return [...leaves.values()].sort((a, b) => b.count - a.count);
}

export function findLine(report: LineReport, id: string | null): LineRead | null {
  if (!id) return null;
  for (const ball of report.balls) {
    const line = ball.lines.find((l) => l.id === id);
    if (line) return line;
  }
  return null;
}
