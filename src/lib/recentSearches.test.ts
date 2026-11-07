import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RECENT_LIMIT,
  addRecentSearch,
  clearRecentSearches,
  readRecentSearches,
  removeRecentSearch
} from "./recentSearches";

describe("recent searches", () => {
  beforeEach(() => localStorage.clear());

  it("keeps the newest first, and an earlier copy only once", () => {
    addRecentSearch("pocket");
    addRecentSearch("Route 66");
    expect(addRecentSearch("POCKET")).toEqual(["POCKET", "Route 66"]);
    expect(readRecentSearches()).toEqual(["POCKET", "Route 66"]);
  });

  it(`holds the last ${RECENT_LIMIT}`, () => {
    for (const q of ["a", "b", "c", "d", "e", "f"]) addRecentSearch(q);
    expect(readRecentSearches()).toEqual(["f", "e", "d", "c", "b"]);
  });

  it("ignores a blank search", () => {
    expect(addRecentSearch("   ")).toEqual([]);
  });

  it("removes one, and clears them all", () => {
    addRecentSearch("a");
    addRecentSearch("b");
    expect(removeRecentSearch("A")).toEqual(["b"]);
    clearRecentSearches();
    expect(readRecentSearches()).toEqual([]);
  });

  it("reads anything unreadable as none", () => {
    localStorage.setItem("headpin:recent-searches", "{not json");
    expect(readRecentSearches()).toEqual([]);
    localStorage.setItem("headpin:recent-searches", JSON.stringify(["ok", 3, ""]));
    expect(readRecentSearches()).toEqual(["ok"]);
  });

  it("keeps working when storage is blocked", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readRecentSearches()).toEqual([]);
    expect(addRecentSearch("pocket")).toEqual(["pocket"]);
    get.mockRestore();
    set.mockRestore();
  });
});
