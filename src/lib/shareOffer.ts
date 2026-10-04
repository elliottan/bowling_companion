/**
 * When to offer to share a session, and how to stop.
 *
 * The offer is the reward for finishing a game, so it is made on that moment
 * and nowhere else: not on a finished game opened from History, not again for
 * the next game of the same session, and not again after a relaunch. Sharing or
 * dismissing retires it for the session. Three dismissals in a row retire it
 * for good, because a bowler who has said no three times has answered, and the
 * share icon in the session header is always there.
 */

/** Settings key holding the state below, as JSON. In `settings`, so it rides
 *  in a backup and a restore does not re-ask about old sessions. */
export const SHARE_OFFER_KEY = "share_offer";

/** Dismissals in a row after which the offer stops for good. */
export const SHARE_OFFER_MAX_DISMISSALS = 3;

/** Sessions remembered as answered. Old ones age out: a session from months ago
 *  is never the one a game was just finished in. */
const REMEMBERED = 50;

export interface ShareOfferState {
  /** Sessions the offer has been answered for, oldest first. */
  answered: number[];
  /** Dismissals since the last share. */
  dismissStreak: number;
}

export const EMPTY_SHARE_OFFER: ShareOfferState = { answered: [], dismissStreak: 0 };

export function parseShareOffer(raw: string | undefined): ShareOfferState {
  if (!raw) return EMPTY_SHARE_OFFER;
  try {
    const parsed = JSON.parse(raw) as Partial<ShareOfferState>;
    return {
      answered: Array.isArray(parsed.answered)
        ? parsed.answered.filter((n): n is number => typeof n === "number")
        : [],
      dismissStreak: typeof parsed.dismissStreak === "number" ? parsed.dismissStreak : 0
    };
  } catch {
    return EMPTY_SHARE_OFFER;
  }
}

/**
 * Whether to show the offer. `justFinished` is true only when a game was
 * completed by a ball recorded on this screen while it was open, never for a
 * finished game that was merely opened.
 */
export function shouldOfferShare(
  state: ShareOfferState,
  sessionId: number,
  justFinished: boolean
): boolean {
  return (
    justFinished &&
    state.dismissStreak < SHARE_OFFER_MAX_DISMISSALS &&
    !state.answered.includes(sessionId)
  );
}

export function answerShareOffer(
  state: ShareOfferState,
  sessionId: number,
  answer: "share" | "dismiss"
): ShareOfferState {
  const answered = [...state.answered.filter((id) => id !== sessionId), sessionId].slice(
    -REMEMBERED
  );
  return {
    answered,
    dismissStreak: answer === "share" ? 0 : state.dismissStreak + 1
  };
}
