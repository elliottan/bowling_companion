// No imports: vite.config.ts reads this too, under the node tsconfig.

/**
 * The service worker's cache for catalog ball photos. Named here rather than
 * only in the workbox config because the arsenal warm-up writes into the same
 * cache, and a typo on either side would leave each one filling a cache the
 * other never reads.
 */
export const BALL_IMAGE_CACHE = "catalog-images";

/** How long a cached ball photo is trusted before it is fetched again. The
 *  files are named after the ball, not their content, so a replaced photo keeps
 *  its URL and only gets through once this runs out. */
export const BALL_IMAGE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
