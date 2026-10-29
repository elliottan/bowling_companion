import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Scorecard } from "./Scorecard";
import type { Frame, PinNumber } from "../types/bowling";

const ALL: PinNumber[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function openFrame(n: number): Frame {
  return {
    game_id: 1,
    frame_number: n,
    shots: [{ pins_standing: ALL }, { pins_standing: ALL }],
    is_strike: false,
    is_spare: false
  };
}

describe("Scorecard", () => {
  it("renders all 10 frames without forcing a min-width that overflows 390px", () => {
    const frames = Array.from({ length: 10 }, (_, i) => openFrame(i + 1));
    const { container } = render(
      <div style={{ width: 390 }}>
        <Scorecard frames={frames} activeFrameNumber={10} />
      </div>
    );

    // No element inside the scorecard advertises a min-width >= 390 via class.
    // Mobile rendering uses a 5x2 grid; the prior implementation had
    // `min-w-[620px]` on the scorecard container which would have failed here.
    const offenders = Array.from(
      container.querySelectorAll<HTMLElement>("[class*='min-w-['] ")
    ).filter((el) => /min-w-\[(?!1?\d{1,2}rem)\d{3,}px\]/.test(el.className));

    expect(offenders).toHaveLength(0);

    // Both layouts render their frame headers (1..10).
    const headers = Array.from(container.querySelectorAll("div, span"))
      .map((el) => el.textContent?.trim())
      .filter((t): t is string => !!t && /^[0-9]+$/.test(t));
    for (let n = 1; n <= 10; n += 1) {
      expect(headers).toContain(String(n));
    }
  });

  it("only makes shots of recorded frames before the active one tappable", () => {
    // Frames 1-2 recorded, currently bowling frame 3, game not complete.
    const frames = [openFrame(1), openFrame(2)];
    const { queryAllByRole } = render(
      <Scorecard
        frames={frames}
        activeFrameNumber={3}
        gameComplete={false}
        onShotTap={() => {}}
      />
    );

    const labels = queryAllByRole("button").map((b) => b.getAttribute("aria-label"));
    // Past frames' shots are tappable; active (3) and empty future frames are not buttons.
    // Two layouts (mobile + desktop) each render the eligible frames.
    expect(labels.some((l) => l?.startsWith("Frame 1, shot 1:"))).toBe(true);
    expect(labels.some((l) => l?.startsWith("Frame 2, shot 2:"))).toBe(true);
    expect(labels.some((l) => l?.startsWith("Frame 3, shot"))).toBe(false);
    expect(labels.some((l) => l?.startsWith("Frame 4, shot"))).toBe(false);
  });

  it("names each whole frame once, in words, with its running total", () => {
    const strike: Frame = {
      game_id: 1,
      frame_number: 1,
      shots: [{ pins_standing: [] }],
      is_strike: true,
      is_spare: false
    };
    const spare: Frame = {
      game_id: 1,
      frame_number: 2,
      shots: [{ pins_standing: [10] }, { pins_standing: [] }],
      is_strike: false,
      is_spare: true
    };
    const open: Frame = {
      game_id: 1,
      frame_number: 3,
      shots: [{ pins_standing: [8, 9, 10] }, { pins_standing: [10] }],
      is_strike: false,
      is_spare: false
    };
    const { getAllByRole } = render(<Scorecard frames={[strike, spare, open]} activeFrameNumber={4} />);

    const frames = getAllByRole("group").map((g) => g.getAttribute("aria-label"));
    // Two layouts (mobile and desktop) each carry the ten frames.
    expect(frames.filter((l) => l?.startsWith("Frame 1, strike")).length).toBeGreaterThan(0);
    expect(frames).toContain("Frame 1, strike, 20");
    expect(frames).toContain("Frame 2, 9, spare, 37");
    expect(frames).toContain("Frame 3, 7 (split), 2, 46");
    expect(frames).toContain("Frame 4, not bowled yet");
    // A tenth frame with nothing in it carries no total to read out.
    expect(frames).toContain("Frame 10, not bowled yet");
  });

  it("says a split, which the ring around it cannot say to a screen reader", () => {
    const split: Frame = {
      game_id: 1,
      frame_number: 1,
      shots: [{ pins_standing: [7, 10] }, { pins_standing: [7] }],
      is_strike: false,
      is_spare: false
    };
    const { getAllByRole } = render(<Scorecard frames={[split]} activeFrameNumber={2} />);
    const first = getAllByRole("group")[0].getAttribute("aria-label");
    expect(first).toBe("Frame 1, 8 (split), 1, 9");
  });
});
