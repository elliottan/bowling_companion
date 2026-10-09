import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ActiveGameScorer } from "./ActiveGameScorer";
import type { Ball, Frame, PinNumber, SpareLine } from "../types/bowling";

/** The commit button reads "Next", with what it would record bracketed under
 *  it; the accessible name carries that outcome as "Next (Strike)". */
const RECORD_SHOT = /^Next( \(|$)/;

/**
 * What each new shot starts with: which ball is selected, and what the Intended
 * line box is prefilled with. The rules live in ADR-017 (carry priority),
 * ADR-029 (fresh-rack carry across games) and ADR-052 (the box shows the line
 * for the ball that is selected).
 *
 * These drive the rendered scorer rather than any internal, so they hold across
 * a refactor of where the decision lives. That is the point of them: the logic
 * they cover had no tests, and it is the most valuable behaviour in the app
 * after scoring itself.
 */

const BALLS: Ball[] = [
  { id: 1, name: "Hammer", is_spare_ball: false, sort_order: 0 },
  { id: 2, name: "Plastic Spare", is_spare_ball: true, sort_order: 1 },
  { id: 3, name: "Gem", is_spare_ball: false, sort_order: 2 }
];

let spareLines: SpareLine[] = [];

vi.mock("../services/ballRepository", () => ({
  getBalls: () => Promise.resolve(BALLS),
  getSpareLinesAll: () => Promise.resolve(spareLines),
  findSpareLineByPins: (lines: SpareLine[], pins: PinNumber[]) =>
    lines.find((sl) => [...sl.pins].sort().join() === [...pins].sort().join()),
  getSpareLineByPins: () => Promise.resolve(undefined)
}));

if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}

const ONE_LANE = { lanes: ["12"], start_lane: "12", lane_number: "12" };

const ballLabel = () => screen.getByRole("button", { name: /^Ball: / }).getAttribute("aria-label");
const stance = () => (screen.getByLabelText("Stance") as HTMLInputElement).value;
const target = () =>
  (screen.getAllByTitle("Target board (arrows)")[0] as HTMLInputElement).value;

/** A struck first frame, so live entry sits on frame 2 shot 1 (a fresh rack). */
function frameOneStrike(ballId?: number, intended?: { stance: number; target: number }): Frame[] {
  return [
    {
      game_id: 1,
      frame_number: 1,
      shots: [{ pins_standing: [] as PinNumber[], ball_id: ballId, intended, notes: "flush" }],
      is_strike: true,
      is_spare: false
    }
  ];
}

