import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CatalogBall } from "../types/catalog";
import { BallCompareView } from "./BallCompareView";

function ball(id: string, over: Partial<CatalogBall> = {}): CatalogBall {
  return {
    id,
    brand: "Storm",
    name: id,
    releaseDate: "2025-03",
    releaseYear: 2025,
    coverstockRaw: "R2S Solid Reactive",
    coverstockCategory: "Solid",
    factoryFinish: "Power Edge",
    coreName: "Velocity",
    coreType: "Symmetric",
    rg: 2.5,
    diff: 0.05,
    mbDiff: null,
    imageThumb: null,
    imageFull: null,
    sourceUrl: "",
    ...over
  };
}

const ignition = ball("Ignition", { rg: 2.47, diff: 0.055, mbDiff: 0.018, coreType: "Asymmetric", weights: [{ weight: 14, rg: 2.52, diff: 0.054, mbDiff: 0.016 }] });
const widow = ball("Widow", { brand: "Hammer", rg: 2.5, diff: 0.058, mbDiff: 0.016, coreType: "Asymmetric" });
const at = (b: CatalogBall, weight = 15) => ({ ball: b, weight });

describe("BallCompareView (ADR-258, ADR-262)", () => {
  it("lays the balls side by side, marking none (ADR-261)", () => {
    render(<BallCompareView compared={[at(ignition), at(widow)]} owned={[]} onRemove={vi.fn()} onBack={vi.fn()} />);

    const rg = screen.getByRole("row", { name: /^RG/ });
    expect(within(rg).getByText("2.47").className).not.toContain("bg-accent-soft");
    expect(screen.queryByText(/^Marked/)).toBeNull();
  });

  it("reads each ball at its own weight, and says when one has no numbers for it", () => {
    render(<BallCompareView compared={[at(ignition, 14), at(widow, 14)]} owned={[]} onRemove={vi.fn()} onWeightChange={vi.fn()} onBack={vi.fn()} />);

    // No one weight for every ball.
    expect(screen.queryByRole("combobox", { name: "Ball weight" })).toBeNull();
    const rg = screen.getByRole("row", { name: /^RG/ });
    expect(within(rg).getByText("2.52")).toBeInTheDocument();
    // Widow lists no 14 lb specs: its 15 lb numbers stand in, starred.
    expect(within(rg).getByText(/2\.50/).textContent).toBe("2.50*");
    expect(screen.getByText(/No specs listed at that weight/)).toBeInTheDocument();
  });

  it("moves one ball's weight from its column, but not one the bowler owns at it", () => {
    const onWeightChange = vi.fn();
    render(<BallCompareView compared={[at(ignition), at(widow)]} owned={[at(widow)]} onRemove={vi.fn()} onWeightChange={onWeightChange} onBack={vi.fn()} />);

    fireEvent.change(screen.getByRole("combobox", { name: "Weight of Ignition" }), { target: { value: "14" } });
    expect(onWeightChange).toHaveBeenCalledWith("Ignition@15", 14);
    expect(screen.queryByRole("combobox", { name: "Weight of Widow" })).toBeNull();
  });

  it("takes a ball out from its column", () => {
    const onRemove = vi.fn();
    render(<BallCompareView compared={[at(ignition), at(widow)]} owned={[]} onRemove={onRemove} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Widow, 15 lb" }));
    // It asks first (ADR-266).
    expect(onRemove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Remove from compare" }));
    expect(onRemove).toHaveBeenCalledWith("Widow@15");
  });

  it("opens a ball's page from its column, and scrolls sideways under the row names (ADR-266)", () => {
    const onOpenBall = vi.fn();
    render(<BallCompareView compared={[at(ignition), at(widow)]} owned={[]} onRemove={vi.fn()} onOpenBall={onOpenBall} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Widow" }));
    expect(onOpenBall).toHaveBeenCalledWith("Widow");
    expect(screen.getByRole("rowheader", { name: "RG" }).className).toContain("sticky");
  });

  it("offers Add a ball only while a column is free", () => {
    const onAddBall = vi.fn();
    const { rerender } = render(<BallCompareView compared={[at(ignition)]} owned={[]} onRemove={vi.fn()} onAddBall={onAddBall} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Add a ball" }));
    expect(onAddBall).toHaveBeenCalled();

    const full = [16, 15, 14, 13].flatMap((w) => [at(ignition, w), at(widow, w)]);
    rerender(<BallCompareView compared={full} owned={[]} onRemove={vi.fn()} onAddBall={onAddBall} onBack={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Add a ball" })).toBeNull();
  });

  it("graphs the compared and the bag, each at its own weight, with a key that tags them and a card that opens a ball (ADR-261)", () => {
    const twin = ball("Twin", { rg: 2.49, diff: 0.057, mbDiff: 0.016 });
    const onOpenBall = vi.fn();
    render(<BallCompareView compared={[at(twin), at(widow)]} owned={[at(widow), at(ignition, 14)]} onRemove={vi.fn()} onBack={vi.fn()} onOpenBall={onOpenBall} initialTab="graph" />);

    expect(screen.queryByText(/rolls much like/)).toBeNull();
    const chart = screen.getByRole("img", { name: "Balls by RG and differential" });
    // Only the compared and the bag: no catalog behind, no cover legend.
    expect(chart.querySelectorAll("[data-ball]")).toHaveLength(3);
    expect(screen.queryByText("Pearl")).toBeNull();

    // Each with its weight; the bag's at the weight it is owned in.
    const key = screen.getByRole("list");
    expect(within(key).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["1Twin15 lbSelected", "2Widow15 lbSelectedOwned", "3Ignition14 lbOwned"]);

    fireEvent.click(within(chart).getByRole("button", { name: "Hammer Widow, 15 lb" }));
    const card = screen.getByRole("dialog", { name: "Widow" });
    expect(card).toHaveTextContent("RG 2.50");
    fireEvent.click(within(card).getByRole("button", { name: "Open Widow" }));
    expect(onOpenBall).toHaveBeenCalledWith("Widow");
    expect(screen.queryByRole("dialog", { name: "Widow" })).toBeNull();

    // Ignition reads its 14 lb numbers: the bag does not follow any menu.
    fireEvent.click(within(chart).getByRole("button", { name: "Storm Ignition, 14 lb" }));
    expect(screen.getByRole("dialog", { name: "Ignition" })).toHaveTextContent("RG 2.52");
  });

  it("switches the bag's balls on the graph one by one from their photos, and all at once from Your bag (ADR-263)", () => {
    const onRemove = vi.fn();
    render(<BallCompareView compared={[at(widow)]} owned={[at(ignition, 14), at(ignition)]} onRemove={onRemove} onBack={vi.fn()} initialTab="graph" />);
    const chart = screen.getByRole("img", { name: "Balls by RG and differential" });
    const bag = screen.getByRole("button", { name: "Your bag, 2 balls" });
    // Over the key it switches, under the chart.
    expect(chart.compareDocumentPosition(bag) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(bag).toHaveAttribute("aria-pressed", "true");

    // One off: still in the key, to switch back on, and the switch says some.
    const one = screen.getByRole("button", { name: "Show Ignition, 14 lb on the graph" });
    fireEvent.click(one);
    expect(one).toHaveAttribute("aria-pressed", "false");
    expect(chart.querySelectorAll("[data-ball]")).toHaveLength(2);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    const some = screen.getByRole("button", { name: "Your bag, 1 of 2" });
    expect(some).toHaveAttribute("aria-pressed", "mixed");

    // Some on, the switch puts them all on; all on, it takes them all off.
    fireEvent.click(some);
    expect(chart.querySelectorAll("[data-ball]")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Your bag, 2 balls" }));
    expect(chart.querySelectorAll("[data-ball]")).toHaveLength(1);

    // A compared ball is always drawn; switched off, it asks, then leaves.
    fireEvent.click(screen.getByRole("button", { name: "Remove Widow, 15 lb" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove from compare" }));
    expect(onRemove).toHaveBeenCalledWith("Widow@15");
  });

  it("names the axes alone, and says what each means on a tap (ADR-263)", () => {
    render(<BallCompareView compared={[at(widow)]} owned={[]} onRemove={vi.fn()} onBack={vi.fn()} initialTab="graph" />);
    expect(screen.queryByText("RG: lower revs up sooner")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "RG: lower revs up sooner" }));
    expect(screen.getByRole("dialog", { name: "RG: lower revs up sooner" })).toHaveTextContent("RG: lower revs up sooner");
  });
});
