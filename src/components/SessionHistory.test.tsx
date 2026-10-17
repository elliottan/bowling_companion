import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SessionHistory } from "./SessionHistory";
import type { Game, SessionSummary } from "../types/bowling";

function summary(finals: Array<number | undefined>): SessionSummary {
  return {
    session: { id: 1, date: "2026-10-17", alley_name: "Chinese Swimming Club" },
    games: finals.map((final_score, i) => ({
      id: i + 1,
      session_id: 1,
      game_number: i + 1,
      final_score,
      frames: []
    }))
  } as unknown as SessionSummary & { games: Game[] };
}

function row(finals: Array<number | undefined>) {
  render(<SessionHistory sessions={[summary(finals)]} onOpenSession={vi.fn()} />);
  return screen.getByRole("button", { name: /Open session/ });
}

describe("SessionHistory row", () => {
  it("leads with the average, with the series beside the game count", () => {
    const el = row([194, 188, 160, 134, 198, 205, 204]);
    expect(el).toHaveTextContent("183avg");
    expect(el).toHaveTextContent("7 games · 1283 series");
  });

  it("gives one game its score, with no series", () => {
    const el = row([212]);
    expect(el).toHaveTextContent("212avg");
    expect(el).toHaveTextContent("1 game");
    expect(el).not.toHaveTextContent("series");
  });
});