describe("what a new shot starts with", () => {
  it("carries the ball, line and notes from the previous frame on the same lane", async () => {
    render(
      <ActiveGameScorer
        gameKey={1}
        mode="session"
        game={ONE_LANE}
        initialFrames={frameOneStrike(1, { stance: 20, target: 15 })}
      />
    );

    // Assert the line inside waitFor as well: LineInput syncs its text from
    // the prop in an effect, so the box fills a tick after the ball label does
    // and a bare assertion here races it on a slow machine.
    await waitFor(() => expect(ballLabel()).toContain("Hammer"));
    await waitFor(() => expect(stance()).toBe("20"));
    expect(target()).toBe("15");
    expect(screen.getByPlaceholderText("This shot…")).toHaveValue("flush");
  });

  it("starts blank when there is nothing to carry", async () => {
    render(<ActiveGameScorer gameKey={1} mode="session" game={ONE_LANE} initialFrames={[]} />);

    await waitFor(() => expect(ballLabel()).toContain("none"));
    expect(stance()).toBe("");
    expect(target()).toBe("");
  });

  it("carries from the previous game played on the same lane", async () => {
    render(
      <ActiveGameScorer
        gameKey={2}
        mode="session"
        game={ONE_LANE}
        initialFrames={[]}
        previousGames={[{ game: ONE_LANE, frames: frameOneStrike(1, { stance: 22, target: 13 }) }]}
      />
    );

    await waitFor(() => expect(ballLabel()).toContain("Hammer"));
    await waitFor(() => expect(stance()).toBe("22"));
  });

  it("does not carry a line across a change of lane", async () => {
    render(
      <ActiveGameScorer
        gameKey={2}
        mode="session"
        game={{ lanes: ["9"], start_lane: "9", lane_number: "9" }}
        initialFrames={[]}
        previousGames={[{ game: ONE_LANE, frames: frameOneStrike(1, { stance: 22, target: 13 }) }]}
      />
    );

    await waitFor(() => expect(stance()).toBe(""));
  });

  describe("on a spare attempt", () => {
    /** Throw shot 1 and leave the 10 pin standing, the way a user gets here. */
    async function leaveTheTenPin() {
      await waitFor(() => expect(ballLabel()).toBeTruthy());
      const pin = screen.getByRole("button", { name: /^Pin 10 / });
      fireEvent.pointerDown(pin);
      fireEvent.pointerUp(pin);
      fireEvent.click(screen.getByRole("button", { name: RECORD_SHOT }));
    }

    it("picks the spare ball when one is configured", async () => {
      spareLines = [];
      render(<ActiveGameScorer gameKey={1} mode="session" game={ONE_LANE} initialFrames={[]} />);

      await leaveTheTenPin();

      await waitFor(() => expect(ballLabel()).toContain("Plastic Spare"));
    });

    it("prefills the saved line for that leave", async () => {
      spareLines = [{ id: 1, pins: [10] as PinNumber[], line: { stance: 30, target: 8 }, sort_order: 0 }];
      render(<ActiveGameScorer gameKey={1} mode="session" game={ONE_LANE} initialFrames={[]} />);

      await leaveTheTenPin();

      await waitFor(() => expect(stance()).toBe("30"));
      await waitFor(() => expect(target()).toBe("8"));
    });

    it("still picks the spare ball when the game opens mid-frame", async () => {
      // Resuming a session: the scorer mounts straight into the spare attempt,
      // so seeding has to wait for the ball list rather than run without it.
      spareLines = [{ id: 1, pins: [10] as PinNumber[], line: { stance: 30, target: 8 }, sort_order: 0 }];
      const midFrame: Frame[] = [
        {
          game_id: 1,
          frame_number: 1,
          shots: [{ pins_standing: [10] as PinNumber[], ball_id: 1 }],
          is_strike: false,
          is_spare: false
        }
      ];

      render(<ActiveGameScorer gameKey={1} mode="session" game={ONE_LANE} initialFrames={midFrame} />);

      // Two async reads (balls, spare lines) have to land before seeding runs,
      // so this waits longer than the 1s default: it timed out once under the
      // load of the full suite.
      await waitFor(() => expect(ballLabel()).toContain("Plastic Spare"), { timeout: 5000 });
      await waitFor(() => expect(stance()).toBe("30"), { timeout: 5000 });
    });

    it("prefers a line already shot at that leave this session over the saved one", async () => {
      spareLines = [{ id: 1, pins: [10] as PinNumber[], line: { stance: 30, target: 8 }, sort_order: 0 }];
      const earlier: Frame[] = [
        {
          game_id: 9,
          frame_number: 3,
          shots: [
            { pins_standing: [10] as PinNumber[] },
            { pins_standing: [] as PinNumber[], intended: { stance: 34, target: 6 } }
          ],
          is_strike: false,
          is_spare: true
        }
      ];

      render(
        <ActiveGameScorer
          gameKey={1}
          mode="session"
          game={ONE_LANE}
          initialFrames={[]}
          sessionFrames={earlier}
        />
      );

      await leaveTheTenPin();

      await waitFor(() => expect(stance()).toBe("34"));
      await waitFor(() => expect(target()).toBe("6"));
    });
  });

  describe("changing the ball", () => {
    /** Open the ball picker and choose by name. */
    async function chooseBall(name: string) {
      // The picker plays an exit animation after a pick and unmounts on a
      // timer, so wait it out before opening again. An option that unmounts
      // between the query and the click takes the click with it: nothing is
      // selected, and the next assertion waits on a line that never changes.
      await waitFor(() =>
        expect(screen.queryByRole("dialog", { name: "Choose ball" })).toBeNull()
      );
      fireEvent.click(screen.getByRole("button", { name: /^Ball: / }));
      const option = await screen.findByRole("button", { name: new RegExp(name) });
      fireEvent.click(option);
      await waitFor(() => expect(ballLabel()).toMatch(new RegExp(name)));
    }

    it("shows the line the chosen ball was last thrown on, and puts it back on the way back", async () => {
      // Frame 1 was struck with the Hammer on 20/15, so that is the Hammer's line.
      render(
        <ActiveGameScorer
          gameKey={1}
          mode="session"
          game={ONE_LANE}
          initialFrames={frameOneStrike(1, { stance: 20, target: 15 })}
        />
      );
      await waitFor(() => expect(stance()).toBe("20"));

      // Another strike ball with no history keeps what is on screen as a
      // starting point.
      await chooseBall("Gem");
      expect(stance()).toBe("20");

      // A spare ball with nothing on record does not: a strike ball's boards
      // are the wrong place to start a spare ball from (ADR-113).
      await chooseBall("Plastic Spare");
      await waitFor(() => expect(stance()).toBe(""));

      // Typing a line for it, then coming back, restores the Hammer's own line.
      fireEvent.change(screen.getByLabelText("Stance"), { target: { value: "27" } });
      await waitFor(() => expect(stance()).toBe("27"));

      await chooseBall("Hammer");
      await waitFor(() => expect(stance()).toBe("20"));
      await waitFor(() => expect(target()).toBe("15"));
    });
  });
});

