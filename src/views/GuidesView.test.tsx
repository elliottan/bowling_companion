import { render, screen, within } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
});
