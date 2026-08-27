import { beforeEach, describe, expect, it, vi } from "vitest";
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
  firstBallAverage: 8.4,
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

const TREND = [
  {
    sessionId: 1,
    date: "2026-06-07",
    alley: "Sea Bowl",
    games: 3,
    stats: STATS
  },
  {
    sessionId: 2,
    date: "2026-06-14",
    alley: "Sea Bowl",
    games: 3,
    stats: { ...STATS, strikePct: 40, carryPct: 50, pocketPct: 80, firstBallAverage: 8.9 }
  }
];

/** The average keeps its own chart, which draws a dot per game, so it needs the
 *  scores as well as the per-night stats block. */
const SESSION_TREND = [
  { sessionId: 1, date: "2026-06-07", alley: "Sea Bowl", average: 200, scores: [190, 200, 210] },
  { sessionId: 2, date: "2026-06-14", alley: "Sea Bowl", average: 180, scores: [170, 180, 190] }
];

describe("picking what the chart plots", () => {
  it("starts on the average", () => {
    render(<Stats stats={STATS} sessionMetrics={TREND} sessionTrend={SESSION_TREND} />);
    expect(screen.getByRole("button", { name: /Avg/, pressed: true })).toBeInTheDocument();
    expect(screen.getByText(/Avg by\s+session/)).toBeInTheDocument();
  });

  it("moves the chart to whichever tile is tapped", () => {
    render(<Stats stats={STATS} sessionMetrics={TREND} sessionTrend={SESSION_TREND} />);

    fireEvent.click(screen.getByRole("button", { name: /Carry/ }));
    expect(screen.getByText(/Carry by\s+session/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Carry/, pressed: true })).toBeInTheDocument();
    // Only one at a time.
    expect(screen.getByRole("button", { name: /Avg/, pressed: false })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Pocket/ }));
    expect(screen.getByText(/Pocket by\s+session/)).toBeInTheDocument();
    expect(screen.queryByText(/Carry by\s+session/)).toBeNull();
  });

  it("plots the value each night actually had", () => {
    render(<Stats stats={STATS} sessionMetrics={TREND} sessionTrend={SESSION_TREND} />);
    fireEvent.click(screen.getByRole("button", { name: /Strike/ }));
    // 60 on the first night, 40 on the second, read off the same stats block
    // the tiles are read from.
    const plotted = screen
      .getAllByRole("button", { name: /Sea Bowl, \d+%/ })
      .map((b) => b.getAttribute("aria-label"));
    expect(plotted).toEqual(["Sea Bowl, 60%", "Sea Bowl, 40%"]);
  });

  it("explains the plotted stat from the chart, not the tile", () => {
    render(<Stats stats={STATS} sessionMetrics={TREND} sessionTrend={SESSION_TREND} />);
    fireEvent.click(screen.getByRole("button", { name: /Pocket/ }));
    expect(screen.queryByText(/balls thrown at a full rack that hit the pocket/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /What Pocket counts/ }));
    expect(screen.getByText(/balls thrown at a full rack that hit the pocket/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /What Pocket counts/ }));
    expect(screen.queryByText(/balls thrown at a full rack that hit the pocket/i)).toBeNull();
  });
});

