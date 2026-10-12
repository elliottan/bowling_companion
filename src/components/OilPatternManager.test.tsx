import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { db } from "../db/bowlingDb";
import { addOilPattern } from "../services/ballRepository";
import { resetPatternCatalogCache } from "../services/patternCatalog";
import { OilPatternManager } from "./OilPatternManager";

describe("OilPatternManager", () => {
  beforeEach(async () => {
    await db.oil_patterns.clear();
    resetPatternCatalogCache();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    await addOilPattern("Short one", undefined, undefined, 35);
    await addOilPattern("Middle one", undefined, undefined, 40);
    await addOilPattern("Long one", undefined, undefined, 45);
    await addOilPattern("No length");
  });

  // The length leads the line under the name, coloured, rather than cluttering
  // the name itself, so the names line up.
  it("puts each pattern's length under its name, in the accent colour", async () => {
    render(<OilPatternManager />);
    expect(await screen.findByText("Short one")).toBeInTheDocument();
    expect(screen.getByText("35 ft")).toHaveClass("text-accent");
    expect(screen.queryByText(/\(35 ft\)/)).toBeNull();
    expect(screen.getByText("No length")).toBeInTheDocument();
  });

  it("filters by length range from the filter sheet", async () => {
    render(<OilPatternManager />);
    await screen.findByText("Long one");
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    const [min] = screen.getAllByRole("slider");
    fireEvent.change(min, { target: { value: "42" } });
    fireEvent.pointerUp(window);
    await waitFor(() => expect(screen.queryByText("Short one")).toBeNull());
    expect(screen.getByText("Long one")).toBeInTheDocument();
    expect(screen.queryByText("No length")).toBeNull();
    expect(screen.getByRole("button", { name: "Filters, 1 applied" })).toBeInTheDocument();
  });

  it("filters by several play styles at once", async () => {
    render(<OilPatternManager />);
    await screen.findByText("Long one");
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.click(screen.getByRole("button", { name: "Sport" }));
    fireEvent.click(screen.getByRole("button", { name: "Challenge" }));
    // None of these has a load table, so no play style matches any of them.
    await waitFor(() => expect(screen.queryByText("Short one")).toBeNull());
    expect(screen.getByRole("button", { name: "Filters, 1 applied" })).toBeInTheDocument();
  });
});
