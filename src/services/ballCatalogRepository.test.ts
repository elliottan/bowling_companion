import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncCatalog, getAllCatalog, getStoredCatalogVersion, refreshArsenalPhotos } from "./ballCatalogRepository";
import { db } from "../db/bowlingDb";
import type { CatalogBall, CatalogManifest } from "../types/catalog";

// fake-indexeddb is installed globally via src/test/setup.ts

function makeBall(id: string): CatalogBall {
  return {
    id,
    brand: "Storm",
    name: id,
    releaseDate: null,
    releaseYear: 2024,
    coverstockRaw: "Reactor Solid",
    coverstockCategory: "Solid",
    factoryFinish: null,
    coreName: null,
    coreType: "Symmetric",
    rg: 2.48,
    diff: 0.05,
    mbDiff: null,
    imageThumb: null,
    imageFull: null,
    sourceUrl: "https://example.com"
  };
}

function makeManifest(version: number): CatalogManifest {
  return { version, generatedAt: "2026-06-20T00:00:00.000Z", ballCount: 0, hash: "abc" };
}

beforeEach(async () => {
  // Clear tables between tests
  await db.ball_catalog.clear();
  await db.settings.clear();
  vi.restoreAllMocks();
});

describe("syncCatalog", () => {
  it("upserts: updates existing rows, inserts new ones, and removes ids gone from remote (ADR-010)", async () => {
    // Pre-populate: one ball that will be updated, one that remote drops.
    await db.ball_catalog.put(makeBall("storm-nova-2024"));
    await db.ball_catalog.put(makeBall("storm-gone-2024"));

    // Remote: updated nova (new name + image), a brand-new ball; no "gone".
    const updatedNova = { ...makeBall("storm-nova-2024"), name: "Nova Updated", imageFull: "/catalog/img/nova-full.webp" };
    const newBall = makeBall("storm-alpha-2024");
    const remoteBalls: CatalogBall[] = [updatedNova, newBall];

    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("catalog-manifest.json")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(makeManifest(1))
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(remoteBalls)
        });
      })
    );

    const states: string[] = [];
    await syncCatalog((s) => states.push(s.status));

    const all = await getAllCatalog();
    // "gone" removed, nova kept + updated, alpha inserted
    expect(all.map((b) => b.id).sort()).toEqual(["storm-alpha-2024", "storm-nova-2024"]);

    const foundNova = all.find((b) => b.id === "storm-nova-2024");
    expect(foundNova?.name).toBe("Nova Updated");
    expect(foundNova?.imageFull).toBe("/catalog/img/nova-full.webp");

    expect(states).toEqual(["syncing", "done"]);
  });

  it("is a no-op when the remote version equals the stored version", async () => {
    // Store version 5
    await db.settings.put({ key: "catalog_version", value: "5" });
    await db.ball_catalog.put(makeBall("storm-nova-2024"));

    const fetchMock = vi.fn((url: string) => {
      if (url.includes("catalog-manifest.json")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(makeManifest(5))
        });
      }
      // catalog.json should NOT be fetched
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([])
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const states: string[] = [];
    await syncCatalog((s) => states.push(s.status));

    // catalog.json fetch must not have been called
    const catalogFetches = fetchMock.mock.calls.filter(
      ([url]) => typeof url === "string" && url.includes("catalog.json") && !url.includes("manifest")
    );
    expect(catalogFetches).toHaveLength(0);

    // Rows unchanged
    const all = await getAllCatalog();
    expect(all).toHaveLength(1);

    expect(states).toEqual(["syncing", "done"]);
  });

  it("a failed manifest fetch leaves existing rows intact and reports an error state", async () => {
    await db.ball_catalog.put(makeBall("storm-nova-2024"));

    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, status: 503 }))
    );

    const states: { status: string; message?: string }[] = [];
    await syncCatalog((s) => {
      if (s.status === "error") {
        states.push({ status: s.status, message: s.message });
      } else {
        states.push({ status: s.status });
      }
    });

    expect(states.some((s) => s.status === "error")).toBe(true);

    // Existing rows must still be intact
    const all = await getAllCatalog();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe("storm-nova-2024");
  });

  it("a failed catalog.json fetch leaves existing rows intact and reports an error state", async () => {
    await db.ball_catalog.put(makeBall("storm-nova-2024"));

    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("catalog-manifest.json")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(makeManifest(2))
          });
        }
        // catalog.json fails
        return Promise.resolve({ ok: false, status: 503 });
      })
    );

    const states: string[] = [];
    await syncCatalog((s) => states.push(s.status));

    expect(states).toContain("error");

    const all = await getAllCatalog();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe("storm-nova-2024");
  });

  it("downloads and populates when stored version equals manifest version but the catalog table is empty (post-restore)", async () => {
    // Backup restore brought back catalog_version = 5 but the ball_catalog
    // table itself is not part of backups, so it's empty on this device.
    await db.settings.put({ key: "catalog_version", value: "5" });

    const fetchMock = vi.fn((url: string) => {
      if (url.includes("catalog-manifest.json")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(makeManifest(5))
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([makeBall("storm-nova-2024")])
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const states: string[] = [];
    await syncCatalog((s) => states.push(s.status));

    // catalog.json must have been fetched despite version matching
    const catalogFetches = fetchMock.mock.calls.filter(
      ([url]) => typeof url === "string" && url.includes("catalog.json") && !url.includes("manifest")
    );
    expect(catalogFetches).toHaveLength(1);

    const all = await getAllCatalog();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe("storm-nova-2024");

    expect(states).toEqual(["syncing", "done"]);
  });

  it("persists catalog_version after a successful sync", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("catalog-manifest.json")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(makeManifest(3))
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([makeBall("storm-nova-2024")])
        });
      })
    );

    await syncCatalog();

    const storedVersion = await getStoredCatalogVersion();
    expect(storedVersion).toBe(3);
  });
});

