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

function renderHome(overrides: Partial<Parameters<typeof DashboardView>[0]> = {}) {
  const props = {
    onStartSession: vi.fn(),
    onScoreNow: vi.fn(),
    onOpenSession: vi.fn(),
    onViewAll: vi.fn(),
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
   * The Tonight card (recent alleys, Start session, Last time) is gone: the
   * floating button starts a session. The bowler's own things come first, as
   * one profile, and the tools and reference follow.
   */
  it("has no Tonight card, and the profile comes before the tools", async () => {
    const id = Number(
      await createSession({ date: "2026-09-30", alley_name: "Chinese Swimming Club", description: "League" })
    );
    await addGameToSession(id, { game_number: 1 });
    renderHome();

    const recent = await screen.findByText("Recent sessions");
    expect(screen.queryByText("Tonight")).not.toBeInTheDocument();
    expect(screen.queryByText(/^Last time/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Start a session at/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start session" })).toBeInTheDocument();
    expect(screen.queryByText("My bowling")).not.toBeInTheDocument();

    expect(
      recent.compareDocumentPosition(screen.getByText("Tools and reference")) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("offers one way in on a device that has never scored, straight to the deck", async () => {
    const props = renderHome();

    fireEvent.click(await screen.findByRole("button", { name: "Start scoring" }));
    expect(props.onScoreNow).toHaveBeenCalled();
    // Not three buttons that all start a session: no form button, no second
    // fast path, and no floating button over the empty state.
    expect(screen.queryByRole("button", { name: "Start session" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Score now, add details later" })
    ).not.toBeInTheDocument();
  });

  it("names the floating button once there are sessions", async () => {
    await createSession({ date: "2026-09-30", alley_name: "Orchid Bowl" });
    renderHome();

    const fab = await screen.findByRole("button", { name: "Start session" });
    // Printed, not only spoken: a plus alone said nothing about what it adds.
    expect(fab).toHaveTextContent("Start session");
    expect(screen.queryByRole("button", { name: "Start scoring" })).not.toBeInTheDocument();
  });

  it("asks for the balls once, in the arsenal's own slot, not again as a step", async () => {
    await createSession({ date: "2026-09-30", alley_name: "Orchid Bowl" });
    await setBackupNudgeSnoozedUntil(new Date(Date.now() + 86_400_000).toISOString());
    renderHome();

    // The step owed next is the one shown instead.
    expect(await screen.findByText("Write down your spare lines")).toBeInTheDocument();
    expect(screen.getAllByText("Add the balls you throw")).toHaveLength(1);
  });

  it("shows one prompt at a time: the backup card holds the setup step back", async () => {
    await createSession({ date: "2026-09-30", alley_name: "Orchid Bowl" });
    renderHome();

    expect(await screen.findByText(/not backed up/)).toBeInTheDocument();
    expect(screen.queryByText("Next steps")).not.toBeInTheDocument();
  });

  it("says what an empty tile is for, rather than that it is empty", async () => {
    renderHome();
    expect(await screen.findByRole("button", { name: "Alley report" })).toHaveTextContent(
      "Your numbers at each alley"
    );
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

  it("shows the arsenal as its balls, each opening the arsenal", async () => {
    await addBall({ name: "Phaze II", is_spare_ball: false });
    await addBall({ name: "Plastic", is_spare_ball: true });
    const props = renderHome();
    fireEvent.click(await screen.findByRole("button", { name: "Plastic" }));
    expect(props.onOpenArsenal).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Phaze II" })).toBeInTheDocument();
    // No heading and no total: the balls are the grid.
    expect(screen.queryByText("Arsenal")).not.toBeInTheDocument();
  });

  it("shows two rows of balls at most, and counts the rest", async () => {
    for (let i = 1; i <= 11; i++) await addBall({ name: `Ball ${i}`, is_spare_ball: false });
    const props = renderHome();
    expect(await screen.findByRole("button", { name: "Ball 7" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ball 8" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "4 more balls" }));
    expect(props.onOpenArsenal).toHaveBeenCalled();
  });

  it("puts spare lines, lane notes and the Alley report side by side as tiles", async () => {
    const props = renderHome();
    fireEvent.click(await screen.findByRole("button", { name: "Spare lines" }));
    fireEvent.click(screen.getByRole("button", { name: "Lane notes" }));
    fireEvent.click(screen.getByRole("button", { name: "Alley report" }));
    expect(props.onOpenSpareLines).toHaveBeenCalled();
    expect(props.onOpenLaneNotes).toHaveBeenCalled();
    expect(props.onOpenAlleyReport).toHaveBeenCalled();
  });

  it("counts the alleys bowled at on the Alley report tile", async () => {
    await createSession({ date: "2026-09-30", alley_name: "Orchid Bowl" });
    await createSession({ date: "2026-10-07", alley_name: "Orchid Bowl" });
    await createSession({ date: "2026-10-08", alley_name: "Sea Bowl" });
    renderHome();
    const tile = await screen.findByRole("button", { name: "Alley report" });
    await waitFor(() => expect(tile).toHaveTextContent("2 alleys"));
  });

  it("lists the oil patterns with the tools, not the bowler's tiles", async () => {
    const props = renderHome();
    fireEvent.click(await screen.findByRole("button", { name: /^Oil patterns/ }));
    expect(props.onOpenOilPatterns).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^Oil patterns/ }).closest("ul, [role=list], section")?.textContent).toContain("Guides");
  });

  it("shows a session tile as its event, alley, date, games and average", async () => {
    const id = Number(
      await createSession({ date: "2026-09-30", alley_name: "Orchid Bowl", description: "League" })
    );
    const g1 = Number(await addGameToSession(id, { game_number: 1 }));
    const g2 = Number(await addGameToSession(id, { game_number: 2 }));
    await db.games.update(g1, { final_score: 180 });
    await db.games.update(g2, { final_score: 201 });
    const props = renderHome();

    const tile = await screen.findByRole("button", { name: /Open session: Orchid Bowl/ });
    await waitFor(() => expect(tile).toHaveTextContent("191AVG(2 GMS)"));
    expect(tile).toHaveTextContent("League");
    expect(tile).not.toHaveTextContent(/Lane/);
    fireEvent.click(tile);
    expect(props.onOpenSession).toHaveBeenCalledWith(id, true);
  });

  it("leads with the game in progress when there is one", async () => {
    await createSession({ date: "2026-09-30", alley_name: "Orchid Bowl" });
    const onResume = vi.fn();
    renderHome({ resumable: { sessionId: 1, alleyName: "Orchid Bowl", gameNumber: 2 }, onResume });

    fireEvent.click(await screen.findByRole("button", { name: /Resume game/ }));
    expect(onResume).toHaveBeenCalled();
    expect(screen.queryByText("Tonight")).not.toBeInTheDocument();
  });

  it("keeps the tools apart from your own things, with no Game plan card", async () => {
    await createSession({ date: "2026-09-30", alley_name: "Orchid Bowl" });
    renderHome();
    expect(await screen.findByText("Tools and reference")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Line visualizer/ })).toBeInTheDocument();
    expect(screen.queryByText("Game plan")).not.toBeInTheDocument();
  });

  it("opens the Alley report from its tile", async () => {
    await createSession({ date: "2026-09-30", alley_name: "Orchid Bowl" });
    const props = renderHome();
    fireEvent.click(await screen.findByRole("button", { name: "Alley report" }));
    expect(props.onOpenAlleyReport).toHaveBeenCalled();
  });

  it("offers the Alley report in the Start session sheet once the alley is one you have bowled at", async () => {
    await createSession({ date: "2026-09-30", alley_name: "Orchid Bowl" });
    const props = renderHome();
    fireEvent.click(await screen.findByRole("button", { name: "Start session" }));

    const alley = await screen.findByPlaceholderText("Pinecrest Lanes");
    fireEvent.change(alley, { target: { value: "Somewhere New" } });
    expect(screen.queryByRole("button", { name: "See your lines here" })).not.toBeInTheDocument();

    fireEvent.change(alley, { target: { value: "orchid bowl" } });
    fireEvent.click(await screen.findByRole("button", { name: "See your lines here" }));
    expect(props.onOpenAlleyReport).toHaveBeenCalled();
    expect(screen.queryByPlaceholderText("Pinecrest Lanes")).not.toBeInTheDocument();
  });

  it("shows the latest eight sessions and sends the rest to History", async () => {
    for (let d = 1; d <= 9; d++) {
      await createSession({ date: `2026-09-0${d}`, alley_name: `Alley ${d}` });
    }
    const props = renderHome();
    fireEvent.click(await screen.findByRole("button", { name: "View all" }));
    expect(props.onViewAll).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryAllByRole("button", { name: /Alley 1\b/ })).toHaveLength(0));
  });
});
