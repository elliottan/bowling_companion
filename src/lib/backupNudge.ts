/**
 * Pure trigger logic for the "back up your data" dashboard nudge. Count-based
 * (not date-based) for the sessions half, because session `date` is
 * free-text/user-editable and unreliable as a signal here. The overdue half is
 * date-based on `lastBackupAt`, which the app writes itself and can trust.
 */

export interface BackupNudgeState {
  lastBackupAt: string | null;
  sessionsAtLastBackup: number;
  totalSessions: number;
  snoozedUntil: string | null;
  now: Date;
}

/** Sessions since the last backup before the nudge appears at all. */
const NUDGE_THRESHOLD = 3;
/** Sessions since the last backup after which snoozing stops working. */
const OVERDUE_SESSIONS = 8;
/** Days since the last backup after which snoozing stops working, given there
 *  is anything new to lose. */
const OVERDUE_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How loudly to ask.
 *
 * `overdue` ignores the snooze. A dismissable reminder that can be dismissed
 * for ever is a reminder that reaches nobody who needs it: the user most
 * likely to lose a season is the one who has been snoozing since March
 * (ADR-067).
 */
export type BackupUrgency = "none" | "due" | "overdue";

export function backupUrgency(state: BackupNudgeState): BackupUrgency {
  const behind = state.lastBackupAt === null
    ? state.totalSessions
    : state.totalSessions - state.sessionsAtLastBackup;

  if (behind <= 0) return "none";

  if (behind >= OVERDUE_SESSIONS) return "overdue";
  if (state.lastBackupAt !== null && daysSince(state.lastBackupAt, state.now) >= OVERDUE_DAYS) {
    return "overdue";
  }

  if (state.snoozedUntil && state.now < new Date(state.snoozedUntil)) return "none";
  return behind >= NUDGE_THRESHOLD ? "due" : "none";
}

/** Kept for callers that only want a yes or no. */
export function shouldShowBackupNudge(state: BackupNudgeState): boolean {
  return backupUrgency(state) !== "none";
}

/** Whole days between an ISO timestamp and now. Negative clocks read as 0. */
export function daysSince(iso: string, now: Date): number {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.floor((now.getTime() - then) / DAY_MS));
}

/** "today", "3 days ago", "6 weeks ago": how long since a backup, in words. */
export function describeAge(iso: string | null, now: Date): string {
  if (iso === null) return "never";
  const days = daysSince(iso, now);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}
