import { describe, expect, it } from "vitest";
import {
  buildSessionCard,
  buildStatsCard,
  buildLayoutCard,
  describeFilter,
  formatCardDate,
  shareCardFilename
} from "./shareCard";

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
  it("leads with the series total", () => {
    const card = buildSessionCard(session);
    expect(card.hero).toEqual({ value: "630", label: "Series" });
  });

  it("says Game, not Series, for a single game", () => {
    const card = buildSessionCard({ ...session, scores: [212], finalScores: [212] });
    expect(card.hero?.label).toBe("Game");
  });

  it("averages finished games only, so a game in progress does not drag it down", () => {
    // Third game is running at 40 and is not final.
    const card = buildSessionCard({
      ...session,
      scores: [212, 185, 40],
      finalScores: [212, 185]
    });
    expect(card.hero?.value).toBe("437");
    expect(card.stats.find((s) => s.label === "Average")?.value).toBe("199");
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
    expect(card.stats.map((s) => s.label)).toEqual(["Average", "High game"]);
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
  const layout = {
    dualAngle: "45 x 4 1/2 x 45",
    vls: "4 1/2 x 3 7/8 x 2 7/8",
    symmetric: false,
    hand: "right" as const,
    grip: "1h" as const,
    pap: '5" over, 1/2" up',
    summary: "Picks up in the mid lane and turns the corner with a defined shape."
  };

  it("leads with the three numbers, which is what one bowler asks another for", () => {
    expect(buildLayoutCard(layout).title).toBe("45 x 4 1/2 x 45");
  });

  it("names the core, the hand and the axis, without which the numbers are a different layout", () => {
    expect(buildLayoutCard(layout).eyebrow).toBe(
      'Asymmetric core  ·  Right hand  ·  PAP 5" over, 1/2" up'
    );
    expect(buildLayoutCard({ ...layout, symmetric: true, hand: "left" }).eyebrow).toContain(
      "Symmetric core  ·  Left hand"
    );
  });

  it("carries what the ball will do as the caption, and no hero or game boxes", () => {
    const card = buildLayoutCard(layout);
    expect(card.caption).toBe(layout.summary);
    expect(card.hero).toBeNull();
    expect(card.games).toBeNull();
  });

  it("keeps the other notation, which the picture cannot say, and nothing else", () => {
    // The flare figure used to sit beside it. It is the one number on the card
    // that is a model's opinion rather than a measurement, the caption above it
    // already says what the ball will do in words, and quoting a tenth of an
    // inch invites it to be read as a spec.
    expect(buildLayoutCard(layout).stats).toEqual([
      { value: "4 1/2 x 3 7/8 x 2 7/8", label: "Storm VLS" }
    ]);
  });

  it("names a two-handed grip, and leaves the common one unsaid", () => {
    // A card that spelled out "one handed" on every layout would be spending a
    // clause of a crowded eyebrow to say nothing surprising.
    expect(buildLayoutCard({ ...layout, grip: "2h" }).eyebrow).toContain("Right hand, two handed");
    expect(buildLayoutCard(layout).eyebrow).not.toContain("handed");
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
