import { describe, expect, it } from "vitest";
import { GUIDES, guideAppPath } from "./guides";
import { guideCardUrl, guidePageUrl, renderGuidePage } from "./guidePage";

/** The committed pages and cards, read as the build would see them. */
const pages = import.meta.glob("../../public/guides/*/index.html", {
  query: "?raw",
  import: "default",
  eager: true
}) as Record<string, string>;
const cards = Object.keys(import.meta.glob("../../public/guides/*/card.png"));

describe("the page behind a shared guide link", () => {
  it("carries the guide's own title, summary and card for the preview", () => {
    for (const guide of GUIDES) {
      const html = renderGuidePage(guide);
      expect(html).toContain(`<meta property="og:title" content="${guide.title}`.replace(/&/g, "&amp;"));
      expect(html).toContain(`<meta property="og:description" content="`);
      expect(html).toContain(`<meta property="og:image" content="${guideCardUrl(guide)}" />`);
      expect(html).toContain(`<link rel="canonical" href="${guidePageUrl(guide)}" />`);
      expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
    }
  });

  it("sends a visitor into the app on that guide, with or without a script", () => {
    for (const guide of GUIDES) {
      const html = renderGuidePage(guide);
      const path = guideAppPath(guide.id);
      expect(html).toContain(`location.replace(${JSON.stringify(path)})`);
      expect(html).toContain(`http-equiv="refresh" content="0; url=${path}"`);
      expect(html).toContain(`<a href="${path}">`);
    }
  });

  it("is kept out of search results, since it only hands a visitor on", () => {
    expect(renderGuidePage(GUIDES[0])).toContain('<meta name="robots" content="noindex" />');
  });

  it("escapes a title rather than letting it into the markup", () => {
    const html = renderGuidePage({ ...GUIDES[0], title: 'A "bold" <b>claim</b> & more' });
    expect(html).toContain("A &quot;bold&quot; &lt;b&gt;claim&lt;/b&gt; &amp; more");
    expect(html).not.toContain("<b>claim</b>");
  });
});

describe("the committed guide pages", () => {
  it("match the guides, so a retitled guide cannot keep an old preview", () => {
    for (const guide of GUIDES) {
      // If this fails: npm run guide-pages
      expect(pages[`../../public/guides/${guide.id}/index.html`]).toBe(renderGuidePage(guide));
      expect(cards).toContain(`../../public/guides/${guide.id}/card.png`);
    }
  });

  it("has no page for a guide that has been removed", () => {
    expect(Object.keys(pages).sort()).toEqual(
      GUIDES.map((g) => `../../public/guides/${g.id}/index.html`).sort()
    );
  });
});
