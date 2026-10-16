import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { db } from "../db/bowlingDb";
import { addOilPattern } from "../services/ballRepository";
import { resetPatternCatalogCache } from "../services/patternCatalog";
import { OilPatternManager } from "./OilPatternManager";

const mail = vi.hoisted(() => ({ opened: [] as string[] }));
vi.mock("../lib/links", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/links")>();
  return {
    ...actual,
    openMail: (url: string) => {
      mail.opened.push(url);
    }
  };
});

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

  it("makes each row one target that opens the pattern, with no pencil beside it", async () => {
    render(<OilPatternManager />);
    expect(await screen.findByRole("button", { name: "Short one details" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Edit / })).not.toBeInTheDocument();
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

  describe("asking for a pattern that is not there", () => {
    beforeEach(() => {
      mail.opened.length = 0;
    });

    function typeSearch(text: string) {
      fireEvent.change(screen.getByRole("searchbox", { name: "Search patterns" }), { target: { value: text } });
    }

    it("offers a request, carrying the search, and keeps adding by hand", async () => {
      render(<OilPatternManager />);
      await screen.findByText("Long one");

      typeSearch("Cheetah");

      expect(await screen.findByText('Nothing matches "Cheetah"')).toBeInTheDocument();
      // It is not the "no patterns yet" state: there are patterns.
      expect(screen.queryByText("No oil patterns yet")).toBeNull();
      expect(screen.getByRole("button", { name: "Add it yourself" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /Request this pattern/ }));
      expect(decodeURIComponent(mail.opened[0]!)).toContain("Pattern request: Cheetah");
    });

    it("clears the filters instead of asking, when only filters emptied the list", async () => {
      render(<OilPatternManager />);
      await screen.findByText("Long one");
      fireEvent.click(screen.getByRole("button", { name: "Filters" }));
      fireEvent.click(screen.getByRole("button", { name: "Sport" }));
      await waitFor(() => expect(screen.queryByText("Long one")).toBeNull());

      expect(await screen.findByText("No patterns match these filters")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Request this pattern/ })).toBeNull();
    });

    it("keeps a quiet request row at the end of the list", async () => {
      render(<OilPatternManager />);
      await screen.findByText("Long one");

      fireEvent.click(screen.getByRole("button", { name: "Request a pattern" }));

      expect(decodeURIComponent(mail.opened[0]!)).toContain("subject=Pattern request");
    });
  });
});
