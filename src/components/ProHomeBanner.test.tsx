import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ProHomeBanner } from "./ProHomeBanner";
import { ProAccessContext } from "../lib/useProAccess";
import { ProOfferContext } from "../lib/proOffer";
import type { ProAccess } from "../lib/pro";

function renderBanner(access: ProAccess, openOffer = vi.fn()) {
  const { container } = render(
    <ProAccessContext.Provider value={access}>
      <ProOfferContext.Provider value={openOffer}>
        <ProHomeBanner />
      </ProOfferContext.Provider>
    </ProAccessContext.Provider>
  );
  return { container, openOffer };
}

describe("the Home banner (ADR-164)", () => {
  it("is one tap to the Pro page, and locks nothing", () => {
    const { openOffer } = renderBanner({ locked: true, appStoreUrl: "https://apps.apple.com/app/id1" });
    expect(screen.getByText(/Charts, leave stats/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Headpin Pro. See what it adds" }));
    expect(openOffer).toHaveBeenCalledTimes(1);
  });

  it("is not there once Pro is open", () => {
    expect(renderBanner({ locked: false }).container).toBeEmptyDOMElement();
    expect(renderBanner({ locked: false, owned: true }).container).toBeEmptyDOMElement();
  });
});
