/**
 * Pure trigger logic for the "back up your data" dashboard nudge. Count-based
 * (not date-based) because session `date` is free-text/user-editable and
 * unreliable as a signal here.
 */

export interface BackupNudgeState {
  lastBackupAt: string | null;
  sessionsAtLastBackup: number;
  totalSessions: number;
  snoozedUntil: string | null;
  now: Date;
}

const NUDGE_THRESHOLD = 3;

export function shouldShowBackupNudge(state: BackupNudgeState): boolean {
  if (state.snoozedUntil && state.now < new Date(state.snoozedUntil)) {
    return false;
  }

  if (state.lastBackupAt === null) {
    return state.totalSessions >= NUDGE_THRESHOLD;
  }

  return state.totalSessions - state.sessionsAtLastBackup >= NUDGE_THRESHOLD;
}
