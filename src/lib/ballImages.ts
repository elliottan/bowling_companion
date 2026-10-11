import type { Ball } from "../types/bowling";

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
