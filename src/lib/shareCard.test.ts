import { describe, expect, it, vi } from "vitest";
import {
  buildSessionCard,
  buildStatsCard,
  buildLayoutCard,
  buildLineCard,
  describeFilter,
  formatCardDate,
  shareCardFilename
} from "./shareCard";
import type { OilPass } from "../types/bowling";

/* The canvas itself is not asserted on: jsdom has no 2D context, so
 * `renderShareCard` cannot run here. These cover the pure builders that decide
 * what the picture says, which is where the mistakes would be. */

const session = {
  alleyName: "Sunset Lanes",
  event: "League",
  date: "2026-08-30",
  scores: [212, 185, 233],
  finalScores: [212, 185, 233],
  strikePct: 61.4,
  sparePct: 48.9
};

describe("buildSessionCard", () => {
  it("leads with the average, and gives the series with its game count", () => {
    const card = buildSessionCard(session);
    expect(card.hero).toEqual({ value: "210", label: "Average" });
    expect(card.stats[0]).toEqual({ value: "630", label: "3 game series" });
  });

  it("says Game, not Average, for a single game", () => {
    const card = buildSessionCard({ ...session, scores: [212], finalScores: [212] });
    expect(card.hero).toEqual({ value: "212", label: "Game" });
    expect(card.stats.map((s) => s.label)).toEqual(["Strikes", "Spares"]);
  });

  it("averages finished games only, so a game in progress does not drag it down", () => {
    // Third game is running at 40 and is not final.
    const card = buildSessionCard({
      ...session,
      scores: [212, 185, 40],
      finalScores: [212, 185]
    });
    expect(card.hero?.value).toBe("199");
    expect(card.stats[0]).toEqual({ value: "437", label: "3 game series" });
  });

  it("leads with the series while no game is finished", () => {
    const card = buildSessionCard({ ...session, scores: [120, 40], finalScores: [] });
    expect(card.hero).toEqual({ value: "160", label: "Series" });
  });

  it("carries every game of a seven game night", () => {
    const seven = [194, 188, 160, 134, 198, 205, 204];
    const card = buildSessionCard({ ...session, scores: seven, finalScores: seven });
    expect(card.games).toHaveLength(7);
    expect(card.hero?.value).toBe("183");
    expect(card.stats[0]).toEqual({ value: "1283", label: "7 game series" });
  });

  it("carries every game score for the boxes", () => {
    expect(buildSessionCard(session).games).toEqual(["212", "185", "233"]);
  });

  it("rounds percentages rather than printing a decimal", () => {
    const card = buildSessionCard(session);
    expect(card.stats.find((s) => s.label === "Strikes")?.value).toBe("61%");
    expect(card.stats.find((s) => s.label === "Spares")?.value).toBe("49%");
  });

  it("omits a stat it has no number for", () => {
    const card = buildSessionCard({ ...session, strikePct: null, sparePct: null });
    expect(card.stats.map((s) => s.label)).toEqual(["3 game series", "High game"]);
  });

  it("survives a session with nothing bowled yet", () => {
    const card = buildSessionCard({
      ...session,
      scores: [],
      finalScores: [],
      strikePct: null,
      sparePct: null
    });
    expect(card.hero?.value).toBe("0");
    expect(card.stats).toEqual([]);
  });

  it("falls back to a name when the alley is blank", () => {
    expect(buildSessionCard({ ...session, alleyName: "" }).title).toBe("Bowling");
  });

  it("drops the event from the eyebrow when there is not one", () => {
    const card = buildSessionCard({ ...session, event: undefined });
    expect(card.eyebrow).not.toContain("·");
  });
});

