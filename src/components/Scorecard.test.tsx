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
    const headers = Array.from(container.querySelectorAll("div"))
      .map((el) => el.textContent?.trim())
      .filter((t): t is string => !!t && /^[0-9]+$/.test(t));
    for (let n = 1; n <= 10; n += 1) {
      expect(headers).toContain(String(n));
    }
  });
});
