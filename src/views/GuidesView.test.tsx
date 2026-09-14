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
    // The shelf is still mounted underneath: back peels the article off first.
    expect(screen.getByRole("dialog", { name: "Guides" })).toBeTruthy();
  });

  it("shows the shelf for an id that is not on it, rather than an empty screen", () => {
    render(<GuidesView onBack={vi.fn()} openGuideId="no-such-guide" onOpenGuide={vi.fn()} />);
    expect(screen.queryByRole("article")).toBeNull();
    expect(screen.getByRole("button", { name: /dual angle layouts/i })).toBeTruthy();
  });
});