describe("stat definitions", () => {
  it("puts pocket, carry and strike on the ball's own row, with the ball count", () => {
    render(<Stats stats={STATS} ballPerformance={REPORT} />);

    // Under the P / C / S / Balls headings, in that order.
    const row = screen.getByText("Wolverine").closest("button")!;
    expect(row).toHaveTextContent(/100%\s*75%\s*75%\s*12/);
    expect(screen.getByLabelText("pocket 100%")).toBeInTheDocument();
    expect(screen.getByLabelText("carry 75%")).toBeInTheDocument();
    expect(screen.getByLabelText("strike 75%")).toBeInTheDocument();
    expect(screen.getByLabelText("12 balls")).toBeInTheDocument();
  });

  it("explains the rows of a ball's table", () => {
    render(<Stats stats={STATS} ballPerformance={REPORT} />);
    fireEvent.click(screen.getByText("Wolverine"));

    // The expanded table's own Carry row, not the tile that shares its label.
    const rowLabel = screen
      .getAllByText("Carry")
      .find((el) => el.closest("tr") !== null)!;
    fireEvent.click(rowLabel);
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
  it("keeps a ball open across a remount", () => {
    const first = render(<Stats stats={STATS} ballPerformance={REPORT} />);
    // The card itself never folds, so the balls are always listed.
    expect(screen.getByText("Wolverine")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Wolverine"));
    // The per-game table is the row's own content.
    expect(screen.getByText("Game")).toBeInTheDocument();
    first.unmount();

    // Leaving for a session and coming back finds it as it was left.
    render(<Stats stats={STATS} ballPerformance={REPORT} />);
    expect(screen.getByText("Game")).toBeInTheDocument();
  });

  it("keeps each screen's copy apart", () => {
    const history = render(
      <Stats stats={STATS} ballPerformance={REPORT} memoryKey="history" />
    );
    fireEvent.click(screen.getByText("Wolverine"));
    expect(screen.getByText("Game")).toBeInTheDocument();
    history.unmount();

    // A session sheet has its own idea of what is expanded.
    render(<Stats stats={STATS} ballPerformance={REPORT} memoryKey="session" />);
    expect(screen.queryByText("Game")).toBeNull();
  });
});

describe("first ball average", () => {
  it("sits with pocket and carry, and can be plotted like them", () => {
    render(<Stats stats={STATS} leaves={[]} sessionMetrics={TREND} sessionTrend={SESSION_TREND} />);
    expect(screen.getByText("8.4")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /1st ball/ }));
    expect(screen.getByText(/1st ball by\s+session/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /What 1st ball counts/ }));
    expect(screen.getByText(/pins knocked down by the average ball/i)).toBeInTheDocument();
  });

  it("keeps the decimal on a whole number", () => {
    render(<Stats stats={{ ...STATS, firstBallAverage: 9 }} leaves={[]} />);
    expect(screen.getByText("9.0")).toBeInTheDocument();
  });

  it("shows a dash when nothing has been thrown", () => {
    render(<Stats stats={{ ...STATS, firstBallAverage: null }} leaves={[]} />);
    expect(screen.getByText("1st ball").previousSibling).toHaveTextContent("-");
  });
});

describe("inside a session, the picker drives the per-game chart", () => {
  const GAME_METRICS = [
    { gameId: 1, gameNumber: 1, lanes: ["11", "12"], stats: STATS },
    {
      gameId: 2,
      gameNumber: 2,
      lanes: ["11", "12"],
      stats: { ...STATS, strikePct: 30, carryPct: 45 }
    },
    {
      gameId: 3,
      gameNumber: 3,
      lanes: ["11", "12"],
      // Still being bowled: no score yet, but the balls thrown still count.
      stats: { ...STATS, averageScore: null, strikePct: 50, carryPct: 80 }
    }
  ];
  const GAMES = [
    { id: 1, game_number: 1, final_score: 200 },
    { id: 2, game_number: 2, final_score: 170 },
    { id: 3, game_number: 3, final_score: undefined }
  ];

  it("keeps the score line for the average, and says these are games", () => {
    render(<Stats stats={STATS} games={GAMES} gameMetrics={GAME_METRICS} />);
    expect(screen.getByText(/Avg by\s+game/)).toBeInTheDocument();
    // The score line names games, not nights.
    expect(screen.getByRole("button", { name: /Game 1/ })).toBeInTheDocument();
  });

  it("swaps to one point per game for any other stat", () => {
    render(<Stats stats={STATS} games={GAMES} gameMetrics={GAME_METRICS} />);
    fireEvent.click(screen.getByRole("button", { name: /Strike/ }));

    const plotted = screen
      .getAllByRole("button", { name: /^Game \d, \d+%$/ })
      .map((b) => b.getAttribute("aria-label"));
    expect(plotted).toEqual(["Game 1, 60%", "Game 2, 30%", "Game 3, 50%"]);
  });

  it("plots a game that has no score yet, and breaks the average line at it", () => {
    render(<Stats stats={STATS} games={GAMES} gameMetrics={GAME_METRICS} />);
    fireEvent.click(screen.getByRole("button", { name: /Carry/ }));
    // Carry exists for the unfinished game; the average would not.
    expect(screen.getByRole("button", { name: "Game 3, 80%" })).toBeInTheDocument();
  });

  it("does not fall back to the by-session chart", () => {
    render(
      <Stats stats={STATS} games={GAMES} gameMetrics={GAME_METRICS} sessionMetrics={TREND} />
    );
    fireEvent.click(screen.getByRole("button", { name: /Pocket/ }));
    expect(screen.queryByRole("button", { name: /Sea Bowl, \d+%/ })).toBeNull();
  });
});

