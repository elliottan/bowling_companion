/**
 * When the store app may ask Apple to show its rating prompt (ADR-218).
 *
 * Apple decides whether the prompt shows at all, and shows it at most three
 * times a year. This only picks a good moment to ask: a game just finished
 * that was at least as good as the bowler's usual, never a first game, and
 * not again for months after asking once.
 */

/** Finished games before the app asks, so a first game is never interrupted. */
export const RATING_MIN_GAMES = 3;

/** Days between asks. Apple's own cap is three a year; this is gentler. */
export const RATING_GAP_DAYS = 120;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RatingMoment {
  /** The game just finished. */
  score: number;
  /** Every finished game's score, the one just finished included. */
  finishedScores: readonly number[];
  /** When the app last asked, as an ISO string, or undefined if never. */
  lastAskedAt: string | undefined;
  now: Date;
}

export function shouldAskForRating({ score, finishedScores, lastAskedAt, now }: RatingMoment): boolean {
  if (finishedScores.length < RATING_MIN_GAMES) return false;

  if (lastAskedAt) {
    const asked = Date.parse(lastAskedAt);
    if (!Number.isNaN(asked) && now.getTime() - asked < RATING_GAP_DAYS * DAY_MS) return false;
  }

  // A good game for this bowler: at or above the average of their others.
  const others = finishedScores.length - 1;
  const othersTotal = finishedScores.reduce((sum, s) => sum + s, 0) - score;
  return score * others >= othersTotal;
}
