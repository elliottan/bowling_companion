import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CatalogView } from "./CatalogView";
import { formatReleaseDate } from "../lib/dates";
import { db } from "../db/bowlingDb";
import type { CatalogBall } from "../types/catalog";

vi.mock("../services/ballCatalogRepository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/ballCatalogRepository")>();
  return {
    ...actual,
    // The real one fetches a JSON file over the network, which a unit test has
    // no business doing; the rows it would have written are seeded directly.
    syncCatalog: vi.fn(async () => {})
  };
});

/** A catalog of `count` balls, written straight to the table. */
async function seedCatalog(count: number, releaseDates: (string | null)[] = []) {
  const balls: CatalogBall[] = Array.from({ length: count }, (_, i) => ({
    id: `ball-${i}`,
    brand: "Storm",
    name: `Ball ${i}`,
    coverstockCategory: "Reactive",
    coreType: "Symmetric",
    rg: 2.5,
    diff: 0.05,
    mbDiff: null,
    releaseDate: releaseDates[i] ?? null,
    releaseYear: releaseDates[i] ? Number(releaseDates[i]!.slice(0, 4)) : 2026,
    imageThumb: null,
    imageFull: null,
    productUrl: null,
    weights: [],
    colorways: []
  })) as unknown as CatalogBall[];
  await db.ball_catalog.bulkPut(balls);
}

const shop = vi.hoisted(() => ({ opened: [] as string[] }));
vi.mock("../lib/links", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/links")>();
  return {
    ...actual,
    // The mail app is not something a unit test can open; what it was handed is.
    openMail: (url: string) => {
      shop.opened.push(url);
    }
  };
});

function renderCatalog() {
  render(<CatalogView onBack={vi.fn()} selectedBallId={null} onSelectBall={vi.fn()} />);
}