describe("plotting by position in the night", () => {
  const SLOTS = [
    { gameNumber: 1, games: 8, stats: { ...STATS, carryPct: 70 } },
    { gameNumber: 2, games: 8, stats: { ...STATS, carryPct: 60 } },
    { gameNumber: 3, games: 6, stats: { ...STATS, carryPct: 45 } },
    { gameNumber: 4, games: 2, stats: { ...STATS, carryPct: 30 } },
    { gameNumber: 5, games: 1, stats: { ...STATS, carryPct: 25 } }
  ];

  it("offers the axis only where there is a second axis to offer", () => {
    render(<Stats stats={STATS} sessionMetrics={TREND} sessionTrend={SESSION_TREND} />);
    expect(screen.queryByRole("button", { name: "Plot by game" })).toBeNull();
  });

  it("switches the chart to one point per game slot", () => {
    render(
      <Stats
        stats={STATS}
        sessionMetrics={TREND}
        sessionTrend={SESSION_TREND}
        gameNumberMetrics={SLOTS}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Carry/ }));
    fireEvent.click(screen.getByRole("button", { name: "Plot by game" }));

    const plotted = screen
      .getAllByRole("button", { name: /^Game \d, \d+%$/ })
      .map((b) => b.getAttribute("aria-label"));
    expect(plotted).toEqual([
      "Game 1, 70%",
      "Game 2, 60%",
      "Game 3, 45%",
      "Game 4, 30%",
      "Game 5, 25%"
    ]);
    // The by-session points are gone, not merely hidden behind them.
    expect(screen.queryByRole("button", { name: /Sea Bowl, \d+%/ })).toBeNull();
  });

  it("takes the average too, since a slot has no score line", () => {
    render(
      <Stats
        stats={STATS}
        sessionMetrics={TREND}
        sessionTrend={SESSION_TREND}
        gameNumberMetrics={SLOTS}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Plot by game" }));
    expect(screen.getByRole("button", { name: "Game 1, 200" })).toBeInTheDocument();
  });

  it("narrows to a slot when one is picked", () => {
    const onSelectGameNumber = vi.fn();
    render(
      <Stats
        stats={STATS}
        sessionMetrics={TREND}
        sessionTrend={SESSION_TREND}
        gameNumberMetrics={SLOTS}
        onSelectGameNumber={onSelectGameNumber}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Plot by game" }));
    fireEvent.click(screen.getByRole("button", { name: "Game 3, 200" }));
    fireEvent.click(screen.getByRole("button", { name: /^Game 3 / }));
    expect(onSelectGameNumber).toHaveBeenCalledWith(3);
  });

  it("goes back to nights when the axis is switched back", () => {
    render(
      <Stats
        stats={STATS}
        sessionMetrics={TREND}
        sessionTrend={SESSION_TREND}
        gameNumberMetrics={SLOTS}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Plot by game" }));
    fireEvent.click(screen.getByRole("button", { name: "Plot by session" }));
    // Back on the average's own chart, whose points are nights.
    expect(screen.getByRole("button", { name: /Sea Bowl, average 200/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Game \d, \d+%$/ })).toBeNull();
  });
});
