import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardView } from "./DashboardView";
import { db } from "../db/bowlingDb";
import { addGameToSession, createSession } from "../services/bowlingRepository";

function renderHome(overrides: Partial<Parameters<typeof DashboardView>[0]> = {}) {
  const props = {
    onStartSession: vi.fn(),
    onScoreNow: vi.fn(),
    onOpenSession: vi.fn(),
    onViewAll: vi.fn(),
    onOpenCatalog: vi.fn(),
    onOpenLineVisualizer: vi.fn(),
    onOpenLayoutLab: vi.fn(),
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
   * floating button starts a session, and the menus sit where it was.
   */
  it("has no Tonight card, and the menus come before the recent sessions", async () => {
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

    const menu = screen.getByText("My bowling");
    expect(menu.compareDocumentPosition(recent) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      screen.getByText("Tools and reference").compareDocumentPosition(recent) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("leads with the game in progress when there is one", async () => {
    await createSession({ date: "2026-09-30", alley_name: "Orchid Bowl" });
    const onResume = vi.fn();
    renderHome({ resumable: { sessionId: 1, alleyName: "Orchid Bowl", gameNumber: 2 }, onResume });

    fireEvent.click(await screen.findByRole("button", { name: /Resume game/ }));
    expect(onResume).toHaveBeenCalled();
    expect(screen.queryByText("Tonight")).not.toBeInTheDocument();
  });

  it("lists your own things apart from the tools, with no Game plan card", async () => {
    await createSession({ date: "2026-09-30", alley_name: "Orchid Bowl" });
    renderHome();
    expect(await screen.findByText("My bowling")).toBeInTheDocument();
    expect(screen.getByText("Tools and reference")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Line visualizer" })).toBeInTheDocument();
    expect(screen.queryByText("Game plan")).not.toBeInTheDocument();
  });

  it("shows three recent sessions and sends the rest to History", async () => {
    for (let d = 1; d <= 5; d++) {
      await createSession({ date: `2026-09-0${d}`, alley_name: `Alley ${d}` });
    }
    const props = renderHome();
    fireEvent.click(await screen.findByRole("button", { name: "All in History" }));
    expect(props.onViewAll).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryAllByRole("button", { name: /Alley 1\b/ })).toHaveLength(0));
  });
});
