import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CatalogView } from "./CatalogView";
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
async function seedCatalog(count: number) {
  const balls: CatalogBall[] = Array.from({ length: count }, (_, i) => ({
    id: `ball-${i}`,
    brand: "Storm",
    name: `Ball ${i}`,
    coverstockCategory: "Reactive",
    coreType: "Symmetric",
    rg: 2.5,
    diff: 0.05,
    mbDiff: null,
    releaseYear: 2026,
    imageThumb: null,
    imageFull: null,
    productUrl: null,
    weights: [],
    colorways: []
  })) as unknown as CatalogBall[];
  await db.ball_catalog.bulkPut(balls);
}

/** Off unless a test turns it on, the same as the shipped default. */
const shop = vi.hoisted(() => ({ deepLink: null as string | null }));
vi.mock("../lib/links", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/links")>();
  return {
    ...actual,
    shopBallUrl: (brand: string, name: string) => actual.shopBallUrl(brand, name, shop.deepLink)
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

  describe("the shop link on a ball", () => {
    afterEach(() => {
      shop.deepLink = null;
    });

    function renderBall() {
      render(<CatalogView onBack={vi.fn()} selectedBallId="ball-0" onSelectBall={vi.fn()} />);
    }

    it("is absent while there is no affiliate link to credit it", async () => {
      await seedCatalog(1);

      renderBall();

      expect(await screen.findByRole("button", { name: "Add to arsenal" })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /Shop at/ })).not.toBeInTheDocument();
      expect(screen.queryByText(/commission/)).not.toBeInTheDocument();
    });

    it("searches the retailer for the ball, and says it earns a commission", async () => {
      shop.deepLink = "https://network.example/r?u={url}";
      await seedCatalog(1);

      renderBall();

      const link = await screen.findByRole("link", { name: "Shop at BowlersMart" });
      expect(new URL(link.getAttribute("href")!).searchParams.get("u")).toBe(
        "https://www.bowlersmart.com/?s=Storm%20Ball%200&post_type=product"
      );
      expect(link).toHaveAttribute("target", "_blank");
      // A paid link is marked as one for search engines, not only for people.
      expect(link.getAttribute("rel")).toMatch(/\bsponsored\b/);
      expect(link.getAttribute("rel")).toMatch(/\bnoopener\b/);
      expect(screen.getByText(/Headpin earns a small commission/)).toBeInTheDocument();
    });
  });

  it("opens the filters as a layer under the Filters button, and puts them away on a tap outside", async () => {
    await seedCatalog(3);
    renderCatalog();
    await screen.findByText("Ball 0");

    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    const panel = screen.getByRole("dialog", { name: "Filter the catalog" });
    // A layer over the list, not a block in front of it: it is positioned out
    // of the flow, so choosing a filter cannot push the balls down the screen.
    expect(panel).toHaveClass("absolute");
    fireEvent.click(within(panel).getByRole("button", { name: "Storm" }));
    expect(screen.getByRole("dialog", { name: "Filter the catalog" })).toBeInTheDocument();

    // The scrim is the only thing behind the panel that is not the page.
    const scrim = panel.parentElement!.querySelector('[aria-hidden="true"]')!;
    fireEvent.pointerDown(scrim);
    expect(screen.queryByRole("dialog", { name: "Filter the catalog" })).not.toBeInTheDocument();
    // What was chosen stays, as a chip that can be removed.
    expect(screen.getByRole("button", { name: "Remove filter: Storm" })).toBeInTheDocument();
  });
});
