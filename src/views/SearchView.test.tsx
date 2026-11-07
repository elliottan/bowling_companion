import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SearchView } from "./SearchView";
import { db } from "../db/bowlingDb";
import { readRecentSearches } from "../lib/recentSearches";

async function seed() {
  const patternId = Number(await db.oil_patterns.add({ name: "Kegel Route 66", distance: 40 }));
  await db.sessions.add({ date: "2026-10-01", alley_name: "Pinecrest Lanes", oil_pattern_id: patternId });
  await db.sessions.add({ date: "2026-10-08", alley_name: "Pinecrest Lanes", oil_pattern_id: patternId });
  return patternId;
}

function renderSearch() {
  const onOpen = vi.fn();
  const onClose = vi.fn();
  const onSearchCatalog = vi.fn();
  render(<SearchView onOpen={onOpen} onClose={onClose} onSearchCatalog={onSearchCatalog} />);
  return { onOpen, onClose, onSearchCatalog, field: screen.getByRole("searchbox", { name: "Search Headpin" }) };
}

describe("SearchView", () => {
  beforeEach(async () => {
    localStorage.clear();
    await db.delete();
    await db.open();
  });

  it("opens with the field focused, so the keyboard comes up with it", () => {
    const { field } = renderSearch();
    expect(document.activeElement).toBe(field);
  });

  it("offers the bowler's own pattern and the guide words before anything is typed", async () => {
    await seed();
    renderSearch();
    expect(await screen.findByRole("button", { name: "Kegel Route 66" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Brooklyn" })).toBeTruthy();
    // No recent searches yet, so no group for them.
    expect(screen.queryByText("Recent")).toBeNull();
  });

  it("answers a pattern with the sessions bowled on it, and opens History on them", async () => {
    await seed();
    const { field, onOpen } = renderSearch();
    fireEvent.change(field, { target: { value: "route 66" } });
    const row = await screen.findByRole("button", { name: /Sessions on Kegel Route 66/ });
    expect(row.textContent).toContain("2 sessions");
    fireEvent.click(row);
    expect(onOpen).toHaveBeenCalledWith({ kind: "sessions", facet: "pattern", value: "Kegel Route 66" });
    // What was searched is remembered for next time.
    expect(readRecentSearches()).toEqual(["route 66"]);
  });

  it("answers a bowling word with its meaning on the row", async () => {
    const { field, onOpen } = renderSearch();
    fireEvent.change(field, { target: { value: "pocket" } });
    const row = await screen.findByRole("button", { name: /^Pocket/ });
    expect(row.textContent).toContain("between the 1 and 3 pins");
    fireEvent.click(row);
    expect(onOpen).toHaveBeenCalledWith({ kind: "guide", guideId: "strike-words" });
  });

  it("shows recent searches, fills one back in, and clears them", async () => {
    localStorage.setItem("headpin:recent-searches", JSON.stringify(["brooklyn", "turkey"]));
    const { field } = renderSearch();
    expect(screen.getByText("Recent")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "turkey" }));
    expect((field as HTMLInputElement).value).toBe("turkey");
    expect(await screen.findByText("Top hit")).toBeTruthy();
    fireEvent.change(field, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    await waitFor(() => expect(screen.queryByText("Recent")).toBeNull());
    expect(readRecentSearches()).toEqual([]);
  });

  it("says when nothing matches, and still offers the catalog", async () => {
    const { field, onSearchCatalog } = renderSearch();
    fireEvent.change(field, { target: { value: "zzqx" } });
    expect(await screen.findByText("No results for “zzqx”")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Search the ball catalog for “zzqx”" }));
    expect(onSearchCatalog).toHaveBeenCalledWith("zzqx");
  });

  it("closes from Cancel", async () => {
    const { onClose } = renderSearch();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
