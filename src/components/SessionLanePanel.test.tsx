import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

const game = (id: number, number: number, score: number, frames: Frame[]) =>
  ({
    id,
    session_id: 1,
    game_number: number,
    final_score: score,
    lanes: ["5"],
    start_lane: "5",
    frames
  }) as Game & { frames: Frame[] };

const SUMMARY: SessionSummary = {
  session: { id: 1, date: "2026-08-05", alley_name: "Chinese Swimming Club" },
  games: [game(1, 1, 200, [frame(1, 1), frame(2, 2), frame(3, undefined)])]
};

const TWO_GAMES: SessionSummary = {
  session: SUMMARY.session,
  games: [
    game(1, 1, 200, [frame(1, 1), frame(2, 1)]),
    game(2, 2, 150, [frame(1, 2)])
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

  it("scopes the stats to a game chip rather than jumping to its frames", async () => {
    render(<SessionLanePanel summary={TWO_GAMES} currentGameId={1} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Stats" }));
    await waitFor(() => expect(screen.getByText("Games")).toBeInTheDocument());
    // The whole series to begin with: both games behind the Games tile.
    const gamesTile = screen.getByText("Games").closest("div")!;
    expect(gamesTile).toHaveTextContent("2");

    fireEvent.click(screen.getByRole("button", { name: /G2/ }));
    expect(screen.getByText("Game 2 only")).toBeInTheDocument();
    // Still on the stats tab: the frames were not what was asked for.
    expect(screen.getByRole("button", { name: "Stats" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Session sheet" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );

    // Tapping the same chip again gives the series back.
    fireEvent.click(screen.getByRole("button", { name: /G2/ }));
    expect(screen.queryByText("Game 2 only")).toBeNull();
  });

  it("clears the scope from the banner", async () => {
    render(<SessionLanePanel summary={TWO_GAMES} currentGameId={1} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Stats" }));
    await waitFor(() => expect(screen.getByText("Games")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /G1/ }));

    fireEvent.click(screen.getByText("Game 1 only"));
    expect(screen.queryByText("Game 1 only")).toBeNull();
  });
});
