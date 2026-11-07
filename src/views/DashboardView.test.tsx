import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardView } from "./DashboardView";
import { db } from "../db/bowlingDb";
import {
  addGameToSession,
  createSession,
  getBowlerName,
  setBackupNudgeSnoozedUntil,
  setBowlerName
} from "../services/bowlingRepository";
import { addBall } from "../services/ballRepository";
import { GREETINGS } from "../lib/greeting";
import { ProAccessContext } from "../lib/useProAccess";
import type { ProAccess } from "../lib/pro";

function renderHome(overrides: Partial<Parameters<typeof DashboardView>[0]> = {}) {
  const props = {
    onStartSession: vi.fn(),
    onOpenCatalog: vi.fn(),
    onOpenLineVisualizer: vi.fn(),
    onOpenLayoutLab: vi.fn(),
    onOpenAlleyReport: vi.fn(),
    onOpenArsenal: vi.fn(),
    onOpenLaneNotes: vi.fn(),
    onOpenOilPatterns: vi.fn(),
    onOpenSpareLines: vi.fn(),
    onOpenGuides: vi.fn(),
    onOpenBackup: vi.fn(),
    ...overrides
  };
  render(<DashboardView {...props} />);
  return props;
}

describe("Home (ADR-115)", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  /**
   * The hero leads (ADR-245): the bowler's average, the last session against
   * it, and Start session. The bowler's own things follow, then the tools.
   * Recent sessions are left to History.
   */
  it("leads with the hero, then the bowler's own things, then the tools", async () => {
    const id = Number(
      await createSession({ date: "2026-09-30", alley_name: "Chinese Swimming Club", description: "League" })
    );
    const g = Number(await addGameToSession(id, { game_number: 1 }));
    await db.games.update(g, { final_score: 190 });
    renderHome();

    const hero = await screen.findByRole("region", { name: "Your average" });
    await waitFor(() => expect(hero).toHaveTextContent("190"));
    expect(hero).toHaveTextContent("Last session 190");
    expect(screen.getByRole("button", { name: "Start session" })).toBeInTheDocument();
    expect(screen.queryByText("Recent sessions")).not.toBeInTheDocument();
    expect(screen.queryByText("Tonight")).not.toBeInTheDocument();

    const arsenal = screen.getByRole("button", { name: /^Arsenal/ });
    expect(hero.compareDocumentPosition(arsenal) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      arsenal.compareDocumentPosition(screen.getByText("Tools and reference")) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("offers one way in on a device that has never scored, and it opens the form", async () => {
    renderHome();

    // Not three buttons that all start a session: no form button, no second
    // fast path, and no floating button over the empty state.
    expect(await screen.findByRole("button", { name: "Start scoring" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start session" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Score now, add details later" })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Start scoring" }));
    expect(await screen.findByRole("dialog", { name: "Start session" })).toBeInTheDocument();
  });

  it("starts a session from the hero's button, even before a game is finished", async () => {
    await createSession({ date: "2026-09-30", alley_name: "Orchid Bowl" });
    renderHome();

    const start = await screen.findByRole("button", { name: "Start session" });
    // Printed, not only spoken: a plus alone said nothing about what it adds.
    expect(start).toHaveTextContent("Start session");
    // No average to show yet, so no hero card around it.
    expect(screen.queryByRole("region", { name: "Your average" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start scoring" })).not.toBeInTheDocument();
    fireEvent.click(start);
    expect(await screen.findByRole("dialog", { name: "Start session" })).toBeInTheDocument();
  });

  it("asks for the balls once, in the arsenal's own slot, not again as a step", async () => {
    await createSession({ date: "2026-09-30", alley_name: "Orchid Bowl" });
    await setBackupNudgeSnoozedUntil(new Date(Date.now() + 86_400_000).toISOString());
    renderHome();

    // The step owed next is the one shown instead.
    expect(await screen.findByText("Write down your spare lines")).toBeInTheDocument();
    expect(screen.getAllByText("Add balls to your bag")).toHaveLength(1);
  });

  it("shows one prompt at a time: the backup card holds the setup step back", async () => {
    await createSession({ date: "2026-09-30", alley_name: "Orchid Bowl" });
    renderHome();

    expect(await screen.findByText(/not backed up/)).toBeInTheDocument();
    expect(screen.queryByText("Next steps")).not.toBeInTheDocument();
  });

  it("says what an empty tile is for, rather than that it is empty", async () => {
    renderHome();
    // The tile is drawn before the counts behind its line are read, so the
    // line is waited for, not checked the moment the tile appears.
    const tile = await screen.findByRole("button", { name: "Game plan" });
    await waitFor(() => expect(tile).toHaveTextContent("Your numbers at each alley"));
    expect(screen.queryByText("None yet")).not.toBeInTheDocument();
  });

  it("greets the bowler by name, and with the greeting alone without one", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    renderHome();
    expect(await screen.findByRole("heading", { level: 1, name: GREETINGS[0] })).toBeInTheDocument();
    expect(screen.getByText("Add your name")).toBeInTheDocument();

    await setBowlerName("Sam");
    expect(
      await screen.findByRole("heading", { level: 1, name: `${GREETINGS[0]}, Sam` })
    ).toBeInTheDocument();
    // A name is set once: changing it lives in Settings, not on the greeting.
    expect(screen.queryByText("Add your name")).toBeNull();
    expect(screen.queryByRole("button", { name: /Sam/ })).toBeNull();
    vi.restoreAllMocks();
  });

  it("takes a name from the greeting", async () => {
    renderHome();
    fireEvent.click(await screen.findByRole("button", { name: "Add your name" }));
    fireEvent.change(screen.getByLabelText(/What do you want to be called/), {
      target: { value: "  Sam " }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));
    await waitFor(async () => expect(await getBowlerName()).toBe("Sam"));
    expect(await screen.findByRole("heading", { level: 1, name: /, Sam$/ })).toBeInTheDocument();
  });

  it("shows the arsenal as one row, named and counted, that opens it", async () => {
    await addBall({ name: "Phaze II", is_spare_ball: false });
    await addBall({ name: "Plastic", is_spare_ball: true });
    const props = renderHome();
    const row = await screen.findByRole("button", { name: /^Arsenal/ });
    await waitFor(() => expect(row).toHaveTextContent("Arsenal2 balls"));
    fireEvent.click(row);
    expect(props.onOpenArsenal).toHaveBeenCalled();
  });

  it("asks for the balls on the arsenal row while the bag is empty", async () => {
    const props = renderHome();
    const row = await screen.findByRole("button", { name: /^Arsenal/ });
    await waitFor(() => expect(row).toHaveTextContent("Add balls to your bag"));
    fireEvent.click(row);
    expect(props.onOpenArsenal).toHaveBeenCalled();
  });

  it("puts spare lines, lane notes and the Game plan side by side as tiles", async () => {
    const props = renderHome();
    fireEvent.click(await screen.findByRole("button", { name: "Spare lines" }));
    fireEvent.click(screen.getByRole("button", { name: "Lane notes" }));
    fireEvent.click(screen.getByRole("button", { name: "Game plan" }));
    expect(props.onOpenSpareLines).toHaveBeenCalled();
    expect(props.onOpenLaneNotes).toHaveBeenCalled();
    expect(props.onOpenAlleyReport).toHaveBeenCalled();
  });

  it("counts the alleys bowled at on the Game plan tile", async () => {
    await createSession({ date: "2026-09-30", alley_name: "Orchid Bowl" });
    await createSession({ date: "2026-10-07", alley_name: "Orchid Bowl" });
    await createSession({ date: "2026-10-08", alley_name: "Sea Bowl" });
    renderHome();
    const tile = await screen.findByRole("button", { name: "Game plan" });
    await waitFor(() => expect(tile).toHaveTextContent("2 alleys"));
  });

  it("shows every tool as a card with the guides under them, each opening its screen", async () => {
    const props = renderHome();
    fireEvent.click(await screen.findByRole("button", { name: /^Line visualizer/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Layouts/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Oil patterns/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Ball catalog/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Guides/ }));
    expect(props.onOpenLineVisualizer).toHaveBeenCalled();
    expect(props.onOpenLayoutLab).toHaveBeenCalled();
    expect(props.onOpenOilPatterns).toHaveBeenCalled();
    expect(props.onOpenCatalog).toHaveBeenCalled();
    expect(props.onOpenGuides).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^Oil patterns/ }).closest("section")?.textContent).toContain("Guides");
  });

  it("leads with the game in progress when there is one", async () => {
    await createSession({ date: "2026-09-30", alley_name: "Orchid Bowl" });
    const onResume = vi.fn();
    renderHome({ resumable: { sessionId: 1, alleyName: "Orchid Bowl", gameNumber: 2 }, onResume });

    fireEvent.click(await screen.findByRole("button", { name: /Resume game/ }));
    expect(onResume).toHaveBeenCalled();
    expect(screen.queryByText("Tonight")).not.toBeInTheDocument();
  });

  it("keeps the tools apart from your own things, with Game plan only as a tile", async () => {
    await createSession({ date: "2026-09-30", alley_name: "Orchid Bowl" });
    renderHome();
    expect(await screen.findByText("Tools and reference")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Line visualizer/ })).toBeInTheDocument();
    // The old full-width Game plan card is gone; the name is the tile's alone.
    expect(screen.getAllByText("Game plan")).toHaveLength(1);
  });

  it("opens the Game plan from its tile", async () => {
    await createSession({ date: "2026-09-30", alley_name: "Orchid Bowl" });
    const props = renderHome();
    fireEvent.click(await screen.findByRole("button", { name: "Game plan" }));
    expect(props.onOpenAlleyReport).toHaveBeenCalled();
  });
});

