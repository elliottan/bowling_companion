import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../db/bowlingDb";
import { clearViewMemory } from "../lib/viewMemory";
import { addGameToSession, createSession } from "../services/bowlingRepository";
import { StatsView } from "./StatsView";

async function seedSessions(n: number) {
  for (let i = 0; i < n; i++) {
    const id = Number(await createSession({ date: `2026-09-${String(i + 1).padStart(2, "0")}`, alley_name: "Orchid Bowl" }));
    await addGameToSession(id, { game_number: 1 });
  }
}

/** "Last 10" is offered once there are ten sessions to read (ADR-208). */
describe("the Stats range", () => {
  beforeEach(async () => {
    clearViewMemory();
    await db.delete();
    await db.open();
  });

  it("leaves Last 10 off with fewer than ten sessions", async () => {
    await seedSessions(9);
    render(<StatsView onOpenSession={vi.fn()} onOpenSessionGame={vi.fn()} />);
    const range = await screen.findByRole("group", { name: "Sessions counted" });
    expect(range).toHaveTextContent("3 mo");
    expect(range).not.toHaveTextContent("Last 10");
  });

  it("offers Last 10 once there are ten", async () => {
    await seedSessions(10);
    render(<StatsView onOpenSession={vi.fn()} onOpenSessionGame={vi.fn()} />);
    const range = await screen.findByRole("group", { name: "Sessions counted" });
    expect(range).toHaveTextContent("Last 10");
  });
});
