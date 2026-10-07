import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../db/bowlingDb";
import { gameFinished } from "../lib/usage";
import {
  report,
  reportGameFinished,
  reportSessionStarted,
  reportShopLink,
  UMAMI_WEBSITE_ID,
  type ReporterDeps
} from "./usageReporter";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    map
  };
}

function deps(over: Partial<ReporterDeps> = {}) {
  const storage = memoryStorage();
  const send = vi.fn(async (_body: unknown) => undefined);
  const d: ReporterDeps = {
    websiteId: "site-id",
    hostname: "headpin.app",
    online: () => true,
    send,
    storage,
    ...over
  };
  return { d, send: d.send as typeof send, storage };
}

/** The event names sent, in order. */
function sentNames(send: ReturnType<typeof vi.fn>) {
  return send.mock.calls.map((c) => (c[0] as { payload: { name: string } }).payload.name);
}

describe("report", () => {
  it("reports to headpin.app's Umami site, and sends nothing without an id", async () => {
    // The landing page's script tag carries the same id (index.html).
    expect(UMAMI_WEBSITE_ID).toBe("5beede37-b88c-4664-a67a-f6205b66b8b6");
    const { d, send } = deps({ websiteId: null });
    await report(gameFinished(1), d);
    expect(send).not.toHaveBeenCalled();
  });

  it("counts only the real site, not a dev server or a preview deploy", async () => {
    for (const hostname of ["localhost", "bowling-companion-git-x.vercel.app"]) {
      const { d, send } = deps({ hostname });
      await report(gameFinished(1), d);
      expect(send).not.toHaveBeenCalled();
    }
  });

  it("holds events while offline and sends them, oldest first, when back", async () => {
    let online = false;
    const { d, send, storage } = deps({ online: () => online });

    await report(gameFinished(1), d);
    await report(gameFinished(2), d);
    expect(send).not.toHaveBeenCalled();
    expect(storage.map.size).toBe(1);

    online = true;
    await report(gameFinished(3), d);
    expect(send.mock.calls.map((c) => (c[0] as { payload: { data: { n: string } } }).payload.data.n)).toEqual([
      "1", "2", "3"
    ]);
    expect(storage.map.size).toBe(0);
  });

  it("keeps an event that failed to send for next time, and never throws", async () => {
    const { d, storage } = deps({ send: vi.fn(async () => Promise.reject(new Error("offline"))) });
    await expect(report(gameFinished(1), d)).resolves.toBeUndefined();
    expect(JSON.parse(storage.map.get("usage_queue")!)).toHaveLength(1);
  });

  it("still sends when storage is unavailable", async () => {
    const { d, send } = deps({ storage: null });
    await report(gameFinished(1), d);
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe("what is counted", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("a session start reports its number and the days since the first", async () => {
    await db.sessions.bulkAdd([
      { alley_name: "Sunset Lanes", date: "2000-01-01" },
      { alley_name: "Sunset Lanes", date: "2000-01-05" }
    ]);
    const { d, send } = deps();
    await reportSessionStarted(d);
    const payload = (send.mock.calls[0][0] as { payload: { name: string; data: unknown } }).payload;
    expect(payload.name).toBe("session-started");
    // Two sessions, the first long ago. No alley name goes with it.
    expect(payload.data).toEqual({ n: "2", days: "31+" });
  });

  it("a finished game reports how many games are finished", async () => {
    await db.games.bulkAdd([
      { session_id: 1, game_number: 1, final_score: 180 },
      { session_id: 1, game_number: 2, final_score: 201 },
      { session_id: 1, game_number: 3 }
    ] as never);
    const { d, send } = deps();
    await reportGameFinished(d);
    expect((send.mock.calls[0][0] as { payload: { data: unknown } }).payload.data).toEqual({ n: "2" });
  });

  it("a shop tap reports the ball's brand", async () => {
    const { d, send } = deps();
    reportShopLink("Motiv", d);
    await vi.waitFor(() => expect(sentNames(send)).toEqual(["shop-link"]));
  });
});
