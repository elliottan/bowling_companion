import { describe, expect, it } from "vitest";
import {
  countBucket,
  daysBetween,
  daysBucket,
  enqueue,
  gameFinished,
  parseQueue,
  QUEUE_LIMIT,
  sessionStarted,
  shopLink,
  umamiBody
} from "./usage";

describe("buckets", () => {
  it("counts the first few exactly and the rest in bands", () => {
    expect([1, 2, 3, 4, 5, 9, 10, 24, 25, 300].map(countBucket)).toEqual([
      "1", "2", "3", "4", "5-9", "5-9", "10-24", "10-24", "25+", "25+"
    ]);
    // A count is never reported as zero: the event is the first of its kind.
    expect(countBucket(0)).toBe("1");
  });

  it("puts days since the first session in the windows a return is judged by", () => {
    expect([0, 1, 7, 8, 14, 15, 30, 31].map(daysBucket)).toEqual([
      "0", "1-7", "1-7", "8-14", "8-14", "15-30", "15-30", "31+"
    ]);
  });

  it("counts calendar days, whatever the time of day", () => {
    expect(daysBetween("2026-10-01", new Date(2026, 9, 6, 23, 59))).toBe(5);
    expect(daysBetween("2026-10-06", new Date(2026, 9, 6, 0, 1))).toBe(0);
    // A date in the future (a session dated ahead) is not a negative return.
    expect(daysBetween("2026-10-09", new Date(2026, 9, 6))).toBe(0);
    expect(daysBetween("not a date", new Date(2026, 9, 6))).toBe(0);
  });
});

describe("events", () => {
  it("carry only buckets and catalog words, never a bowler's own data", () => {
    expect(sessionStarted(2, 9)).toEqual({ name: "session-started", data: { n: "2", days: "8-14" } });
    expect(gameFinished(1)).toEqual({ name: "game-finished", data: { n: "1" } });
    expect(shopLink("Storm")).toEqual({ name: "shop-link", data: { brand: "Storm" } });
  });

  it("report the app's root, not the session the bowler is on", () => {
    const body = umamiBody(gameFinished(3), "site-id", {
      hostname: "headpin.app",
      language: "en-US",
      screen: "390x844"
    });
    expect(body).toEqual({
      type: "event",
      payload: {
        website: "site-id",
        hostname: "headpin.app",
        language: "en-US",
        screen: "390x844",
        url: "/score",
        title: "Headpin",
        name: "game-finished",
        data: { n: "3" }
      }
    });
  });
});

describe("the offline queue", () => {
  it("keeps the newest events up to its limit", () => {
    let queue = parseQueue(null);
    for (let i = 1; i <= QUEUE_LIMIT + 5; i++) queue = enqueue(queue, gameFinished(i));
    expect(queue).toHaveLength(QUEUE_LIMIT);
    expect(queue[queue.length - 1]).toEqual(gameFinished(QUEUE_LIMIT + 5));
  });

  it("reads back only well-formed events", () => {
    expect(parseQueue("not json")).toEqual([]);
    expect(parseQueue('{"name":"x"}')).toEqual([]);
    expect(parseQueue(JSON.stringify([gameFinished(1), { nope: 1 }, null]))).toEqual([gameFinished(1)]);
  });
});