describe("what a recorded shot stores (B1)", () => {
  async function pickBall(name: string) {
    await waitFor(() => expect(ballLabel()).toBeTruthy());
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Choose ball" })).toBeNull()
    );
    fireEvent.click(screen.getByRole("button", { name: /^Ball: / }));
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(name) }));
    await waitFor(() => expect(ballLabel()).toMatch(new RegExp(name)));
  }

  /** Strike, then wait until the scorer has seeded the next frame. */
  async function strikeAndWait(nextFrame: number) {
    fireEvent.click(screen.getByRole("button", { name: "Strike" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Ball: / }).getAttribute("aria-label")).toBeTruthy()
    );
    await waitFor(() => expect(saved.some((f) => f.frame_number === nextFrame - 1)).toBe(true));
  }

  let saved: Frame[] = [];
  const onFrameComplete = (f: Frame) => {
    saved = [...saved.filter((x) => x.frame_number !== f.frame_number), f];
  };

  const LANE_SETUPS: Array<[string, typeof ONE_LANE | undefined]> = [
    ["no lanes", undefined],
    ["one lane", ONE_LANE],
    ["a lane pair", { lanes: ["9", "10"], start_lane: "9", lane_number: "9" }]
  ];

  for (const [label, game] of LANE_SETUPS) {
    it(`keeps the ball on every frame the bowler does not touch, on ${label}`, async () => {
      spareLines = [];
      saved = [];
      render(
        <ActiveGameScorer
          gameKey={1}
          mode="session"
          game={game}
          initialFrames={[]}
          onFrameComplete={onFrameComplete}
        />
      );
      await pickBall("Gem");
      for (let n = 1; n <= 4; n++) {
        await strikeAndWait(n + 1);
        await waitFor(() => expect(ballLabel()).toMatch(/Gem/));
      }
      for (let n = 1; n <= 4; n++) {
        expect(saved.find((f) => f.frame_number === n)?.shots[0].ball_id).toBe(3);
      }
    });
  }

  it("keeps a typed line on the next frame on one lane", async () => {
    spareLines = [];
    saved = [];
    render(
      <ActiveGameScorer
        gameKey={1}
        mode="session"
        game={ONE_LANE}
        initialFrames={[]}
        onFrameComplete={onFrameComplete}
      />
    );
    await pickBall("Hammer");
    fireEvent.change(screen.getByLabelText("Stance"), { target: { value: "24" } });
    await waitFor(() => expect(stance()).toBe("24"));
    await strikeAndWait(2);
    await waitFor(() => expect(stance()).toBe("24"));
    await strikeAndWait(3);

    const second = saved.find((f) => f.frame_number === 2)?.shots[0];
    expect(second?.ball_id).toBe(1);
    expect(second?.intended?.stance).toBe(24);
  });
});