describe("CatalogView", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  afterEach(() => {
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  it("says what to do when the catalog has never loaded and there is no signal", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });

    renderCatalog();

    expect(await screen.findByText("Connect once to load the catalog")).toBeInTheDocument();
    // The button that needs the network says so rather than failing when tapped.
    expect(screen.getByRole("button", { name: "Waiting for a connection" })).toBeDisabled();
  });

  it("offers to load it when there is a connection", async () => {
    renderCatalog();

    expect(await screen.findByText("The catalog has not loaded")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load the catalog" })).toBeEnabled();
  });

  /**
   * All 250 rows used to be in the DOM at once, each with a photo. The list is
   * windowed now, so the first paint is a page.
   */
  it("renders a page of rows, not the whole catalog", async () => {
    await seedCatalog(120);

    renderCatalog();

    // A page of rows in the DOM, out of a catalog three times that size. Which
    // forty is the sort's business, not this test's.
    await waitFor(() => expect(screen.getAllByRole("listitem").length).toBeGreaterThan(0));
    // A page of rows in the DOM, out of a catalog three times that size.
    // A page of rows in the DOM, out of a catalog three times that size.
    const rows = screen.getAllByRole("listitem");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(40);
  });

  it("says a ball's release month, and sorts newest first by it", async () => {
    // Seeded oldest first, so the order on screen is the sort's doing. A ball
    // known only to its year sits after that year's dated ones.
    await seedCatalog(4, ["2024", "2024-03-12", "2024-11-05", null]);

    renderCatalog();

    // The request row closes the list, and is not one of its balls.
    const ballRows = () => screen.getAllByRole("listitem").filter((row) => /Ball \d/.test(row.textContent ?? ""));
    await waitFor(() => expect(ballRows()).toHaveLength(4));
    const names = ballRows().map((row) => row.textContent ?? "");
    expect(names.map((text) => text.match(/Ball \d/)?.[0])).toEqual(["Ball 2", "Ball 1", "Ball 0", "Ball 3"]);
    expect(names[0]).toContain(formatReleaseDate("2024-11")!);
    expect(names[1]).toContain(formatReleaseDate("2024-03")!);
    // A year is a year: no month is made up for it.
    expect(names[2]).toContain("2024 ·");
  });

  describe("asking for a ball that is not there", () => {
    beforeEach(() => {
      shop.opened.length = 0;
    });

    function typeSearch(text: string) {
      fireEvent.change(screen.getByRole("searchbox", { name: "Search the catalog" }), { target: { value: text } });
    }

    it("offers a request, carrying the search, when nothing matches it", async () => {
      await seedCatalog(3);
      renderCatalog();
      await screen.findByText("Ball 0");

      typeSearch("Zzyzx");

      expect(await screen.findByText('Nothing matches "Zzyzx"')).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /Request this ball/ }));
      expect(shop.opened).toHaveLength(1);
      expect(decodeURIComponent(shop.opened[0]!)).toContain("Ball request: Zzyzx");
    });

    it("clears the filters instead of asking, when only filters emptied the list", async () => {
      await seedCatalog(3);
      renderCatalog();
      await screen.findByText("Ball 0");

      fireEvent.click(screen.getByRole("button", { name: /Filters/ }));
      fireEvent.click(screen.getByRole("button", { name: "Pearl" }));

      expect(await screen.findByText("No balls match these filters")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Request this ball/ })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
      expect(await screen.findByText("Ball 0")).toBeInTheDocument();
    });

    it("keeps a quiet request row at the end of the list", async () => {
      await seedCatalog(3);
      renderCatalog();
      await screen.findByText("Ball 0");

      fireEvent.click(screen.getByRole("button", { name: "Request a ball" }));

      expect(decodeURIComponent(shop.opened[0]!)).toContain("subject=Ball request");
    });
  });

  it("opens the filters in a sheet that applies as you choose, and is left with Done", async () => {
    await seedCatalog(3);
    renderCatalog();
    await screen.findByText("Ball 0");

    expect(screen.getAllByText("3 results")).toHaveLength(2); // under the title, and the bar's copy
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    // A sheet from the bottom edge, as every other filter sheet in the app is,
    // not a card dropped down over the list.
    const sheet = screen.getByRole("dialog", { name: "Filters" });
    fireEvent.click(within(sheet).getByRole("button", { name: "Storm" }));
    // Applied at once: the Filters button lights up with the count while the
    // sheet is still up.
    const filtersButton = () => screen.getByRole("button", { name: /^Filters/ });
    expect(filtersButton()).toHaveAttribute("aria-pressed", "true");
    expect(filtersButton()).toHaveTextContent("1");

    fireEvent.click(within(sheet).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Filters" })).not.toBeInTheDocument());
    // The count under the title follows the list.
    expect(screen.getAllByText("3 results")).toHaveLength(2); // under the title, and the bar's copy
    // What was chosen stays, on the button alone: no chips under the search.
    expect(filtersButton()).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: /^Remove filter/ })).not.toBeInTheDocument();
  });

  it("clears every filter from the sheet's leading corner, and keeps the search", async () => {
    await seedCatalog(3);
    renderCatalog();
    await screen.findByText("Ball 0");

    fireEvent.change(screen.getByPlaceholderText("Search name, brand, coverstock…"), { target: { value: "Ball" } });
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    const sheet = screen.getByRole("dialog", { name: "Filters" });
    // Nothing to clear yet, so it is there but cannot be pressed.
    expect(within(sheet).getByRole("button", { name: "Clear all" })).toBeDisabled();

    fireEvent.click(within(sheet).getByRole("button", { name: "Storm" }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Clear all" }));
    expect(screen.getByRole("button", { name: /^Filters/ })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByPlaceholderText("Search name, brand, coverstock…")).toHaveValue("Ball");
  });

  describe("a ball's page", () => {
    /** Five on one core, two of them in one cover, and one on a core of its own. */
    async function seedKin() {
      const base = {
        brand: "Storm",
        coverstockCategory: "Pearl",
        coreType: "Symmetric",
        rg: 2.5,
        diff: 0.05,
        mbDiff: null,
        releaseYear: 2025,
        imageThumb: null,
        imageFull: null,
        productUrl: null,
        weights: [],
        colorways: []
      };
      const balls = [
        { id: "a", name: "Alpha", coreName: "Velocity Core", coverstockRaw: "R2S Pearl", releaseDate: "2025-05" },
        { id: "b", name: "Bravo", coreName: "Velocity", coverstockRaw: "R2S Pearl", releaseDate: "2025-04" },
        { id: "c", name: "Charlie", coreName: "Velocity", coverstockRaw: "TX-16 Solid", releaseDate: "2025-03" },
        { id: "d", name: "Delta", coreName: "Velocity", coverstockRaw: "TX-16 Solid", releaseDate: "2025-02" },
        { id: "e", name: "Echo", coreName: "Velocity", coverstockRaw: "Pearl Reactive", releaseDate: "2025-01" },
        { id: "f", name: "Foxtrot", coreName: "Gear", coverstockRaw: "Pearl Reactive", releaseDate: "2024-01" }
      ].map((b) => ({ ...base, ...b })) as unknown as CatalogBall[];
      await db.ball_catalog.bulkPut(balls);
    }

    it("names the brand among the specs, and offers the balls on its core and in its cover", async () => {
      await seedKin();
      const onSelectBall = vi.fn();
      render(<CatalogView onBack={vi.fn()} selectedBallId="a" onSelectBall={onSelectBall} />);

      const core = await screen.findByRole("region", { name: "Same core: Velocity Core" });
      expect(screen.getByText("Brand").nextSibling).toHaveTextContent("Storm");
      // Newest first, three to a row, and the rest under View all.
      expect(within(core).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
        "StormBravo",
        "StormCharlie",
        "StormDelta"
      ]);
      expect(within(core).getByRole("button", { name: "View all 5 balls" })).toBeInTheDocument();

      const cover = screen.getByRole("region", { name: "Same cover: R2S Pearl" });
      expect(within(cover).getAllByRole("listitem")).toHaveLength(1);
      // Everything it holds is shown, so there is nothing to view all of.
      expect(within(cover).queryByRole("button", { name: /View all/ })).not.toBeInTheDocument();

      fireEvent.click(within(cover).getByRole("button", { name: /Bravo/ }));
      expect(onSelectBall).toHaveBeenCalledWith("b");
    });

    it("starts no cover row for a cover that names only a kind", async () => {
      await seedKin();
      render(<CatalogView onBack={vi.fn()} selectedBallId="e" onSelectBall={vi.fn()} />);

      await screen.findByRole("region", { name: "Same core: Velocity" });
      expect(screen.queryByRole("region", { name: /Same cover/ })).not.toBeInTheDocument();
    });

    it("goes back to the list filtered to the core from View all", async () => {
      await seedKin();
      const onBack = vi.fn();
      const { rerender } = render(<CatalogView onBack={onBack} selectedBallId="a" onSelectBall={vi.fn()} />);

      const core = await screen.findByRole("region", { name: "Same core: Velocity Core" });
      fireEvent.click(within(core).getByRole("button", { name: "View all 5 balls" }));
      expect(onBack).toHaveBeenCalled();
      rerender(<CatalogView onBack={onBack} selectedBallId={null} onSelectBall={vi.fn()} />);

      // Every spelling of the core, and nothing else.
      await waitFor(() => expect(screen.getByRole("button", { name: /^Filters/ })).toHaveAttribute("aria-pressed", "true"));
      expect(screen.getAllByText("5 results")).toHaveLength(2);
      const names = screen.getAllByRole("listitem").map((li) => li.textContent ?? "");
      expect(names.filter((text) => /Alpha|Bravo|Charlie|Delta|Echo|Foxtrot/.test(text))).toHaveLength(5);
      expect(names.some((text) => text.includes("Foxtrot"))).toBe(false);
    });
  });
});
