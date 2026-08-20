import type { Frame, Game, LineSpec, Shot } from "../types/bowling";

/**
 * Resolve which physical lane a given frame is bowled on.
 *
 * - Single lane (or no config): every frame is on that lane.
 * - Cross-lane pair: frames alternate starting from `start_lane` — odd frames
 *   (1,3,5,7,9) on the start lane, even frames on the other.
 *
 * Derivation is live: editing a game's lane config re-derives every frame, so
 * no per-frame lane is stored.
 */
export function laneForFrame(game: Pick<Game, "lanes" | "start_lane" | "lane_number">, frameNumber: number): string | undefined {
  const lanes = normalizeLanes(game);
  if (lanes.length === 0) return undefined;
  if (lanes.length === 1) return lanes[0];

  const start = game.start_lane && lanes.includes(game.start_lane) ? game.start_lane : lanes[0];
  const other = lanes.find((l) => l !== start) ?? start;
  // Frame 1 (odd) -> start; frame 2 (even) -> other; alternate.
  return frameNumber % 2 === 1 ? start : other;
}

/** The lane the game *ends* on (frame 10), used to flip the next game's start. */
export function endLane(game: Pick<Game, "lanes" | "start_lane" | "lane_number">): string | undefined {
  return laneForFrame(game, 10);
}

/**
 * Default start lane for the next game in a session: the lane the previous game
 * ended on (cross-lane flips each game). Single lane stays put.
 */
export function nextGameStartLane(previous: Pick<Game, "lanes" | "start_lane" | "lane_number">): string | undefined {
  return endLane(previous);
}

/**
 * The most recent earlier frame bowled on the same lane as `frameNumber`.
 * Used to carry forward a line. Single lane (or no game) → the immediately
 * previous frame. Cross-lane → two frames back (1,3,5… and 2,4,6… pair up),
 * so frames 1 and 2 have no same-lane predecessor.
 */
export function previousSameLaneFrame(
  game: Pick<Game, "lanes" | "start_lane" | "lane_number"> | undefined,
  frameNumber: number,
  frames: Frame[]
): Frame | undefined {
  const earlier = frames.filter((f) => f.frame_number < frameNumber);
  if (earlier.length === 0) return undefined;
  const lane = game ? laneForFrame(game, frameNumber) : undefined;
  const pool =
    lane === undefined
      ? earlier
      : earlier.filter((f) => laneForFrame(game!, f.frame_number) === lane);
  if (pool.length === 0) return undefined;
  return pool.reduce((a, b) => (b.frame_number > a.frame_number ? b : a));
}

/**
 * The most recent frame bowled on the same physical lane as `frameNumber`
 * (of `currentGame`) across earlier games in the session. `previousGames` is
 * ordered oldest→newest. Used to carry a line/ball/notes into a new game.
 */
export function previousGameSameLaneFrame(
  currentGame: Pick<Game, "lanes" | "start_lane" | "lane_number"> | undefined,
  frameNumber: number,
  previousGames: Array<{
    game: Pick<Game, "lanes" | "start_lane" | "lane_number">;
    frames: Frame[];
  }>
): Frame | undefined {
  const lane = currentGame ? laneForFrame(currentGame, frameNumber) : undefined;
  if (lane === undefined) return undefined;
  for (let gi = previousGames.length - 1; gi >= 0; gi--) {
    const { game, frames } = previousGames[gi];
    const sameLane = frames.filter((f) => laneForFrame(game, f.frame_number) === lane);
    if (sameLane.length > 0) {
      return sameLane.reduce((a, b) => (b.frame_number > a.frame_number ? b : a));
    }
  }
  return undefined;
}

/** Indices of shots thrown at a full rack: ball 1, or any shot after a cleared deck. */
export function freshRackShotIndices(shots: Shot[]): number[] {
  return shots.reduce<number[]>((acc, _shot, i) => {
    if (i === 0 || shots[i - 1].pins_standing.length === 0) acc.push(i);
    return acc;
  }, []);
}

/**
 * The shot whose context (intended line, ball) should seed a new fresh-rack shot.
 * Search order: latest fresh-rack shot in the current frame, then the latest
 * fresh-rack shot of previousSameLaneFrame(...), then of
 * previousGameSameLaneFrame(...), else undefined (ADR-029, ADR-045).
 */
