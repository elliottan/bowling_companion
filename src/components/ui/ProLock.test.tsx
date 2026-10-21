import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ProBanner, ProChip, ProLock, ProNote } from "./ProLock";
import { ProAccessContext } from "../../lib/useProAccess";
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
    expect(screen.queryByText("Pro")).not.toBeInTheDocument();
  });

  it("is the card itself when the content is free right now", () => {
    renderLock(LOCKED, false);
    expect(screen.getByRole("button", { name: "Open Wolverine" })).toBeInTheDocument();
    expect(screen.queryByText("Pro")).not.toBeInTheDocument();
  });

  it("keeps the card's first lines in view under one tap nobody can reach into", () => {
    renderLock(LOCKED);
    // What is under it is still drawn, for the bowler to see there is something.
    const preview = screen.getByText("Open Wolverine").parentElement!;
    expect(preview).toHaveAttribute("inert");
    expect(preview).toHaveAttribute("aria-hidden", "true");
    // It fades out rather than being blurred, and shows only a few lines.
    expect(preview.style.maxHeight).toBe("9rem");
    expect(preview.style.maskImage || preview.style.webkitMaskImage).toContain("linear-gradient");
    // Out of the accessibility tree and the tab order.
    expect(screen.queryByRole("button", { name: "Open Wolverine" })).not.toBeInTheDocument();
    // The one tap is named for what the card shows and what it does.
    expect(screen.getByRole("button", { name: "How each ball strikes. Get the app" })).toBeInTheDocument();
    expect(screen.getByText("Pro")).toBeInTheDocument();
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

describe("ProNote", () => {
  it("says nothing while Pro is open", () => {
    const { container } = render(
      <ProAccessContext.Provider value={{ locked: false }}>
        <ProNote what="Read only" />
      </ProAccessContext.Provider>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("is one quiet line that says what waits on Pro and unlocks it", async () => {
    store.opened.length = 0;
    render(
      <ProAccessContext.Provider value={LOCKED}>
        <ProNote what="Read only. Editing is in Headpin Pro" />
      </ProAccessContext.Provider>
    );
    expect(screen.getByText("Read only. Editing is in Headpin Pro")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Read only. Editing is in Headpin Pro. Get the app" }));
    fireEvent.click(screen.getByRole("button", { name: "Open the App Store" }));
    await waitFor(() => expect(store.opened).toEqual(["https://apps.apple.com/app/id1"]));
  });
});

describe("ProChip", () => {
  it("says nothing while Pro is open", () => {
    const { container } = render(
      <ProAccessContext.Provider value={{ locked: false }}>
        <ProChip what="Moving the line is in Headpin Pro" />
      </ProAccessContext.Provider>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("is a small mark that opens the way to Pro", () => {
    render(
      <ProAccessContext.Provider value={LOCKED}>
        <ProChip what="Moving the line is in Headpin Pro" />
      </ProAccessContext.Provider>
    );
    expect(screen.getByText("Unlock editing")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Moving the line is in Headpin Pro. Get the app" }));
    expect(screen.getByRole("dialog", { name: "Bowled with Headpin on the web?" })).toBeInTheDocument();
  });
});

describe("Pro in the iOS app", () => {
  function storeWith(buy: ProStore["buy"], price: string | null = "$9.99"): ProStore {
    return { owned: false, price, buy, restore: async () => false };
  }

  it("offers the purchase at the App Store's own price", async () => {
    const buy = vi.fn(async () => "purchased" as const);
    renderLock({ locked: true, store: storeWith(buy) });
    fireEvent.click(screen.getByRole("button", { name: "How each ball strikes. Get Headpin Pro, $9.99" }));
    await waitFor(() => expect(buy).toHaveBeenCalledTimes(1));
  });

  it("names the purchase without a price until the store answers", () => {
    renderLock({ locked: true, store: storeWith(async () => "cancelled", null) });
    expect(screen.getByRole("button", { name: "How each ball strikes. Get Headpin Pro" })).toBeInTheDocument();
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

  it("puts the purchase in the banner as a button with the price", () => {
    render(
      <ProAccessContext.Provider value={{ locked: true, store: storeWith(async () => "cancelled") }}>
        <ProBanner what="Charts for every stat" />
      </ProAccessContext.Provider>
    );
    expect(screen.getByRole("button", { name: "Get Headpin Pro, $9.99" })).toBeInTheDocument();
  });
});
