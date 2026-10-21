import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ProLock, ProNote } from "./ProLock";
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
    expect(screen.queryByText("How each ball strikes")).not.toBeInTheDocument();
  });

  it("is the card itself when the content is free right now", () => {
    renderLock(LOCKED, false);
    expect(screen.getByRole("button", { name: "Open Wolverine" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Get the app" })).not.toBeInTheDocument();
  });

  it("keeps the card's place as a preview nobody can reach into, saying what it shows", () => {
    renderLock(LOCKED);
    expect(screen.getByText("How each ball strikes")).toBeInTheDocument();
    // Out of the accessibility tree and the tab order, and no tap reaches it.
    expect(screen.queryByRole("button", { name: "Open Wolverine" })).not.toBeInTheDocument();
    const preview = screen.getByText("Open Wolverine").parentElement!;
    expect(preview).toHaveAttribute("inert");
    expect(preview).toHaveAttribute("aria-hidden", "true");
  });

  it("shows the steps for moving games over before it opens the App Store", async () => {
    store.opened.length = 0;
    renderLock(LOCKED);
    fireEvent.click(screen.getByRole("button", { name: "Get the app" }));

    expect(screen.getByRole("dialog", { name: "Bowled with Headpin on the web?" })).toBeInTheDocument();
    expect(screen.getByText(/open Settings, then Backup & restore, and export/)).toBeInTheDocument();
    expect(store.opened).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "Open the App Store" }));
    await waitFor(() => expect(store.opened).toEqual(["https://apps.apple.com/app/id1"]));
  });

  it("stays on the page when the bowler is not ready to switch", async () => {
    store.opened.length = 0;
    renderLock(LOCKED);
    fireEvent.click(screen.getByRole("button", { name: "Get the app" }));
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(store.opened).toEqual([]);
  });
});

describe("ProNote", () => {
  it("says nothing while Pro is open", () => {
    const { container } = render(
      <ProAccessContext.Provider value={{ locked: false }}>
        <ProNote what="Moving the line" />
      </ProAccessContext.Provider>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("says what waits on Pro, and sends the bowler to the App Store", async () => {
    store.opened.length = 0;
    render(
      <ProAccessContext.Provider value={LOCKED}>
        <ProNote lane what="Moving the line" />
      </ProAccessContext.Provider>
    );
    expect(screen.getByText("Moving the line is in the Headpin app")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Get the app" }));
    fireEvent.click(screen.getByRole("button", { name: "Open the App Store" }));
    await waitFor(() => expect(store.opened).toEqual(["https://apps.apple.com/app/id1"]));
  });
});

describe("ProLock in the iOS app", () => {
  function storeWith(buy: ProStore["buy"], price: string | null = "$9.99"): ProStore {
    return { owned: false, price, buy, restore: async () => false };
  }

  it("offers the purchase at the App Store's own price", async () => {
    const buy = vi.fn(async () => "purchased" as const);
    renderLock({ locked: true, store: storeWith(buy) });
    fireEvent.click(screen.getByRole("button", { name: "Get Headpin Pro, $9.99" }));
    await waitFor(() => expect(buy).toHaveBeenCalledTimes(1));
  });

  it("names the purchase without a price until the store answers", () => {
    renderLock({ locked: true, store: storeWith(async () => "cancelled", null) });
    expect(screen.getByRole("button", { name: "Get Headpin Pro" })).toBeInTheDocument();
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

  it("puts the purchase on a read-only screen's note too, and names Pro, not the app", () => {
    render(
      <ProAccessContext.Provider value={{ locked: true, store: storeWith(async () => "cancelled") }}>
        <ProNote what="Moving the line" lane />
      </ProAccessContext.Provider>
    );
    expect(screen.getByText("Moving the line is in Headpin Pro")).toBeInTheDocument();
    expect(screen.queryByText(/in the Headpin app/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Get Headpin Pro, $9.99" })).toBeInTheDocument();
  });
});
