import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Stats } from "./Stats";
import { clearViewMemory } from "../lib/viewMemory";
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

// What is expanded is remembered for the app run (`lib/viewMemory`), so each
// test starts from a screen nobody has touched.
beforeEach(clearViewMemory);

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

  it("puts pocket, carry and strike on the ball's own row, with the ball count", () => {
    render(<Stats stats={STATS} ballPerformance={REPORT} />);

    // The row reads P 100 · C 75 · S 75 · 12, letters muted and numbers bold.
    const row = screen.getByText("Wolverine").closest("button")!;
    expect(row).toHaveTextContent(/P\s*100\s*·\s*C\s*75\s*·\s*S\s*75\s*·\s*12/);
  });

  it("explains the rows of a ball's table too", () => {
    render(<Stats stats={STATS} ballPerformance={REPORT} />);
    fireEvent.click(screen.getByText("Wolverine"));

    // The tile and the table row share a label, so the row is the second one.
    fireEvent.click(screen.getAllByText("Carry")[0]);
    expect(screen.getByText(/pocket hits that struck/i)).toBeInTheDocument();
  });
});

describe("the games behind a column", () => {
  const withSessions: BallPerformanceReport = {
    ...REPORT,
    balls: [
      {
        ...REPORT.balls[0],
        byGame: [
          {
            gameNumber: 4,
            firstBalls: 12,
            pocket: 12,
            strikes: 9,
            pocketStrikes: 9,
            sessions: [
              {
                sessionId: 3,
                gameId: 30,
                date: "2026-08-05",
                alley: "Chinese Swimming Club",
                event: "SIA Bilateral",
                lanes: ["5", "6"],
                oilPattern: "Chromium 42ft",
                firstBalls: 12,
                pocket: 12,
                strikes: 7,
                pocketStrikes: 7
              }
            ]
          }
        ]
      }
    ]
  };

  function openDrilldown(onOpenGame: (sessionId: number, gameId: number, ballId?: number) => void = () => {}) {
    render(<Stats stats={STATS} ballPerformance={withSessions} onOpenGame={onOpenGame} />);
    fireEvent.click(screen.getByText("Wolverine"));
    fireEvent.click(screen.getByRole("button", { name: /Games behind Wolverine, game 4/ }));
  }

  it("names the ball, and says which game the usages are in", () => {
    openDrilldown();
    expect(screen.getByRole("heading", { name: "Wolverine" })).toBeInTheDocument();
    expect(screen.getByText("Usages in game 4")).toBeInTheDocument();
  });

  it("shows the event and the rates behind the counts", () => {
    openDrilldown();
    expect(screen.getByText("SIA Bilateral · Lanes 5/6 · Chromium 42ft")).toBeInTheDocument();
    expect(screen.getByLabelText("pocket 12 of 12, 100%")).toBeInTheDocument();
    expect(screen.getByLabelText("carry 7 of 12, 58%")).toBeInTheDocument();
    expect(screen.getByLabelText("strike 7 of 12, 58%")).toBeInTheDocument();
    expect(screen.getByText("12 balls")).toBeInTheDocument();
  });

  it("hands the ball to the caller, so the destination can light its shots up", async () => {
    const opened: Array<[number, number, number | undefined]> = [];
    openDrilldown((sessionId, gameId, ballId) => opened.push([sessionId, gameId, ballId]));
    fireEvent.click(screen.getByText("Chinese Swimming Club"));
    // The dialog plays its exit before handing over, so the call lands a beat
    // after the tap.
    await waitFor(() => expect(opened).toEqual([[3, 30, 1]]));
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

describe("what stays open", () => {
  it("shows ball performance expanded, and keeps a ball open across a remount", () => {
    const first = render(<Stats stats={STATS} ballPerformance={REPORT} />);
    // Open on arrival: the card is the reason to be on this screen.
    expect(screen.getByText("Wolverine")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Wolverine"));
    expect(screen.getByText("Balls")).toBeInTheDocument();
    first.unmount();

    // Leaving for a session and coming back finds it as it was left.
    render(<Stats stats={STATS} ballPerformance={REPORT} />);
    expect(screen.getByText("Balls")).toBeInTheDocument();
  });

  it("keeps each screen's copy apart", () => {
    const history = render(
      <Stats stats={STATS} ballPerformance={REPORT} memoryKey="history" />
    );
    fireEvent.click(screen.getByText("Wolverine"));
    expect(screen.getByText("Balls")).toBeInTheDocument();
    history.unmount();

    // A session sheet has its own idea of what is expanded.
    render(<Stats stats={STATS} ballPerformance={REPORT} memoryKey="session" />);
    expect(screen.queryByText("Balls")).toBeNull();
  });
});
