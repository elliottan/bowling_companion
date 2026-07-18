import { describe, expect, it } from "vitest";
import { shouldShowBackupNudge, type BackupNudgeState } from "./backupNudge";

const NOW = new Date("2026-07-19T12:00:00.000Z");

function state(overrides: Partial<BackupNudgeState>): BackupNudgeState {
  return {
    lastBackupAt: null,
    sessionsAtLastBackup: 0,
    totalSessions: 0,
    snoozedUntil: null,
    now: NOW,
    ...overrides
  };
}

describe("shouldShowBackupNudge", () => {
  it("never backed up + 0 sessions -> false", () => {
    expect(shouldShowBackupNudge(state({ totalSessions: 0 }))).toBe(false);
  });

  it("never backed up + 1 session -> false", () => {
    expect(shouldShowBackupNudge(state({ totalSessions: 1 }))).toBe(false);
  });

  it("never backed up + 2 sessions -> false", () => {
    expect(shouldShowBackupNudge(state({ totalSessions: 2 }))).toBe(false);
  });

  it("never backed up + 3 sessions -> true", () => {
    expect(shouldShowBackupNudge(state({ totalSessions: 3 }))).toBe(true);
  });

  it("backed up once + 2 more sessions -> false", () => {
    expect(
      shouldShowBackupNudge(
        state({ lastBackupAt: "2026-07-01T00:00:00.000Z", sessionsAtLastBackup: 5, totalSessions: 7 })
      )
    ).toBe(false);
  });

  it("backed up once + 3 more sessions -> true", () => {
    expect(
      shouldShowBackupNudge(
        state({ lastBackupAt: "2026-07-01T00:00:00.000Z", sessionsAtLastBackup: 5, totalSessions: 8 })
      )
    ).toBe(true);
  });

  it("snoozed and not expired -> false even if otherwise due", () => {
    expect(
      shouldShowBackupNudge(
        state({ totalSessions: 5, snoozedUntil: "2026-07-20T00:00:00.000Z" })
      )
    ).toBe(false);
  });

  it("snooze expired -> true again if otherwise due", () => {
    expect(
      shouldShowBackupNudge(
        state({ totalSessions: 5, snoozedUntil: "2026-07-18T00:00:00.000Z" })
      )
    ).toBe(true);
  });
});
