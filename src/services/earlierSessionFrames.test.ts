import { liveQuery } from "dexie";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../db/bowlingDb";
import { earlierSessionFrames } from "../lib/shotSeeding";
import type { PinNumber, Session } from "../types/bowling";
import {
  addGameToSession,
  createSession,
  getEarlierSessionFrames,
  getSessionHistory,
  saveFrame
} from "./bowlingRepository";

/** A session with one game whose first frame leaves `pins`, then makes it. */
async function night(date: string, alley: string, pins: PinNumber[], stance: number, oil_pattern_id?: number) {
  const sessionId = await createSession({ date, alley_name: alley, oil_pattern_id });
  const gameId = await addGameToSession(sessionId, { game_number: 1 });
  await saveFrame(gameId, {
    frame_number: 1,
    is_strike: false,
    is_spare: true,
    shots: [{ pins_standing: pins }, { pins_standing: [], intended: { stance, target: 10 } }]
  });
  return { sessionId, gameId };
}

/**
 * The scorer seeds a leave from earlier nights at the same house on the same
 * pattern (ADR-140). It used to load every frame ever bowled to find them, and
 * to load them again after every ball.
 */
describe("getEarlierSessionFrames", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("finds exactly the frames the whole-history search did", async () => {
    await night("2026-10-01", "Home Lanes", [10], 30);
    await night("2026-10-08", " home lanes ", [7], 12);
    await night("2026-10-08", "Away Lanes", [10], 25);
    await night("2026-10-15", "Home Lanes", [10], 31, 4);
    await night("2026-12-01", "Home Lanes", [10], 33);
    const { sessionId } = await night("2026-11-01", "Home Lanes", [10], 0);
    const current = (await db.sessions.get(sessionId)) as Session;

    const fromHistory = earlierSessionFrames(await getSessionHistory(), current);
    const targeted = await getEarlierSessionFrames(current);

    expect(targeted).toEqual(fromHistory);
    // The two earlier nights at Home Lanes with no pattern, oldest first.
    expect(targeted.map((f) => f.shots[1].intended?.stance)).toEqual([30, 12]);
  });

  it("finds nothing for a session with no alley named", async () => {
    await night("2026-10-01", "", [10], 30);
    expect(await getEarlierSessionFrames({ id: 99, date: "2026-11-01", alley_name: " " })).toEqual([]);
  });

  it("is not re-run by a ball saved in the current session", async () => {
    await night("2026-10-01", "Home Lanes", [10], 30);
    const { sessionId, gameId } = await night("2026-11-01", "Home Lanes", [10], 0);
    const current = (await db.sessions.get(sessionId)) as Session;

    let runs = 0;
    const subscription = liveQuery(() => {
      runs += 1;
      return getEarlierSessionFrames(current);
    }).subscribe({});
    await waitUntil(() => runs >= 1);
    // Let the first run settle before counting what a save does.
    await new Promise((r) => setTimeout(r, 50));
    const settled = runs;

    for (let frame = 2; frame <= 5; frame++) {
      await saveFrame(gameId, {
        frame_number: frame,
        is_strike: true,
        is_spare: false,
        shots: [{ pins_standing: [] }]
      });
    }
    await new Promise((r) => setTimeout(r, 50));
    expect(runs).toBe(settled);

    // An earlier night at the house is what it reads, so an edit there does.
    const earlier = await db.games.where("session_id").notEqual(sessionId).first();
    await saveFrame(earlier!.id!, {
      frame_number: 2,
      is_strike: true,
      is_spare: false,
      shots: [{ pins_standing: [] }]
    });
    await waitUntil(() => runs > settled);
    subscription.unsubscribe();
  });
});

async function waitUntil(check: () => boolean) {
  for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 10));
  expect(check()).toBe(true);
}