describe("a strike ball at a leave (B2, B3)", () => {
  async function leaveTheTenPin() {
    await waitFor(() => expect(ballLabel()).toBeTruthy());
    const pin = screen.getByRole("button", { name: /^Pin 10 / });
    fireEvent.pointerDown(pin);
    fireEvent.pointerUp(pin);
    fireEvent.click(screen.getByRole("button", { name: RECORD_SHOT }));
  }

  async function chooseBall(name: string) {
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Choose ball" })).toBeNull()
    );
    fireEvent.click(screen.getByRole("button", { name: /^Ball: / }));
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(name) }));
    await waitFor(() => expect(ballLabel()).toMatch(new RegExp(name)));
  }

  it("shows the strike ball's own line, not the spare ball's saved one", async () => {
    spareLines = [{ id: 1, pins: [10] as PinNumber[], line: { stance: 31, target: 22 }, sort_order: 0 }];
    render(
      <ActiveGameScorer
        gameKey={1}
        mode="session"
        game={ONE_LANE}
        initialFrames={frameOneStrike(1, { stance: 20, target: 15 })}
      />
    );
    await leaveTheTenPin();
    await waitFor(() => expect(ballLabel()).toContain("Plastic Spare"));
    await waitFor(() => expect(stance()).toBe("31"));

    await chooseBall("Hammer");
    await waitFor(() => expect(stance()).toBe("20"));
    await waitFor(() => expect(target()).toBe("15"));
  });

  it("starts the spare ball from the strike ball's move when the leave has no spare line (ADR-125)", async () => {
    spareLines = [
      { id: 1, pins: [10] as PinNumber[], strike_offset: { stance: 4, target: -3 }, sort_order: 0 }
    ];
    render(
      <ActiveGameScorer
        gameKey={1}
        mode="session"
        game={ONE_LANE}
        initialFrames={frameOneStrike(1, { stance: 20, target: 15 })}
      />
    );
    await leaveTheTenPin();
    await waitFor(() => expect(ballLabel()).toContain("Plastic Spare"));
    await waitFor(() => expect(stance()).toBe("24"));
    expect(target()).toBe("12");
  });

  it("swaps between the spare line and the strike move as the ball changes, both ways (ADR-125)", async () => {
    spareLines = [
      {
        id: 1,
        pins: [10] as PinNumber[],
        line: { stance: 31, target: 22 },
        strike_offset: { stance: 4, target: -3 },
        sort_order: 0
      }
    ];
    render(
      <ActiveGameScorer
        gameKey={1}
        mode="session"
        game={ONE_LANE}
        initialFrames={frameOneStrike(1, { stance: 20, target: 15 })}
      />
    );
    await leaveTheTenPin();
    await waitFor(() => expect(ballLabel()).toContain("Plastic Spare"));
    await waitFor(() => expect(stance()).toBe("31"));
    await waitFor(() => expect(target()).toBe("22"));

    await chooseBall("Hammer");
    await waitFor(() => expect(stance()).toBe("24"));
    await waitFor(() => expect(target()).toBe("12"));

    await chooseBall("Plastic Spare");
    await waitFor(() => expect(stance()).toBe("31"));
    await waitFor(() => expect(target()).toBe("22"));
  });

  it("empties the box for a strike ball with no line on record", async () => {
    spareLines = [{ id: 1, pins: [10] as PinNumber[], line: { stance: 31, target: 22 }, sort_order: 0 }];
    render(<ActiveGameScorer gameKey={1} mode="session" game={ONE_LANE} initialFrames={[]} />);
    await leaveTheTenPin();
    await waitFor(() => expect(stance()).toBe("31"));

    await chooseBall("Gem");
    await waitFor(() => expect(stance()).toBe(""));
  });

  it("does not offer to save a strike ball's attempt as the leave's spare line", async () => {
    spareLines = [];
    render(<ActiveGameScorer gameKey={1} mode="session" game={ONE_LANE} initialFrames={[]} />);
    await leaveTheTenPin();
    await waitFor(() => expect(ballLabel()).toContain("Plastic Spare"));
    await chooseBall("Gem");
    fireEvent.change(screen.getByLabelText("Stance"), { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: "Spare" }));

    await waitFor(() => expect(screen.getByRole("button", { name: /^Ball: / })).toBeTruthy());
    expect(screen.queryByText(/Save this as your line/)).toBeNull();
  });

  it("offers it after a spare ball attempt", async () => {
    spareLines = [];
    render(<ActiveGameScorer gameKey={1} mode="session" game={ONE_LANE} initialFrames={[]} />);
    await leaveTheTenPin();
    await waitFor(() => expect(ballLabel()).toContain("Plastic Spare"));
    fireEvent.change(screen.getByLabelText("Stance"), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: "Spare" }));

    expect(await screen.findByText(/Save this as your line for 10-pin/)).toBeTruthy();
  });
});

