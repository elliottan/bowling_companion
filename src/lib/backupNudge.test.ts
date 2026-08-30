import { describe, expect, it } from "vitest";
import {
  backupUrgency,
  describeAge,
  nudgePolicy,
  shouldShowBackupNudge,
  snoozeMs,
  type BackupNudgeState
} from "./backupNudge";

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

describe("shouldShowBackupNudge, installed", () => {
  it("never backed up + 0 sessions -> false", () => {
    expect(shouldShowBackupNudge(state({ totalSessions: 0 }), true)).toBe(false);
  });

  it("never backed up + 1 session -> false", () => {
    expect(shouldShowBackupNudge(state({ totalSessions: 1 }), true)).toBe(false);
  });

  it("never backed up + 2 sessions -> false", () => {
    expect(shouldShowBackupNudge(state({ totalSessions: 2 }), true)).toBe(false);
  });

  it("never backed up + 3 sessions -> true", () => {
    expect(shouldShowBackupNudge(state({ totalSessions: 3 }), true)).toBe(true);
  });

  it("backed up once + 2 more sessions -> false", () => {
    expect(
      shouldShowBackupNudge(state({ lastBackupAt: "2026-07-01T00:00:00.000Z", sessionsAtLastBackup: 5, totalSessions: 7 }), true)
    ).toBe(false);
  });

  it("backed up once + 3 more sessions -> true", () => {
    expect(
      shouldShowBackupNudge(state({ lastBackupAt: "2026-07-01T00:00:00.000Z", sessionsAtLastBackup: 5, totalSessions: 8 }), true)
    ).toBe(true);
  });

  it("snoozed and not expired -> false even if otherwise due", () => {
    expect(
      shouldShowBackupNudge(state({ totalSessions: 5, snoozedUntil: "2026-07-20T00:00:00.000Z" }), true)
    ).toBe(false);
  });

  it("snooze expired -> true again if otherwise due", () => {
    expect(
      shouldShowBackupNudge(state({ totalSessions: 5, snoozedUntil: "2026-07-18T00:00:00.000Z" }), true)
    ).toBe(true);
  });
});

describe("backupUrgency, installed", () => {
  const at = (over: Partial<BackupNudgeState> = {}): BackupNudgeState => ({
    lastBackupAt: "2026-06-01T00:00:00.000Z",
    sessionsAtLastBackup: 10,
    totalSessions: 10,
    snoozedUntil: null,
    now: new Date("2026-06-08T00:00:00.000Z"),
    ...over
  });

  it("says nothing when everything is backed up", () => {
    expect(backupUrgency(at(), true)).toBe("none");
  });

  it("waits for a few sessions before asking at all", () => {
    expect(backupUrgency(at({ totalSessions: 12 }), true)).toBe("none");
    expect(backupUrgency(at({ totalSessions: 13 }), true)).toBe("due");
  });

  it("honours a snooze while it is only due", () => {
    const snoozed = at({ totalSessions: 13, snoozedUntil: "2026-06-30T00:00:00.000Z" });
    expect(backupUrgency(snoozed, true)).toBe("none");
  });

  it("stops honouring the snooze once enough has piled up", () => {
    // The user who has been snoozing since March is the one who loses a season.
    const snoozed = at({ totalSessions: 18, snoozedUntil: "2026-12-30T00:00:00.000Z" });
    expect(backupUrgency(snoozed, true)).toBe("overdue");
  });

  it("goes overdue on age alone, given there is something to lose", () => {
    const stale = at({
      totalSessions: 14,
      lastBackupAt: "2026-01-01T00:00:00.000Z",
      snoozedUntil: "2026-12-30T00:00:00.000Z"
    });
    expect(backupUrgency(stale, true)).toBe("overdue");
  });

  it("stays quiet on an old backup when nothing has been bowled since", () => {
    const stale = at({ totalSessions: 10, lastBackupAt: "2026-01-01T00:00:00.000Z" });
    expect(backupUrgency(stale, true)).toBe("none");
  });

  it("counts every session when there has never been a backup", () => {
    expect(backupUrgency(at({ lastBackupAt: null, totalSessions: 3 }), true)).toBe("due");
    expect(backupUrgency(at({ lastBackupAt: null, totalSessions: 8 }), true)).toBe("overdue");
  });
});