describe("buildLayoutCard", () => {
  const meters = [
    { label: "Flare", value: 0.9, word: "High" },
    { label: "Length", value: 0.5, word: "Mid" },
    { label: "Backend", value: 0.5, word: "Defined" },
    { label: "Strength", value: 0.8, word: "Strong" }
  ];
  const layout = {
    dualAngle: "45 x 4 1/2 x 45",
    vls: "4 1/2 x 3 7/8 x 2 7/8",
    symmetric: false,
    hand: "right" as const,
    grip: "1h" as const,
    pap: '5" over, 1/2" up',
    meters
  };

  it("leads with the three numbers, drawn as a reading, which is what one bowler asks another for", () => {
    const card = buildLayoutCard(layout);
    expect(card.title).toBe("45 x 4 1/2 x 45");
    expect(card.readingTitle).toBe(true);
  });

  it("names the core in a word, the hand and the axis, without which the numbers are a different layout", () => {
    expect(buildLayoutCard(layout).eyebrow).toBe('Asym  ·  Right hand  ·  PAP 5" over, 1/2" up');
    expect(buildLayoutCard({ ...layout, symmetric: true, hand: "left" }).eyebrow).toContain(
      "Sym  ·  Left hand"
    );
  });

  it("says what the ball will do in four small bars rather than a sentence, and has no hero or game boxes", () => {
    const card = buildLayoutCard(layout);
    expect(card.meters).toEqual(meters);
    expect(card.caption).toBeUndefined();
    expect(card.hero).toBeNull();
    expect(card.games).toBeNull();
  });

  it("keeps the other notation, which the picture cannot say, and nothing else", () => {
    expect(buildLayoutCard(layout).stats).toEqual([
      { value: "4 1/2 x 3 7/8 x 2 7/8", label: "Storm VLS" }
    ]);
  });

  it("names a two-handed grip, and leaves the common one unsaid", () => {
    // A card that spelled out the one-handed grip on every layout would be
    // spending a clause of the eyebrow to say nothing surprising.
    expect(buildLayoutCard({ ...layout, grip: "2h" }).eyebrow).toContain("Right hand, 2H");
    expect(buildLayoutCard(layout).eyebrow).not.toContain("1H");
  });
});

describe("buildStatsCard", () => {
  const stats = {
    totalSessions: 12,
    completedGames: 36,
    averageScore: 187.6,
    highGame: 268,
    strikePct: 55.2,
    sparePct: 51.1,
    pocketPct: 62.4,
    carryPct: 71.8
  };

  it("leads with the average", () => {
    expect(buildStatsCard(stats, "Every session").hero).toEqual({
      value: "188",
      label: "Average"
    });
  });

  it("counts the sample in the eyebrow", () => {
    expect(buildStatsCard(stats, "Every session").eyebrow).toBe("12 sessions  ·  36 games");
  });

  it("singularizes a sample of one", () => {
    const card = buildStatsCard({ ...stats, totalSessions: 1, completedGames: 1 }, "x");
    expect(card.eyebrow).toBe("1 session  ·  1 game");
  });

  it("takes three rows, using the space the game boxes would have needed", () => {
    expect(buildStatsCard(stats, "Every session").stats).toHaveLength(5);
  });

  it("caps at six so it cannot overflow the card", () => {
    // Every optional stat present is still only five; the cap guards a future
    // seventh being added to the calculator without anyone checking the card.
    const card = buildStatsCard(stats, "Every session");
    expect(card.stats.length).toBeLessThanOrEqual(6);
  });

  it("has no hero when nothing has been scored", () => {
    const card = buildStatsCard({ ...stats, averageScore: null }, "Every session");
    expect(card.hero).toBeNull();
  });

  it("draws no game boxes: a stats card is not a night", () => {
    expect(buildStatsCard(stats, "Every session").games).toBeNull();
  });
});

describe("describeFilter", () => {
  const none = { alley: "", pattern: "", event: "", gameNumber: null, lanes: [] };

  it("says so when nothing is applied", () => {
    expect(describeFilter(none)).toBe("Every session");
  });

  it("names each applied part", () => {
    expect(describeFilter({ ...none, alley: "Sunset Lanes", event: "League" })).toBe(
      "Sunset Lanes  ·  League"
    );
  });

  it("labels a game position", () => {
    expect(describeFilter({ ...none, gameNumber: 3 })).toBe("Game 3");
  });

  it("pluralizes lanes", () => {
    expect(describeFilter({ ...none, lanes: ["7"] })).toBe("Lane 7");
    expect(describeFilter({ ...none, lanes: ["7", "8"] })).toBe("Lanes 7, 8");
  });

  it("ignores whitespace-only filters", () => {
    expect(describeFilter({ ...none, alley: "   " })).toBe("Every session");
  });
});

