import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Stats } from "./Stats";
import type { BallPerformanceReport, BowlingStats, LeaveStats } from "../lib/stats";

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

  it("reads the rate off chances and marks the leaves that had none", () => {
    render(<Stats stats={STATS} leaves={[tenPin]} />);
    expect(screen.getByText("1/2")).toBeInTheDocument();
    expect(screen.getByText("+1")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("marks nothing when every leave had a ball after it", () => {
    render(<Stats stats={STATS} leaves={[{ ...tenPin, attempts: 2 }]} />);
    expect(screen.queryByText(/^\+\d+$/)).toBeNull();
  });

  it("explains the counts when the group heading is tapped", () => {
    render(<Stats stats={STATS} leaves={[tenPin]} />);
    fireEvent.click(screen.getByText("Makeables"));
    expect(screen.getByText(/no spare to make/i)).toBeInTheDocument();
  });
});
