import { afterEach, describe, expect, it, vi } from "vitest";
import { buildLayoutCard, buildLineCard, buildSessionCard, buildStatsCard, renderShareCard } from "./shareCard";
import type { OilPass } from "../types/bowling";

/* jsdom has no 2D context, so the canvas is a recorder: every call is kept,
 * text by what it said. Enough to see what a card drew without a browser.
 * How it looks is checked by eye in a real one. */

interface Drawn {
  texts: string[];
  arcs: number;
  lines: number;
}

function stubCanvas(): Drawn {
  const drawn: Drawn = { texts: [], arcs: 0, lines: 0 };
  const ctx = new Proxy(
    {
      measureText: (t: string) => ({ width: t.length * 20 }),
      fillText: (t: string) => void drawn.texts.push(t),
      arc: () => void (drawn.arcs += 1),
      lineTo: () => void (drawn.lines += 1),
      roundRect: () => {}
    } as Record<string, unknown>,
    {
      get: (target, key: string) => (key in target ? target[key] : () => {}),
      set: () => true
    }
  );
  const real = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    if (tag !== "canvas") return real(tag);
    return {
      width: 0,
      height: 0,
      getContext: () => ctx,
      toBlob: (cb: (b: Blob) => void) => cb(new Blob(["png"], { type: "image/png" }))
    } as unknown as HTMLCanvasElement;
  });
  return drawn;
}

afterEach(() => vi.restoreAllMocks());

describe("renderShareCard", () => {
  it("draws every game of a seven game night", async () => {
    const drawn = stubCanvas();
    const seven = [194, 188, 160, 134, 198, 205, 204];
    const blob = await renderShareCard(
      buildSessionCard({
        alleyName: "Chinese Swimming Club",
        date: "2026-10-17",
        scores: seven,
        finalScores: seven,
        strikePct: 42,
        sparePct: 75
      })
    );
    expect(blob.type).toBe("image/png");
    expect(drawn.texts).toContain("G7");
    expect(drawn.texts).toContain("183");
    expect(drawn.texts).toContain("7 GAME SERIES");
  });

  it("draws a stats card's numbers", async () => {
    const drawn = stubCanvas();
    await renderShareCard(
      buildStatsCard(
        {
          totalSessions: 3,
          completedGames: 9,
          averageScore: 190,
          highGame: 240,
          strikePct: 40,
          sparePct: 70,
          pocketPct: 60,
          carryPct: 65
        },
        "Every session"
      )
    );
    expect(drawn.texts).toEqual(expect.arrayContaining(["190", "HIGH GAME", "CARRY"]));
  });

  it("draws a layout with its ball and wraps its caption", async () => {
    const drawn = stubCanvas();
    const card = buildLayoutCard({
      dualAngle: "45 x 4 1/2 x 45",
      vls: "4 1/2 x 3 7/8 x 2 7/8",
      symmetric: false,
      hand: "right",
      grip: "2h",
      pap: '5" over, 1/2" up',
      summary: "Picks up in the mid lane and turns the corner with a defined shape. High flare, a strong look overall, and more words than fit."
    });
    await renderShareCard({ ...card, diagram: {} as CanvasImageSource, mark: {} as CanvasImageSource });
    expect(drawn.texts).toContain("45 x 4 1/2 x 45");
    expect(drawn.texts.some((t) => t.endsWith("…"))).toBe(true);
  });

  it("draws a line on its lane, with the oil and the keyed marks", async () => {
    const drawn = stubCanvas();
    const passes = [
      { start_distance: 0, end_distance: 40, left_board: 2, right_board: 38, loads: 2, microliters: 50, direction: "forward" }
    ] as unknown as OilPass[];
    await renderShareCard(
      buildLineCard({
        line: { laydown: 20, target: 15, final_board: 17.5 },
        hand: "right",
        spare: false,
        pattern: { name: "House shot", passes }
      })
    );
    expect(drawn.texts).toEqual(expect.arrayContaining(["House shot", "BREAKPOINT", "PATTERN LENGTH"]));
    // Ten pins, five marks and two keys at the least, and a path of many segments.
    expect(drawn.arcs).toBeGreaterThanOrEqual(17);
    expect(drawn.lines).toBeGreaterThan(10);
  });

  it("refuses when the browser has no 2D context", async () => {
    const real = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) =>
      tag === "canvas" ? ({ getContext: () => null } as unknown as HTMLCanvasElement) : real(tag)
    );
    await expect(renderShareCard(buildLineCard({ line: {}, hand: "right", spare: false }))).rejects.toThrow(
      "cannot draw"
    );
  });
});