describe("shareCardFilename", () => {
  const at = new Date("2026-08-30T19:30:00");

  it("slugs the title and stamps the minute", () => {
    expect(shareCardFilename("Sunset Lanes", at)).toBe("sunset-lanes-2026-08-30-1930.png");
  });

  it("includes minutes so two shares in one day do not collide", () => {
    const later = new Date("2026-08-30T19:31:00");
    expect(shareCardFilename("Sunset Lanes", at)).not.toBe(shareCardFilename("Sunset Lanes", later));
  });

  it("survives a title with nothing sluggable in it", () => {
    expect(shareCardFilename("···", at)).toBe("bowling-2026-08-30-1930.png");
  });
});

describe("formatCardDate", () => {
  it("returns the raw string when the date does not parse", () => {
    // `date` is user-editable free text and is not guaranteed to be ISO.
    expect(formatCardDate("some time last winter")).toBe("some time last winter");
  });

  it("formats a real date", () => {
    expect(formatCardDate("2026-08-30")).toContain("2026");
  });
});

describe("buildLineCard", () => {
  const strikeLine = { laydown: 20, target: 15, final_board: 17.5 };

  it("draws the lane, with the path the visualizer draws", () => {
    const card = buildLineCard({ line: strikeLine, hand: "right", spare: false });
    expect(card.lane?.path.length).toBeGreaterThan(2);
    expect(card.lane?.laydown.board).toBeCloseTo(20);
    expect(card.lane?.final.board).toBeCloseTo(17.5);
    expect(card.lane?.standing).toHaveLength(10);
  });

  it("names each number, and the pocket as the pocket", () => {
    const card = buildLineCard({ line: strikeLine, hand: "right", spare: false });
    expect(card.stats.map((s) => s.label)).toEqual([
      "Laydown board",
      "Target at the arrows",
      "Breakpoint",
      "Into the pocket"
    ]);
    expect(card.stats[2].value).toMatch(/^\d+(\.5)? at \d+ ft$/);
  });

  it("titles a strike line by its pattern, and adds the oil", () => {
    const passes = [
      { start_distance: 0, end_distance: 40, left_board: 2, right_board: 38, loads: 2, microliters: 50, direction: "forward" }
    ] as unknown as OilPass[];
    const card = buildLineCard({
      line: strikeLine,
      hand: "right",
      spare: false,
      pattern: { name: "House shot", passes }
    });
    expect(card.title).toBe("House shot");
    expect(card.eyebrow).toBe("Right hand  ·  Strike line");
    expect(card.lane?.oil?.length).toBe(40);
    expect(card.stats.find((s) => s.label === "Pattern length")?.value).toBe("40 ft");
  });

  it("titles a spare by its leave and stands only the leave", () => {
    const card = buildLineCard({
      line: { laydown: 30, target: 22, final_board: 30 },
      hand: "left",
      spare: true,
      leave: [10]
    });
    expect(card.title).toBe("10 pin spare");
    expect(card.eyebrow).toBe("Left hand");
    expect(card.lane?.standing).toEqual([10]);
    expect(card.stats.some((s) => s.label === "Into the pocket")).toBe(false);
  });

  it("still makes a card from a line with no target", () => {
    const card = buildLineCard({ line: { laydown: 20 }, hand: "right", spare: false });
    expect(card.lane).toBeUndefined();
    expect(card.stats).toEqual([{ value: "20", label: "Laydown board" }]);
  });
});

describe("share cards in the store apps (ADR-156)", () => {
  it("hand the picture to the platform's sheet, for share and for save alike", async () => {
    vi.resetModules();
    const shareFileFromApp = vi.fn(async () => "shared" as const);
    vi.doMock("./nativeShare", () => ({ shareFileFromApp }));
    vi.stubGlobal("Capacitor", { isNativePlatform: () => true });
    try {
      const { shareCardImage, downloadCardImage } = await import("./shareCard");
      const blob = new Blob(["png"], { type: "image/png" });
      expect(await shareCardImage(blob, "night.png")).toBe("shared");
      await downloadCardImage(blob, "night.png");
      expect(shareFileFromApp).toHaveBeenCalledTimes(2);
      expect(shareFileFromApp).toHaveBeenCalledWith("night.png", blob);
    } finally {
      vi.unstubAllGlobals();
      vi.doUnmock("./nativeShare");
      vi.resetModules();
    }
  });
});
