import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardView } from "./DashboardView";
import { db } from "../db/bowlingDb";
import { addGameToSession, createSession } from "../services/bowlingRepository";
import { localDateKey } from "../lib/dates";

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

  it("starts a session at a recent alley in one tap, prefilled", async () => {
    const id = Number(
      await createSession({
        date: "2026-09-30",
        alley_name: "Chinese Swimming Club",
        description: "League",
        oil_pattern_id: 4
      })
    );
    await addGameToSession(id, { game_number: 1 });
    const props = renderHome();

    fireEvent.click(
      await screen.findByRole("button", { name: "Start a session at Chinese Swimming Club, League" })
    );
    expect(props.onStartSession).toHaveBeenCalledWith({
      alley_name: "Chinese Swimming Club",
      description: "League",
      oil_pattern_id: 4,
      date: localDateKey(),
      lanes: []
    });
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
