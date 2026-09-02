import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActiveSessionView } from "./ActiveSessionView";
import { db } from "../db/bowlingDb";
import { addGameToSession, createSession, saveFrame } from "../services/bowlingRepository";

function renderSession(sessionId: number) {
  render(
    <ActiveSessionView
      sessionId={sessionId}
      onBack={vi.fn()}
      onSessionDeleted={vi.fn()}
      onOpenArsenal={vi.fn()}
    />
  );
}

describe("ActiveSessionView", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  /**
   * A session with no game is a session waiting for one. It used to offer only
   * Back, which leaves the bowler standing on the approach with nowhere to put
   * the shot they are about to throw.
   */
  it("offers to add a game when the session has none", async () => {
    const sessionId = Number(await createSession({ date: "2026-05-27", alley_name: "Empty Lanes" }));

    renderSession(sessionId);

    const add = await screen.findByRole("button", { name: "Add game" });
    expect(screen.getByRole("button", { name: /Back/ })).toBeInTheDocument();

    fireEvent.click(add);

    await waitFor(async () => expect(await db.games.count()).toBe(1));
  });

  it("opens on the session's game, with its alley and its scorer", async () => {
    const sessionId = Number(await createSession({ date: "2026-05-27", alley_name: "Axe Lanes" }));
    await addGameToSession(sessionId, { game_number: 1 });

    renderSession(sessionId);

    expect(await screen.findByText("Axe Lanes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Strike" })).toBeInTheDocument();
  });

  it("adds a second game to the session it is in", async () => {
    const sessionId = Number(await createSession({ date: "2026-05-27", alley_name: "Axe Lanes" }));
    const gameId = Number(await addGameToSession(sessionId, { game_number: 1 }));
    await saveFrame(gameId, {
      frame_number: 1,
      shots: [{ pins_standing: [] }],
      is_strike: true,
      is_spare: false
    });

    renderSession(sessionId);

    // The scorer's own control, which is the + beside the game chips.
    fireEvent.click(await screen.findByRole("button", { name: "New game" }));

    await waitFor(async () => expect(await db.games.count()).toBe(2));

    // The new game belongs to this session and follows the first one.
    const games = await db.games.where("session_id").equals(sessionId).sortBy("game_number");
    expect(games.map((g) => g.game_number)).toEqual([1, 2]);
  });
});
