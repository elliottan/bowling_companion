import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ActiveGameScorer } from "./ActiveGameScorer";
import type { Ball, Frame, PinNumber, SpareLine } from "../types/bowling";

/** The commit button reads "Next", with what it would record named under it;
 *  the accessible name carries that outcome as "Next: Strike". */
const RECORD_SHOT = /^Next(:|$)/;

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
  { id: 2, name: "Plastic Spare", is_spare_ball: true, sort_order: 1 }
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

      // A ball with no history keeps what is on screen as a starting point.
      await chooseBall("Plastic Spare");
      await waitFor(() => expect(ballLabel()).toMatch(/Plastic Spare/));
      expect(stance()).toBe("20");

      // Typing a line for it, then coming back, restores the Hammer's own line.
      fireEvent.change(screen.getByLabelText("Stance"), { target: { value: "27" } });
      await waitFor(() => expect(stance()).toBe("27"));

      await chooseBall("Hammer");
      await waitFor(() => expect(stance()).toBe("20"));
      await waitFor(() => expect(target()).toBe("15"));
    });
  });
});