export function freshRackSeedShot(
  game: Pick<Game, "lanes" | "start_lane" | "lane_number"> | undefined,
  frameNumber: number,
  currentFrameShots: Shot[],
  frames: Frame[],
  previousGames: Array<{
    game: Pick<Game, "lanes" | "start_lane" | "lane_number">;
    frames: Frame[];
  }>
): Shot | undefined {
  const freshIndices = freshRackShotIndices(currentFrameShots);
  if (freshIndices.length > 0) {
    return currentFrameShots[freshIndices[freshIndices.length - 1]];
  }
  const prev =
    previousSameLaneFrame(game, frameNumber, frames) ??
    previousGameSameLaneFrame(game, frameNumber, previousGames);
  // The latest fresh-rack shot of that frame, not its first. Only the 10th can
  // hold more than one, and there the last one thrown is the recent throw a
  // bowler is carrying forward (ADR-045). In frames 1 to 9 ball 1 is the only
  // fresh-rack shot, so this stays exactly ADR-029's behaviour.
  const prevShots = prev?.shots ?? [];
  const prevFresh = freshRackShotIndices(prevShots);
  return prevFresh.length > 0 ? prevShots[prevFresh[prevFresh.length - 1]] : undefined;
}

/** A line worth carrying: at least one aiming field is set. */
export function lineHasValue(l: LineSpec | undefined): boolean {
  return !!l && (l.stance != null || l.target != null || l.breakpoint != null);
}

/**
 * The intended line to seed from this ball's own history, used when nothing
 * else filled the box (ADR-035). Only fresh-rack shots are eligible sources —
 * a spare attempt aims at a leave, so its line never seeds another shot.
 *
 * Strict two-tier precedence, each scanned all the way back (current frame →
 * earlier frames this game → earlier games in the session, newest first):
 *   1. same ball, same lane as `frameNumber`
 *   2. same ball, the other lane of a cross-lane pair
 * A same-lane match always wins, however old — lane identity is a stronger
 * signal than recency when a pair oils and breaks down differently.
 */
export function sameBallSeedLine(
  ballId: number | undefined,
  game: Pick<Game, "lanes" | "start_lane" | "lane_number"> | undefined,
  frameNumber: number,
  currentFrameShots: Shot[],
  frames: Frame[],
  previousGames: Array<{
    game: Pick<Game, "lanes" | "start_lane" | "lane_number">;
    frames: Frame[];
  }>
): LineSpec | undefined {
  if (ballId == null) return undefined;
  const lane = game ? laneForFrame(game, frameNumber) : undefined;

  const sameLane: LineSpec[] = [];
  const otherLane: LineSpec[] = [];

  // No lane config (or an unknown frame lane) means there is no "other lane" to
  // distinguish — everything counts as tier 1.
  const collect = (shotLane: string | undefined, shots: Shot[]) => {
    const bucket =
      lane === undefined || shotLane === undefined || shotLane === lane ? sameLane : otherLane;
    for (const i of freshRackShotIndices(shots).reverse()) {
      const shot = shots[i];
      if (shot.ball_id === ballId && lineHasValue(shot.intended)) bucket.push(shot.intended!);
    }
  };

  const newestFirst = (fs: Frame[]) => [...fs].sort((a, b) => b.frame_number - a.frame_number);

  collect(lane, currentFrameShots);
  for (const f of newestFirst(frames.filter((f) => f.frame_number < frameNumber))) {
    collect(game ? laneForFrame(game, f.frame_number) : undefined, f.shots);
  }
  for (let gi = previousGames.length - 1; gi >= 0; gi--) {
    const pg = previousGames[gi];
    for (const f of newestFirst(pg.frames)) {
      collect(laneForFrame(pg.game, f.frame_number), f.shots);
    }
  }

  return sameLane[0] ?? otherLane[0];
}

function normalizeLanes(game: Pick<Game, "lanes" | "start_lane" | "lane_number">): string[] {
  if (game.lanes && game.lanes.length > 0) {
    return game.lanes.map((l) => l.trim()).filter(Boolean);
  }
  if (game.lane_number && game.lane_number.trim()) return [game.lane_number.trim()];
  return [];
}
