import { describe, expect, it } from "vitest";
import { GUIDES, GUIDE_TOPICS, findGuide, guidesByTopic } from "./guides";

describe("the guide shelf", () => {
  it("gives every guide a unique id, since the URL carries it", () => {
    const ids = GUIDES.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("puts every guide on a known shelf, or it would never be listed", () => {
    for (const guide of GUIDES) {
      expect(GUIDE_TOPICS).toContain(guide.topic);
      expect(guide.body.length).toBeGreaterThan(0);
      expect(guide.summary).not.toBe("");
    }
  });

  it("groups without losing one", () => {
    const grouped = guidesByTopic().flatMap((group) => group.guides);
    expect(grouped).toHaveLength(GUIDES.length);
  });

  it("answers undefined for an id that is not on the shelf", () => {
    expect(findGuide("no-such-guide")).toBeUndefined();
    expect(findGuide(null)).toBeUndefined();
    expect(findGuide("dual-angle-layouts")?.title).toBe("Dual angle layouts");
  });

  it("gives every source a real link, since the bowler is about to spend money", () => {
    for (const source of GUIDES.flatMap((g) => g.sources ?? [])) {
      expect(source.url).toMatch(/^https:\/\//);
      expect(source.label).not.toBe("");
    }
  });
});
