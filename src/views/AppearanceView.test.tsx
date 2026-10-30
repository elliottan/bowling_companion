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

describe("the language picker (ADR-225)", () => {
  beforeEach(() => localStorage.clear());

  function renderPicker(reload = vi.fn()) {
    render(
      <ProAccessContext.Provider value={{ locked: true, appStoreUrl: null }}>
        <ProOfferContext.Provider value={vi.fn()}>
          <AppearanceView reload={reload} />
        </ProOfferContext.Provider>
      </ProAccessContext.Provider>
    );
    return reload;
  }

  it("follows the phone until a language is picked, and names each in its own language", () => {
    renderPicker();
    expect(screen.getByRole("button", { name: /Automatic/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "日本語" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("日本語")).toHaveAttribute("lang", "ja");
    expect(screen.getByText("Español")).toBeInTheDocument();
  });

  it("remembers a pick and starts the app again in it", () => {
    const reload = renderPicker();
    fireEvent.click(screen.getByRole("button", { name: "한국어" }));
    expect(localStorage.getItem("language")).toBe("ko");
    expect(reload).toHaveBeenCalledOnce();
  });

  it("goes back to the phone's language, and does nothing for the language already on", () => {
    localStorage.setItem("language", "es");
    const reload = renderPicker();
    fireEvent.click(screen.getByRole("button", { name: "Español" }));
    expect(reload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Automatic/ }));
    expect(localStorage.getItem("language")).toBeNull();
    expect(reload).toHaveBeenCalledOnce();
  });
});