describe("refreshArsenalPhotos (ADR-143)", () => {
  const snap = (imageThumb: string | null) => ({
    brand: "Pyramid",
    name: "Path",
    coverstockCategory: "Polyester",
    coreName: "Pancake",
    rg: 2.68,
    diff: 0.006,
    mbDiff: null,
    imageThumb
  });

  beforeEach(async () => {
    await db.balls.clear();
  });

  it("points a linked ball at the photo its catalog entry has now, and leaves the rest of the ball alone", async () => {
    await db.ball_catalog.put({ ...makeBall("pyramid-path-2011"), imageThumb: "/catalog/img/path-bg2-thumb.webp" });
    const id = await db.balls.add({
      name: "Path",
      is_spare_ball: true,
      weight: 15,
      catalog_ref_id: "pyramid-path-2011",
      catalog_snapshot: snap("/catalog/img/path-thumb.webp")
    });

    expect(await refreshArsenalPhotos()).toBe(1);

    const ball = await db.balls.get(id);
    expect(ball?.catalog_snapshot?.imageThumb).toBe("/catalog/img/path-bg2-thumb.webp");
    // The specs were read for this ball's weight; only the photo follows.
    expect(ball?.catalog_snapshot?.rg).toBe(2.68);
    expect(ball?.name).toBe("Path");
    expect(ball?.weight).toBe(15);
  });

  it("leaves unlinked balls, current photos and balls whose entry has gone as they are", async () => {
    await db.ball_catalog.put({ ...makeBall("storm-nova-2024"), imageThumb: "/a.webp" });
    await db.balls.bulkAdd([
      { name: "Plastic", is_spare_ball: false },
      { name: "Nova", is_spare_ball: false, catalog_ref_id: "storm-nova-2024", catalog_snapshot: snap("/a.webp") },
      { name: "Gone", is_spare_ball: false, catalog_ref_id: "storm-gone-2019", catalog_snapshot: snap("/old.webp") }
    ]);

    expect(await refreshArsenalPhotos()).toBe(0);
    const gone = (await db.balls.toArray()).find((b) => b.name === "Gone");
    expect(gone?.catalog_snapshot?.imageThumb).toBe("/old.webp");
  });

  it("takes a ball's photo down when its catalog entry's photo was taken down", async () => {
    await db.ball_catalog.put({ ...makeBall("storm-nova-2024"), imageThumb: null });
    const id = await db.balls.add({
      name: "Nova",
      is_spare_ball: false,
      catalog_ref_id: "storm-nova-2024",
      catalog_snapshot: snap("/a.webp")
    });
    await refreshArsenalPhotos();
    expect((await db.balls.get(id))?.catalog_snapshot?.imageThumb).toBeNull();
  });

  it("runs after a sync even when the network is not there, against the catalog on the device", async () => {
    await db.ball_catalog.put({ ...makeBall("pyramid-path-2011"), imageThumb: "/new.webp" });
    const id = await db.balls.add({
      name: "Path",
      is_spare_ball: false,
      catalog_ref_id: "pyramid-path-2011",
      catalog_snapshot: snap("/old.webp")
    });
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));

    await syncCatalog();

    expect((await db.balls.get(id))?.catalog_snapshot?.imageThumb).toBe("/new.webp");
    vi.unstubAllGlobals();
  });
});
