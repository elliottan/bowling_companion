import { describe, expect, it } from "vitest";
import { AFFILIATE_DEEP_LINK, retailerSearchUrl, shopBallUrl } from "./links";

const AWIN = "https://www.awin1.com/cread.php?awinmid=1&awinaffid=2&ued={url}";

describe("shopBallUrl", () => {
  it("is null until the affiliate program supplies a deep link", () => {
    expect(shopBallUrl("Motiv", "Venom Shock", null)).toBeNull();
    // Shipped off. Turning it on is a deliberate edit, not a default.
    expect(AFFILIATE_DEEP_LINK).toBeNull();
  });

  it("searches the retailer for the brand and the name", () => {
    expect(retailerSearchUrl("Roto Grip", "Attention Star S2")).toBe(
      "https://www.bowling.com/search?q=Roto%20Grip%20Attention%20Star%20S2"
    );
  });

  /** The retailer URL is a parameter of the network's URL, so its own `?` and
   *  `&` have to be escaped or the network reads them as its own. */
  it("wraps the search in the deep link, escaped", () => {
    const url = shopBallUrl("Storm", "Phaze II", AWIN);
    expect(url).toBe(
      `https://www.awin1.com/cread.php?awinmid=1&awinaffid=2&ued=${encodeURIComponent(
        "https://www.bowling.com/search?q=Storm%20Phaze%20II"
      )}`
    );
    expect(new URL(url!).searchParams.get("ued")).toBe(retailerSearchUrl("Storm", "Phaze II"));
  });
});
