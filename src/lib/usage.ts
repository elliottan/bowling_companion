/**
 * Anonymous usage counts (ADR-120): the shapes of the three events Headpin
 * reports, and nothing that sends them.
 *
 * They exist to answer one question the page counts cannot: does a bowler who
 * tries Headpin come back? So every number is a coarse bucket, never a value
 * that could pick a person out, and nothing a bowler typed ever goes in one:
 * no score, no alley, no ball, no note.
 */

export type UsageEventName = "session-started" | "game-finished" | "shop-link";

export interface UsageEvent {
  name: UsageEventName;
  data: Record<string, string>;
}

/** How many of something, in the buckets a retention question needs. */
export function countBucket(n: number): string {
  if (n <= 4) return String(Math.max(1, Math.floor(n)));
  if (n <= 9) return "5-9";
  if (n <= 24) return "10-24";
  return "25+";
}

/** Days since the first session, in the windows a return is judged by. */
export function daysBucket(days: number): string {
  if (days < 1) return "0";
  if (days <= 7) return "1-7";
  if (days <= 14) return "8-14";
  if (days <= 30) return "15-30";
  return "31+";
}

/**
 * Whole days from `first` to `now`, both read as calendar days. A session's
 * date is the `yyyy-mm-dd` the bowler picked, so the clock time of `now` is
 * dropped rather than allowed to round a day either way.
 */
export function daysBetween(first: string, now: Date): number {
  const start = Date.parse(`${first}T00:00:00Z`);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  if (Number.isNaN(start)) return 0;
  return Math.max(0, Math.round((today - start) / 86_400_000));
}

/** A session was started: the how-many-th, and how long after the first. */
export function sessionStarted(sessionCount: number, daysSinceFirst: number): UsageEvent {
  return {
    name: "session-started",
    data: { n: countBucket(sessionCount), days: daysBucket(daysSinceFirst) }
  };
}

/** A game reached its last ball: the how-many-th finished game on this phone. */
export function gameFinished(finishedCount: number): UsageEvent {
  return { name: "game-finished", data: { n: countBucket(finishedCount) } };
}

/** The retailer link on a catalog ball was tapped. The brand is the catalog's,
 *  never the bowler's own words. */
export function shopLink(brand: string): UsageEvent {
  return { name: "shop-link", data: { brand } };
}

/** Where the request is sent, and the one host whose visits count. Development
 *  servers and preview deploys stay out of the numbers. */
export const UMAMI_ENDPOINT = "https://cloud.umami.is/api/send";
export const REPORTING_HOST = "headpin.app";

export interface UmamiContext {
  hostname: string;
  language: string;
  screen: string;
}

/**
 * The body Umami's send API takes. The URL is the app's root rather than the
 * page the bowler is on, because a session's URL carries its id, and the
 * report has no use for it.
 */
export function umamiBody(event: UsageEvent, websiteId: string, ctx: UmamiContext) {
  return {
    type: "event",
    payload: {
      website: websiteId,
      hostname: ctx.hostname,
      language: ctx.language,
      screen: ctx.screen,
      url: "/score",
      title: "Headpin",
      name: event.name,
      data: event.data
    }
  };
}

/** Events waiting for a connection: an alley is often where the signal is
 *  worst. Capped, oldest dropped first, so a phone that never reconnects never
 *  builds up a backlog. */
export const QUEUE_LIMIT = 50;

export function enqueue(queue: UsageEvent[], event: UsageEvent): UsageEvent[] {
  return [...queue, event].slice(-QUEUE_LIMIT);
}

/** Read a stored queue back, keeping only well-formed events. */
export function parseQueue(raw: string | null): UsageEvent[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is UsageEvent =>
        typeof e === "object" &&
        e !== null &&
        typeof (e as UsageEvent).name === "string" &&
        typeof (e as UsageEvent).data === "object"
    );
  } catch {
    return [];
  }
}
