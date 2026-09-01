/**
 * When to ask a bowler what they think, and how to never ask twice.
 *
 * Three finished sessions, not three games: three nights out means the habit
 * stuck and they have met the app's rough edges, which is the only point at
 * which an answer is worth more than the interruption cost. Asked once, ever.
 * A prompt that comes back is a prompt people learn to dismiss without reading.
 *
 * It is not a `NextStep`: those name a gap in the user's data and retire when
 * the gap is filled, and there is no gap here. It sits with the install and
 * backup banners instead, as its own thing on Home.
 */

/** Nights out before the ask. */
export const FEEDBACK_PROMPT_SESSIONS = 3;

/**
 * The settings key holding the ISO time the prompt was answered or waved off.
 *
 * In `settings`, so it rides in a backup and comes back with a restore: moving
 * to a new phone must not re-ask someone who already answered. A fresh install
 * with no restore is a genuinely new start, and asking there is correct.
 */
export const FEEDBACK_PROMPT_KEY = "feedback_prompt_done";

export function shouldAskForFeedback(sessionCount: number, done: boolean): boolean {
  return !done && sessionCount >= FEEDBACK_PROMPT_SESSIONS;
}
