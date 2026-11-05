import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { AlleySummary, BallEstimates } from "./BallEstimates";
import { ProAccessContext } from "../lib/useProAccess";
import { estimateBalls } from "../lib/scoreModel";
import { calculateGameScore } from "../lib/scoring";
import type { Ball, Frame, Game, PinNumber, SessionSummary } from "../types/bowling";

const NONE: PinNumber[] = [];

function frame(n: number, ball: number, ...standing: PinNumber[][]): Frame {
  return {
    game_id: 1,
    frame_number: n,
    shots: standing.map((pins_standing) => ({ pins_standing, ball_id: ball })),
    is_strike: standing[0].length === 0,
    is_spare: standing[0].length > 0 && standing[1]?.length === 0
  };
}

/** Strike, then a leave, in turn, by one ball: the leave is the ball's. */
function game(ball: number, leave: PinNumber[], after: PinNumber[]): Game & { frames: Frame[] } {
  const frames = Array.from({ length: 10 }, (_, i) =>
    i === 9 ? frame(10, ball, NONE, NONE, NONE) : i % 2 ? frame(i + 1, ball, leave, after) : frame(i + 1, ball, NONE)
  );
  return { id: 1, session_id: 1, game_number: 1, final_score: calculateGameScore(frames).total, frames };
}

const BALLS: Ball[] = [
  { id: 1, name: "Tenpin", is_spare_ball: false },
  { id: 2, name: "Splitter", is_spare_ball: false },
  { id: 3, name: "Rarely", is_spare_ball: false }
] as Ball[];

function report() {
  const games = [
    ...Array.from({ length: 6 }, () => game(1, [10], NONE)),
    ...Array.from({ length: 6 }, () => game(2, [7, 10], [7])),
    // Three first balls with another ball inside a Tenpin game: under ten.
    (() => {
      const g = game(1, [10], NONE);
      g.frames = g.frames.map((f) => (f.frame_number <= 3 ? frame(f.frame_number, 3, NONE) : f));
      return g;
    })()
  ];
  const history: SessionSummary[] = [{ session: { date: "2026-06-07", alley_name: "Sea Bowl" }, games }];
  return estimateBalls(history);
}

describe("BallEstimates", () => {
  it("ranks the balls by what you'd average with them", () => {
    render(<BallEstimates report={report()} balls={BALLS} />);
    expect(screen.getByText("By ball")).toBeInTheDocument();
    const names = screen.getAllByRole("button").map((b) => b.textContent);
    // Every estimate is marked as one, with the ball's strike rate under it.
    expect(names[0]).toMatch(/~\d+/);
    expect(names[0]).toMatch(/^Tenpin\d+ balls · strike \d+%/);
    expect(names[1]).toMatch(/^Splitter/);
  });

  it("greys a ball with too few first balls and does not rank it", () => {
    render(<BallEstimates report={report()} balls={BALLS} />);
    const rows = screen.getAllByRole("button");
    expect(rows[rows.length - 1]).toHaveTextContent(/Rarely3 balls, too few/);
  });

  it("opens a ball in a sheet with its rates against all balls and its leaves as a percentage made", () => {
    render(<BallEstimates report={report()} balls={BALLS} scope="Sea Bowl" />);
    fireEvent.click(screen.getByRole("button", { name: /^Splitter/ }));
    const sheet = screen.getByRole("dialog", { name: "Splitter" });
    expect(within(sheet).getByText("Sea Bowl")).toBeInTheDocument();
    expect(within(sheet).getByText(/^\u2212\d+ a game against your \d+ here$/)).toBeInTheDocument();
    // Every split, against every ball's share: more splits reads as worse.
    expect(within(sheet).getByLabelText(/^leaves that split 100%, \d+ points above all balls$/)).toBeInTheDocument();
    expect(within(sheet).getByLabelText(/^leaves made 0%, \d+ points below all balls$/)).toBeInTheDocument();
    const leaves = within(sheet).getByRole("list", { name: "Leaves, costliest first" });
    const [first] = within(leaves).getAllByRole("listitem");
    expect(first).toHaveTextContent("7-10");
    expect(first).toHaveTextContent(/0%made/);
    expect(first).toHaveTextContent(/Left \d+ times/);
  });

  it("shows the leaves of a ball whose spares were all made", () => {
    render(<BallEstimates report={report()} balls={BALLS} />);
    fireEvent.click(screen.getByRole("button", { name: /^Tenpin/ }));
    const sheet = screen.getByRole("dialog", { name: "Tenpin" });
    const leaves = within(sheet).getByRole("list", { name: "Leaves, costliest first" });
    expect(within(leaves).getByText("10")).toBeInTheDocument();
    expect(within(leaves).getByText("100%")).toBeInTheDocument();
  });

  it("draws nothing when no ball is on record", () => {
    const empty = estimateBalls([]);
    const { container } = render(<BallEstimates report={empty} balls={BALLS} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("AlleySummary", () => {
  it("leads with the real average, what it is read from, and every ball's rates", () => {
    const r = report();
    render(<AlleySummary report={r} shots={120} sessions={1} />);
    const card = screen.getByRole("region", { name: "Your average here" });
    expect(card).toHaveTextContent(String(Math.round(r.actual!)));
    expect(card).toHaveTextContent("1 session · 120 balls");
    expect(within(card).getByLabelText(/^strike \d+%$/)).toBeInTheDocument();
    expect(within(card).getByLabelText(/^leaves that split \d+%$/)).toBeInTheDocument();
  });
});

describe("BallEstimates without Pro (ADR-167)", () => {
  it("shows the best ball in full, the next one blurred, and no more", () => {
    render(
      <ProAccessContext.Provider value={{ locked: true, appStoreUrl: "https://apps.apple.com/app/id1" }}>
        <BallEstimates report={report()} balls={BALLS} free={1} />
      </ProAccessContext.Provider>
    );
    expect(screen.getByRole("button", { name: /^Tenpin/ })).toHaveTextContent(/~\d+/);
    // The next is blurred under one tap, and the last is not drawn.
    expect(screen.queryByRole("button", { name: /^Splitter/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "What you'd average with each ball here. Get the app" })).toBeInTheDocument();
    expect(screen.queryByText(/Rarely/)).not.toBeInTheDocument();
  });
});
