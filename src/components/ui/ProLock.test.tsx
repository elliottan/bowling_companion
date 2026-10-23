import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ProBanner, ProBlur, ProLock, ProVeil } from "./ProLock";
import { ProAccessContext } from "../../lib/useProAccess";
import { ProOfferContext } from "../../lib/proOffer";
import type { ProAccess, ProStore } from "../../lib/pro";
import { waitFor } from "@testing-library/react";

const store = vi.hoisted(() => ({ opened: [] as string[] }));
vi.mock("../../lib/pro", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/pro")>();
  return { ...actual, openAppStore: (url: string) => store.opened.push(url) };
});

const LOCKED = { locked: true as const, appStoreUrl: "https://apps.apple.com/app/id1" };

function renderLock(access: ProAccess, pro?: boolean) {
  render(
    <ProAccessContext.Provider value={access}>
      <ProLock what="How each ball strikes" pro={pro}>
        <button type="button">Open Wolverine</button>
      </ProLock>
    </ProAccessContext.Provider>
  );
}

describe("ProLock", () => {
  it("is the card itself while Pro is open", () => {
    renderLock({ locked: false });
    expect(screen.getByRole("button", { name: "Open Wolverine" })).toBeInTheDocument();
    expect(document.querySelector("[data-pro-mark]")).toBeNull();
  });

  it("is the card itself when the content is free right now", () => {
    renderLock(LOCKED, false);
    expect(screen.getByRole("button", { name: "Open Wolverine" })).toBeInTheDocument();
    expect(document.querySelector("[data-pro-mark]")).toBeNull();
  });

  it("keeps the card's first lines in view under one tap nobody can reach into", () => {
    renderLock(LOCKED);
    // What is under it is still drawn, for the bowler to see there is something.
    const preview = screen.getByText("Open Wolverine").parentElement!;
    expect(preview).toHaveAttribute("inert");
    expect(preview).toHaveAttribute("aria-hidden", "true");
    // It fades out, lightly blurred so it reads as locked, and shows only a
    // few lines (ADR-173).
    expect(preview.className).toContain("blur-");
    expect(preview.style.maxHeight).toBe("9rem");
    expect(preview.style.maskImage || preview.style.webkitMaskImage).toContain("linear-gradient");
    // Out of the accessibility tree and the tab order.
    expect(screen.queryByRole("button", { name: "Open Wolverine" })).not.toBeInTheDocument();
    // The one tap is named for what the card shows and what it does.
    expect(screen.getByRole("button", { name: "How each ball strikes. Get the app" })).toBeInTheDocument();
    // The lock alone, without the word (ADR-173).
    expect(document.querySelector("[data-pro-mark]")).not.toBeNull();
    expect(screen.queryByText("Pro")).not.toBeInTheDocument();
  });

  it("shows the steps for moving games over before it opens the App Store", async () => {
    store.opened.length = 0;
    renderLock(LOCKED);
    fireEvent.click(screen.getByRole("button", { name: /Get the app/ }));

    expect(screen.getByRole("dialog", { name: "Bowled with Headpin on the web?" })).toBeInTheDocument();
    expect(screen.getByText(/open Settings, then Backup & restore, and export/)).toBeInTheDocument();
    expect(store.opened).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "Open the App Store" }));
    await waitFor(() => expect(store.opened).toEqual(["https://apps.apple.com/app/id1"]));
  });

  it("stays on the page when the bowler is not ready to switch", async () => {
    store.opened.length = 0;
    renderLock(LOCKED);
    fireEvent.click(screen.getByRole("button", { name: /Get the app/ }));
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(store.opened).toEqual([]);
  });
});

