import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { ActiveGameScorer } from "./ActiveGameScorer";
import { ProAccessContext } from "../lib/useProAccess";
import { ProOfferContext } from "../lib/proOffer";
import type { ProAccess } from "../lib/pro";
import type { LaneVisualizerLazy } from "./LaneVisualizerLazy";

vi.mock("../services/ballRepository", () => ({
  getBalls: () => Promise.resolve([]),
  getSpareLinesAll: () => Promise.resolve([]),
  findSpareLineByPins: () => undefined,
  getSpareLineByPins: () => Promise.resolve(undefined)
}));

// The lane itself is tested on its own; here only what the scorer hands it.
vi.mock("./LaneVisualizerLazy", () => ({
  LaneVisualizerLazy: (props: ComponentProps<typeof LaneVisualizerLazy>) => (
    <div role="dialog" aria-label={`${props.title} visualizer`} data-editable={String(props.onChange != null)}>
      {props.notice}
    </div>
  )
}));

if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}

function renderScorer(access: ProAccess, openOffer = vi.fn()) {
  render(
    <ProAccessContext.Provider value={access}>
      <ProOfferContext.Provider value={openOffer}>
        <ActiveGameScorer />
      </ProOfferContext.Provider>
    </ProAccessContext.Provider>
  );
  return openOffer;
}

describe("the lane view from score entry and Pro (ADR-165)", () => {
  it("draws the line but cannot move it without Pro, and offers Pro from the lane", async () => {
    const openOffer = renderScorer({ locked: true, appStoreUrl: "https://apps.apple.com/app/id1" });
    fireEvent.click(await screen.findByRole("button", { name: "View intended line" }));
    const lane = screen.getByRole("dialog", { name: "Intended line visualizer" });
    expect(lane).toHaveAttribute("data-editable", "false");

    fireEvent.click(screen.getByRole("button", { name: /Moving the line is in Headpin Pro/ }));
    // The lane is closed so the Pro page is not hidden behind it.
    expect(screen.queryByRole("dialog", { name: "Intended line visualizer" })).not.toBeInTheDocument();
    expect(openOffer).toHaveBeenCalledTimes(1);
  });

  it("does the same for the actual line", async () => {
    renderScorer({ locked: true, appStoreUrl: "https://apps.apple.com/app/id1" });
    fireEvent.click(await screen.findByRole("button", { name: "View actual line" }));
    expect(screen.getByRole("dialog", { name: "Actual line visualizer" })).toHaveAttribute("data-editable", "false");
  });

  it("lets the line be moved with Pro", async () => {
    renderScorer({ locked: false });
    fireEvent.click(await screen.findByRole("button", { name: "View intended line" }));
    expect(screen.getByRole("dialog", { name: "Intended line visualizer" })).toHaveAttribute("data-editable", "true");
    expect(screen.queryByRole("button", { name: /Moving the line is in Headpin Pro/ })).not.toBeInTheDocument();
  });

  it("keeps typing the boards free", async () => {
    renderScorer({ locked: true, appStoreUrl: "https://apps.apple.com/app/id1" });
    const stance = (await screen.findByLabelText("Stance")) as HTMLInputElement;
    fireEvent.change(stance, { target: { value: "20" } });
    expect(stance.value).toBe("20");
  });
});
