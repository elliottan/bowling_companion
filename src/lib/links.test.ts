import { describe, expect, it } from "vitest";
import { AFFILIATE_DEEP_LINK, retailerSearchUrl, shopBallUrl } from "./links";

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
