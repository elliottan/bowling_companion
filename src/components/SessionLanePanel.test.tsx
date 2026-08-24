import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { SessionLanePanel } from "./SessionLanePanel";
import type { Ball, Frame, Game, PinNumber, SessionSummary } from "../types/bowling";

const BALLS: Ball[] = [
  {
    id: 1,
    name: "Roto Grip Gem",
    is_spare_ball: false,
    catalog_snapshot: {
      brand: "Roto Grip",
      name: "Gem",
      coverstockCategory: null,
      coreName: null,
      rg: null,
      diff: null,
      mbDiff: null,
      imageThumb: null
    }
  },
  { id: 2, name: "Zen Master", is_spare_ball: false }
];

vi.mock("../services/ballRepository", () => ({
  getBalls: () => Promise.resolve(BALLS),
  // The lane-notes tab is mounted alongside the sheet, and reads through the
  // same module.
  getLaneNotes: () => Promise.resolve([]),
  upsertLaneNote: () => Promise.resolve(),
  deleteLaneNote: () => Promise.resolve()
}));

// jsdom has no layout, so the sheet's scroll-to-the-current-game is a no-op.
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

const frame = (n: number, ballId?: number): Frame => ({
  game_id: 1,
  frame_number: n,
  shots: [{ pins_standing: [] as PinNumber[], ball_id: ballId }],
  is_strike: true,
  is_spare: false
});

const SUMMARY: SessionSummary = {
  session: { id: 1, date: "2026-08-05", alley_name: "Chinese Swimming Club" },
  games: [
    {
      id: 1,
      session_id: 1,
      game_number: 1,
      final_score: 200,
      lanes: ["5"],
      start_lane: "5",
      frames: [frame(1, 1), frame(2, 2), frame(3, undefined)]
    } as Game & { frames: Frame[] }
  ]
};

describe("the session sheet", () => {
  it("marks each frame with the ball it opened with, and leaves untagged frames bare", async () => {
    render(<SessionLanePanel summary={SUMMARY} currentGameId={1} onClose={() => {}} />);

    // The balls are read asynchronously, so the corners fill a tick later.
    await waitFor(() => expect(screen.getByTitle("Roto Grip Gem")).toBeInTheDocument());
    expect(screen.getByTitle("Zen Master")).toBeInTheDocument();
    // The third frame names no ball, so nothing is claimed for it.
    expect(screen.getAllByTitle(/Gem|Zen/)).toHaveLength(2);
  });
});
