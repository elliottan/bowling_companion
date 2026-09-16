import { describe, expect, it, vi, beforeEach } from "vitest";
import { db } from "../db/bowlingDb";
import { syncPatternCatalog, resetPatternCatalogCache } from "./patternCatalog";
import { getAllOilPatterns, addOilPattern } from "./ballRepository";

const CATALOG = {
  version: 1,
  generated_at: "2026-09-16T00:00:00.000Z",
  patterns: [
    {
      id: "stonehenge",
      name: "Stonehenge",
      vendor: "kegel",
      sourceUrl: "https://example.com/stonehenge.pdf",
      distance: 40,
      volumeMl: 23.75,
      ratio: 6.56,
      shape: "challenge" as const,
      passes: [
        { direction: "forward" as const, left_board: 2, right_board: 38, loads: 3, microliters: 50, start_distance: 0, end_distance: 40 },
      ],
    },
  ],
};

function serveCatalog(body: unknown = CATALOG) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => body }));
}

describe("syncPatternCatalog", () => {
  beforeEach(async () => {
    await db.oil_patterns.clear();
    resetPatternCatalogCache();
    vi.unstubAllGlobals();
  });

  // The point of ADR-105: no separation. A catalog pattern is a pattern.
  it("seeds a catalog pattern into the bowler's own list", async () => {
    serveCatalog();
    await syncPatternCatalog();

    const [pattern] = await getAllOilPatterns();
    expect(pattern).toMatchObject({ name: "Stonehenge", catalog_id: "stonehenge" });
    expect(pattern.passes).toHaveLength(1);
  });

  it("seeds once, however many times it runs", async () => {
    serveCatalog();
    await syncPatternCatalog();
    resetPatternCatalogCache();
    serveCatalog();
    await syncPatternCatalog();

    expect(await getAllOilPatterns()).toHaveLength(1);
  });

  // Matched by catalog id, never by name, so a rename survives and still gets
  // the load table kept current.
  it("keeps a renamed pattern's name and refreshes its table", async () => {
    serveCatalog();
    await syncPatternCatalog();
    const [seeded] = await getAllOilPatterns();
    await db.oil_patterns.update(seeded.id!, { name: "Thursday shot", passes: [] });

    resetPatternCatalogCache();
    serveCatalog();
    await syncPatternCatalog();

    const [after] = await getAllOilPatterns();
    expect(after.name).toBe("Thursday shot");
    expect(after.passes).toHaveLength(1);
  });

  it("leaves a pattern of the bowler's own that happens to share the name", async () => {
    await addOilPattern("Stonehenge");
    serveCatalog();
    await syncPatternCatalog();

    const patterns = await getAllOilPatterns();
    expect(patterns).toHaveLength(1);
    expect(patterns[0].catalog_id).toBeUndefined();
    expect(patterns[0].passes).toBeUndefined();
  });

  it("does nothing at all when the catalog cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await syncPatternCatalog();
    expect(await getAllOilPatterns()).toHaveLength(0);
  });
});
