/**
 * Which setup step to put in front of a user next, decided from what their
 * database is missing rather than from how many times they have opened the app.
 *
 * A step earns its place by being useful *now*: nothing is offered before the
 * data that makes it pay off exists (you are not asked to write lane notes for
 * an alley you have been to once), and everything retires itself the moment the
 * gap it names is filled. So this is not a tour with a progress bar, which is a
 * thing to get through; it is a list that is empty most of the time.
 *
 * Install and backup are deliberately absent. They have their own banners on
 * Home (ADR-067, ADR-068) and a second copy would only compete with them.
 */

export type NextStepKey = "arsenal" | "spare-lines" | "oil-pattern" | "lane-notes";

/** What the app knows about how furnished the user's data is. */
export interface OnboardingFacts {
  sessionCount: number;
  ballCount: number;
  /** Spare lines that carry an answer, not just the seeded pin set. */
  answeredSpareLines: number;
  oilPatternCount: number;
  /** Alleys bowled at more than once. A place you keep going back to is the
   *  only place a lane note is worth writing. */
  repeatAlleyCount: number;
  laneNoteCount: number;
  dismissed: readonly NextStepKey[];
}

/** Two at a time. A card that lists everything undone is a wall, and a wall on
 *  Home gets scrolled past instead of read (DESIGN-LANGUAGE §5). */
export const NEXT_STEP_LIMIT = 2;

/** Ordered by what pays off soonest, so the cap always keeps the best two. */
const RULES: Array<{ key: NextStepKey; open: (f: OnboardingFacts) => boolean }> = [
  // Before anything else: a shot with no ball on it cannot be compared to the
  // next one, and every line, drift and carry number downstream is per ball.
  { key: "arsenal", open: (f) => f.ballCount === 0 },
  // Seeded pin sets exist from the first visit; an answer does not. Asked only
  // once a session is on record, so day one is a single question.
  { key: "spare-lines", open: (f) => f.sessionCount >= 1 && f.answeredSpareLines === 0 },
  { key: "oil-pattern", open: (f) => f.sessionCount >= 1 && f.oilPatternCount === 0 },
  { key: "lane-notes", open: (f) => f.repeatAlleyCount >= 1 && f.laneNoteCount === 0 }
];

export function nextSteps(facts: OnboardingFacts): NextStepKey[] {
  const dismissed = new Set(facts.dismissed);
  return RULES.filter((r) => !dismissed.has(r.key) && r.open(facts))
    .map((r) => r.key)
    .slice(0, NEXT_STEP_LIMIT);
}

/** Settings key holding the ISO time a step was dismissed. Per step, so waving
 *  off one does not silence the others. */
export function nextStepDismissedKey(step: NextStepKey): string {
  return `next_step_dismissed:${step}`;
}
