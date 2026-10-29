import { db } from "../db/bowlingDb";
import { arsenalImageUrls, BALL_IMAGE_CACHE } from "../lib/ballImages";
import { nativePhotoStore } from "../lib/nativePhotoStore";
import { isNativeApp, siteUrl } from "../lib/platform";
import type { PhotoStore } from "../lib/photoStore";

export interface WarmDeps {
  /** Cache Storage, or null where there is none (an old browser, a test). */
  caches: Pick<CacheStorage, "open"> | null;
  urls: () => Promise<string[]>;
}

function defaultDeps(): WarmDeps {
  return {
    // None in the store app either: the cache is the service worker's, and the
    // app runs no worker to read it back (ADR-155).
    caches: typeof caches === "undefined" || isNativeApp() ? null : caches,
    urls: async () => arsenalImageUrls(await db.balls.toArray())
  };
}

/**
 * Puts every arsenal ball's photo in the service worker's image cache before a
 * screen asks for it.
 *
 * The photos are runtime-cached, not precached, so without this a ball's photo
 * is only stored the first time some screen shows it. Until then, and again
 * after iOS clears an idle web app's storage, every screen that shows it waits
 * on the network, which at a bowling alley is the second or two of empty tile
 * a bowler sees. The arsenal is a handful of 10KB files that hardly ever
 * change, so they are fetched once, up front, and only the missing ones.
 *
 * Written straight into the cache rather than fetched through the worker, so it
 * works on the first launch too, before the worker controls the page. Best
 * effort: a failure leaves the photo to load the ordinary way.
 */
export async function warmArsenalImages(deps: WarmDeps = defaultDeps()): Promise<number> {
  if (!deps.caches) return 0;
  try {
    const cache = await deps.caches.open(BALL_IMAGE_CACHE);
    const urls = await deps.urls();
    const missing: string[] = [];
    for (const url of urls) {
      if (!(await cache.match(url))) missing.push(url);
    }
    const results = await Promise.allSettled(missing.map((url) => cache.add(url)));
    return results.filter((r) => r.status === "fulfilled").length;
  } catch {
    return 0;
  }
}

export interface KeepDeps {
  /** The phone's photo store (ADR-162), or null on the web. */
  store: Pick<PhotoStore, "lookup" | "save"> | null;
  urls: () => Promise<string[]>;
}

/**
 * The store app's half of `warmArsenalImages` (ADR-218): it has no service
 * worker, so the arsenal's photos go to the photo store on the phone's disk
 * (ADR-162) before any screen shows them. Without this a ball only kept a photo
 * once some screen had drawn it online, so a bowler who added a ball and drove
 * to an alley with no signal saw a grey silhouette. Only the missing ones are
 * fetched, so a launch with everything kept costs no network at all.
 */
export async function keepArsenalPhotos(deps: KeepDeps = defaultKeepDeps()): Promise<number> {
  const { store } = deps;
  if (!store) return 0;
  try {
    let kept = 0;
    for (const path of await deps.urls()) {
      const url = siteUrl(path, true);
      if (await store.lookup(url)) continue;
      await store.save(url);
      if (await store.lookup(url)) kept += 1;
    }
    return kept;
  } catch {
    return 0;
  }
}

function defaultKeepDeps(): KeepDeps {
  return {
    store: nativePhotoStore(),
    urls: async () => arsenalImageUrls(await db.balls.toArray())
  };
}