describe("a pocket leave (ADR-123)", () => {
  /** Mid-frame: ball 1 left the 1, 3 and 5 standing. */
  const pocketLeft: Frame[] = [
    {
      game_id: 1,
      frame_number: 1,
      shots: [{ pins_standing: [1, 3, 5] as PinNumber[], ball_id: 1, intended: { stance: 20, target: 15 } }],
      is_strike: false,
      is_spare: false
    }
  ];

  it("opens with the strike ball on the line just thrown, and offers no spare line", async () => {
    spareLines = [{ id: 1, pins: [1, 3, 5] as PinNumber[], line: { stance: 31, target: 22 }, sort_order: 0 }];
    render(<ActiveGameScorer gameKey={1} mode="session" game={ONE_LANE} initialFrames={pocketLeft} />);

    await waitFor(() => expect(ballLabel()).toContain("Hammer"), { timeout: 5000 });
    await waitFor(() => expect(stance()).toBe("20"), { timeout: 5000 });
    expect(target()).toBe("15");
    expect(screen.queryByRole("button", { name: "Use another leave's line" })).toBeNull();
  });

  it("does not offer to save the attempt as a spare line, even off the spare ball", async () => {
    spareLines = [];
    render(<ActiveGameScorer gameKey={1} mode="session" game={ONE_LANE} initialFrames={pocketLeft} />);
    await waitFor(() => expect(ballLabel()).toContain("Hammer"), { timeout: 5000 });
    // A strike ball's attempt is never offered (ADR-113), so pick the spare ball.
    fireEvent.click(screen.getByRole("button", { name: /^Ball: / }));
    fireEvent.click(await screen.findByRole("button", { name: /Plastic Spare/ }));
    await waitFor(() => expect(ballLabel()).toContain("Plastic Spare"));
    fireEvent.change(screen.getByLabelText("Stance"), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: "Spare" }));

    await waitFor(() => expect(screen.getByRole("button", { name: /^Ball: / })).toBeTruthy());
    expect(screen.queryByText(/Save this as your line/)).toBeNull();
  });
});
