import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AppearanceView } from "./AppearanceView";
import { ProAccessContext } from "../lib/useProAccess";
import { ProOfferContext } from "../lib/proOffer";
import type { ProAccess } from "../lib/pro";

function renderView(access: ProAccess, openOffer = vi.fn()) {
  render(
    <ProAccessContext.Provider value={access}>
      <ProOfferContext.Provider value={openOffer}>
        <AppearanceView />
      </ProOfferContext.Provider>
    </ProAccessContext.Provider>
  );
  return openOffer;
}

describe("the color picker (ADR-164)", () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.palette;
  });

  it("applies and remembers a color while Pro is open", () => {
    renderView({ locked: false });
    fireEvent.click(screen.getByRole("button", { name: "Ocean" }));
    expect(document.documentElement.dataset.palette).toBe("ocean");
    expect(localStorage.getItem("palette")).toBe("ocean");
    expect(screen.getByRole("button", { name: "Ocean" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Felt" }));
    expect(document.documentElement.dataset.palette).toBeUndefined();
    expect(localStorage.getItem("palette")).toBeNull();
  });

  it("sends a locked color to the Pro page and changes nothing", () => {
    const openOffer = renderView({ locked: true, appStoreUrl: "https://apps.apple.com/app/id1" });
    expect(screen.getByText(/Pro adds four more/)).toBeInTheDocument();
    // Felt is everybody's and is the one on.
    expect(screen.getByRole("button", { name: "Felt" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Sunset, needs Headpin Pro" }));
    expect(openOffer).toHaveBeenCalledTimes(1);
    expect(document.documentElement.dataset.palette).toBeUndefined();
    expect(localStorage.getItem("palette")).toBeNull();
  });

  it("shows Felt as on while a stored Pro color is held back", () => {
    localStorage.setItem("palette", "rose");
    renderView({ locked: true, appStoreUrl: "https://apps.apple.com/app/id1" });
    expect(screen.getByRole("button", { name: "Felt" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Rose, needs Headpin Pro" })).toHaveAttribute("aria-pressed", "false");
  });
});
