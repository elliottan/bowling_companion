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
  it("lays the balls side by side, and marks the lowest RG and the highest diff", () => {
    render(<BallCompareView compared={[ignition, widow]} catalog={[ignition, widow]} owned={[]} onRemove={vi.fn()} onBack={vi.fn()} />);

    const rg = screen.getByRole("row", { name: /^RG/ });
    expect(within(rg).getByText("2.47").className).toContain("bg-accent-soft");
    expect(within(rg).getByText("2.50").className).not.toContain("bg-accent-soft");
    const diff = screen.getByRole("row", { name: /^Diff/ });
    expect(within(diff).getByText("0.058").className).toContain("bg-accent-soft");
  });

  it("reads each ball at the weight picked, and says when one has no numbers for it", () => {
    render(<BallCompareView compared={[ignition, widow]} catalog={[ignition, widow]} owned={[]} onRemove={vi.fn()} onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "14 lb" }));
    const rg = screen.getByRole("row", { name: /^RG/ });
    expect(within(rg).getByText("2.52")).toBeInTheDocument();
    // Widow lists no 14 lb specs: its 15 lb numbers stand in, starred.
    expect(within(rg).getByText(/2\.50/).textContent).toBe("2.50*");
    expect(screen.getByText(/No specs listed at 14 lb/)).toBeInTheDocument();
  });

  it("takes a ball out from its column", () => {
    const onRemove = vi.fn();
    render(<BallCompareView compared={[ignition, widow]} catalog={[ignition, widow]} owned={[]} onRemove={onRemove} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Widow" }));
    expect(onRemove).toHaveBeenCalledWith("Widow");
  });

  it("says which ball in the bag a new one rolls like, and maps both with a key", () => {
    const twin = ball("Twin", { rg: 2.49, diff: 0.057, mbDiff: 0.016 });
    render(<BallCompareView compared={[twin]} catalog={[twin, widow]} owned={[widow]} onRemove={vi.fn()} onBack={vi.fn()} />);

    expect(screen.getByText("Twin rolls much like Widow in your bag.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Map" }));
    expect(screen.getByRole("img", { name: "Balls by RG and differential" })).toBeInTheDocument();
    // The key comes first; the note under it is a list too.
    const key = screen.getAllByRole("list")[0];
    expect(within(key).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["1Twin · comparing", "2Widow · in your bag"]);
  });
});
