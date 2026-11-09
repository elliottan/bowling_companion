/**
 * The catalog's own stack of pages (ADR-264): a ball's page, or a list of the
 * balls on one core or in one cover, which View all on a ball's page pushes
 * over it. Both ride in one trail of strings beside the catalog overlay
 * (`catalogBallId`, `catalogBallTrail`), so back pops them in order and a
 * restored URL lands on the same page. A list is written with a prefix no
 * catalog id can start with: ids are slugs of letters, digits and hyphens.
 */

export type KinList = { kind: "core" | "cover"; name: string };

const PREFIX = "~";

/** The page id of a list of balls on one core or in one cover. */
export function kinListPage(list: KinList): string {
  return `${PREFIX}${list.kind}:${list.name}`;
}

/** The list a page id names, or null when it names a ball. */
export function parseKinListPage(id: string): KinList | null {
  if (!id.startsWith(PREFIX)) return null;
  const colon = id.indexOf(":");
  const kind = id.slice(PREFIX.length, colon);
  if (colon < 0 || (kind !== "core" && kind !== "cover")) return null;
  return { kind, name: id.slice(colon + 1) };
}

/** How many pages of the stack stay drawn: the one on top, and two under it
 *  for the drag back to uncover. Deeper pages come back as they are reached,
 *  so a bowler can wander ball to list to ball as far as they like without
 *  every page they passed staying mounted. */
export const DRAWN_PAGES = 3;
