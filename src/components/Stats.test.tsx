import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  strikeOnStrikePct: 47,
  bestStreak: 4,
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

describe("the headline", () => {
  it("leads with the average, and names the high, low and games under it", () => {
    render(<Stats stats={{ ...STATS, highGame: 211, lowGame: 134 }} />);
    expect(screen.getByRole("heading", { name: "Average" }).nextElementSibling).toHaveTextContent("200");
    expect(screen.getByText("211").previousElementSibling).toHaveTextContent("High");
    expect(screen.getByText("134").previousElementSibling).toHaveTextContent("Low");
    expect(screen.getByText("Games").nextElementSibling).toHaveTextContent("1");
  });

  it("says nothing about recent form when it is not given", () => {
    render(<Stats stats={STATS} />);
    expect(screen.queryByText(/over your last/)).toBeNull();
  });

  it("reads the last five sessions against the average", () => {
    render(<Stats stats={STATS} form={{ average: 207, difference: 7 }} />);
    expect(screen.getByText(/over your last 5 sessions, 7 above your average/)).toBeInTheDocument();
  });

  it("says when they are under it, without colouring it as a failure", () => {
    render(<Stats stats={STATS} form={{ average: 188, difference: -12 }} />);
    const line = screen.getByText(/over your last 5 sessions, 12 under your average/);
    expect(line.closest("p")!.innerHTML).not.toMatch(/danger/);
  });

  it("says when they are level", () => {
    render(<Stats stats={STATS} form={{ average: 200, difference: 0 }} />);
    expect(screen.getByText(/level with your average/)).toBeInTheDocument();
  });

  it("says why it is empty when the caller knows", () => {
    render(
      <Stats
        stats={{ ...STATS, totalGames: 0 }}
        empty={{ title: "Nothing in the last 3 months", description: "Your earlier games are under All." }}
      />
    );
    expect(screen.getByText("Nothing in the last 3 months")).toBeInTheDocument();
  });
});

describe("the first ball", () => {
  it("reads pocket, carry and strike as one chain", () => {
    render(<Stats stats={STATS} />);
    const terms = screen
      .getByRole("heading", { name: "First ball" })
      .closest("section")!
      .querySelectorAll("dt");
    expect([...terms].map((t) => t.textContent)).toEqual([
      "Pocket",
      "Carry",
      "Strike",
      "Strike on strike",
      "Streak"
    ]);
    expect(screen.getByText("Pocket").nextElementSibling).toHaveTextContent("90%");
    expect(screen.getByText("Carry").nextElementSibling).toHaveTextContent("67%");
  });
});

describe("strike on strike and the streak", () => {
  it("sits with the first ball, and says what it counts on the chart", () => {
    render(<Stats stats={STATS} sessionMetrics={TREND} sessionTrend={SESSION_TREND} />);
    const card = screen.getByRole("heading", { name: "First ball" }).closest("section")!;
    expect(within(card).getByText("Strike on strike").nextElementSibling).toHaveTextContent("47%");
    expect(within(card).getByText("Streak").nextElementSibling).toHaveTextContent("4");

    fireEvent.click(screen.getByRole("button", { name: "Strike on strike" }));
    expect(screen.getByText("Strikes the next ball struck too.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Streak" }));
    expect(screen.getByText("Most strikes in a row in one game.")).toBeInTheDocument();
  });
});

