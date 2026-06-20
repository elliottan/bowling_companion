import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncCatalog, getAllCatalog, getStoredCatalogVersion } from "./ballCatalogRepository";
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
  it("appends only new ids and does not duplicate or overwrite existing rows", async () => {
    // Pre-populate one ball
    const existing = makeBall("storm-nova-2024");
    await db.ball_catalog.put(existing);

    const newBall = makeBall("storm-alpha-2024");
    const remoteBalls: CatalogBall[] = [existing, newBall];

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
    expect(all).toHaveLength(2);
    expect(all.map((b) => b.id).sort()).toEqual(["storm-alpha-2024", "storm-nova-2024"]);

    // Existing row was NOT overwritten (bulkPut would overwrite — but we filter before calling it)
    // Verify by checking the existing ball's data matches original
    const foundExisting = all.find((b) => b.id === "storm-nova-2024");
    expect(foundExisting).toEqual(existing);

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
