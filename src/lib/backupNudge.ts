/**
 * Pure trigger logic for the "back up your data" dashboard nudge. Count-based
 * (not date-based) for the sessions half, because session `date` is
 * free-text/user-editable and unreliable as a signal here. The overdue half is
 * date-based on `lastBackupAt`, which the app writes itself and can trust.
 *
 * Every threshold is a function of whether the app is installed: see
 * `nudgePolicy` and ADR-068.
 */

export interface BackupNudgeState {
  lastBackupAt: string | null;
  sessionsAtLastBackup: number;
  totalSessions: number;
  snoozedUntil: string | null;
  now: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How hard to push, and it depends entirely on where the app is running.
 *
 * Installed to the home screen, storage is durable and the only real risk is a
 * lost or wiped phone, so the app can afford to ask politely and rarely. In a
 * browser tab it cannot: iOS Safari clears script-writable storage for a site
 * the user has not opened in seven days (ADR-067), so the nudge has to land
 * inside that window or it is warning about data that is already gone.
 *
 * `overdueDays` is five, not seven, deliberately. Seven is the deadline; a
 * reminder that fires on the deadline fires too late to act on.
 */
export interface NudgePolicy {
  /** Sessions since the last backup before the nudge appears at all. */
  due: number;
  /** Sessions since the last backup after which snoozing stops working. */
  overdue: number;
  /** Days since the last backup after which snoozing stops working, given
   *  there is anything new to lose. */
  overdueDays: number;
  /** How long Later buys, in days. */
  snoozeDays: number;
}

const INSTALLED_POLICY: NudgePolicy = { due: 3, overdue: 8, overdueDays: 60, snoozeDays: 7 };
const BROWSER_POLICY: NudgePolicy = { due: 1, overdue: 2, overdueDays: 5, snoozeDays: 2 };

export function nudgePolicy(installed: boolean): NudgePolicy {
  return installed ? INSTALLED_POLICY : BROWSER_POLICY;
}

/** Milliseconds Later buys, for callers writing the snooze timestamp. */
export function snoozeMs(installed: boolean): number {
  return nudgePolicy(installed).snoozeDays * DAY_MS;
}

/**
 * How loudly to ask.
 *
 * `overdue` ignores the snooze. A dismissable reminder that can be dismissed
 * for ever is a reminder that reaches nobody who needs it: the user most
 * likely to lose a season is the one who has been snoozing since March
 * (ADR-067).
 */
export type BackupUrgency = "none" | "due" | "overdue";

export function backupUrgency(state: BackupNudgeState, installed: boolean): BackupUrgency {
  const policy = nudgePolicy(installed);
  const behind = state.lastBackupAt === null
    ? state.totalSessions
    : state.totalSessions - state.sessionsAtLastBackup;

  if (behind <= 0) return "none";

  if (behind >= policy.overdue) return "overdue";
  if (state.lastBackupAt !== null && daysSince(state.lastBackupAt, state.now) >= policy.overdueDays) {
    return "overdue";
  }

  if (state.snoozedUntil && state.now < new Date(state.snoozedUntil)) return "none";
  return behind >= policy.due ? "due" : "none";
}

/** Kept for callers that only want a yes or no. */
export function shouldShowBackupNudge(state: BackupNudgeState, installed: boolean): boolean {
  return backupUrgency(state, installed) !== "none";
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
