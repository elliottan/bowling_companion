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

  it("puts each pattern's length in front of its name", async () => {
    render(<OilPatternManager />);
    expect(await screen.findByText("(35) Short one")).toBeInTheDocument();
    expect(screen.getByText("No length")).toBeInTheDocument();
  });

  it("filters by length", async () => {
    render(<OilPatternManager />);
    await screen.findByText("(45) Long one");
    fireEvent.click(screen.getByRole("button", { name: "Long" }));
    await waitFor(() => expect(screen.queryByText("(35) Short one")).toBeNull());
    expect(screen.getByText("(45) Long one")).toBeInTheDocument();
    expect(screen.queryByText("No length")).toBeNull();

    // A second tap clears it.
    fireEvent.click(screen.getByRole("button", { name: "Long" }));
    expect(await screen.findByText("(35) Short one")).toBeInTheDocument();
  });
});