describe("picking what the chart plots", () => {
  it("starts on the average", () => {
    render(<Stats stats={STATS} sessionMetrics={TREND} sessionTrend={SESSION_TREND} />);
    expect(screen.getByRole("group", { name: "Chart by session" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Average", pressed: true })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /^Average by session/ })).toBeInTheDocument();
  });

  it("moves the chart to whichever chip is tapped, one at a time", () => {
    render(<Stats stats={STATS} sessionMetrics={TREND} sessionTrend={SESSION_TREND} />);

    fireEvent.click(screen.getByRole("button", { name: "Carry" }));
    expect(screen.getByRole("button", { name: "Carry", pressed: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Average", pressed: false })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Sea Bowl, 67%" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Pocket" }));
    expect(screen.getByRole("button", { name: "Sea Bowl, 90%" })).toBeInTheDocument();
  });

  it("marks the game average with the dashed line, not the mean of the nights", () => {
    // Nights of 200 and 180 average 190; the games behind the headline say 200.
    render(<Stats stats={STATS} sessionMetrics={TREND} sessionTrend={SESSION_TREND} />);
    expect(screen.getByText("avg 200")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Overall average 200\./ })).toBeInTheDocument();
  });

  it("plots the value each night actually had", () => {
    render(<Stats stats={STATS} sessionMetrics={TREND} sessionTrend={SESSION_TREND} />);
    fireEvent.click(screen.getByRole("button", { name: "Strike" }));
    // 60 on the first night, 40 on the second, read off the same stats block
    // the tiles are read from.
    const plotted = screen
      .getAllByRole("button", { name: /Sea Bowl, \d+%/ })
      .map((b) => b.getAttribute("aria-label"));
    expect(plotted).toEqual(["Sea Bowl, 60%", "Sea Bowl, 40%"]);
  });

  it("always says what the plotted stat counts, with no button to open it", () => {
    render(<Stats stats={STATS} sessionMetrics={TREND} sessionTrend={SESSION_TREND} />);
    expect(screen.getByText("Your score per finished game.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Carry" }));
    expect(screen.getByText("Pocket hits that struck.")).toBeInTheDocument();
    expect(screen.queryByText("Your score per finished game.")).toBeNull();
    expect(screen.queryByRole("button", { name: /^What .* counts$/ })).toBeNull();
  });

  it("gives every stat on the picker a line short enough for one row on a phone", () => {
    render(<Stats stats={STATS} sessionMetrics={TREND} sessionTrend={SESSION_TREND} />);
    const picker = screen.getByRole("group", { name: "Chart by session" });
    for (const chip of within(picker).getAllByRole("button")) {
      fireEvent.click(chip);
      const line = picker.parentElement!.nextElementSibling!;
      expect(line.textContent!.length).toBeGreaterThan(0);
      // About what fits a 390px card at 12px.
      expect(line.textContent!.length).toBeLessThanOrEqual(50);
    }
  });
});

describe("stat definitions", () => {
  it("gives a ball one number, its strike rate, with the balls behind it", () => {
    render(<Stats stats={STATS} ballPerformance={REPORT} />);

    const row = screen.getByText("Wolverine").closest("button")!;
    expect(row).toHaveTextContent(/75%\s*12 balls/);
    expect(screen.getByLabelText("strike 75%")).toBeInTheDocument();
    // Pocket and carry are one tap down.
    expect(row).not.toHaveTextContent("100%");
    fireEvent.click(row);
    expect(screen.getByRole("row", { name: /Pocket/ })).toHaveTextContent("100%");
  });

  it("ranks the balls by strike rate, and puts a thin one last however it strikes", () => {
    const ball = REPORT.balls[0];
    render(
      <Stats
        stats={STATS}
        ballPerformance={{
          ...REPORT,
          balls: [
            { ...ball, ballId: 1, name: "Thin", firstBalls: 4, strikePct: 100 },
            { ...ball, ballId: 2, name: "Steady", firstBalls: 40, strikePct: 45 },
            { ...ball, ballId: 3, name: "Hot", firstBalls: 30, strikePct: 55 }
          ]
        }}
      />
    );
    const names = screen
      .getByRole("heading", { name: "Balls" })
      .closest("section")!
      .querySelectorAll("li .truncate");
    expect([...names].map((n) => n.textContent)).toEqual(["Hot", "Steady", "Thin"]);
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
    expect(screen.getByRole("dialog")).toHaveTextContent("12 balls");
  });

  it("hands the ball to the caller, so the destination can light its shots up", async () => {
    const opened: Array<[number, number, number | undefined]> = [];
    openDrilldown((sessionId, gameId, ballId) => opened.push([sessionId, gameId, ballId]));
    fireEvent.click(screen.getByText("Chinese Swimming Club"));
    // The dialog plays its exit before handing over, so the call lands a beat
    // after the tap.
    await waitFor(() => expect(opened).toEqual([[3, 30, 1]]));
  });

  it("closes itself on the way out, so it does not come back over the game it opened", async () => {
    openDrilldown();
    fireEvent.click(screen.getByText("Chinese Swimming Club"));
    await waitFor(() => expect(screen.queryByText("Usages in game 4")).toBeNull());
  });
});

describe("leave cells", () => {
  const tenPin: LeaveStats = {
    pins: [10],
    attempts: 3,
    chances: 2,
    conversions: 1,
    conversionPct: 50,
    sharePct: 6
  };

  it("names the makeables missed most on the spares card, most misses first", () => {
    const leave = (pins: number[], chances: number, conversions: number): LeaveStats => ({
      pins: pins as LeaveStats["pins"],
      attempts: chances,
      chances,
      conversions,
      conversionPct: Math.round((conversions / chances) * 100),
      sharePct: null
    });
    render(
      <Stats
        stats={STATS}
        leaves={[
          leave([10], 20, 18), // 2 missed
          leave([7], 10, 4), // 6 missed
          leave([3, 6, 10], 9, 5), // 4 missed
          leave([2, 4, 5, 8], 3, 2), // 1 missed
          leave([5], 5, 5), // never missed
          leave([7, 10], 8, 0) // a split: not a spare you missed
        ]}
      />
    );
    const card = screen.getByRole("button", { name: "Spares" }).closest("section")!;
    const shown = [...card.querySelectorAll("button[aria-label^='Open ']")].map((b) =>
      b.getAttribute("aria-label")
    );
    expect(shown).toEqual(["Open Pin 7", "Open 3-6-10", "Open Pin 10"]);
    expect(card).toHaveTextContent("80%");
  });

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
      conversionPct: null,
      sharePct: 4
    };
    render(<Stats stats={STATS} leaves={[lastBallOnly]} />);
    expect(screen.queryByText("0/0")).toBeNull();
    expect(screen.queryByText("Makeables")).toBeNull();
  });

  it("lists every leave, grouped, behind All leaves", async () => {
    const singles: LeaveStats[] = [];
    // Thirteen makeable leaves: every single pin, then three baby splits.
    const pinsList = [[1], [2], [3], [4], [5], [6], [7], [8], [9], [10], [2, 7], [3, 10], [4, 5]];
    pinsList.forEach((pins, i) =>
      singles.push({ ...tenPin, pins: pins as LeaveStats["pins"], chances: 20 - i, attempts: 20 - i })
    );
    render(<Stats stats={STATS} leaves={[...singles, { ...tenPin, pins: [7, 10] }]} />);
    // The card names three.
    expect(screen.getAllByRole("button", { name: /^Open / })).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: "All leaves" }));
    const sheet = await screen.findByRole("dialog", { name: "Leaves" });
    expect(sheet.querySelectorAll("li")).toHaveLength(14);
    expect(sheet).toHaveTextContent("Makeables");
    expect(sheet).toHaveTextContent("Splits");
  });

  it("opens a leave's details from its cell", async () => {
    render(<Stats stats={STATS} leaves={[tenPin]} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Pin 10" }));
    expect(await screen.findByRole("dialog", { name: "Pin 10" })).toBeInTheDocument();
    // Read first: editing is behind the pencil.
    expect(screen.getByRole("button", { name: "Edit spare line" })).toBeInTheDocument();
    expect(screen.getByText("Converted")).toBeInTheDocument();
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
      conversionPct: 0,
      sharePct: null
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

  it("puts a ball's leave count against how much that ball was thrown", () => {
    render(
      <Stats
        stats={STATS}
        ballPerformance={{
          ...REPORT,
          balls: [
            {
              ...REPORT.balls[0],
              leaves: [
                {
                  pins: [10],
                  attempts: 9,
                  chances: 9,
                  conversions: 4,
                  conversionPct: 44,
                  sharePct: 12
                }
              ]
            }
          ]
        }}
      />
    );
    fireEvent.click(screen.getByText("Wolverine"));
    expect(screen.getByText("times").parentElement).toHaveTextContent("9 times");
    expect(screen.getByText("12%")).toBeInTheDocument();
  });

  it("explains the counts when a group heading is tapped", async () => {
    render(<Stats stats={STATS} leaves={[tenPin]} />);
    fireEvent.click(screen.getByRole("button", { name: "All leaves" }));
    fireEvent.click(await screen.findByRole("button", { name: "Makeables" }));
    expect(screen.getByText(/no spare to follow it/i)).toBeInTheDocument();
  });

  it("explains spare % from the card's heading", () => {
    render(<Stats stats={STATS} leaves={[tenPin]} />);
    fireEvent.click(screen.getByRole("button", { name: "Spares" }));
    expect(screen.getByText(/excludes splits and washouts/i)).toBeInTheDocument();
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
  it("sits on the first ball card, and can be plotted like the rest", () => {
    render(<Stats stats={STATS} leaves={[]} sessionMetrics={TREND} sessionTrend={SESSION_TREND} />);
    expect(screen.getByText("8.4").parentElement).toHaveTextContent("8.4 pins a ball");
    fireEvent.click(screen.getByRole("button", { name: "1st ball" }));
    expect(screen.getByRole("button", { name: "Sea Bowl, 8.9" })).toBeInTheDocument();
  });

  it("keeps the decimal on a whole number", () => {
    render(<Stats stats={{ ...STATS, firstBallAverage: 9 }} leaves={[]} />);
    expect(screen.getByText("9.0")).toBeInTheDocument();
  });

  it("shows a dash when nothing has been thrown", () => {
    render(<Stats stats={{ ...STATS, firstBallAverage: null }} leaves={[]} />);
    expect(screen.getByText(/pins a ball/).parentElement).toHaveTextContent("- pins a ball");
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
    expect(screen.getByRole("group", { name: "Chart by game" })).toBeInTheDocument();
    // The score line names games, not nights.
    expect(screen.getByRole("button", { name: /Game 1/ })).toBeInTheDocument();
  });

  it("swaps to one point per game for any other stat", () => {
    render(<Stats stats={STATS} games={GAMES} gameMetrics={GAME_METRICS} />);
    fireEvent.click(screen.getByRole("button", { name: "Strike" }));

    const plotted = screen
      .getAllByRole("button", { name: /^Game \d, \d+%$/ })
      .map((b) => b.getAttribute("aria-label"));
    expect(plotted).toEqual(["Game 1, 60%", "Game 2, 30%", "Game 3, 50%"]);
  });

  it("plots a game that has no score yet, and breaks the average line at it", () => {
    render(<Stats stats={STATS} games={GAMES} gameMetrics={GAME_METRICS} />);
    fireEvent.click(screen.getByRole("button", { name: "Carry" }));
    // Carry exists for the unfinished game; the average would not.
    expect(screen.getByRole("button", { name: "Game 3, 80%" })).toBeInTheDocument();
  });

  it("does not fall back to the by-session chart", () => {
    render(
      <Stats stats={STATS} games={GAMES} gameMetrics={GAME_METRICS} sessionMetrics={TREND} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Pocket" }));
    expect(screen.queryByRole("button", { name: /Sea Bowl, \d+%/ })).toBeNull();
  });
});
