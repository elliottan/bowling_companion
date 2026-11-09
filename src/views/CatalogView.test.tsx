import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CatalogView } from "./CatalogView";
import { formatReleaseDate } from "../lib/dates";
import { db } from "../db/bowlingDb";
import type { CatalogBall } from "../types/catalog";
import { clearViewMemory } from "../lib/viewMemory";
import { setDefaultBallWeight } from "../services/bowlingRepository";

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

/** The balls in the compare tray at the foot (ADR-266). */
function trayBalls() {
  return within(screen.getAllByRole("list", { name: "In compare" })[0]).getAllByRole("button", { name: /^Remove / });
}

/** Opens ball `id`'s page and adds it to the comparison from its bar, as the
 *  only way in is (ADR-268). The picks outlive the view, so a rerender keeps
 *  them. Returns the page. */
async function addFromPage(rerender: (ui: React.ReactElement) => void, id: string, name: string) {
  rerender(<CatalogView onBack={vi.fn()} selectedBallId={id} onSelectBall={vi.fn()} />);
  const page = await screen.findByRole("dialog", { name });
  fireEvent.click(within(page).getByRole("button", { name: "Add to compare" }));
  return page;
}

function renderCatalog() {
  render(<CatalogView onBack={vi.fn()} selectedBallId={null} onSelectBall={vi.fn()} />);
}