describe("ProBanner", () => {
  it("says nothing while Pro is open", () => {
    const { container } = render(
      <ProAccessContext.Provider value={{ locked: false }}>
        <ProBanner what="Charts for every stat" />
      </ProAccessContext.Provider>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("says once what Pro adds, with the one way to get it", async () => {
    store.opened.length = 0;
    render(
      <ProAccessContext.Provider value={LOCKED}>
        <ProBanner what="Charts for every stat" />
      </ProAccessContext.Provider>
    );
    expect(screen.getByText("Charts for every stat")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Get the app" }));
    fireEvent.click(screen.getByRole("button", { name: "Open the App Store" }));
    await waitFor(() => expect(store.opened).toEqual(["https://apps.apple.com/app/id1"]));
  });
});

describe("ProBlur", () => {
  it("is the row itself while Pro is open", () => {
    render(
      <ProAccessContext.Provider value={{ locked: false }}>
        <ProBlur what="Every ball">
          <button type="button">Open Wolverine</button>
        </ProBlur>
      </ProAccessContext.Provider>
    );
    expect(screen.getByRole("button", { name: "Open Wolverine" })).toBeInTheDocument();
    expect(document.querySelector("[data-pro-mark]")).toBeNull();
  });

  it("blurs the row out of reach under the mark, and the row is the way to Pro", () => {
    render(
      <ProAccessContext.Provider value={LOCKED}>
        <ProBlur what="Every ball">
          <button type="button">Open Wolverine</button>
        </ProBlur>
      </ProAccessContext.Provider>
    );
    const preview = screen.getByText("Open Wolverine").parentElement!;
    expect(preview).toHaveAttribute("inert");
    expect(preview).toHaveAttribute("aria-hidden", "true");
    expect(preview.className).toContain("blur-");
    expect(screen.queryByRole("button", { name: "Open Wolverine" })).not.toBeInTheDocument();
    // The lock alone, without the word (ADR-173).
    expect(document.querySelector("[data-pro-mark]")).not.toBeNull();
    expect(screen.queryByText("Pro")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Every ball. Get the app" }));
    expect(screen.getByRole("dialog", { name: "Bowled with Headpin on the web?" })).toBeInTheDocument();
  });
});

describe("ProVeil", () => {
  it("is the controls themselves while Pro is open", () => {
    render(
      <ProAccessContext.Provider value={{ locked: false }}>
        <ProVeil what="Changing the layout" label="Edit with Pro">
          <input aria-label="Drilling angle" />
        </ProVeil>
      </ProAccessContext.Provider>
    );
    expect(screen.getByRole("textbox", { name: "Drilling angle" })).toBeInTheDocument();
    expect(screen.queryByText("Edit with Pro")).not.toBeInTheDocument();
  });

  it("keeps the controls in place, blurred and out of reach, under one tap", () => {
    render(
      <ProAccessContext.Provider value={LOCKED}>
        <ProVeil what="Changing the layout" label="Edit with Pro">
          <input aria-label="Drilling angle" />
        </ProVeil>
      </ProAccessContext.Provider>
    );
    expect(screen.queryByRole("textbox", { name: "Drilling angle" })).not.toBeInTheDocument();
    expect(screen.getByText("Edit with Pro")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Changing the layout. Get the app" }));
    expect(screen.getByRole("dialog", { name: "Bowled with Headpin on the web?" })).toBeInTheDocument();
  });

  it("draws the controls as they are when clear, with the lock alone (ADR-203)", () => {
    const { container } = render(
      <ProAccessContext.Provider value={LOCKED}>
        <ProVeil clear what="Changing the layout">
          <input aria-label="Drilling angle" />
        </ProVeil>
      </ProAccessContext.Provider>
    );
    expect(container.querySelector(".blur-\\[1px\\]")).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Drilling angle" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Changing the layout. Get the app" })).toBeInTheDocument();
  });
});

describe("Pro in the iOS app", () => {
  function storeWith(buy: ProStore["buy"]): ProStore {
    return { owned: false, buy, restore: async () => false };
  }

  it("offers the purchase without a price", async () => {
    const buy = vi.fn(async () => "purchased" as const);
    renderLock({ locked: true, store: storeWith(buy) });
    fireEvent.click(screen.getByRole("button", { name: "How each ball strikes. Get Headpin Pro" }));
    await waitFor(() => expect(buy).toHaveBeenCalledTimes(1));
  });

  it("says when a purchase is waiting on approval", async () => {
    renderLock({ locked: true, store: storeWith(async () => "pending") });
    fireEvent.click(screen.getByRole("button", { name: /Get Headpin Pro/ }));
    expect(await screen.findByRole("status")).toHaveTextContent("Waiting for approval");
  });

  it("says when the App Store did not answer, and lets the bowler try again", async () => {
    renderLock({
      locked: true,
      store: storeWith(async () => {
        throw new Error("offline");
      })
    });
    fireEvent.click(screen.getByRole("button", { name: /Get Headpin Pro/ }));
    expect(await screen.findByRole("status")).toHaveTextContent("did not answer");
    expect(screen.getByRole("button", { name: /Get Headpin Pro/ })).toBeEnabled();
  });

  it("puts the purchase in the banner as a button", () => {
    render(
      <ProAccessContext.Provider value={{ locked: true, store: storeWith(async () => "cancelled") }}>
        <ProBanner what="Charts for every stat" />
      </ProAccessContext.Provider>
    );
    expect(screen.getByRole("button", { name: "Get Headpin Pro" })).toBeInTheDocument();
  });
});

describe("with the Pro page available (ADR-164)", () => {
  it("opens the page from a teaser, a banner, a blurred row and blurred controls, and charges nothing there", () => {
    const openOffer = vi.fn();
    const buy = vi.fn(async () => "purchased" as const);
    const access = { locked: true as const, store: { owned: false, buy, restore: async () => false } };
    render(
      <ProAccessContext.Provider value={access}>
        <ProOfferContext.Provider value={openOffer}>
          <ProLock what="How each ball strikes">
            <p>Wolverine</p>
          </ProLock>
          <ProBanner what="Charts for every stat" />
          <ProBlur what="Every ball">
            <p>Phaze</p>
          </ProBlur>
          <ProVeil what="Moving the line" label="Move it with Pro">
            <p>Laydown</p>
          </ProVeil>
        </ProOfferContext.Provider>
      </ProAccessContext.Provider>
    );
    fireEvent.click(screen.getByRole("button", { name: "How each ball strikes. Get Headpin Pro" }));
    fireEvent.click(screen.getByRole("button", { name: "Get Headpin Pro" }));
    fireEvent.click(screen.getByRole("button", { name: "Every ball. Get Headpin Pro" }));
    fireEvent.click(screen.getByRole("button", { name: "Moving the line. Get Headpin Pro" }));
    expect(openOffer).toHaveBeenCalledTimes(4);
    expect(buy).not.toHaveBeenCalled();
  });
});

describe("where there is no app to send anyone to yet (ADR-166)", () => {
  it("shows the teaser and its mark, and the tap does nothing on its own", () => {
    render(
      <ProAccessContext.Provider value={{ locked: true, appStoreUrl: null }}>
        <ProLock what="How each ball strikes">
          <p>Wolverine</p>
        </ProLock>
      </ProAccessContext.Provider>
    );
    expect(screen.getByRole("button", { name: "How each ball strikes. Coming to the App Store" })).toBeDisabled();
  });

  it("still opens the Pro page to read when the app has one", () => {
    const openOffer = vi.fn();
    render(
      <ProAccessContext.Provider value={{ locked: true, appStoreUrl: null }}>
        <ProOfferContext.Provider value={openOffer}>
          <ProLock what="How each ball strikes">
            <p>Wolverine</p>
          </ProLock>
        </ProOfferContext.Provider>
      </ProAccessContext.Provider>
    );
    fireEvent.click(screen.getByRole("button", { name: "How each ball strikes. See Headpin Pro" }));
    expect(openOffer).toHaveBeenCalledTimes(1);
  });
});
