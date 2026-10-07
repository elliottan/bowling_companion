import { db } from "../db/bowlingDb";
import {
  daysBetween,
  enqueue,
  gameFinished,
  parseQueue,
  REPORTING_HOST,
  sessionStarted,
  shopLink,
  UMAMI_ENDPOINT,
  umamiBody,
  type UsageEvent
} from "../lib/usage";

/**
 * Sends the anonymous usage counts (ADR-120) to Umami Cloud.
 *
 * The website id is from Umami's dashboard for headpin.app. It isn't a secret:
 * it ships in every page that reports, the landing page's script tag included.
 * Null would send nothing at all.
 */
export const UMAMI_WEBSITE_ID: string | null = "5beede37-b88c-4664-a67a-f6205b66b8b6";

/** Events held in localStorage while the phone is offline. A per-device
 *  convenience: losing it loses a few counts, never a bowler's data. */
const QUEUE_KEY = "usage_queue";

export interface ReporterDeps {
  websiteId: string | null;
  hostname: string;
  online: () => boolean;
  send: (body: unknown) => Promise<unknown>;
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
}

function browserStorage(): ReporterDeps["storage"] {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function defaultDeps(): ReporterDeps {
  return {
    websiteId: UMAMI_WEBSITE_ID,
    hostname: window.location.hostname,
    online: () => navigator.onLine !== false,
    send: (body) =>
      fetch(UMAMI_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        keepalive: true
      }),
    storage: browserStorage()
  };
}

function readQueue(deps: ReporterDeps): UsageEvent[] {
  try {
    return parseQueue(deps.storage?.getItem(QUEUE_KEY) ?? null);
  } catch {
    return [];
  }
}

function writeQueue(deps: ReporterDeps, queue: UsageEvent[]) {
  try {
    if (queue.length) deps.storage?.setItem(QUEUE_KEY, JSON.stringify(queue));
    else deps.storage?.removeItem(QUEUE_KEY);
  } catch {
    // Storage refused (private mode, quota): the counts are best effort.
  }
}

/**
 * Send one event, after whatever was queued while offline. Never throws and
 * never blocks: a count is worth less than any delay it could cause.
 */
export async function report(event: UsageEvent, deps: ReporterDeps = defaultDeps()): Promise<void> {
  const websiteId = deps.websiteId;
  if (!websiteId || deps.hostname !== REPORTING_HOST) return;

  const queue = enqueue(readQueue(deps), event);
  if (!deps.online()) {
    writeQueue(deps, queue);
    return;
  }

  const ctx = {
    hostname: deps.hostname,
    language: navigator.language,
    screen: `${window.screen.width}x${window.screen.height}`
  };
  const unsent: UsageEvent[] = [];
  for (const e of queue) {
    try {
      await deps.send(umamiBody(e, websiteId, ctx));
    } catch {
      unsent.push(e);
    }
  }
  writeQueue(deps, unsent);
}

/** A session was started. Counted after it is saved, so it includes itself. */
export async function reportSessionStarted(deps?: ReporterDeps): Promise<void> {
  try {
    const count = await db.sessions.count();
    const first = await db.sessions.orderBy("date").first();
    await report(sessionStarted(count, first ? daysBetween(first.date, new Date()) : 0), deps);
  } catch {
    // Best effort, like everything here.
  }
}

/** A game was just finished. */
export async function reportGameFinished(deps?: ReporterDeps): Promise<void> {
  try {
    const finished = await db.games.filter((g) => g.final_score !== undefined).count();
    await report(gameFinished(finished), deps);
  } catch {
    // Best effort.
  }
}

export function reportShopLink(brand: string, deps?: ReporterDeps): void {
  void report(shopLink(brand), deps);
}
