import { db } from "../db/bowlingDb";
import { FEEDBACK_PROMPT_KEY } from "../lib/feedbackPrompt";
import {
  nextStepDismissedKey,
  type NextStepKey,
  type OnboardingFacts
} from "../lib/onboarding";

const ALL_STEPS: NextStepKey[] = ["arsenal", "spare-lines", "oil-pattern", "lane-notes"];

/**
 * The counts the next-step rules run on, read in one pass.
 *
 * Counts, not rows: this runs live on Home and the only question asked of each
 * table is whether it is empty, so pulling the rows to find that out would be
 * the mistake ADR-066 already fixed once elsewhere. Sessions are the exception,
 * because "an alley you keep going back to" cannot be counted by the index.
 */
export async function getOnboardingFacts(): Promise<OnboardingFacts> {
  const [sessions, ballCount, spareLines, oilPatternCount, laneNoteCount, settings] =
    await Promise.all([
      db.sessions.toArray(),
      db.balls.count(),
      db.spare_lines.toArray(),
      db.oil_patterns.count(),
      db.lane_notes.count(),
      db.settings.bulkGet(ALL_STEPS.map(nextStepDismissedKey))
    ]);

  const visits = new Map<string, number>();
  for (const s of sessions) {
    const alley = s.alley_name?.trim().toLowerCase();
    if (alley) visits.set(alley, (visits.get(alley) ?? 0) + 1);
  }

  return {
    sessionCount: sessions.length,
    ballCount,
    // A seeded row carries a pin set and nothing else. It counts once it holds
    // an answer: an absolute line, or a move off the strike ball's own line.
    answeredSpareLines: spareLines.filter((l) => l.line || l.strike_offset).length,
    oilPatternCount,
    laneNoteCount,
    repeatAlleyCount: [...visits.values()].filter((n) => n > 1).length,
    dismissed: ALL_STEPS.filter((_, i) => settings[i] !== undefined)
  };
}

/** Wave one step off for good. The card reads the same keys it writes, so the
 *  live query on Home picks the change up without being told. */
export async function dismissNextStep(step: NextStepKey): Promise<void> {
  await db.settings.put({ key: nextStepDismissedKey(step), value: new Date().toISOString() });
}

/**
 * Whether the one-time feedback ask is still owed, and the session count the
 * rule reads. Counted, not listed: the rule only asks how many nights there
 * have been.
 */
export async function getFeedbackPromptFacts(): Promise<{
  sessionCount: number;
  done: boolean;
}> {
  const [sessionCount, row] = await Promise.all([
    db.sessions.count(),
    db.settings.get(FEEDBACK_PROMPT_KEY)
  ]);
  return { sessionCount, done: row !== undefined };
}

/** Retire the ask for good, whether they answered it or waved it off. Both are
 *  an answer, and asking a second time is how a prompt gets ignored. */
export async function dismissFeedbackPrompt(): Promise<void> {
  await db.settings.put({ key: FEEDBACK_PROMPT_KEY, value: new Date().toISOString() });
}
