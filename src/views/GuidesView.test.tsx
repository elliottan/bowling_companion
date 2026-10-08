import { render, screen, within } from "@testing-library/react";
import { fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GuidesView } from "./GuidesView";
import { GUIDES } from "../lib/guides";

describe("GuidesView", () => {
  it("lists every guide under its topic heading", () => {
    render(<GuidesView onBack={vi.fn()} openGuideId={null} onOpenGuide={vi.fn()} />);
    for (const guide of GUIDES) {
      expect(screen.getByRole("button", { name: new RegExp(guide.title, "i") })).toBeTruthy();
    }
    expect(screen.getByText("Layouts")).toBeTruthy();
  });

  it("asks for the guide the row names rather than opening it itself", () => {
    const onOpenGuide = vi.fn();
    render(<GuidesView onBack={vi.fn()} openGuideId={null} onOpenGuide={onOpenGuide} />);
    fireEvent.click(screen.getByRole("button", { name: /dual angle layouts/i }));
    expect(onOpenGuide).toHaveBeenCalledWith("dual-angle-layouts");
  });

  it("renders the article over the list, with its sources as links out", () => {
    render(<GuidesView onBack={vi.fn()} openGuideId="dual-angle-layouts" onOpenGuide={vi.fn()} />);
    const article = screen.getByRole("article");
    expect(within(article).getByText(/neither number sets it alone/i)).toBeTruthy();
    const source = within(article).getAllByRole("link")[0] as HTMLAnchorElement;
    expect(source.target).toBe("_blank");
    // The list is still mounted underneath, so back closes the article first.
    expect(screen.getByRole("dialog", { name: "Guides" })).toBeTruthy();
  });

  it("draws every figure the articles ask for, named by its caption", () => {
    // Renders each article in turn: a figure id with no drawing behind it
    // would throw here rather than leaving a blank box on the screen.
    for (const guide of GUIDES) {
      const figures = guide.body.filter((b) => b.kind === "figure");
      const { unmount } = render(
        <GuidesView onBack={vi.fn()} openGuideId={guide.id} onOpenGuide={vi.fn()} />
      );
      for (const block of figures) {
        if (block.kind !== "figure") continue;
        expect(screen.getByRole("img", { name: block.caption })).toBeTruthy();
      }
      unmount();
    }
  });

  it("shows the list for an id that is not in it, rather than an empty screen", () => {
    render(<GuidesView onBack={vi.fn()} openGuideId="no-such-guide" onOpenGuide={vi.fn()} />);
    expect(screen.queryByRole("article")).toBeNull();
    expect(screen.getByRole("button", { name: /dual angle layouts/i })).toBeTruthy();
  });

  describe("sharing a guide", () => {
    afterEach(() => {
      Reflect.deleteProperty(navigator, "share");
      Reflect.deleteProperty(navigator, "clipboard");
    });

    it("sends the guide's own link, which opens that guide inside the app", async () => {
      const share = vi.fn(() => Promise.resolve());
      Object.assign(navigator, { share });
      render(<GuidesView onBack={vi.fn()} openGuideId="picking-a-layout" onOpenGuide={vi.fn()} />);
      fireEvent.click(screen.getByRole("button", { name: "Share guide" }));
      await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
      const [data] = share.mock.calls[0] as unknown as [{ title: string; url: string }];
      expect(data.title).toBe("Picking a layout for your game");
      expect(data.url).toMatch(/\/guides\/picking-a-layout$/);
    });

    it("copies the link where there is no share sheet, and says it did", async () => {
      const written: string[] = [];
      Object.assign(navigator, {
        clipboard: { writeText: (t: string) => (written.push(t), Promise.resolve()) }
      });
      render(<GuidesView onBack={vi.fn()} openGuideId="dual-angle-layouts" onOpenGuide={vi.fn()} />);
      fireEvent.click(screen.getByRole("button", { name: "Share guide" }));
      await waitFor(() => expect(written).toHaveLength(1));
      expect(written[0]).toMatch(/\/guides\/dual-angle-layouts$/);
      expect(await screen.findByText("Link copied")).toBeTruthy();
    });

    it("takes a dismissed share sheet as an answer, not an error", async () => {
      const share = vi.fn(() => Promise.reject(new DOMException("cancelled", "AbortError")));
      Object.assign(navigator, { share });
      render(<GuidesView onBack={vi.fn()} openGuideId="picking-a-layout" onOpenGuide={vi.fn()} />);
      fireEvent.click(screen.getByRole("button", { name: "Share guide" }));
      await waitFor(() => expect(share).toHaveBeenCalled());
      expect(screen.queryByText("Link copied")).toBeNull();
    });
  });
});
