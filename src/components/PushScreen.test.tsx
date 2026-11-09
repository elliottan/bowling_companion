import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { overlayHandoff, PUSH_IN_MS } from "../lib/overlayHandoff";
import { getOpenSheets } from "../lib/sheetBackStack";
import { PushScreen } from "./PushScreen";

const panelOf = () => screen.getByRole("dialog", { name: "Spare lines" }).querySelector(".bg-surface-sunken") as HTMLElement;

describe("PushScreen taking a loading screen's place", () => {
  afterEach(() => {
    overlayHandoff.active = false;
    vi.restoreAllMocks();
  });

  it("slides in on its own when nothing stood in for it", () => {
    render(<PushScreen history="route" title="Spare lines" onBack={() => {}}>body</PushScreen>);
    expect(panelOf()).toHaveClass("animate-push-in");
    expect(panelOf().style.animationDelay).toBe("");
  });

  it("carries the loading screen's slide on from where it had got to", () => {
    vi.spyOn(performance, "now").mockReturnValue(1000);
    Object.assign(overlayHandoff, { active: true, since: 1000 - 40 });
    render(<PushScreen history="route" title="Spare lines" onBack={() => {}}>body</PushScreen>);
    // The first open used to arrive with no slide at all, standing where the
    // loading screen had barely begun to move.
    expect(panelOf()).toHaveClass("animate-push-in");
    expect(panelOf().style.animationDelay).toBe("-40ms");
  });

  it("does not slide again once the loading screen's slide has finished", () => {
    vi.spyOn(performance, "now").mockReturnValue(5000);
    Object.assign(overlayHandoff, { active: true, since: 5000 - PUSH_IN_MS - 100 });
    render(<PushScreen history="route" title="Spare lines" onBack={() => {}}>body</PushScreen>);
    expect(panelOf()).not.toHaveClass("animate-push-in");
  });
});

describe("PushScreen large title (ADR-226)", () => {
  const barTitle = () => document.querySelector("[data-bar-title]") as HTMLElement;
  const scroller = () => screen.getByRole("heading", { level: 1 }).closest(".overflow-y-auto") as HTMLElement;
  const rect = (bottom: number) => ({ bottom, top: bottom - 40, left: 0, right: 0, width: 0, height: 40, x: 0, y: 0, toJSON: () => ({}) });

  it("leads the page with the whole name as the one heading, and keeps the bar's copy hidden", () => {
    render(<PushScreen history="route" title="2019 PBA Johnny Petraglia Open" eyebrow="Kegel" onBack={() => {}}>body</PushScreen>);
    const heading = screen.getByRole("heading", { level: 1, name: "2019 PBA Johnny Petraglia Open" });
    expect(heading).not.toHaveClass("truncate");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    // Over the large title, and in the bar's hidden copy, so the brand comes
    // up with the name once it has scrolled under the bar.
    expect(screen.getAllByText("Kegel")).toHaveLength(2);
    expect(barTitle()).toHaveTextContent("Kegel");
    expect(barTitle()).toHaveAttribute("aria-hidden", "true");
    expect(barTitle()).toHaveClass("opacity-0");
  });

  it("brings the name into the bar once the large title has gone under it, and back out above it", () => {
    render(<PushScreen history="route" title="Oil patterns" onBack={() => {}}>body</PushScreen>);
    const block = document.querySelector("[data-title-name]") as HTMLElement;
    const header = document.querySelector("header") as HTMLElement;
    vi.spyOn(header, "getBoundingClientRect").mockReturnValue(rect(48) as DOMRect);
    const title = vi.spyOn(block, "getBoundingClientRect");

    title.mockReturnValue(rect(90) as DOMRect);
    fireEvent.scroll(scroller());
    expect(barTitle()).toHaveClass("opacity-0");

    title.mockReturnValue(rect(40) as DOMRect);
    fireEvent.scroll(scroller());
    expect(barTitle()).toHaveClass("opacity-100");

    title.mockReturnValue(rect(70) as DOMRect);
    fireEvent.scroll(scroller());
    expect(barTitle()).toHaveClass("opacity-0");
  });

  it("keeps the title in the bar, and only there, when the large title is off", () => {
    render(<PushScreen history="route" title="Layouts" largeTitle={false} onBack={() => {}}>body</PushScreen>);
    const heading = screen.getByRole("heading", { level: 1, name: "Layouts" });
    expect(heading).toHaveClass("truncate");
    expect(barTitle()).not.toHaveAttribute("aria-hidden");
    expect(barTitle()).not.toHaveClass("opacity-0");
  });

  it("has no large title when the screen draws its own bar", () => {
    render(<PushScreen history="route" title="Session" bar={<span>Bowl 300</span>} onBack={() => {}}>body</PushScreen>);
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
  });

  it("draws a screen's own heading as the large title, and tells its bar when that has gone under", () => {
    render(
      <PushScreen
        history="route"
        title="Ace Lanes"
        heading={<div><h1 data-title-name="">Ace Lanes and a long name</h1><p>League night</p></div>}
        bar={(compact) => <span data-testid="bar">{compact ? "compact" : "open"}</span>}
        onBack={() => {}}
      >
        body
      </PushScreen>
    );
    expect(screen.getByRole("heading", { level: 1, name: "Ace Lanes and a long name" })).toBeInTheDocument();
    expect(screen.getByTestId("bar")).toHaveTextContent("open");
    // The name has gone under the bar, the line under it has not: the bar
    // takes the name.
    const block = document.querySelector("[data-large-title]") as HTMLElement;
    const name = screen.getByRole("heading", { level: 1 });
    vi.spyOn(document.querySelector("header") as HTMLElement, "getBoundingClientRect").mockReturnValue(rect(48) as DOMRect);
    vi.spyOn(block, "getBoundingClientRect").mockReturnValue(rect(70) as DOMRect);
    vi.spyOn(name, "getBoundingClientRect").mockReturnValue(rect(40) as DOMRect);
    fireEvent.scroll(block.closest(".overflow-y-auto") as HTMLElement);
    expect(screen.getByTestId("bar")).toHaveTextContent("compact");
  });
});

describe("PushScreen history (ADR-271)", () => {
  it("leaves a route to history: it is not on the sheet back stack", () => {
    const { unmount } = render(<PushScreen history="route" title="Arsenal" onBack={() => {}}>body</PushScreen>);
    expect(getOpenSheets()).toHaveLength(0);
    unmount();
  });

  it("puts a layer on the sheet back stack, so back closes it and not the route under it", () => {
    const onBack = vi.fn();
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
    const { unmount } = render(<PushScreen history="layer" title="Catalog" onBack={onBack}>body</PushScreen>);
    expect(getOpenSheets()).toHaveLength(1);
    getOpenSheets()[0].close();
    expect(onBack).toHaveBeenCalledTimes(1);
    unmount();
    expect(getOpenSheets()).toHaveLength(0);
    vi.restoreAllMocks();
  });
});
