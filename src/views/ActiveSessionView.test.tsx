import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

function renderSession(sessionId: number, extra: Partial<Parameters<typeof ActiveSessionView>[0]> = {}) {
  render(
    <ActiveSessionView
      sessionId={sessionId}
      onBack={vi.fn()}
      onSessionDeleted={vi.fn()}
      onOpenArsenal={vi.fn()}
      {...extra}
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

  it("opens a finished session from History on its stats", async () => {
    const sessionId = Number(await createSession({ date: "2026-05-27", alley_name: "Axe Lanes" }));
    const gameId = Number(await addGameToSession(sessionId, { game_number: 1 }));
    await db.games.update(gameId, { final_score: 200 });

    renderSession(sessionId, { openStatsOnMount: true });

    const panel = await screen.findByRole("dialog", { name: "Session sheet" });
    expect(within(panel).getByRole("button", { name: "Stats" })).toHaveAttribute("aria-pressed", "true");
  });

  /**
   * The bar's identity is the edit: a tap on the alley opens the session's
   * details, with no pencil to say so.
   */
  it("opens the session details from a tap on the bar's identity", async () => {
    const sessionId = Number(await createSession({ date: "2026-05-27", alley_name: "Axe Lanes" }));
    await addGameToSession(sessionId, { game_number: 1 });
    renderSession(sessionId);

    fireEvent.click(await screen.findByRole("button", { name: "Edit session" }));
    expect(await screen.findByRole("dialog", { name: "Edit session" })).toBeInTheDocument();
  });

  /**
   * With the sheet up the same tap puts the sheet away rather than editing:
   * the sheet is what the bowler is looking at, and the bar is the way out.
   */
  it("holds the screen still under the sheet, and lets it scroll again once it goes", async () => {
    const sessionId = Number(await createSession({ date: "2026-05-27", alley_name: "Axe Lanes" }));
    await addGameToSession(sessionId, { game_number: 1 });
    // The Score tab's `<main>`, which scrolls the session there.
    const main = document.createElement("main");
    main.style.overflowY = "auto";
    document.body.appendChild(main);
    render(
      <ActiveSessionView sessionId={sessionId} onBack={vi.fn()} onSessionDeleted={vi.fn()} onOpenArsenal={vi.fn()} />,
      { container: main.appendChild(document.createElement("div")) }
    );

    fireEvent.click(await screen.findByRole("button", { name: "Session stats" }));
    await screen.findByRole("dialog", { name: "Session sheet" });
    // A pull on the strip above the sheet bounced the screen, sheet and all.
    expect(main.style.overflowY).toBe("hidden");

    fireEvent.click(screen.getByRole("button", { name: "Close session sheet" }));
    await waitFor(() => expect(main.style.overflowY).toBe("auto"));
    main.remove();
  });

  it("closes the sheet, and opens no editor, from the identity while the sheet is up", async () => {
    const sessionId = Number(await createSession({ date: "2026-05-27", alley_name: "Axe Lanes" }));
    await addGameToSession(sessionId, { game_number: 1 });
    renderSession(sessionId);

    fireEvent.click(await screen.findByRole("button", { name: "Session stats" }));
    await screen.findByRole("dialog", { name: "Session sheet" });
    expect(screen.queryByRole("button", { name: "Edit session" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close session sheet" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Session sheet" })).not.toBeInTheDocument());
    expect(screen.queryByRole("dialog", { name: "Edit session" })).not.toBeInTheDocument();
  });

  /**
   * A session's deletes sit in its own editor: each game, and the session at
   * the foot, in red, behind a confirm. No long press anywhere (ADR-184).
   */
  it("deletes a game from the session's editor, after a confirm", async () => {
    const sessionId = Number(await createSession({ date: "2026-05-27", alley_name: "Axe Lanes" }));
    await addGameToSession(sessionId, { game_number: 1 });
    const g2 = Number(await addGameToSession(sessionId, { game_number: 2 }));
    renderSession(sessionId);

    fireEvent.click(await screen.findByRole("button", { name: "Edit session" }));
    const editor = await screen.findByRole("dialog", { name: "Edit session" });
    fireEvent.click(within(editor).getByRole("button", { name: "Delete game 2" }));
    const confirm = (await screen.findByText("Delete this game?")).closest("[role=dialog]") as HTMLElement;
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));

    await waitFor(async () => expect(await db.games.get(g2)).toBeUndefined());
    expect(await db.sessions.get(sessionId)).toBeDefined();
  });

  it("deletes the whole session from the foot of its editor, after a warning", async () => {
    const sessionId = Number(await createSession({ date: "2026-05-27", alley_name: "Axe Lanes" }));
    await addGameToSession(sessionId, { game_number: 1 });
    const onSessionDeleted = vi.fn();
    renderSession(sessionId, { onSessionDeleted });

    fireEvent.click(await screen.findByRole("button", { name: "Edit session" }));
    const editor = await screen.findByRole("dialog", { name: "Edit session" });
    fireEvent.click(within(editor).getByRole("button", { name: "Delete session" }));
    const confirm = (await screen.findByText("Delete this session?")).closest("[role=dialog]") as HTMLElement;
    expect(confirm).toHaveTextContent(/permanently deleted\. This can't be undone\./);
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(onSessionDeleted).toHaveBeenCalled());
    expect(await db.sessions.get(sessionId)).toBeUndefined();
  });

  it("scrolls the game chips with no scroll bar drawn", async () => {
    const sessionId = Number(await createSession({ date: "2026-05-27", alley_name: "Axe Lanes" }));
    await addGameToSession(sessionId, { game_number: 1 });
    renderSession(sessionId);
    const chip = await screen.findByRole("button", { name: /^G1/ });
    expect(chip.parentElement).toHaveClass("overflow-x-auto", "scrollbar-none");
  });

  it("puts the oil pattern and a short date in the bar, and no game count", async () => {
    const sessionId = Number(
      await createSession({ date: "2026-05-27", alley_name: "Axe Lanes", description: "Practice" })
    );
    await addGameToSession(sessionId, { game_number: 1 });
    const patternId = await db.oil_patterns.add({ name: "Chromium" });
    await db.sessions.update(sessionId, { oil_pattern_id: patternId });
    renderSession(sessionId);

    const identity = await screen.findByRole("button", { name: "Edit session" });
    await waitFor(() => expect(identity).toHaveTextContent("Chromium"));
    expect(identity).toHaveTextContent("Practice");
    expect(identity).not.toHaveTextContent(/\bgames?\b/);
  });

  it("opens the share over the sheet and leaves the sheet up", async () => {
    const sessionId = Number(await createSession({ date: "2026-05-27", alley_name: "Axe Lanes" }));
    const gameId = Number(await addGameToSession(sessionId, { game_number: 1 }));
    await db.games.update(gameId, { final_score: 200 });
    renderSession(sessionId, { openStatsOnMount: true });

    const panel = await screen.findByRole("dialog", { name: "Session sheet" });
    fireEvent.click(screen.getByRole("button", { name: "Share this session" }));
    const share = await screen.findByRole("dialog", { name: /share/i });
    expect(panel).toBeInTheDocument();
    // Portalled to the body, beside the sheet: inside the screen it shared the
    // screen's stacking context and painted under the sheet.
    expect(share.parentElement).toBe(document.body);
  });

  it("lets the sheet's panes scroll only once the panel has stopped moving", async () => {
    const sessionId = Number(await createSession({ date: "2026-05-27", alley_name: "Axe Lanes" }));
    await addGameToSession(sessionId, { game_number: 1 });
    renderSession(sessionId);
    fireEvent.click(await screen.findByRole("button", { name: "Session stats" }));
    const panel = await screen.findByRole("dialog", { name: "Session sheet" });
    const panes = panel.querySelectorAll<HTMLElement>("[data-sheet-pane]");
    expect(panes).toHaveLength(3);

    // A scrolling box on iOS does not follow its panel's slide, so the panes
    // are plain boxes until the slide has ended.
    for (const pane of panes) expect(pane.className).toContain("overflow-hidden");
    fireEvent.animationEnd(panel.firstElementChild as HTMLElement);
    for (const pane of panes) expect(pane.className).toContain("overflow-y-auto");
  });

  it("switches the sheet's tabs with the control only", async () => {
    const sessionId = Number(await createSession({ date: "2026-05-27", alley_name: "Axe Lanes" }));
    await addGameToSession(sessionId, { game_number: 1 });
    renderSession(sessionId);
    fireEvent.click(await screen.findByRole("button", { name: "Session stats" }));
    const panel = await screen.findByRole("dialog", { name: "Session sheet" });

    // A sideways drag across the panes used to change tab.
    const body = panel.querySelector("[data-sheet-pane]") as HTMLElement;
    fireEvent.touchStart(body, { touches: [{ clientX: 300, clientY: 300 }] });
    fireEvent.touchMove(body, { touches: [{ clientX: 50, clientY: 305 }] });
    fireEvent.touchEnd(body, { changedTouches: [{ clientX: 50, clientY: 305 }] });
    expect(within(panel).getByRole("button", { name: "Stats" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(within(panel).getByRole("button", { name: "Lanes" }));
    expect(within(panel).getByRole("button", { name: "Lanes" })).toHaveAttribute("aria-pressed", "true");
  });

  it("scopes the stats with the screen's own game chips while the sheet is up", async () => {
    const sessionId = Number(await createSession({ date: "2026-05-27", alley_name: "Axe Lanes" }));
    const g1 = Number(await addGameToSession(sessionId, { game_number: 1 }));
    const g2 = Number(await addGameToSession(sessionId, { game_number: 2 }));
    await db.games.update(g1, { final_score: 200 });
    await db.games.update(g2, { final_score: 150 });
    renderSession(sessionId, { openStatsOnMount: true });

    await screen.findByRole("dialog", { name: "Session sheet" });
    fireEvent.click(screen.getByRole("button", { name: /^G2/ }));
    expect(await screen.findByText("Game 2 only")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^G2/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /^G2/ }));
    expect(screen.queryByText("Game 2 only")).toBeNull();
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

  it("tells a new game what the bowler usually moves into it at this alley (U3)", async () => {
    async function nightAt(date: string, lines: Array<[number, number]>, playLast = true) {
      const sessionId = Number(await createSession({ date, alley_name: "Axe Lanes" }));
      for (const [i, [stance, target]] of lines.entries()) {
        const gameId = Number(await addGameToSession(sessionId, { game_number: i + 1 }));
        await db.games.update(gameId, { lanes: ["9"], start_lane: "9" });
        if (!playLast && i === lines.length - 1) continue;
        await saveFrame(gameId, {
          frame_number: 1,
          shots: [{ pins_standing: [], intended: { stance, target } }],
          is_strike: true,
          is_spare: false
        });
      }
      return sessionId;
    }
    await nightAt("2026-05-01", [[20, 10], [22, 11]]);
    await nightAt("2026-05-08", [[20, 10], [22, 11]]);
    const tonight = await nightAt("2026-05-15", [[20, 10], [0, 0]], false);

    renderSession(tonight);

    expect(
      await screen.findByText(
        "Game 2 here: you usually move 2 boards left at the stance and 1 board left at the target."
      )
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss game hint" }));
    await waitFor(() => expect(screen.queryByText(/you usually move/)).toBeNull());
  });
});
