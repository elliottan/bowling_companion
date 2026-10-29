import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../db/bowlingDb";
import {
  addNextGameToSession,
  createSession,
  deleteFrame,
  deleteGame,
  deleteSession,
  getLiveActivityEnabled,
  resumeLiveActivity,
  saveFrame,
  setLiveActivityEnabled
} from "./bowlingRepository";
import { liveActivity } from "../lib/nativeLiveActivity";
import { isIOSApp } from "../lib/platform";
import type { PinNumber } from "../types/bowling";

vi.mock("./usageReporter", () => ({ reportGameFinished: vi.fn(async () => {}) }));
vi.mock("../lib/platform", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/platform")>()),
  isIOSApp: vi.fn(() => true)
}));
vi.mock("../lib/nativeLiveActivity", () => ({
  liveActivity: { show: vi.fn(), finish: vi.fn(), stop: vi.fn() }
}));

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

async function newGame(description = "League night") {
  const sessionId = await createSession({ date: "2026-10-29", alley_name: "Sunset Lanes", description });
  const gameId = await addNextGameToSession(sessionId);
  return { sessionId, gameId };
}

const strike = (n: number) => ({
  frame_number: n,
  shots: [{ pins_standing: [] as PinNumber[] }],
  is_strike: true,
  is_spare: false
});

describe("Live Activity wiring", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    vi.mocked(liveActivity.show).mockClear();
    vi.mocked(liveActivity.finish).mockClear();
    vi.mocked(liveActivity.stop).mockClear();
    vi.mocked(isIOSApp).mockReturnValue(true);
  });

  it("shows the game after a ball is saved, without making the save wait for it", async () => {
    const { gameId } = await newGame();
    await saveFrame(gameId, strike(1));
    // saveFrame has returned; the Lock Screen is brought up behind it.
    await settle();
    expect(liveActivity.show).toHaveBeenCalledTimes(1);
    const { state, gameId: sent } = vi.mocked(liveActivity.show).mock.calls[0][0];
    expect(sent).toBe(gameId);
    expect(state.label).toBe("League night");
    expect(state.location).toBe("Sunset Lanes");
    expect(state.game).toBe(1);
    expect(state.frames[0].marks).toEqual(["", "X"]);
  });

  it("ends the activity with the final score when the tenth frame is saved", async () => {
    const { gameId } = await newGame();
    for (let n = 1; n <= 9; n += 1) await saveFrame(gameId, strike(n));
    // Balls are seconds apart; let each one's Lock Screen update land first.
    await settle();
    await saveFrame(gameId, {
      frame_number: 10,
      shots: [{ pins_standing: [] }, { pins_standing: [] }, { pins_standing: [] }],
      is_strike: true,
      is_spare: false
    });
    await settle();
    expect(liveActivity.finish).toHaveBeenCalledTimes(1);
    expect(vi.mocked(liveActivity.finish).mock.calls[0][0].state.total).toBe(300);
  });

  it("takes the activity down when an undo empties the first frame", async () => {
    const { gameId } = await newGame();
    await saveFrame(gameId, strike(1));
    await deleteFrame(gameId, 1);
    await settle();
    expect(liveActivity.stop).toHaveBeenCalledWith(gameId);
  });

  it("shows the game again when an undo reopens a finished one", async () => {
    const { gameId } = await newGame();
    for (let n = 1; n <= 9; n += 1) await saveFrame(gameId, strike(n));
    const tenth = {
      frame_number: 10,
      shots: [{ pins_standing: [] as PinNumber[] }, { pins_standing: [] as PinNumber[] }, { pins_standing: [] as PinNumber[] }],
      is_strike: true,
      is_spare: false
    };
    await saveFrame(gameId, tenth);
    await saveFrame(gameId, { ...tenth, shots: tenth.shots.slice(0, 2) });
    await settle();
    expect(liveActivity.show).toHaveBeenCalled();
    expect(vi.mocked(liveActivity.show).mock.calls[vi.mocked(liveActivity.show).mock.calls.length - 1][0].state.done).toBe(false);
  });

  it("takes it down when the game, or its session, is deleted", async () => {
    const first = await newGame();
    await saveFrame(first.gameId, strike(1));
    await deleteGame(first.gameId);
    expect(liveActivity.stop).toHaveBeenCalledWith(first.gameId);

    const second = await newGame();
    await deleteSession(second.sessionId);
    expect(liveActivity.stop).toHaveBeenCalledWith(second.gameId);
  });

  it("does nothing, and reads nothing, off the iPhone app", async () => {
    vi.mocked(isIOSApp).mockReturnValue(false);
    const { gameId } = await newGame();
    await saveFrame(gameId, strike(1));
    await resumeLiveActivity(gameId);
    await settle();
    expect(liveActivity.show).not.toHaveBeenCalled();
    expect(liveActivity.finish).not.toHaveBeenCalled();
  });

  it("is on until the bowler turns it off, and turning it off takes it down", async () => {
    expect(await getLiveActivityEnabled()).toBe(true);
    await setLiveActivityEnabled(false);
    expect(await getLiveActivityEnabled()).toBe(false);
    expect(liveActivity.stop).toHaveBeenCalledWith();

    const { gameId } = await newGame();
    await saveFrame(gameId, strike(1));
    await settle();
    expect(liveActivity.show).not.toHaveBeenCalled();

    await setLiveActivityEnabled(true);
    await saveFrame(gameId, strike(2));
    await settle();
    expect(liveActivity.show).toHaveBeenCalledTimes(1);
  });

  it("resumes a half-bowled game when the scorer opens on it, and leaves a finished one", async () => {
    const half = await newGame();
    await saveFrame(half.gameId, strike(1));
    await settle();
    vi.mocked(liveActivity.show).mockClear();
    await resumeLiveActivity(half.gameId);
    expect(liveActivity.show).toHaveBeenCalledTimes(1);

    const done = await newGame();
    for (let n = 1; n <= 9; n += 1) await saveFrame(done.gameId, strike(n));
    await saveFrame(done.gameId, {
      frame_number: 10,
      shots: [{ pins_standing: [] }, { pins_standing: [] }, { pins_standing: [] }],
      is_strike: true,
      is_spare: false
    });
    await settle();
    vi.mocked(liveActivity.show).mockClear();
    vi.mocked(liveActivity.finish).mockClear();
    await resumeLiveActivity(done.gameId);
    expect(liveActivity.show).not.toHaveBeenCalled();
    expect(liveActivity.finish).not.toHaveBeenCalled();
  });
});