describe("Home and Pro (ADR-164)", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  function renderWithAccess(access: ProAccess) {
    render(
      <ProAccessContext.Provider value={access}>
        <DashboardView
          onStartSession={vi.fn()}
          onOpenCatalog={vi.fn()}
          onOpenLineVisualizer={vi.fn()}
          onOpenLayoutLab={vi.fn()}
          onOpenAlleyReport={vi.fn()}
          onOpenArsenal={vi.fn()}
          onOpenLaneNotes={vi.fn()}
          onOpenOilPatterns={vi.fn()}
          onOpenSpareLines={vi.fn()}
          onOpenGuides={vi.fn()}
          onOpenBackup={vi.fn()}
        />
      </ProAccessContext.Provider>
    );
  }

  it("shows the Pro mark in place of the app's for a bowler who bought it, and no banner (ADR-167)", async () => {
    renderWithAccess({ locked: false, owned: true });
    expect(await screen.findByRole("img", { name: "Headpin Pro" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /See what it adds/ })).not.toBeInTheDocument();
  });

  it("shows the banner, and no tag, to a bowler on the free tier", async () => {
    renderWithAccess({ locked: true, appStoreUrl: "https://apps.apple.com/app/id1" });
    expect(await screen.findByRole("button", { name: "Headpin Pro. See what it adds" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Headpin Pro" })).not.toBeInTheDocument();
  });

  it("shows neither where Pro is merely open", async () => {
    renderWithAccess({ locked: false });
    await screen.findByText("Tools and reference");
    expect(screen.queryByRole("img", { name: "Headpin Pro" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /See what it adds/ })).not.toBeInTheDocument();
  });
});
