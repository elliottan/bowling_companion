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

    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    // A sheet from the bottom edge, as every other filter sheet in the app is,
    // not a card dropped down over the list.
    const sheet = screen.getByRole("dialog", { name: "Filters" });
    fireEvent.click(within(sheet).getByRole("button", { name: "Storm" }));
    // Applied at once: the chip under the search says so while the sheet is up.
    expect(screen.getByRole("button", { name: "Remove filter: Storm" })).toBeInTheDocument();

    fireEvent.click(within(sheet).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Filters" })).not.toBeInTheDocument());
    // What was chosen stays, as a chip that can be removed.
    expect(screen.getByRole("button", { name: "Remove filter: Storm" })).toBeInTheDocument();
  });
});
