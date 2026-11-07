import { describe, expect, it } from "vitest";
import { GUIDES, GUIDE_TOPICS, findGuide, guideAppPath, guideShareUrl, guidesByTopic, termSlug } from "./guides";
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
      expect(url.pathname).toBe("/app");
      const route = parseRoute(url.hash);
      expect(route.view).toBe("dashboard");
      expect(route.overlays).toEqual(["guides"]);
      expect(route.guideId).toBe(guide.id);
    }
  });
});

describe("the Bowling terms page (ADR-249)", () => {
  const glossary = GUIDES.find((g) => g.glossary)!;
  const terms = glossary.body.flatMap((b) => (b.kind === "terms" ? b.items : []));

  it("is one page holding every short term", () => {
    expect(GUIDES.filter((g) => g.glossary)).toHaveLength(1);
    expect(terms.length).toBeGreaterThan(50);
  });

  it("gives every term an id of its own, since search opens the page on one", () => {
    const ids = terms.map((t) => termSlug(t.term));
    expect(new Set(ids).size).toBe(ids.length);
    expect(termSlug("7-10 split")).toBe("7-10-split");
    expect(termSlug("Ringing 10")).toBe("ringing-10");
  });

  it("draws a leave only with pins that exist", () => {
    for (const t of terms) {
      if (t.figure?.kind !== "leave") continue;
      for (const pin of [...t.figure.standing, ...(t.figure.mark ?? [])]) {
        expect(pin).toBeGreaterThanOrEqual(1);
        expect(pin).toBeLessThanOrEqual(10);
      }
    }
  });

  it("draws the leaves the words name", () => {
    const leave = (name: string) => {
      const f = terms.find((t) => t.term === name)?.figure;
      return f?.kind === "leave" ? f.standing : undefined;
    };
    expect(leave("Greek church")).toEqual([4, 6, 7, 9, 10]);
    expect(leave("Big four")).toEqual([4, 6, 7, 10]);
    expect(leave("7-10 split")).toEqual([7, 10]);
  });

  it("covers both corner pin leaves for both hands", () => {
    const find = (q: string) => terms.find((t) => t.term === q || t.aliases?.includes(q));
    for (const name of ["Ringing 10", "Ringing 7", "Flat 10", "Flat 7"]) expect(find(name)).toBeDefined();
  });
});