describe("backupUrgency, in a browser tab", () => {
  // Backed up two days ago, not seven: the installed fixture's seven-day-old
  // backup is already past the tab policy's five-day line, so it would answer
  // "overdue" for every case here and hide what the counts do.
  const at = (over: Partial<BackupNudgeState> = {}): BackupNudgeState => ({
    lastBackupAt: "2026-06-06T00:00:00.000Z",
    sessionsAtLastBackup: 10,
    totalSessions: 10,
    snoozedUntil: null,
    now: new Date("2026-06-08T00:00:00.000Z"),
    ...over
  });

  it("still says nothing when everything is backed up", () => {
    expect(backupUrgency(at(), false)).toBe("none");
  });

  it("asks after a single unsaved session, where installed waits for three", () => {
    expect(backupUrgency(at({ totalSessions: 11 }), false)).toBe("due");
    expect(backupUrgency(at({ totalSessions: 11 }), true)).toBe("none");
  });

  it("goes overdue at two sessions, where installed waits for eight", () => {
    expect(backupUrgency(at({ totalSessions: 12 }), false)).toBe("overdue");
    expect(backupUrgency(at({ totalSessions: 12 }), true)).toBe("none");
  });

  it("goes overdue inside the seven days iOS gives it, not after", () => {
    // Five days stale with one session unsaved. Installed, sixty days is the
    // line and this is silent; in a tab the data can be evicted on day seven,
    // so the warning has to have landed already.
    const stale = at({
      totalSessions: 11,
      lastBackupAt: "2026-06-01T00:00:00.000Z",
      snoozedUntil: "2026-12-30T00:00:00.000Z"
    });
    expect(backupUrgency(stale, false)).toBe("overdue");
    expect(backupUrgency(stale, true)).toBe("none");
  });

  it("stays quiet on an old backup when nothing has been bowled since", () => {
    // The age rule must not fire on its own, or a user who backs up and then
    // stops bowling gets nagged for ever about nothing.
    const stale = at({ totalSessions: 10, lastBackupAt: "2026-01-01T00:00:00.000Z" });
    expect(backupUrgency(stale, false)).toBe("none");
  });

  it("honours a snooze while it is only due", () => {
    const snoozed = at({ totalSessions: 11, snoozedUntil: "2026-06-30T00:00:00.000Z" });
    expect(backupUrgency(snoozed, false)).toBe("none");
  });
});

describe("nudgePolicy", () => {
  it("warns before the eviction deadline rather than on it", () => {
    // Seven days is when iOS clears the data. A reminder that fires on the
    // deadline fires too late to act on.
    expect(nudgePolicy(false).overdueDays).toBeLessThan(7);
  });

  it("pushes harder in a tab than installed, on every axis", () => {
    const tab = nudgePolicy(false);
    const app = nudgePolicy(true);
    expect(tab.due).toBeLessThan(app.due);
    expect(tab.overdue).toBeLessThan(app.overdue);
    expect(tab.overdueDays).toBeLessThan(app.overdueDays);
    expect(tab.snoozeDays).toBeLessThan(app.snoozeDays);
  });

  it("snoozes for shorter in a tab than the eviction window", () => {
    expect(snoozeMs(false)).toBe(2 * 24 * 60 * 60 * 1000);
    expect(snoozeMs(true)).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe("describeAge", () => {
  const now = new Date("2026-06-30T00:00:00.000Z");

  it("says never when there has been no backup", () => {
    expect(describeAge(null, now)).toBe("never");
  });

  it("reads in the units a person would use", () => {
    expect(describeAge("2026-06-30T00:00:00.000Z", now)).toBe("today");
    expect(describeAge("2026-06-29T00:00:00.000Z", now)).toBe("yesterday");
    expect(describeAge("2026-06-25T00:00:00.000Z", now)).toBe("5 days ago");
    expect(describeAge("2026-06-09T00:00:00.000Z", now)).toBe("3 weeks ago");
    expect(describeAge("2026-03-30T00:00:00.000Z", now)).toBe("3 months ago");
  });

  it("does not go negative on a clock that has moved backwards", () => {
    expect(describeAge("2026-07-30T00:00:00.000Z", now)).toBe("today");
  });
});
