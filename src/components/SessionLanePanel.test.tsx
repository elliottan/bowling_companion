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

  it("scopes the stats to the game the screen's chips chose", async () => {
    render(
      <SessionLanePanel
        summary={TWO_GAMES}
        currentGameId={1}
        tab="stats"
        selection={{ gameId: 2, token: 1 }}
        onClose={() => {}}
      />
    );
    await waitFor(() => expect(screen.getByText("Game 2 only")).toBeInTheDocument());
    const gamesTile = screen.getByText("Games").closest("div")!;
    expect(gamesTile).toHaveTextContent("1");
  });

  it("clears the scope from the banner", async () => {
    const onSelectionChange = vi.fn();
    render(
      <SessionLanePanel
        summary={TWO_GAMES}
        currentGameId={1}
        tab="stats"
        selection={{ gameId: 1, token: 1 }}
        onSelectionChange={onSelectionChange}
        onClose={() => {}}
      />
    );
    fireEvent.click(await screen.findByText("Game 1 only"));
    expect(onSelectionChange).toHaveBeenCalledWith({ gameId: undefined, token: 2 });
  });

  /**
   * The header and the chips above the panel are the screen's, and stay in
   * view: the panel draws neither a second time, and carries no close.
   */
  it("draws no header, no chips and no close of its own", () => {
    render(<SessionLanePanel summary={TWO_GAMES} currentGameId={1} top={120} onClose={() => {}} />);
    const panel = screen.getByRole("dialog", { name: "Session sheet" });
    expect(panel).toHaveStyle({ top: "120px" });
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^G1/ })).toBeNull();
    expect(screen.queryByLabelText("Series total")).toBeNull();
  });

  it("goes to the game on the sheet when one is picked off the score line", async () => {
    render(<SessionLanePanel summary={TWO_GAMES} currentGameId={1} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Stats" }));
    await waitFor(() => expect(screen.getByText("Games")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Game 2, 150" }));
    // The card under the chart, not the sheet's own heading for that game.
    fireEvent.click(screen.getByText("Game 2", { selector: "span" }));

    // The chart is the way in: this one moves to the frames.
    expect(screen.getByRole("button", { name: "Sheet" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    // One game is chosen, not two: coming back to the stats finds the same one.
    fireEvent.click(screen.getByRole("button", { name: "Stats" }));
    expect(screen.getByText("Game 2 only")).toBeInTheDocument();
  });
});
