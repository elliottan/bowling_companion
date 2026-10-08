import { describe, expect, it } from "vitest";
import { GUIDES, GUIDE_TOPICS, findGuide, guideAppPath, guideShareUrl, guidesByTopic } from "./guides";
import { parseRoute } from "./appRoute";

describe("the guide list", () => {
  it("gives every guide a unique id, since the URL carries it", () => {
    const ids = GUIDES.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("puts every guide under a known topic, or it would never be listed", () => {
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

  it("answers undefined for an id that is not in the list", () => {
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

describe("the guide share link", () => {
  it("points at the guide's own page, not at the app, so a chat app can preview it", () => {
    expect(guideShareUrl("picking-a-layout", "https://headpin.app")).toBe(
      "https://headpin.app/guides/picking-a-layout"
    );
    // The host comes from the page, so a preview build shares itself.
    expect(guideShareUrl("picking-a-layout", "https://preview.vercel.app")).toBe(
      "https://preview.vercel.app/guides/picking-a-layout"
    );
  });

  it("sends that page on to the guides list with the article open, for every guide", () => {
    for (const guide of GUIDES) {
      const url = new URL(guideAppPath(guide.id), "https://headpin.app");
      expect(url.pathname).toBe("/score");
      const route = parseRoute(url.hash);
      expect(route.view).toBe("dashboard");
      expect(route.overlays).toEqual(["guides"]);
      expect(route.guideId).toBe(guide.id);
    }
  });
});
