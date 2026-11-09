import type { Ball } from "../types/bowling";
import type { CatalogBall, Colorway } from "../types/catalog";

export { BALL_IMAGE_CACHE, BALL_IMAGE_MAX_AGE_SECONDS } from "./ballImageCacheConfig";

/**
 * The photos the arsenal shows, each once. Only the thumbnails: every screen
 * that pictures one of the bowler's own balls (arsenal, picker, scorer, stats)
 * uses the thumb, and the full size is only for browsing the catalog.
 */
export function arsenalImageUrls(balls: readonly Pick<Ball, "catalog_snapshot">[]): string[] {
  const urls = new Set<string>();
  for (const ball of balls) {
    const thumb = ball.catalog_snapshot?.imageThumb;
    if (thumb) urls.add(thumb);
  }
  return [...urls];
}

/**
 * A colorway's photo. Its own where the catalog has one; failing that, the
 * ball's photo stands in only for the first colorway, which is the one the
 * catalog pictures. Any other colorway without a photo of its own has none,
 * so it draws the placeholder rather than a ball of another colour under its
 * name: Pyramid Path's six colorways all showed the pink one. No colorway
 * (none picked, or a SKU the catalog no longer lists) is the ball's photo.
 */
export function colorwayImage(
  ball: Pick<CatalogBall, "imageThumb" | "imageFull" | "colorways">,
  colorway: Colorway | null | undefined,
  size: "thumb" | "full"
): string | null {
  const own = size === "thumb" ? colorway?.imageThumb : colorway?.imageFull;
  if (own) return own;
  const first = ball.colorways?.[0];
  if (colorway && first && colorway.sku !== first.sku) return null;
  return (size === "thumb" ? ball.imageThumb : ball.imageFull) ?? null;
}
