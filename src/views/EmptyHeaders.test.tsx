import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../db/bowlingDb";
import { clearViewMemory } from "../lib/viewMemory";
import { addGameToSession, createSession } from "../services/bowlingRepository";
import { HistoryView } from "./HistoryView";
import { StatsView } from "./StatsView";

/**
 * History and Stats put their filter and share in the header. Before the first
 * session neither has anything to act on, and a control that can only ever
 * filter an empty list is noise on the screen a new bowler is deciding about.
 */
describe("the History and Stats headers before there is anything to read", () => {
  beforeEach(async () => {
    clearViewMemory();
    await db.delete();
    await db.open();
  });

  it("History shows no filter until there is a session", async () => {
    const { unmount } = render(
      <HistoryView onOpenSession={vi.fn()} activeSessionId={null} onSessionDeleted={vi.fn()} />
    );
    expect(await screen.findByText("No sessions yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /filter/i })).not.toBeInTheDocument();
    unmount();

    const id = Number(await createSession({ date: "2026-09-30", alley_name: "Orchid Bowl" }));
    await addGameToSession(id, { game_number: 1 });
    render(<HistoryView onOpenSession={vi.fn()} activeSessionId={null} onSessionDeleted={vi.fn()} />);
    expect(await screen.findByRole("button", { name: /filter/i })).toBeInTheDocument();
  });

  it("Stats shows neither the filter nor the share until there is a session", async () => {
    const { unmount } = render(<StatsView onOpenSession={vi.fn()} onOpenSessionGame={vi.fn()} />);
    expect(await screen.findByText("No stats yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /filter/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Share these stats" })).not.toBeInTheDocument();
    unmount();

    const id = Number(await createSession({ date: "2026-09-30", alley_name: "Orchid Bowl" }));
    await addGameToSession(id, { game_number: 1 });
    render(<StatsView onOpenSession={vi.fn()} onOpenSessionGame={vi.fn()} />);
    expect(await screen.findByRole("button", { name: /filter/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Share these stats" })).toBeInTheDocument();
  });
});
