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

  // Collapsed together (ADR-106): a row named exactly what a catalog pattern is
  // called IS that pattern, and adopting it beats standing a duplicate next to
  // it. It gains the load table it never had; nothing of the bowler's is lost,
  // because a pattern of their own never had one to lose.
  it("adopts a pattern of the bowler's own that carries the same name", async () => {
    await addOilPattern("Stonehenge");
    serveCatalog();
    await syncPatternCatalog();

    const patterns = await getAllOilPatterns();
    expect(patterns).toHaveLength(1);
    expect(patterns[0]).toMatchObject({ name: "Stonehenge", catalog_id: "stonehenge" });
    expect(patterns[0].passes).toHaveLength(1);
  });

  it("leaves a pattern whose name is the bowler's own alone", async () => {
    await addOilPattern("Thursday league");
    serveCatalog();
    await syncPatternCatalog();

    const mine = (await getAllOilPatterns()).find((p) => p.name === "Thursday league");
    expect(mine?.catalog_id).toBeUndefined();
    expect(mine?.passes).toBeUndefined();
  });

  it("does nothing at all when the catalog cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await syncPatternCatalog();
    expect(await getAllOilPatterns()).toHaveLength(0);
  });
});

describe("the one-time link reset", () => {
  beforeEach(async () => {
    await db.oil_patterns.clear();
    await db.settings.clear();
    resetPatternCatalogCache();
    vi.unstubAllGlobals();
  });

  // Linking is one way by design, which is right for a deliberate link and
  // wrong for the first one made by mistake (ADR-106).
  it("clears a link the bowler wants to make again", async () => {
    const id = await db.oil_patterns.add({
      name: "Thursday shot",
      catalog_id: "chromium-6742",
      passes: [],
    });
    serveCatalog();
    await syncPatternCatalog();

    expect((await db.oil_patterns.get(id))?.catalog_id).toBeUndefined();
  });

  it("runs once, so a link made afterwards survives the next boot", async () => {
    serveCatalog();
    await syncPatternCatalog();
    const id = await db.oil_patterns.add({ name: "Mine", catalog_id: "chromium-6742" });

    resetPatternCatalogCache();
    serveCatalog();
    await syncPatternCatalog();

    expect((await db.oil_patterns.get(id))?.catalog_id).toBe("chromium-6742");
  });

  // A renamed row must not be duplicated by the reset: its load table says
  // which pattern it is, whatever it is called.
  it("re-adopts a renamed pattern by its load table rather than duplicating it", async () => {
    serveCatalog();
    await syncPatternCatalog();
    const [seeded] = await getAllOilPatterns();
    await db.oil_patterns.update(seeded.id!, { name: "My Thursday shot" });
    await db.settings.clear(); // let the reset run again

    resetPatternCatalogCache();
    serveCatalog();
    await syncPatternCatalog();

    const after = await getAllOilPatterns();
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ name: "My Thursday shot", catalog_id: "stonehenge" });
  });
});

// ADR-107. Linking used to leave the pair it created: the bowler's own row,
// now carrying the catalog id, and the row the catalog had seeded beside it.
describe("collapsing a pattern that is in the list twice", () => {
  beforeEach(async () => {
    await db.oil_patterns.clear();
    await db.sessions.clear();
    await db.settings.clear();
    resetPatternCatalogCache();
    vi.unstubAllGlobals();
  });

  it("keeps the older row and takes the younger one out of the list", async () => {
    const mine = await db.oil_patterns.add({ name: "Thursday 40ft", catalog_id: "stonehenge" });
    const seeded = await db.oil_patterns.add({ name: "Stonehenge", catalog_id: "stonehenge" });
    await db.settings.put({ key: "oil_pattern_links_reset", value: "done" });

    serveCatalog();
    await syncPatternCatalog();

    const after = await getAllOilPatterns();
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(mine);
    expect(after[0].name).toBe("Thursday 40ft");
    expect(await db.oil_patterns.get(seeded)).toBeUndefined();
  });

  it("moves the sessions off the row it removes, so none loses its pattern", async () => {
    const mine = await db.oil_patterns.add({ name: "Thursday 40ft", catalog_id: "stonehenge" });
    const seeded = await db.oil_patterns.add({ name: "Stonehenge", catalog_id: "stonehenge" });
    const session = await db.sessions.add({
      date: "2026-09-01",
      alley_name: "Orchid",
      oil_pattern_id: seeded,
    });
    await db.settings.put({ key: "oil_pattern_links_reset", value: "done" });

    serveCatalog();
    await syncPatternCatalog();

    expect((await db.sessions.get(session))?.oil_pattern_id).toBe(mine);
  });

  it("leaves a list with nothing duplicated in it alone", async () => {
    serveCatalog();
    await syncPatternCatalog();
    const before = await getAllOilPatterns();

    resetPatternCatalogCache();
    serveCatalog();
    await syncPatternCatalog();

    expect(await getAllOilPatterns()).toEqual(before);
  });
});
