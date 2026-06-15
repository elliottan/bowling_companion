import type { Frame, Game } from "../types/bowling";

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

function normalizeLanes(game: Pick<Game, "lanes" | "start_lane" | "lane_number">): string[] {
  if (game.lanes && game.lanes.length > 0) {
    return game.lanes.map((l) => l.trim()).filter(Boolean);
  }
  if (game.lane_number && game.lane_number.trim()) return [game.lane_number.trim()];
  return [];
}
