import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProOfferView } from "./ProOfferView";
import { ProAccessContext, ProStoreContext } from "../lib/useProAccess";
import type { ProAccess, ProStore } from "../lib/pro";

const opened = vi.hoisted(() => ({ urls: [] as string[] }));
vi.mock("../lib/pro", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/pro")>();
  return { ...actual, openAppStore: (url: string) => opened.urls.push(url) };
});

function renderOffer(access: ProAccess, store: ProStore | null = null) {
  render(
    <ProAccessContext.Provider value={access}>
      <ProStoreContext.Provider value={store}>
        <ProOfferView onBack={vi.fn()} />
      </ProStoreContext.Provider>
    </ProAccessContext.Provider>
  );
}

const base: ProStore = { owned: false, price: "$9.99", buy: async () => "cancelled", restore: async () => false };

describe("the Pro page (ADR-164)", () => {
  it("says what Pro adds and what stays free before any button that charges", () => {
    renderOffer({ locked: true, appStoreUrl: "https://apps.apple.com/app/id1" });
    for (const title of [
      "Charts for every stat",
      "First ball breakdown",
      "Your leaves",
      "Ball by ball",
      "Move your line",
      "Edit layouts",
      "More colors"
    ]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
    expect(screen.getByText(/You pay once and keep it/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What stays free" })).toBeInTheDocument();
  });

  it("sends the web to the App Store after the steps for moving games", async () => {
    opened.urls.length = 0;
    renderOffer({ locked: true, appStoreUrl: "https://apps.apple.com/app/id1" });
    expect(screen.getByText("Pro is bought in the iPhone app.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Get the app" }));
    fireEvent.click(screen.getByRole("button", { name: "Open the App Store" }));
    await waitFor(() => expect(opened.urls).toEqual(["https://apps.apple.com/app/id1"]));
  });

  it("buys at the App Store's price from its own button, and only there", async () => {
    const buy = vi.fn(async () => "purchased" as const);
    const store = { ...base, buy };
    renderOffer({ locked: true, store }, store);
    expect(buy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Get Headpin Pro, $9.99" }));
    await waitFor(() => expect(buy).toHaveBeenCalledTimes(1));
  });

  it("restores a purchase, and says when there is none", async () => {
    const restore = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const store = { ...base, restore };
    renderOffer({ locked: true, store }, store);
    fireEvent.click(screen.getByRole("button", { name: "Restore purchase" }));
    expect(await screen.findByText("This Apple ID has not bought Headpin Pro.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Restore purchase" }));
    expect(await screen.findByText("Headpin Pro is restored.")).toBeInTheDocument();
  });

  it("says when the App Store did not answer a restore", async () => {
    const store = {
      ...base,
      restore: async () => {
        throw new Error("offline");
      }
    };
    renderOffer({ locked: true, store }, store);
    fireEvent.click(screen.getByRole("button", { name: "Restore purchase" }));
    expect(await screen.findByText(/did not answer: offline/)).toBeInTheDocument();
  });

  it("thanks an owner instead of offering the purchase", () => {
    renderOffer({ locked: false, owned: true });
    expect(screen.getByText(/You have Headpin Pro/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Get Headpin Pro|Get the app/ })).not.toBeInTheDocument();
  });
});
