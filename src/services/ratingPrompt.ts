import { db } from "../db/bowlingDb";
import { isIOSApp } from "../lib/platform";
import { shouldAskForRating } from "../lib/ratingPrompt";
import { loadStorePlugin } from "../lib/nativeStorePlugin";

/** When the app last asked for a rating, an ISO string. */
export const RATING_ASKED_KEY = "rating_asked_at";

/** Long enough for the last ball's mark and the final score to land first. */
const ASK_DELAY_MS = 2000;

export interface RatingDeps {
  ios: boolean;
  finishedScores: () => Promise<number[]>;
  lastAskedAt: () => Promise<string | undefined>;
  markAsked: (at: string) => Promise<void>;
  requestReview: () => Promise<void>;
  wait: (ms: number) => Promise<void>;
  now: () => Date;
}

function defaultDeps(): RatingDeps {
  return {
    ios: isIOSApp(),
    finishedScores: async () =>
      (await db.games.filter((g) => g.final_score !== undefined).toArray()).map((g) => g.final_score as number),
    lastAskedAt: async () => (await db.settings.get(RATING_ASKED_KEY))?.value,
    markAsked: async (at) => {
      await db.settings.put({ key: RATING_ASKED_KEY, value: at });
    },
    requestReview: async () => (await loadStorePlugin()).requestReview(),
    wait: (ms) => new Promise((resolve) => window.setTimeout(resolve, ms)),
    now: () => new Date()
  };
}

/**
 * Asks Apple for its rating prompt after a good game, in the iPhone app only
 * (ADR-218). Called once per game, when its last ball finishes it. Best
 * effort: nothing here can fail a saved frame.
 */
export async function considerRatingPrompt(score: number, deps: RatingDeps = defaultDeps()): Promise<boolean> {
  if (!deps.ios) return false;
  try {
    const [finishedScores, lastAskedAt] = await Promise.all([deps.finishedScores(), deps.lastAskedAt()]);
    const now = deps.now();
    if (!shouldAskForRating({ score, finishedScores, lastAskedAt, now })) return false;
    // Marked before asking, so a prompt Apple chose not to show still counts
    // as an ask and the app does not try again after every good game.
    await deps.markAsked(now.toISOString());
    await deps.wait(ASK_DELAY_MS);
    await deps.requestReview();
    return true;
  } catch {
    return false;
  }
}
