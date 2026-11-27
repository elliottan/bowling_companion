import { describe, expect, it } from "vitest";
import { laneVerdict } from "./laneVerdict";
import { foundNote, grayStats, laneCheckNote, Notes, timesNote, verdictNote, windowNote } from "./notes";

describe("the shot tracer's details", () => {
  it("keeps lines in the order first written, replaced by set and joined by add", () => {
    const n = new Notes();
    n.set("video", "avc1");
    n.add("read", "first part");
    n.add("read", "the rest");
    n.set("video", "hvc1");
    expect(n.get("read")).toBe("first part; the rest");
    expect(n.text()).toBe("video: hvc1\nread: first part; the rest");
  });

  it("gives a picture's mean, least and most grey, so a black or washed-out draw shows", () => {
    expect(grayStats(Uint8Array.from([16, 16, 235, 233]))).toBe("125/16/235");
    expect(grayStats(new Uint8Array(0))).toBe("empty");
  });

  it("says what the search answered", () => {
    expect(foundNote(null)).toBe("no run found");
    const found = { start: 1.2, release: 1.6, pinHit: null, confidence: 0.4, run: [{ t: 1.6, x: 0.5, y: 0.6 }], others: [[]], guessed: true };
    expect(foundNote(found)).toBe("release 1.60 s, pins not seen, confidence 0.40, guessed (no run passed in the picture), 2 runs, run 1 points from y 0.60");
    expect(foundNote({ ...found, pinHit: 4.1, others: undefined, guessed: undefined })).toBe("release 1.60 s, pins 4.10 s, confidence 0.40, 1 run, run 1 points from y 0.60");
  });

  it("counts the runs' verdicts, and says the window and the stage times", () => {
    expect(verdictNote([])).toBe("no runs");
    expect(verdictNote(["too-slow", "ball", "too-slow"])).toBe("too-slow 2, ball 1");
    expect(windowNote({ foul: 3.7, end: 7.1, by: "speed", speed: 39.5 })).toBe("foul line 3.70 s, end 7.10 s by speed (39.5 ft/s)");
    expect(windowNote({ foul: null, end: 4.67, by: "slowest", speed: null })).toBe("foul line not found, end 4.67 s by slowest");
    expect(timesNote({ look: 3400, read: 4800, lane: 1000, trace: 8800 })).toBe("look 3.4, read 4.8, lane 1.0, trace 8.8 s");
  });

  it("says the lane check and what it was decided on", () => {
    // 6602 as the Node read finds it.
    const e = { guess: null, support: { left: 0.58, right: 0.6 }, pinsUsed: 3, camera: 20.18, kept: 7, dropped: 17, elsewhere: 7, pinCheck: 0.649, pinsSeen: 3 };
    expect(laneCheckNote(laneVerdict(e), e)).toBe("sure, kept 7 of 24 (7 elsewhere), pins 3 within 0.65 bd, edges 0.58/0.60, 3 pins in the fit, camera 20.2 ft");
    const off = { ...e, pinCheck: 1.4, elsewhere: 0, pinsUsed: 1, guess: { foul: "typical-camera" } };
    expect(laneCheckNote(laneVerdict(off), off)).toBe(
      "check (foul-guessed, pins-off), kept 7 of 24, pins 3 within 1.40 bd, edges 0.58/0.60, 1 pin in the fit, camera 20.2 ft, foul line guessed (typical-camera)"
    );
    expect(laneCheckNote(laneVerdict({ pinCheck: null }), { pinCheck: null })).toBe("sure, no pins checked");
    expect(laneCheckNote(laneVerdict({}), {})).toBe("sure");
  });
});
