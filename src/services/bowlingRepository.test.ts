import { beforeEach, describe, expect, it } from "vitest";
import { db, linkLegacySessionOilPatterns } from "../db/bowlingDb";
import {
  addNextGameToSession,
  addGameToSession,
  createSession,
  deleteGame,
  deleteSession,
  getBackupNudgeState,
  getDriftModel,
  getResumableForSession,
  getSessionDetails,
  getSessionHistory,
  getSetting,
  saveFrame,
  setBackupNudgeSnoozedUntil,
  setDriftModel,
  setSetting,
  updateGameNotes
} from "./bowlingRepository";
import { DEFAULT_DRIFT_MODEL } from "../lib/driftModel";

describe("bowlingRepository", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("creates a session, adds a game, saves a frame, and reads history", async () => {
    const sessionId = Number(await createSession({
      date: "2026-05-26",
      alley_name: "Test Lanes",
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

  it("resolves the oil pattern name and link from oil_pattern_id", async () => {
    const patternId = Number(
      await db.oil_patterns.add({ name: "Kegel Main Street", url: "https://example.com/ms.pdf" })
    );
    const sessionId = Number(
      await createSession({ date: "2026-05-26", alley_name: "Test Lanes", oil_pattern_id: patternId })
    );

    const details = await getSessionDetails(sessionId);
    expect(details?.session.oil_pattern).toBe("Kegel Main Street");
    expect(details?.session.oil_pattern_url).toBe("https://example.com/ms.pdf");

    // Renaming the pattern is enough — nothing is copied onto the session.
    await db.oil_patterns.update(patternId, { name: "Main Street" });
    expect((await getSessionDetails(sessionId))?.session.oil_pattern).toBe("Main Street");
  });

  it("links legacy sessions that carry only the pattern name", async () => {
    await db.sessions.add({
      date: "2026-05-26",
      alley_name: "Test Lanes",
      oil_pattern: "House Shot"
    } as never);

    await linkLegacySessionOilPatterns(db.sessions, db.oil_patterns);

    const [session] = await db.sessions.toArray();
    const [pattern] = await db.oil_patterns.toArray();
    expect(pattern.name).toBe("House Shot");
    expect(session.oil_pattern_id).toBe(pattern.id);
    expect((await getSessionDetails(session.id!))?.session.oil_pattern).toBe("House Shot");
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

describe("drift model setting", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("defaults when unset, and materializes drift_model idempotently", async () => {
    const first = await getDriftModel();
    expect(first).toEqual(DEFAULT_DRIFT_MODEL);

    // Idempotency: the migration write-back means the underlying setting now
    // exists, and a second call returns the same result without re-migrating.
    expect(await getSetting("drift_model")).toBeDefined();
    const second = await getDriftModel();
    expect(second).toEqual(DEFAULT_DRIFT_MODEL);
  });

  it("migrates a legacy laydown_offset into release_offset", async () => {
    await setSetting("laydown_offset", "10");
    expect(await getDriftModel()).toEqual({ ...DEFAULT_DRIFT_MODEL, release_offset: 10 });
  });

  it("returns an already-valid drift_model as-is, leaving laydown_offset untouched", async () => {
    const model = { ...DEFAULT_DRIFT_MODEL, release_offset: 3, drift: { outside: 1, middle: 0, inside: -1 } };
    await setSetting("drift_model", JSON.stringify(model));
    await setSetting("laydown_offset", "10");
    expect(await getDriftModel()).toEqual(model);
    expect(await getSetting("laydown_offset")).toBe("10");
  });

  it("falls back to the legacy-or-default path on a corrupted drift_model", async () => {
    await setSetting("drift_model", "not json");
    expect(await getDriftModel()).toEqual(DEFAULT_DRIFT_MODEL);

    await setSetting("drift_model", JSON.stringify({ ...DEFAULT_DRIFT_MODEL, outside_max: 30, inside_min: 25 }));
    await setSetting("laydown_offset", "8");
    expect(await getDriftModel()).toEqual({ ...DEFAULT_DRIFT_MODEL, release_offset: 8 });
  });

  it("round-trips a stored model via setDriftModel", async () => {
    const model = { ...DEFAULT_DRIFT_MODEL, release_offset: 4.5 };
    await setDriftModel(model);
    expect(await getDriftModel()).toEqual(model);
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
