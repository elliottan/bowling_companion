import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Stats } from "./Stats";
import { clearViewMemory } from "../lib/viewMemory";
import type { BallPerformanceReport, BowlingStats, LeaveStats } from "../lib/stats";
import { describePinsStanding } from "../lib/pins";
import { ProAccessContext } from "../lib/useProAccess";
import type { PinNumber } from "../types/bowling";

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
      firstBallAverage: 9.3,
      strikeOnStrikePct: 75,
      byGame: [
        {
          gameNumber: 4,
          firstBalls: 12,
          pocket: 12,
          strikes: 9,
          pocketStrikes: 9,
          firstBallPins: 111,
          followUpOpps: 8,
          followUps: 6,
          sessions: []
        }
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
      "Max consecutive strikes"
    ]);
    expect(screen.getByText("Pocket").nextElementSibling).toHaveTextContent("90%");
    expect(screen.getByText("Carry").nextElementSibling).toHaveTextContent("67%");
  });
});

describe("strike on strike and max consecutive strikes", () => {
  it("sits with the first ball, and says what it counts on the chart", () => {
    render(<Stats stats={STATS} sessionMetrics={TREND} sessionTrend={SESSION_TREND} />);
    const card = screen.getByRole("heading", { name: "First ball" }).closest("section")!;
    expect(within(card).getByText("Strike on strike").nextElementSibling).toHaveTextContent("47%");
    expect(within(card).getByText("Max consecutive strikes").nextElementSibling).toHaveTextContent("4");

    fireEvent.click(screen.getByRole("button", { name: "Strike on strike" }));
    expect(screen.getByText("Strikes the next ball struck too.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Max consecutive strikes" }));
    expect(screen.getByText("Most strikes in a row in one game.")).toBeInTheDocument();
  });

  it("is the last chip on the picker", () => {
    render(<Stats stats={STATS} sessionMetrics={TREND} sessionTrend={SESSION_TREND} />);
    const chips = within(screen.getByRole("group", { name: "Chart by session" })).getAllByRole("button");
    expect(chips[chips.length - 1]).toHaveTextContent("Max consecutive strikes");
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
  it("puts pocket, carry and strike on each ball's row, with the balls behind them", () => {
    render(<Stats stats={STATS} ballPerformance={REPORT} />);

    const row = screen.getByRole("button", { name: "Open Wolverine" });
    expect(row).toHaveTextContent(/12 balls\s*100%\s*75%\s*75%/);
    expect(within(row).getByLabelText("pocket 100%")).toBeInTheDocument();
    expect(within(row).getByLabelText("carry 75%")).toBeInTheDocument();
    expect(within(row).getByLabelText("strike 75%")).toBeInTheDocument();
  });

  it("shows every ball on the card, and every ball, each one open, behind All balls", async () => {
    const ball = REPORT.balls[0];
    const balls = Array.from({ length: 7 }, (_, i) => ({
      ...ball,
      ballId: i + 1,
      name: `Ball ${i + 1}`,
      firstBalls: 40,
      strikePct: 70 - i
    }));
    render(<Stats stats={STATS} ballPerformance={{ ...REPORT, balls }} scopeLabel="Last 10 sessions  ·  Sea Bowl" />);
    // Every ball is on the card, the list scrolling inside it.
    expect(
      within(screen.getByRole("region", { name: "Ball columns" })).getAllByRole("button", {
        name: /^Open Ball /
      })
    ).toHaveLength(7);

    fireEvent.click(screen.getByRole("button", { name: /^View all \d+ balls?$/ }));
    const sheet = await screen.findByRole("dialog", { name: "Balls" });
    expect(within(sheet).getAllByText(/^Ball \d$/)).toHaveLength(7);
    // Every ball's table is open, no tap needed.
    expect(within(sheet).getAllByRole("table")).toHaveLength(7);
    // The Stats tab's scope rides along, in the bar under the title rather
    // than in the list.
    const scope = within(sheet).getByText("Last 10 sessions · Sea Bowl");
    expect(scope.previousElementSibling).toHaveTextContent("Balls");
    // Each ball names its own rates, so nothing has to be pinned over the list.
    for (let i = 1; i <= 7; i++) {
      const line = within(sheet).getByRole("region", { name: `Ball ${i} columns` });
      expect(line).toHaveTextContent(/Pocket.*Carry.*Strike.*1st ball.*Strike on strike/);
    }
  });

  it("adds the first ball average and strike on strike to each ball's row", () => {
    render(<Stats stats={STATS} ballPerformance={REPORT} />);
    const row = screen.getByRole("button", { name: "Open Wolverine" });
    expect(within(row).getByLabelText("first ball 9.3")).toBeInTheDocument();
    expect(within(row).getByLabelText("strike on strike 75%")).toBeInTheDocument();
  });

  it("keeps the ball columns in one scroller, all rows together, on the card", () => {
    render(<Stats stats={STATS} ballPerformance={REPORT} />);
    const scroller = screen.getByRole("region", { name: "Ball columns" });
    // Down for the balls, and sideways only on a phone too narrow for the
    // columns (ADR-144).
    expect(scroller).toHaveClass("overflow-auto");
    // A long name wraps to a second line rather than being cut at the first.
    expect(within(scroller).getByText("Wolverine")).toHaveClass("line-clamp-2");
    expect(within(scroller).getByRole("button", { name: "Open Wolverine" })).toBeInTheDocument();
    expect(within(scroller).getByText("Strike on strike")).toBeInTheDocument();
  });

  it("gives each ball's table a first ball and strike on strike row, scrolled sideways", async () => {
    render(<Stats stats={STATS} ballPerformance={REPORT} />);
    fireEvent.click(screen.getByRole("button", { name: /^View all \d+ balls?$/ }));
    const sheet = await screen.findByRole("dialog", { name: "Balls" });
    const table = within(sheet).getByRole("region", { name: "Wolverine by game" });
    expect(table).toHaveClass("overflow-x-auto");
    const rows = within(table).getAllByRole("row").map((r) => r.textContent);
    // Game 4: 111 pins over 12 balls, and 6 of 8 strikes followed by a strike.
    expect(rows).toContain("1st ball9.39.3");
    expect(rows).toContain("Strike on strike75%75%");
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
      .querySelectorAll("li .line-clamp-2");
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
            firstBallPins: 111,
            followUpOpps: 8,
            followUps: 6,
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
    fireEvent.click(screen.getByRole("button", { name: "Open Wolverine" }));
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
    const dialogs = screen.getAllByRole("dialog");
    expect(dialogs[dialogs.length - 1]).toHaveTextContent("12 balls");
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

  it("lists the leaves left most on the spares card, however few times, most left first", () => {
    const leave = (pins: number[], attempts: number, conversions: number): LeaveStats => ({
      pins: pins as LeaveStats["pins"],
      attempts,
      chances: attempts,
      conversions,
      conversionPct: Math.round((conversions / attempts) * 100),
      sharePct: null
    });
    render(
      <Stats
        stats={STATS}
        leaves={[
          leave([10], 20, 18), // left most, and nearly always made
          leave([7], 10, 4),
          leave([7, 10], 8, 0), // a split is a leave like any other here
          leave([5], 5, 5), // never missed, still left
          leave([3, 6, 10], 3, 1),
          leave([2, 4, 5, 8], 1, 1) // once is enough to be on the card
        ]}
      />
    );
    const card = screen.getByRole("region", { name: "Leaves left most" });
    const shown = [...card.querySelectorAll("button[aria-label^='Open ']")].map((b) =>
      b.getAttribute("aria-label")
    );
    expect(shown).toEqual([
      "Open Pin 10",
      "Open Pin 7",
      "Open 7-10",
      "Open Pin 5",
      "Open 3-6-10",
      "Open 2-4-5-8"
    ]);
    const section = card.closest("section")!;
    expect(section).toHaveTextContent(/80%\s*made/);
    expect(section).not.toHaveTextContent(/missed/i);
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
    // The card lists every leave left three times or more, two rows on show
    // and the rest a scroll away inside it.
    const card = screen.getByRole("region", { name: "Leaves left most" });
    expect(within(card).getAllByRole("button", { name: /^Open / })).toHaveLength(14);
    expect(card.className).toMatch(/overflow-y-auto/);

    fireEvent.click(screen.getByRole("button", { name: /^View all \d+ leaves?$/ }));
    const sheet = await screen.findByRole("dialog", { name: "Leaves" });
    expect(sheet.querySelectorAll("li")).toHaveLength(14);
    expect(sheet).toHaveTextContent("Makeables");
    expect(sheet).toHaveTextContent("Splits");
  });

  it("narrows All leaves with the Spare lines filters, and says what it is counting", async () => {
    render(
      <Stats
        stats={STATS}
        scopeLabel="Last 3 months"
        leaves={[tenPin, { ...tenPin, pins: [3, 6, 10] }, { ...tenPin, pins: [2, 7] }]}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /^View all \d+ leaves?$/ }));
    const sheet = await screen.findByRole("dialog", { name: "Leaves" });
    expect(within(sheet).getByText("Last 3 months")).toBeInTheDocument();
    expect(sheet.querySelectorAll("li")).toHaveLength(3);

    const chips = within(sheet).getByRole("group", { name: "Filter leaves" });
    fireEvent.click(within(chips).getByRole("button", { name: "Single pins" }));
    expect(sheet.querySelectorAll("li")).toHaveLength(1);
    // No spare lines are saved here, so every leave has no line yet.
    fireEvent.click(within(chips).getByRole("button", { name: "Has a line" }));
    expect(within(sheet).getByText("No leaves fit these filters.")).toBeInTheDocument();
    fireEvent.click(within(chips).getByRole("button", { name: "All" }));
    expect(sheet.querySelectorAll("li")).toHaveLength(3);
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
    fireEvent.click(screen.getByRole("button", { name: /^View all \d+ leaves?$/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Makeables" }));
    expect(screen.getByText(/no spare to follow it/i)).toBeInTheDocument();
  });

  it("explains spare % from the card's heading", () => {
    render(<Stats stats={STATS} leaves={[tenPin]} />);
    fireEvent.click(screen.getByRole("button", { name: "Spares" }));
    expect(screen.getByText(/excludes splits and washouts/i)).toBeInTheDocument();
  });
});

describe("the All balls sheet", () => {
  it("opens on the ball that was tapped", async () => {
    const scrolled: string[] = [];
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this.getAttribute("data-ball") ?? "");
    };
    const ball = REPORT.balls[0];
    render(
      <Stats
        stats={STATS}
        ballPerformance={{
          ...REPORT,
          balls: [
            { ...ball, ballId: 1, name: "First" },
            { ...ball, ballId: 2, name: "Second", strikePct: 50 }
          ]
        }}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Open Second" }));
    await screen.findByRole("dialog", { name: "Balls" });
    expect(scrolled).toEqual(["2"]);
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

describe("by session or by game, on the Stats tab", () => {
  const NIGHT = {
    sessionId: 7,
    date: "2026-09-16",
    alley: "Chinese Swimming Club",
    event: "League",
    oilPattern: "2019 PBA Bear 41",
    lanes: ["7", "8"],
    scores: [195, 149, 237]
  };
  const BY_GAME = [
    {
      gameNumber: 1,
      games: 2,
      stats: { ...STATS, averageScore: 210, strikePct: 70 },
      sessions: [{ ...NIGHT, gameId: 71 }]
    },
    {
      gameNumber: 2,
      games: 2,
      stats: { ...STATS, averageScore: 190, strikePct: 50 },
      sessions: [{ ...NIGHT, gameId: 72 }]
    }
  ];

  it("starts by session, and offers by game", () => {
    render(
      <Stats stats={STATS} sessionMetrics={TREND} sessionTrend={SESSION_TREND} gameNumberMetrics={BY_GAME} />
    );
    const toggle = screen.getByRole("group", { name: "Chart by" });
    expect(within(toggle).getByRole("button", { name: "By session", pressed: true })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /^Average by session/ })).toBeInTheDocument();
  });

  it("plots every game 1 against every game 2, for any stat, the average included", () => {
    render(
      <Stats stats={STATS} sessionMetrics={TREND} sessionTrend={SESSION_TREND} gameNumberMetrics={BY_GAME} />
    );
    fireEvent.click(screen.getByRole("button", { name: "By game" }));
    expect(screen.getByRole("group", { name: "Chart by game" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Game 1, 210" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Game 2, 190" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sea Bowl/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Strike" }));
    expect(screen.getByRole("button", { name: "Game 1, 70%" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Game 2, 50%" })).toBeInTheDocument();
  });

  it("goes back to the nights", () => {
    render(
      <Stats stats={STATS} sessionMetrics={TREND} sessionTrend={SESSION_TREND} gameNumberMetrics={BY_GAME} />
    );
    fireEvent.click(screen.getByRole("button", { name: "By game" }));
    fireEvent.click(screen.getByRole("button", { name: "By session" }));
    expect(screen.getByRole("img", { name: /^Average by session/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Game \d/ })).toBeNull();
  });

  it("narrows everything to a game number picked off the chart", () => {
    const picked: number[] = [];
    render(
      <Stats
        stats={STATS}
        sessionMetrics={TREND}
        sessionTrend={SESSION_TREND}
        gameNumberMetrics={BY_GAME}
        onOpenGameNumber={(n) => picked.push(n)}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "By game" }));
    fireEvent.click(screen.getByRole("button", { name: "Game 2, 190" }));
    // The point opens a footer naming the slot; tapping it is the way in.
    fireEvent.click(screen.getByRole("button", { name: /^Game 2\s*2 games\s*190$/ }));
    expect(picked).toEqual([2]);
  });

  it("opens a point into its nights, and a night into that game", async () => {
    const opened: Array<[number, number]> = [];
    render(
      <Stats
        stats={STATS}
        sessionMetrics={TREND}
        sessionTrend={SESSION_TREND}
        gameNumberMetrics={BY_GAME}
        onOpenGameNumber={() => {}}
        onOpenGame={(sessionId, gameId) => opened.push([sessionId, gameId])}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "By game" }));
    fireEvent.click(screen.getByRole("button", { name: "Game 2, 190" }));
    fireEvent.click(screen.getByRole("button", { name: /^Game 2\s*2 games\s*190$/ }));

    const dialog = screen.getByRole("dialog", { name: "Game 2, every session" });
    const row = within(dialog).getByRole("button", { name: /Chinese Swimming Club/ });
    expect(row).toHaveTextContent("League · Lanes 7/8 · 2019 PBA Bear 41");
    // This night's game 2 is the one picked out.
    expect(within(row).getByText("149").parentElement).toHaveAttribute("aria-current", "true");
    fireEvent.click(row);
    await waitFor(() => expect(opened).toEqual([[7, 72]]));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Game 2, every session" })).toBeNull());
  });

  it("is not offered inside a session, which already plots its games", () => {
    render(
      <Stats
        stats={STATS}
        games={[{ game_number: 1, final_score: 200 }]}
        gameMetrics={[{ gameId: 1, gameNumber: 1, lanes: [], stats: STATS }]}
        gameNumberMetrics={BY_GAME}
      />
    );
    expect(screen.queryByRole("group", { name: "Chart by" })).toBeNull();
  });
});

describe("the spares card's cap", () => {
  it("shows the fifteen leaves left most, and keeps the rest for All leaves", () => {
    const pins = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    // Nine leaves left often, then eight left once: seventeen in all.
    const leaves: LeaveStats[] = Array.from({ length: 17 }, (_, i) => ({
      pins: [pins[i % 9], 10] as LeaveStats["pins"],
      attempts: 30 - i,
      chances: 30 - i,
      conversions: 1,
      conversionPct: 3,
      sharePct: null
    })).filter((l, i, all) => all.findIndex((m) => m.pins.join() === l.pins.join()) === i);
    const many = [
      ...leaves,
      ...Array.from({ length: 8 }, (_, i) => ({
        pins: [pins[i], 9] as LeaveStats["pins"],
        attempts: 1,
        chances: 1,
        conversions: 0,
        conversionPct: 0,
        sharePct: null
      }))
    ];
    render(<Stats stats={STATS} leaves={many} />);
    const card = screen.getByRole("region", { name: "Leaves left most" });
    const shown = card.querySelectorAll("button[aria-label^='Open ']");
    expect(shown).toHaveLength(15);
    expect(shown[0]).toHaveAccessibleName(/1-10/);
  });
});


describe("while Pro is locked (ADR-154)", () => {
  const LOCKED = { locked: true as const, appStoreUrl: "https://apps.apple.com/app/id1" };
  const leaf: LeaveStats = { pins: [10], attempts: 3, chances: 2, conversions: 1, conversionPct: 50, sharePct: 6 };

  function renderLocked() {
    render(
      <ProAccessContext.Provider value={LOCKED}>
        <Stats
          stats={STATS}
          sessionMetrics={TREND}
          sessionTrend={SESSION_TREND}
          ballPerformance={REPORT}
          leaves={[leaf]}
        />
      </ProAccessContext.Provider>
    );
  }

  it("keeps the average, strike and spare open", () => {
    renderLocked();
    expect(screen.getByRole("img", { name: /^Average by session/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Strike" }));
    expect(screen.getByRole("button", { name: "Sea Bowl, 60%" })).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
  });

  it("keeps every chart and the first ball open (ADR-174)", () => {
    renderLocked();
    fireEvent.click(screen.getByRole("button", { name: "Carry" }));
    expect(screen.getByRole("button", { name: "Sea Bowl, 67%" })).toBeInTheDocument();
    expect(screen.getByText("First ball")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Every stat/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Pocket, carry/ })).not.toBeInTheDocument();
  });

  it("says once what Pro adds", () => {
    renderLocked();
    // Said once for the screen, with the one button that says "Get the app".
    expect(screen.getAllByRole("button", { name: "Get the app" })).toHaveLength(1);
    expect(screen.getByText(/Pro adds every leave and every ball/)).toBeInTheDocument();
  });

  it("shows the two leaves left most in full, the next one blurred, and no more (ADR-167)", () => {
    const leave = (pin: PinNumber, attempts: number, conversions: number): LeaveStats => ({
      pins: [pin],
      attempts,
      chances: attempts,
      conversions,
      conversionPct: Math.round((conversions / attempts) * 100),
      sharePct: 5
    });
    render(
      <ProAccessContext.Provider value={LOCKED}>
        <Stats
          stats={STATS}
          leaves={[leave(7, 4, 1), leave(10, 9, 6), leave(4, 6, 3), leave(6, 2, 2)]}
        />
      </ProAccessContext.Provider>
    );
    const grid = screen.getByRole("list", { name: "Leaves left most" });
    // Left most first: the 10 pin (9), then the 4 pin (6), with their rates.
    expect(within(grid).getByRole("button", { name: "Open Pin 10" })).toHaveTextContent("6/967%");
    expect(within(grid).getByRole("button", { name: "Open Pin 4" })).toHaveTextContent("3/650%");
    // The third is blurred under one tap to Pro, and the fourth is not drawn.
    expect(within(grid).queryByRole("button", { name: "Open Pin 7" })).not.toBeInTheDocument();
    expect(
      within(grid).getByRole("button", { name: "Every leave you leave, and how often you make each. Get the app" })
    ).toBeInTheDocument();
    expect(screen.queryByText("2/2")).not.toBeInTheDocument();
    expect(within(grid).getAllByRole("listitem")).toHaveLength(3);
    // The sheet opens without Pro, says how many there are, and shows the same
    // two with the next one blurred (ADR-174).
    fireEvent.click(screen.getByRole("button", { name: "View all 4 leaves" }));
    const sheet = screen.getByRole("dialog", { name: /Leaves/ });
    const locked = within(sheet).getByRole("list", { name: "Leaves left most" });
    expect(within(locked).getByRole("button", { name: "Open Pin 10" })).toBeInTheDocument();
    expect(within(locked).getByRole("button", { name: "Open Pin 4" })).toBeInTheDocument();
    expect(within(locked).queryByRole("button", { name: "Open Pin 7" })).not.toBeInTheDocument();
    expect(within(locked).getAllByRole("listitem")).toHaveLength(3);
  });

  it("shows the best ball in full, the next one blurred, and no more (ADR-167)", () => {
    const ball = (ballId: number, name: string, strikePct: number) => ({ ...REPORT.balls[0], ballId, name, strikePct });
    render(
      <ProAccessContext.Provider value={LOCKED}>
        <Stats
          stats={STATS}
          ballPerformance={{
            unattributed: 0,
            balls: [ball(1, "Wolverine", 75), ball(2, "Phaze", 50), ball(3, "Hyroad", 40)]
          }}
        />
      </ProAccessContext.Provider>
    );
    const balls = screen.getByRole("list", { name: "Balls" });
    expect(within(balls).getByText("Wolverine")).toBeInTheDocument();
    expect(within(balls).getByLabelText("strike 75%")).toBeInTheDocument();
    // The best ball opens the sheet, which says how many balls there are.
    expect(screen.getByRole("button", { name: "Open Wolverine" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View all 3 balls" })).toBeInTheDocument();
    expect(
      within(balls).getByRole("button", { name: "How each of your balls strikes, carries and spares. Get the app" })
    ).toBeInTheDocument();
    // The next ball is drawn only blurred, out of the accessibility tree.
    expect(screen.getByText("Phaze").closest('[aria-hidden="true"]')).toHaveAttribute("inert");
    expect(screen.queryByText("Hyroad")).not.toBeInTheDocument();
    // In the sheet: the best ball open with its details, the next blurred, and
    // nothing after it (ADR-174).
    fireEvent.click(screen.getByRole("button", { name: "View all 3 balls" }));
    const sheet = screen.getByRole("dialog", { name: /Balls/ });
    expect(within(sheet).getByRole("region", { name: "Wolverine columns" })).toBeInTheDocument();
    expect(
      within(sheet).getByRole("button", { name: "How each of your balls strikes, carries and spares. Get the app" })
    ).toBeInTheDocument();
    expect(within(sheet).queryByText("Hyroad")).not.toBeInTheDocument();
  });

  it("shows a lone ball blurred, so a locked list always has something locked", () => {
    renderLocked();
    expect(
      screen.getByRole("button", { name: "How each of your balls strikes, carries and spares. Get the app" })
    ).toBeInTheDocument();
    expect(screen.getByText("Wolverine").closest('[aria-hidden="true"]')).toHaveAttribute("inert");
  });
});
