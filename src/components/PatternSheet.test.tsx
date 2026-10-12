import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PatternSheet } from "./PatternSheet";
import { CHROMIUM_6742 } from "../lib/oilPattern.fixture";
import { resetPatternCatalogCache } from "../services/patternCatalog";

const chromium = { id: 1, name: "Chromium 6742", passes: CHROMIUM_6742 };

describe("PatternSheet", () => {
  it("leads with the numbers a sheet leads with", () => {
    render(<PatternSheet pattern={chromium} onClose={() => {}} />);
    // The Distance figure; the lane drawing labels its end line with it too.
    expect(screen.getByText("Distance").nextElementSibling).toHaveTextContent("42 ft");
    expect(screen.getByText("25.56 mL")).toBeInTheDocument();
    // Twice on screen, and legitimately: the headline ratio, and the outside
    // track zone that happens to carry the same figure.
    expect(screen.getAllByText("6.71:1").length).toBeGreaterThan(0);
    expect(screen.getByText("Challenge")).toBeInTheDocument();
    expect(screen.getByText("15.41 / 10.15 mL")).toBeInTheDocument();
  });

  // The drawing a sheet prints beside its tables: boards across, feet up, and
  // where the oil ends marked, so the distance reads off the picture.
  it("draws the lane up to where the oil ends, buffed stretch included", () => {
    const { container } = render(<PatternSheet pattern={chromium} onClose={() => {}} />);
    const lane = screen.getByRole("img", { name: "Oil on the lane, ending at 42 ft" });
    expect(lane.querySelectorAll('[data-role="oil-band"]').length).toBeGreaterThan(5);
    // Chromium's last forward passes load nothing and only buff to 42 ft.
    expect(lane.querySelectorAll('[data-role="buff-band"]').length).toBeGreaterThan(0);
    expect(container.querySelector('[data-role="oil-end"]')).not.toBeNull();
    expect(lane.textContent).toContain("42 ft");
  });

  // One drawing of the oil, not two: the per-board bar graph repeated what the
  // lane drawing already shows.
  it("draws the oil once, as the lane", () => {
    const { container } = render(<PatternSheet pattern={chromium} onClose={() => {}} />);
    expect(container.querySelectorAll('[data-role="board-bar"]')).toHaveLength(0);
    expect(screen.queryByText("Oil across the lane")).toBeNull();
  });

  // One row, as the sheet prints it: bare numbers, with the middle at 1.00.
  it("prints the track zone ratios in one row, the middle in the middle", () => {
    const { container } = render(<PatternSheet pattern={chromium} onClose={() => {}} />);
    const cells = [...container.querySelectorAll("ul.grid-cols-7 > li")].map((li) => li.textContent);
    expect(cells).toHaveLength(7);
    expect(cells[0]).toBe("3L-7L6.71");
    expect(cells[3]).toBe("18L-18R1.00");
    expect(cells.every((cell) => !cell?.includes(":1"))).toBe(true);
  });

  it("lists every pass, in the sheet's own board notation", () => {
    render(<PatternSheet pattern={chromium} onClose={() => {}} />);
    expect(screen.getByText(/Forward passes/i)).toBeInTheDocument();
    expect(screen.getByText(/Reverse passes/i)).toBeInTheDocument();
    expect(screen.getAllByText("2L to 2R").length).toBeGreaterThan(0);
  });

  // A pattern of the bowler's own has no table, and the sheet says so rather
  // than drawing an empty graph.
  it("says there is nothing to show for a pattern with no load table", () => {
    render(<PatternSheet pattern={{ id: 2, name: "Thursday", distance: 40 }} onClose={() => {}} />);
    expect(screen.getByText(/40 ft\. This pattern has no load table/i)).toBeInTheDocument();
    expect(screen.queryByText(/Forward passes/i)).toBeNull();
  });

  it("goes back", async () => {
    const onClose = vi.fn();
    render(<PatternSheet pattern={chromium} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  // The visualizer is the push's one trailing action, not a button in the body.
  it("puts the line visualizer in the nav bar", () => {
    const onOpen = vi.fn();
    render(<PatternSheet pattern={chromium} onClose={() => {}} onOpenInLineVisualizer={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: /line visualizer/i }));
    expect(onOpen).toHaveBeenCalled();
  });

  it("keeps the original sheet reachable", () => {
    render(<PatternSheet pattern={{ ...chromium, url: "https://example.com/c.pdf" }} onClose={() => {}} />);
    expect(screen.getByRole("link", { name: /original pattern sheet/i })).toHaveAttribute(
      "href", "https://example.com/c.pdf");
  });

  describe("our copy of the sheet (ADR-136)", () => {
    const serveCatalog = (sheet?: string, sheetPages?: string[]) => {
      resetPatternCatalogCache();
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          version: 1,
          generated_at: "",
          patterns: [{ id: "chromium-6742", name: "Chromium 6742", sheet, sheetPages, passes: [] }],
        }),
      }));
    };
    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
      resetPatternCatalogCache();
    });

    it("opens the kept sheet in the app, not the publisher's site", async () => {
      serveCatalog("sheets/chromium-6742.0123456789ab.pdf", ["sheets/chromium-6742.0123456789ab.p1.webp"]);
      render(
        <PatternSheet
          pattern={{ ...chromium, catalog_id: "chromium-6742", url: "https://www.lvsb.at/c.pdf" }}
          onClose={() => {}}
        />
      );
      fireEvent.click(await screen.findByRole("button", { name: /original pattern sheet/i }));
      expect(await screen.findByAltText("Chromium 6742, page 1 of 1")).toHaveAttribute(
        "src", "/catalog/sheets/chromium-6742.0123456789ab.p1.webp");
      expect(screen.queryByRole("link", { name: /lvsb|original source/i })).toBeNull();

      const open = vi.spyOn(window, "open").mockReturnValue(null);
      fireEvent.click(screen.getByRole("button", { name: "Open the PDF" }));
      expect(open).toHaveBeenCalledWith("/catalog/sheets/chromium-6742.0123456789ab.pdf", "_blank", "noopener,noreferrer");
    });

    // iOS pulls nested fixed layers apart when the PAGE is pinch-zoomed, which
    // showed the pattern screen beside the sheet. So the viewer zooms itself,
    // by tap or pinch, and the page's own zoom is cancelled inside it.
    describe("zooming the sheet", () => {
      async function openViewer() {
        serveCatalog("sheets/c.0123456789ab.pdf", ["sheets/c.0123456789ab.p1.webp"]);
        render(<PatternSheet pattern={{ ...chromium, catalog_id: "chromium-6742" }} onClose={() => {}} />);
        fireEvent.click(await screen.findByRole("button", { name: /original pattern sheet/i }));
        const viewer = await waitFor(() => {
          const el = document.querySelector<HTMLElement>('[data-role="sheet-viewer"]');
          expect(el).not.toBeNull();
          return el!;
        });
        return { viewer, pages: viewer.firstElementChild as HTMLElement };
      }
      const touch = (x: number) => ({ clientX: x, clientY: 100 });

      it("zooms in on a tap and back out on the next", async () => {
        const { pages } = await openViewer();
        fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
        expect(pages.style.width).toBe("250%");
        fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
        expect(pages.style.width).toBe("");
      });

      it("follows a pinch, and keeps it from zooming the page", async () => {
        const { viewer, pages } = await openViewer();
        fireEvent.touchStart(viewer, { touches: [touch(100), touch(200)] });
        const spread = fireEvent.touchMove(viewer, { touches: [touch(50), touch(350)] });
        expect(spread).toBe(false); // default prevented: the page did not zoom
        expect(pages.style.width).toBe("300%");
        fireEvent.touchMove(viewer, { touches: [touch(0), touch(2000)] });
        expect(pages.style.width).toBe("500%"); // capped
        fireEvent.touchEnd(viewer, { touches: [] });
      });

      it("cancels Safari's own pinch gesture inside the viewer", async () => {
        const { viewer } = await openViewer();
        const gesture = new Event("gesturestart", { cancelable: true });
        viewer.dispatchEvent(gesture);
        expect(gesture.defaultPrevented).toBe(true);
      });
    });

    // A link the bowler typed themselves is theirs, and still opens.
    it("links the bowler's own sheet when the catalog kept no copy", async () => {
      serveCatalog(undefined);
      render(
        <PatternSheet
          pattern={{ ...chromium, catalog_id: "chromium-6742", url: "https://example.com/c.pdf" }}
          onClose={() => {}}
        />
      );
      await waitFor(() => expect(fetch).toHaveBeenCalled());
      expect(screen.getByRole("link", { name: /original pattern sheet/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /original pattern sheet/i })).toBeNull();
    });
  });
});
