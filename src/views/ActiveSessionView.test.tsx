import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActiveSessionView } from "./ActiveSessionView";
import { db } from "../db/bowlingDb";
import { addGameToSession, createSession, saveFrame } from "../services/bowlingRepository";

// Installed, so the backup ask (browser tab only) never takes the strip of
// screen the share offer would use.
vi.mock("../lib/installPrompt", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/installPrompt")>()),
  isStandalone: () => true
}));

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

  it("keeps the second lane typed while the first one saves (B7)", async () => {
    const sessionId = Number(await createSession({ date: "2026-05-27", alley_name: "Axe Lanes" }));
    const gameId = Number(await addGameToSession(sessionId, { game_number: 1 }));

    renderSession(sessionId);

    fireEvent.click(await screen.findByRole("button", { name: "Edit game lanes" }));
    const first = await screen.findByLabelText("First lane");
    fireEvent.change(first, { target: { value: "9" } });
    fireEvent.blur(first);
    // Typed before the first lane's save has come back.
    fireEvent.change(screen.getByLabelText("Second lane"), { target: { value: "10" } });

    await waitFor(async () => expect((await db.games.get(gameId))?.lanes).toEqual(["9"]));
    // Let the refresh after that save land.
    await new Promise((r) => setTimeout(r, 50));
    expect((screen.getByLabelText("Second lane") as HTMLInputElement).value).toBe("10");
  });

  it("does not offer to share a finished game that was only opened (B6)", async () => {
    const sessionId = Number(await createSession({ date: "2026-05-27", alley_name: "Axe Lanes" }));
    const gameId = Number(await addGameToSession(sessionId, { game_number: 1 }));
    for (let n = 1; n <= 10; n++) {
      await saveFrame(gameId, {
        frame_number: n,
        shots: n === 10 ? [{ pins_standing: [5] }, { pins_standing: [5] }] : [{ pins_standing: [] }],
        is_strike: n !== 10,
        is_spare: false
      });
    }
    await db.games.update(gameId, { final_score: 254, lanes: ["9"], start_lane: "9" });

    renderSession(sessionId);

    expect(await screen.findByText("Axe Lanes")).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(/Share the session\?/)).toBeNull();
  });

  it("offers to share once, on the game just finished, and not again after a dismiss (B6)", async () => {
    const sessionId = Number(await createSession({ date: "2026-05-27", alley_name: "Axe Lanes" }));
    const gameId = Number(await addGameToSession(sessionId, { game_number: 1 }));
    await db.games.update(gameId, { lanes: ["9"], start_lane: "9" });
    for (let n = 1; n <= 9; n++) {
      await saveFrame(gameId, {
        frame_number: n,
        shots: [{ pins_standing: [] }],
        is_strike: true,
        is_spare: false
      });
    }
    await saveFrame(gameId, {
      frame_number: 10,
      shots: [{ pins_standing: [5] }],
      is_strike: false,
      is_spare: false
    });

    renderSession(sessionId);

    // The last ball of the game: a miss at the 5, so no bonus ball.
    await screen.findByRole("button", { name: /^Next/ });
    fireEvent.click(screen.getByRole("button", { name: /^Next/ }));

    expect(await screen.findByText(/Share the session\?/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss share offer" }));
    await waitFor(() => expect(screen.queryByText(/Share the session\?/)).toBeNull());
    await waitFor(async () =>
      expect(await db.settings.get("share_offer")).toBeTruthy()
    );
  });
});
