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

describe("BallCompareView (ADR-258)", () => {
  it("lays the balls side by side, marking none (ADR-261)", () => {
    render(<BallCompareView compared={[ignition, widow]} owned={[]} onRemove={vi.fn()} onBack={vi.fn()} />);

    const rg = screen.getByRole("row", { name: /^RG/ });
    expect(within(rg).getByText("2.47").className).not.toContain("bg-accent-soft");
    expect(screen.queryByText(/^Marked/)).toBeNull();
  });

  it("reads each ball at the weight picked, and says when one has no numbers for it", () => {
    render(<BallCompareView compared={[ignition, widow]} owned={[]} onRemove={vi.fn()} onBack={vi.fn()} />);

    // The weight is a menu (ADR-261).
    fireEvent.change(screen.getByRole("combobox", { name: "Ball weight" }), { target: { value: "14" } });
    const rg = screen.getByRole("row", { name: /^RG/ });
    expect(within(rg).getByText("2.52")).toBeInTheDocument();
    // Widow lists no 14 lb specs: its 15 lb numbers stand in, starred.
    expect(within(rg).getByText(/2\.50/).textContent).toBe("2.50*");
    expect(screen.getByText(/No specs listed at 14 lb/)).toBeInTheDocument();
  });

  it("takes a ball out from its column", () => {
    const onRemove = vi.fn();
    render(<BallCompareView compared={[ignition, widow]} owned={[]} onRemove={onRemove} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Widow" }));
    expect(onRemove).toHaveBeenCalledWith("Widow");
  });

  it("maps the compared and the bag with a key that tags them, and a card that opens a ball (ADR-261)", () => {
    const twin = ball("Twin", { rg: 2.49, diff: 0.057, mbDiff: 0.016 });
    const onOpenBall = vi.fn();
    render(<BallCompareView compared={[twin, widow]} owned={[widow, ignition]} onRemove={vi.fn()} onBack={vi.fn()} onOpenBall={onOpenBall} initialTab="map" />);

    expect(screen.queryByText(/rolls much like/)).toBeNull();
    const chart = screen.getByRole("img", { name: "Balls by RG and differential" });
    // Only the compared and the bag: no catalog behind, no cover legend.
    expect(chart.querySelectorAll("[data-ball]")).toHaveLength(3);
    expect(screen.queryByText("Pearl")).toBeNull();
    // The bag's switch sits over the chart.
    const bag = screen.getByRole("button", { name: "Your bag, 2 balls" });
    expect(bag.compareDocumentPosition(chart) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const key = screen.getByRole("list");
    expect(within(key).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["1TwinSelected", "2WidowSelectedOwned", "3IgnitionOwned"]);

    fireEvent.click(within(chart).getByRole("button", { name: "Hammer Widow" }));
    const card = screen.getByRole("dialog", { name: "Widow" });
    expect(card).toHaveTextContent("RG 2.50");
    fireEvent.click(within(card).getByRole("button", { name: "Open Widow" }));
    expect(onOpenBall).toHaveBeenCalledWith("Widow");
    expect(screen.queryByRole("dialog", { name: "Widow" })).toBeNull();

    // Hiding the bag leaves the compared alone.
    fireEvent.click(bag);
    expect(chart.querySelectorAll("[data-ball]")).toHaveLength(2);
  });
});
