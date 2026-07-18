import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../db/bowlingDb";
import {
  addNextGameToSession,
  addGameToSession,
  createSession,
  deleteGame,
  deleteSession,
  getBackupNudgeState,
  getLaydownOffset,
  getResumableForSession,
  getSessionDetails,
  getSessionHistory,
  saveFrame,
  setBackupNudgeSnoozedUntil,
  setLaydownOffset,
  setSetting,
  updateGameNotes
} from "./bowlingRepository";

describe("bowlingRepository", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("creates a session, adds a game, saves a frame, and reads history", async () => {
    const sessionId = Number(await createSession({
      date: "2026-05-26",
      alley_name: "Test Lanes",
      oil_pattern: "House",
      general_notes: "Fresh pair"
    }));
    const gameId = Number(await addGameToSession(sessionId, {
      game_number: 1,
      lane_number: "12"
    }));

    await saveFrame(gameId, {
      frame_number: 1,
      shots: [{ pins_standing: [] }],
      is_strike: true,
      is_spare: false
    });

    const history = await getSessionHistory();

    expect(history).toHaveLength(1);
    expect(history[0].session.alley_name).toBe("Test Lanes");
    expect(history[0].games[0].frames[0].is_strike).toBe(true);
  });

  it("loads session details and adds sequential games", async () => {
    const sessionId = Number(
      await createSession({
        date: "2026-05-26",
        alley_name: "Test Lanes"
      })
    );

    await addGameToSession(sessionId, {
      game_number: 1,
      lane_number: "7"
    });
    await addNextGameToSession(sessionId, { lanes: ["8"], start_lane: "8" });

    const details = await getSessionDetails(sessionId);

    expect(details?.games).toHaveLength(2);
    expect(details?.games[0].game_number).toBe(1);
    expect(details?.games[1].game_number).toBe(2);
    expect(details?.games[1].lane_number).toBe("8");
  });

  it("saves and clears per-game notes", async () => {
    const sessionId = await createSession({
      date: "2026-05-26",
      alley_name: "Test Lanes"
    });
    const gameId = await addGameToSession(sessionId, { game_number: 1 });

    await updateGameNotes(gameId, "  Switched to urethane  ");
    let details = await getSessionDetails(sessionId);
    expect(details?.games[0].notes).toBe("Switched to urethane");

    // Empty string clears the note rather than storing whitespace.
    await updateGameNotes(gameId, "   ");
    details = await getSessionDetails(sessionId);
    expect(details?.games[0].notes).toBeUndefined();
  });

  it("deletes a session with all its games and frames", async () => {
    const sessionId = await createSession({ date: "2026-05-26", alley_name: "Test Lanes" });
    const gameId = await addGameToSession(sessionId, { game_number: 1 });
    await saveFrame(gameId, {
      frame_number: 1,
      shots: [{ pins_standing: [] }],
      is_strike: true,
      is_spare: false
    });

    await deleteSession(sessionId);

    expect(await getSessionHistory()).toHaveLength(0);
    expect(await db.games.where("session_id").equals(sessionId).count()).toBe(0);
    expect(await db.frames.where("game_id").equals(gameId).count()).toBe(0);
  });

  it("deletes a middle game and renumbers the survivors contiguously", async () => {
    const sessionId = await createSession({ date: "2026-05-26", alley_name: "Test Lanes" });
    await addGameToSession(sessionId, { game_number: 1 });
    const g2 = await addGameToSession(sessionId, { game_number: 2 });
    await addGameToSession(sessionId, { game_number: 3 });

    const result = await deleteGame(g2);

    expect(result.sessionDeleted).toBe(false);
    const details = await getSessionDetails(sessionId);
    expect(details?.games).toHaveLength(2);
    expect(details?.games.map((g) => g.game_number)).toEqual([1, 2]);
  });

  it("deletes the session when its only game is deleted", async () => {
    const sessionId = await createSession({ date: "2026-05-26", alley_name: "Test Lanes" });
    const gameId = await addGameToSession(sessionId, { game_number: 1 });

    const result = await deleteGame(gameId);

    expect(result.sessionDeleted).toBe(true);
    expect(await getSessionHistory()).toHaveLength(0);
  });

  it("returns null from getResumableForSession when every game is finished", async () => {
    const sessionId = await createSession({ date: "2026-05-26", alley_name: "Test Lanes" });
    const gameId = await addGameToSession(sessionId, { game_number: 1 });
    await db.games.update(gameId, { final_score: 150 });

    expect(await getResumableForSession(sessionId)).toBeNull();
  });

  it("returns the unfinished game from getResumableForSession", async () => {
    const sessionId = await createSession({ date: "2026-05-26", alley_name: "Test Lanes" });
    const g1 = await addGameToSession(sessionId, { game_number: 1 });
    await db.games.update(g1, { final_score: 150 });
    await addGameToSession(sessionId, { game_number: 2 });

    const resumable = await getResumableForSession(sessionId);

    expect(resumable).not.toBeNull();
    expect(resumable?.gameNumber).toBe(2);
  });
});

describe("laydown offset setting", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("defaults to 6 when unset", async () => {
    expect(await getLaydownOffset()).toBe(6);
  });
  it("round-trips a stored value", async () => {
    await setLaydownOffset(4.5);
    expect(await getLaydownOffset()).toBe(4.5);
  });
  it("falls back to the default on a garbage stored value", async () => {
    await setSetting("laydown_offset", "banana");
    expect(await getLaydownOffset()).toBe(6);
  });
});

describe("backup nudge state", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("assembles never-backed-up state", async () => {
    await createSession({ date: "2026-07-19", alley_name: "Test Lanes" });

    const state = await getBackupNudgeState();

    expect(state.lastBackupAt).toBeNull();
    expect(state.sessionsAtLastBackup).toBe(0);
    expect(state.totalSessions).toBe(1);
    expect(state.snoozedUntil).toBeNull();
  });

  it("assembles backed-up state", async () => {
    await createSession({ date: "2026-07-19", alley_name: "Test Lanes" });
    await createSession({ date: "2026-07-19", alley_name: "Other Lanes" });
    await setSetting("last_backup_at", "2026-07-01T00:00:00.000Z");
    await setSetting("sessions_at_last_backup", "1");

    const state = await getBackupNudgeState();

    expect(state.lastBackupAt).toBe("2026-07-01T00:00:00.000Z");
    expect(state.sessionsAtLastBackup).toBe(1);
    expect(state.totalSessions).toBe(2);
  });

  it("assembles snoozed state", async () => {
    await setBackupNudgeSnoozedUntil("2026-07-26T00:00:00.000Z");

    const state = await getBackupNudgeState();

    expect(state.snoozedUntil).toBe("2026-07-26T00:00:00.000Z");
  });
});
