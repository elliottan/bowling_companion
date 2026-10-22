/**
 * A short check code on a shared line or layout link (ADR-192).
 *
 * A link's numbers are what the line visualizer and the layout lab are opened
 * on, and those two are Pro to move: without a code, typing `?da=70&ptp=5` into
 * the address bar was a free slider. The code is worked out from the link's
 * other parameters, so a number changed by hand no longer matches it, and the
 * link opens on the defaults instead of on the edit.
 *
 * It is a checksum, not a signature. The page that checks it carries the recipe,
 * so somebody who reads the app's code can make a code for any numbers. What it
 * stops is the casual edit, which is the one anybody would try.
 *
 * Pure, per the `lib/` layering rule.
 */

/** The parameter the code rides in. */
export const CHECK_PARAM = "c";

/** Mixed into every code, so it is not the bare hash of the numbers. */
const SALT = "headpin-share-v1";

/** The link's parameters in one order whatever order they arrived in: sorted
 *  by name, the code itself left out. */
function canonical(params: URLSearchParams): string {
  return [...params.entries()]
    .filter(([key]) => key !== CHECK_PARAM)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

/** FNV-1a, 32 bits, as six base-36 characters. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(7, "0").slice(-6);
}

/** The code for a set of parameters. */
export function checkCode(params: URLSearchParams): string {
  return hash(`${SALT}:${canonical(params)}`);
}

/** A query string, without its `?`, with its code added. */
export function withCheck(query: string): string {
  const params = new URLSearchParams(query);
  params.delete(CHECK_PARAM);
  params.set(CHECK_PARAM, checkCode(params));
  return params.toString();
}

/** Whether a link's parameters carry the code that matches them. */
export function hasValidCheck(params: URLSearchParams): boolean {
  const code = params.get(CHECK_PARAM);
  return code !== null && code === checkCode(params);
}
