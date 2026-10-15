import { describe, expect, it } from "vitest";
import { AFFILIATE_DEEP_LINK, catalogRequestMailto, retailerSearchUrl, shopBallUrl } from "./links";

const RAKUTEN = "https://click.linksynergy.com/deeplink?id=abc&mid=123&murl={url}";

describe("shopBallUrl", () => {
  it("is null until the affiliate program supplies a deep link", () => {
    expect(shopBallUrl("Motiv", "Venom Shock", null)).toBeNull();
    // Shipped off. Turning it on is a deliberate edit, not a default.
    expect(AFFILIATE_DEEP_LINK).toBeNull();
  });

  it("searches the retailer for the brand and the name", () => {
    expect(retailerSearchUrl("Roto Grip", "Attention Star S2")).toBe(
      "https://www.bowlersmart.com/?s=Roto%20Grip%20Attention%20Star%20S2&post_type=product"
    );
  });

  /** The retailer URL is a parameter of the network's URL, so its own `?` and
   *  `&` have to be escaped or the network reads them as its own. */
  it("wraps the search in the deep link, escaped", () => {
    const url = shopBallUrl("Storm", "Phaze II", RAKUTEN);
    expect(url).toBe(
      `https://click.linksynergy.com/deeplink?id=abc&mid=123&murl=${encodeURIComponent(
        "https://www.bowlersmart.com/?s=Storm%20Phaze%20II&post_type=product"
      )}`
    );
    // The retailer's own `&post_type` stays inside murl, not beside it.
    const params = new URL(url!).searchParams;
    expect(params.get("murl")).toBe(retailerSearchUrl("Storm", "Phaze II"));
    expect(params.get("post_type")).toBeNull();
  });
});

describe("catalogRequestMailto", () => {
  function parts(url: string) {
    const [head, query] = url.split("?");
    const params = new URLSearchParams(query);
    return { to: head, subject: params.get("subject"), body: params.get("body") };
  }

  it("asks for a ball, with what was searched in the subject and the body", () => {
    const { to, subject, body } = parts(catalogRequestMailto("ball", "  Hy-Road Max "));
    expect(to).toBe("mailto:hello@headpin.app");
    expect(subject).toBe("Ball request: Hy-Road Max");
    expect(body).toContain("Ball: Hy-Road Max");
    expect(body).toContain("Brand:");
  });

  it("asks for a pattern, and asks for the sheet", () => {
    const { subject, body } = parts(catalogRequestMailto("pattern", "Cheetah"));
    expect(subject).toBe("Pattern request: Cheetah");
    expect(body).toContain("Pattern: Cheetah");
    expect(body).toContain("Link to the pattern sheet:");
  });

  it("drops the colon when nothing was typed", () => {
    expect(parts(catalogRequestMailto("ball", "   ")).subject).toBe("Ball request");
  });

  it("caps a pasted paragraph so it cannot become the subject line", () => {
    const { subject } = parts(catalogRequestMailto("ball", "x".repeat(500)));
    expect(subject).toBe(`Ball request: ${"x".repeat(60)}`);
  });

  it("escapes what the bowler typed", () => {
    const url = catalogRequestMailto("ball", "A&B=C?");
    expect(url.split("?").length).toBe(2);
    expect(parts(url).subject).toBe("Ball request: A&B=C?");
  });
});