describe("CatalogView", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    // The picks to compare outlive the view, by design; not one test.
    clearViewMemory();
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

    expect(screen.getAllByText(/^3 results ·/)).toHaveLength(2); // under the title, and the bar's copy
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
    expect(screen.getAllByText(/^3 results ·/)).toHaveLength(2); // under the title, and the bar's copy
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

  it("adds balls to compare from their own pages only, and opens them side by side (ADR-258, ADR-268)", async () => {
    await seedCatalog(5);
    const { rerender } = render(<CatalogView onBack={vi.fn()} selectedBallId={null} onSelectBall={vi.fn()} />);
    await screen.findByText("Ball 0");
    // No picking in the list any more.
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(screen.queryByRole("button", { name: "Compare balls" })).toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });

    await addFromPage(rerender, "ball-1", "Ball 1");
    await addFromPage(rerender, "ball-3", "Ball 3");
    rerender(<CatalogView onBack={vi.fn()} selectedBallId={null} onSelectBall={vi.fn()} />);
    await waitFor(() => expect(trayBalls()).toHaveLength(2));

    fireEvent.click(screen.getByRole("button", { name: "Compare" }));
    const compare = await screen.findByRole("dialog", { name: "Compare" });
    expect(within(compare).getByRole("button", { name: "Remove Ball 1, 15 lb" })).toBeInTheDocument();
    expect(within(compare).getByRole("button", { name: "Remove Ball 3, 15 lb" })).toBeInTheDocument();
  });

  it("adds at the default weight, then asks which weight for the same ball, and moves each on its own (ADR-262, ADR-268)", async () => {
    await seedCatalog(2);
    await db.ball_catalog.update("ball-1", { weights: [14, 13].map((weight) => ({ weight, rg: 2.5, diff: 0.05, mbDiff: null })) });
    await setDefaultBallWeight(14);
    const { rerender } = render(<CatalogView onBack={vi.fn()} selectedBallId={null} onSelectBall={vi.fn()} />);
    // The rows say which weight their numbers are for.
    expect(await screen.findAllByText(/Specs at 14 lb/)).not.toHaveLength(0);

    // First in, at the default weight with no question.
    const page = await addFromPage(rerender, "ball-1", "Ball 1");
    await waitFor(() => expect(trayBalls()).toHaveLength(1));
    // Already in: the same button asks which weight, of those not in yet.
    fireEvent.click(within(page).getByRole("button", { name: "Add to compare" }));
    expect(screen.queryByRole("button", { name: "Add at 14 lb" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add at 15 lb" }));
    await waitFor(() => expect(trayBalls()).toHaveLength(2));

    fireEvent.click(within(page).getByRole("button", { name: "Compare" }));
    const compare = await screen.findByRole("dialog", { name: "Compare" });
    // No one weight for all: a menu in each column.
    expect(within(compare).queryByRole("combobox", { name: "Ball weight" })).toBeNull();
    const menus = within(compare).getAllByRole("combobox", { name: "Weight of Ball 1" });
    expect(menus.map((m) => (m as HTMLSelectElement).value)).toEqual(["14", "15"]);
    // A column cannot take a weight the same ball holds in another.
    expect([...(menus[0] as HTMLSelectElement).options].map((o) => o.value)).not.toContain("15");
    fireEvent.change(menus[0], { target: { value: "13" } });
    expect(within(compare).getByRole("button", { name: "Remove Ball 1, 13 lb" })).toBeInTheDocument();
    expect(within(compare).getByRole("button", { name: "Remove Ball 1, 15 lb" })).toBeInTheDocument();
  });

  it("holds a ball the bowler owns at the weight they own it in (ADR-262)", async () => {
    await seedCatalog(2);
    await db.balls.add({ name: "Mine", is_spare_ball: false, catalog_ref_id: "ball-0", weight: 13 });
    const { rerender } = render(<CatalogView onBack={vi.fn()} selectedBallId={null} onSelectBall={vi.fn()} />);
    await screen.findByText("Ball 0");
    await addFromPage(rerender, "ball-0", "Ball 0");
    const page = await addFromPage(rerender, "ball-1", "Ball 1");
    await waitFor(() => expect(trayBalls()).toHaveLength(2));
    fireEvent.click(within(page).getByRole("button", { name: "Compare" }));
    const compare = await screen.findByRole("dialog", { name: "Compare" });
    // Theirs, at 13 lb and no menu; the catalog's ball has one.
    expect(within(compare).queryByRole("combobox", { name: "Weight of Ball 0" })).toBeNull();
    expect(within(compare).getByRole("button", { name: "Remove Ball 0, 13 lb" })).toBeInTheDocument();
    expect(within(compare).getByRole("combobox", { name: "Weight of Ball 1" })).toBeInTheDocument();
  });

  it("pushes the list over the comparison from Add a ball, multi-select on, and back comes back to it (ADR-270)", async () => {
    await seedCatalog(3);
    const onBack = vi.fn();
    const { rerender } = render(<CatalogView onBack={onBack} selectedBallId={null} onSelectBall={vi.fn()} />);
    await screen.findByText("Ball 0");
    await addFromPage(rerender, "ball-1", "Ball 1");
    const onSelectBall = vi.fn();
    rerender(<CatalogView onBack={onBack} selectedBallId={null} onSelectBall={onSelectBall} />);
    fireEvent.click(await screen.findByRole("button", { name: "Compare" }));
    const compare = await screen.findByRole("dialog", { name: "Compare" });

    fireEvent.click(within(compare).getByRole("button", { name: "Add a ball" }));
    const dialogs = await screen.findAllByRole("dialog");
    const picker = dialogs[dialogs.length - 1];
    // Over the comparison, which stays under it.
    expect(picker).toHaveAccessibleName("Catalog");
    expect(screen.getByRole("dialog", { name: "Compare", hidden: true })).toBeInTheDocument();
    // Multi-select is on: Ball 1 is in, Ball 2 goes in from its toggle.
    expect(within(picker).getByRole("button", { name: "Select to compare" })).toHaveAttribute("aria-pressed", "true");
    expect(within(picker).getByRole("button", { name: "Compare Ball 1" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(picker).getByRole("button", { name: "Compare Ball 2" }));
    await waitFor(() => expect(within(picker).getByRole("button", { name: "Compare Ball 2" })).toHaveAttribute("aria-pressed", "true"));
    // A tap on the row still opens the ball.
    fireEvent.click(within(picker).getByRole("button", { name: /^Storm.*Ball 0/ }));
    expect(onSelectBall).toHaveBeenCalledWith("ball-0");

    // Back from it is the comparison, with the new ball in, and not out of
    // the catalog.
    fireEvent.click(within(picker).getByRole("button", { name: "Back" }));
    await waitFor(() => expect(screen.getAllByRole("dialog").map((d) => d.getAttribute("aria-label"))).toEqual(["Catalog", "Compare"]));
    expect(onBack).not.toHaveBeenCalled();
    expect(within(screen.getByRole("dialog", { name: "Compare" })).getByRole("combobox", { name: "Weight of Ball 2" })).toBeInTheDocument();
  });

  it("turns multi-select on and off from the bar's graph button, a toggle at each row's end (ADR-270)", async () => {
    await seedCatalog(2);
    const onSelectBall = vi.fn();
    render(<CatalogView onBack={vi.fn()} selectedBallId={null} onSelectBall={onSelectBall} />);
    await screen.findByText("Ball 0");
    const toggle = screen.getByRole("button", { name: "Select to compare" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("button", { name: "Compare Ball 0" })).toBeNull();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    const pick = screen.getByRole("button", { name: "Compare Ball 0" });
    expect(pick).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(pick);
    await waitFor(() => expect(trayBalls()).toHaveLength(1));
    expect(screen.getByRole("button", { name: "Compare Ball 0" })).toHaveAttribute("aria-pressed", "true");
    expect(onSelectBall).not.toHaveBeenCalled();
    // Again takes it out.
    fireEvent.click(screen.getByRole("button", { name: "Compare Ball 0" }));
    await waitFor(() => expect(screen.queryAllByRole("list", { name: "In compare" })).toHaveLength(0));

    fireEvent.click(toggle);
    expect(screen.queryByRole("button", { name: "Compare Ball 0" })).toBeNull();
  });

  it("shows the bowler's copies of a ball over its specs, one at a time, and still offers another (ADR-263)", async () => {
    await seedCatalog(2);
    await db.ball_catalog.update("ball-1", { weights: [{ weight: 14, rg: 2.53, diff: 0.046, mbDiff: null }] });
    await db.balls.bulkAdd([
      { name: "Comp ball", is_spare_ball: false, catalog_ref_id: "ball-1", weight: 15 },
      { name: "Spare night", is_spare_ball: false, catalog_ref_id: "ball-1", weight: 14 },
      { name: "Old one", is_spare_ball: false, catalog_ref_id: "ball-1", weight: 16, retired: true }
    ]);
    render(<CatalogView onBack={vi.fn()} selectedBallId="ball-1" onSelectBall={vi.fn()} />);
    const mine = await screen.findByRole("region", { name: "In your arsenal" });
    // Its own weight's numbers; a retired copy is out of the bag.
    expect(within(mine).getByText("Comp ball")).toBeInTheDocument();
    expect(within(mine).getByText("14 lb · RG 2.53 · Diff 0.046")).toBeInTheDocument();
    expect(within(mine).queryByText("Old one")).toBeNull();
    expect(within(mine).getByRole("button", { name: "Spare night, 14 lb" })).toBeInTheDocument();
    // Over the specs, and owning it never stops another.
    expect(mine.compareDocumentPosition(screen.getByText("Coverstock")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText("Already in your arsenal")).toBeNull();
    expect(screen.getByRole("button", { name: "Add another to arsenal" })).toBeEnabled();
  });

  it("adds to the arsenal through the arsenal's own form, linked to the ball, at the default weight (ADR-265)", async () => {
    await seedCatalog(2);
    await setDefaultBallWeight(14);
    render(<CatalogView onBack={vi.fn()} selectedBallId="ball-1" onSelectBall={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add to arsenal" }));

    const form = await screen.findByRole("dialog", { name: "Add ball to arsenal" });
    expect(within(form).getByLabelText("Display name")).toHaveValue("Storm Ball 1");
    await waitFor(() => expect(within(form).getByLabelText(/Weight/)).toHaveValue("14"));
    expect(within(form).getByText("Linked to catalog")).toBeInTheDocument();
    // No sentence explaining the specs.
    expect(screen.queryByText(/The specs come across with it/)).toBeNull();

    fireEvent.click(within(form).getByRole("button", { name: "Add" }));
    await waitFor(async () => expect(await db.balls.toArray()).toHaveLength(1));
    const [saved] = await db.balls.toArray();
    expect(saved).toMatchObject({ name: "Storm Ball 1", weight: 14, catalog_ref_id: "ball-1" });
  });

  it("keeps the tray over a ball's page with each ball's weight, tints compared rows, and takes one out from its X (ADR-266, ADR-269)", async () => {
    await seedCatalog(3);
    const { rerender } = render(<CatalogView onBack={vi.fn()} selectedBallId={null} onSelectBall={vi.fn()} />);
    await screen.findByText("Ball 0");
    const page = await addFromPage(rerender, "ball-1", "Ball 1");
    // Over the ball's page, each ball with its weight on a badge.
    const tray = within(page).getByRole("list", { name: "In compare" });
    expect(within(tray).getByRole("button", { name: "Ball 1, 15 lb" })).toHaveTextContent("15");
    expect(within(tray).getByRole("button", { name: "Remove Ball 1, 15 lb" })).toBeInTheDocument();
    // No count and no Clear.
    expect(screen.queryByText(/of 8/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();

    rerender(<CatalogView onBack={vi.fn()} selectedBallId={null} onSelectBall={vi.fn()} />);
    // Tinted in the list.
    expect((await screen.findByRole("button", { name: /^Storm.*Ball 1/ })).className).toContain("bg-accent-soft");
    // Its X takes it out at once, with no question (ADR-269).
    fireEvent.click(trayBalls()[0]);
    expect(screen.queryByRole("button", { name: "Remove from compare" })).toBeNull();
    await waitFor(() => expect(screen.queryAllByRole("list", { name: "In compare" })).toHaveLength(0));
  });

  it("puts Add to arsenal and Add to compare in a ball page's bar, compare right-most, with no buttons on the page (ADR-268)", async () => {
    await seedCatalog(2);
    render(<CatalogView onBack={vi.fn()} selectedBallId="ball-1" onSelectBall={vi.fn()} />);
    const page = await screen.findByRole("dialog", { name: "Ball 1" });
    const arsenal = within(page).getByRole("button", { name: "Add to arsenal" });
    const compare = within(page).getByRole("button", { name: "Add to compare" });
    expect(arsenal.compareDocumentPosition(compare) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Up in the bar, over the specs, not a row of big buttons under them.
    expect(compare.compareDocumentPosition(within(page).getByText("Coverstock")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(page).queryByText(/In compare:/)).toBeNull();
  });

  it("opens one of the bowler's copies in the arsenal from a ball's page (ADR-270)", async () => {
    await seedCatalog(2);
    const id = await db.balls.add({ name: "Comp ball", is_spare_ball: false, catalog_ref_id: "ball-1", weight: 15 });
    const onOpenArsenalBall = vi.fn();
    render(<CatalogView onBack={vi.fn()} selectedBallId="ball-1" onSelectBall={vi.fn()} onOpenArsenalBall={onOpenArsenalBall} />);
    const mine = await screen.findByRole("region", { name: "In your arsenal" });
    fireEvent.click(await within(mine).findByRole("button", { name: "Open Comp ball, 15 lb, in your arsenal" }));
    expect(onOpenArsenalBall).toHaveBeenCalledWith(id);
  });

  it("puts Add to arsenal in the bar as a bag (ADR-270)", async () => {
    await seedCatalog(2);
    render(<CatalogView onBack={vi.fn()} selectedBallId="ball-1" onSelectBall={vi.fn()} />);
    const page = await screen.findByRole("dialog", { name: "Ball 1" });
    const arsenal = within(page).getByRole("button", { name: "Add to arsenal" });
    // The bag's body, not the ball's circle.
    expect(arsenal.querySelector("rect")).not.toBeNull();
    expect(arsenal.querySelector("circle")).toBeNull();
  });

  it("asks for a ball from the bar's menu (ADR-261)", async () => {
    await seedCatalog(2);
    shop.opened.length = 0;
    renderCatalog();
    await screen.findByText("Ball 0");
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    // The list's own row at its foot asks too; the menu's is the last drawn.
    const asks = screen.getAllByRole("button", { name: "Request a ball" });
    fireEvent.click(asks[asks.length - 1]);
    expect(shop.opened).toHaveLength(1);
    expect(shop.opened[0]).toMatch(/^mailto:/);
    expect(screen.queryByRole("button", { name: "Compare balls" })).toBeNull();
  });

  it("opens straight on the graph from the arsenal, and a ball's card there opens its page over it (ADR-261)", async () => {
    await seedCatalog(3);
    await db.balls.add({ name: "Ball 2", brand: "Storm", catalog_ref_id: "ball-2", weight: 14 } as never);
    const onSelectBall = vi.fn();
    const onBack = vi.fn();
    const { rerender } = render(<CatalogView onBack={onBack} selectedBallId={null} onSelectBall={onSelectBall} openGraph />);
    const compare = await screen.findByRole("dialog", { name: "Compare" });
    // The graph is the screen: no list under it.
    expect(screen.queryByPlaceholderText("Search name, brand, coverstock…")).toBeNull();
    const key = await within(compare).findByRole("button", { name: /^Ball 2/ });
    expect(key).toHaveTextContent("Owned");
    // At the weight it is owned in (ADR-262).
    expect(key).toHaveTextContent("14 lb");
    fireEvent.click(key);
    const card = screen.getByRole("dialog", { name: "Ball 2" });
    fireEvent.click(within(card).getByRole("button", { name: "Open Ball 2" }));
    expect(onSelectBall).toHaveBeenCalledWith("ball-2");

    rerender(<CatalogView onBack={onBack} selectedBallId="ball-2" onSelectBall={onSelectBall} openGraph />);
    // The ball goes over the graph, which stays under it for back.
    const dialogs = await screen.findAllByRole("dialog");
    expect(dialogs[dialogs.length - 1]).toHaveAccessibleName("Ball 2");
    expect(screen.getByRole("dialog", { name: "Compare", hidden: true })).toBeInTheDocument();
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

    it("pushes the core's balls over the ball from View all, so back returns to it (ADR-264)", async () => {
      await seedKin();
      const onSelectBall = vi.fn();
      const onBack = vi.fn();
      const { rerender } = render(<CatalogView onBack={onBack} selectedBallId="a" onSelectBall={onSelectBall} />);

      const core = await screen.findByRole("region", { name: "Same core: Velocity Core" });
      fireEvent.click(within(core).getByRole("button", { name: "View all 5 balls" }));
      // A page on the catalog's stack, not back out to its list.
      expect(onBack).not.toHaveBeenCalled();
      expect(onSelectBall).toHaveBeenCalledWith("~core:Velocity Core");

      rerender(<CatalogView onBack={onBack} selectedBallId="~core:Velocity Core" ballTrail={["a"]} onSelectBall={onSelectBall} />);
      const pages = await screen.findAllByRole("dialog", { hidden: true });
      const list = pages[pages.length - 1];
      expect(list).toHaveAccessibleName("Velocity Core");
      // Every spelling of the core, and nothing else.
      const names = within(list).getAllByRole("listitem").map((li) => li.textContent ?? "");
      expect(names).toHaveLength(5);
      expect(names.some((text) => text.includes("Foxtrot"))).toBe(false);
      // The ball it came from stays drawn under it, for back.
      expect(screen.getByRole("dialog", { name: "Alpha", hidden: true })).toBeInTheDocument();

      // A row opens its ball over the list in turn.
      fireEvent.click(within(list).getByRole("button", { name: /Bravo/ }));
      expect(onSelectBall).toHaveBeenLastCalledWith("b");
    });

    it("keeps the ball it was opened from drawn beneath (ADR-257)", async () => {
      await seedKin();
      render(<CatalogView onBack={vi.fn()} selectedBallId="b" ballTrail={["a"]} onSelectBall={vi.fn()} />);

      await screen.findByRole("region", { name: "Same core: Velocity" });
      // Both pages are there, the one beneath first, so it is what the drag
      // back uncovers.
      const pages = screen.getAllByRole("dialog");
      expect(pages.map((p) => p.getAttribute("aria-label"))).toEqual(["Catalog", "Alpha", "Bravo"]);
    });

    it("puts View all on the heading's line, and pushes over every ball rather than leaving them (ADR-264)", async () => {
      await seedKin();
      const onBack = vi.fn();
      const onSelectBall = vi.fn();
      render(<CatalogView onBack={onBack} selectedBallId="b" ballTrail={["a"]} onSelectBall={onSelectBall} />);

      const core = await screen.findByRole("region", { name: "Same core: Velocity" });
      const viewAll = within(core).getByRole("button", { name: "View all 5 balls" });
      // Beside the heading, before the row of balls.
      expect(viewAll.compareDocumentPosition(within(core).getByRole("list")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      fireEvent.click(viewAll);
      expect(onSelectBall).toHaveBeenCalledWith("~core:Velocity");
      expect(onBack).not.toHaveBeenCalled();
    });
  });
});
