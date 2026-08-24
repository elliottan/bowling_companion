import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Stats } from "./Stats";
import type { BallPerformanceReport, BowlingStats, LeaveStats } from "../lib/stats";
import { describePinsStanding } from "../lib/pins";

const STATS: BowlingStats = {
  totalSessions: 1,
  totalGames: 1,
  completedGames: 1,
  averageScore: 200,
  highGame: 200,
  lowGame: 200,
  strikePct: 60,
  sparePct: 80,
  pocketPct: 90,
  carryPct: 67,
  byAlley: []
};

const REPORT: BallPerformanceReport = {
  unattributed: 0,
  balls: [
    {
      ballId: 1,
      name: "Wolverine",
      imageThumb: null,
      brand: null,
      firstBalls: 12,
      pocketPct: 100,
      carryPct: 75,
      strikePct: 75,
      byGame: [
        { gameNumber: 4, firstBalls: 12, pocket: 12, strikes: 9, pocketStrikes: 9, sessions: [] }
      ],
      leaves: []
    }
  ]
};

describe("stat definitions", () => {
  it("explains a tile when it is tapped, and hides it when tapped again", () => {
    render(<Stats stats={STATS} />);
    expect(screen.queryByText(/balls thrown at a full rack that hit the pocket/i)).toBeNull();

    fireEvent.click(screen.getByText("Pocket"));
    expect(screen.getByText(/balls thrown at a full rack that hit the pocket/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Pocket"));
    expect(screen.queryByText(/balls thrown at a full rack that hit the pocket/i)).toBeNull();
  });

  it("swaps one definition for another rather than stacking them", () => {
    render(<Stats stats={STATS} />);
    fireEvent.click(screen.getByText("Pocket"));
    fireEvent.click(screen.getByText("Carry"));
    expect(screen.getByText(/pocket hits that struck/i)).toBeInTheDocument();
    expect(screen.queryByText(/balls thrown at a full rack that hit the pocket/i)).toBeNull();
  });

  it("explains the rows of a ball's table too", () => {
    render(<Stats stats={STATS} ballPerformance={REPORT} />);
    fireEvent.click(screen.getByText("Ball performance"));
    fireEvent.click(screen.getByText("Wolverine"));

    // The tile and the table row share a label, so the row is the second one.
    fireEvent.click(screen.getAllByText("Carry")[0]);
    expect(screen.getByText(/pocket hits that struck/i)).toBeInTheDocument();
  });
});

describe("leave cells", () => {
  const tenPin: LeaveStats = {
    pins: [10],
    attempts: 3,
    chances: 2,
    conversions: 1,
    conversionPct: 50
  };

  it("reads the rate off chances, and says nothing about the leaves that had none", () => {
    render(<Stats stats={STATS} leaves={[tenPin]} />);
    expect(screen.getByText("1/2")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    // The third time it was left, no ball followed it. These cards are about
    // converting, so that one is not reported here at all.
    expect(screen.queryByText("+1")).toBeNull();
    expect(screen.queryByText("1/3")).toBeNull();
  });

  it("drops a leave no ball ever followed, rather than showing it as 0/0", () => {
    const lastBallOnly: LeaveStats = {
      pins: [7],
      attempts: 2,
      chances: 0,
      conversions: 0,
      conversionPct: null
    };
    render(<Stats stats={STATS} leaves={[lastBallOnly]} />);
    expect(screen.queryByText("0/0")).toBeNull();
    expect(screen.queryByText("Makeables")).toBeNull();
  });

  it("marks nothing when every leave had a ball after it", () => {
    render(<Stats stats={STATS} leaves={[{ ...tenPin, attempts: 2 }]} />);
    expect(screen.queryByText(/^\+\d+$/)).toBeNull();
  });

  it("groups a ball's own leaves the way the cards below are, easiest first", () => {
    const leave = (pins: number[], attempts: number): LeaveStats => ({
      pins: pins as LeaveStats["pins"],
      attempts,
      chances: attempts,
      conversions: 0,
      conversionPct: 0
    });
    render(
      <Stats
        stats={STATS}
        ballPerformance={{
          ...REPORT,
          balls: [
            {
              ...REPORT.balls[0],
              // Most-shot-at first coming in, so any grouping has to reorder.
              leaves: [leave([7, 10], 5), leave([1, 2, 4, 10], 3), leave([10], 2), leave([4], 1)]
            }
          ]
        }}
      />
    );
    fireEvent.click(screen.getByText("Ball performance"));
    fireEvent.click(screen.getByText("Wolverine"));

    const order = screen
      .getAllByRole("img")
      .map((el) => el.getAttribute("aria-label"))
      .filter((l): l is string => l !== null);
    expect(order).toEqual([
      describePinsStanding([10]),
      describePinsStanding([4]),
      describePinsStanding([1, 2, 4, 10]),
      describePinsStanding([7, 10])
    ]);
  });

  it("explains the counts when the group heading is tapped", () => {
    render(<Stats stats={STATS} leaves={[tenPin]} />);
    fireEvent.click(screen.getByText("Makeables"));
    expect(screen.getByText(/no spare to make/i)).toBeInTheDocument();
  });
});
