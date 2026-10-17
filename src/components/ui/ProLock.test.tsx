import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ProLock } from "./ProLock";
import { ProAccessContext } from "../../lib/useProAccess";

const store = vi.hoisted(() => ({ opened: [] as string[] }));
vi.mock("../../lib/pro", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/pro")>();
  return { ...actual, openAppStore: (url: string) => store.opened.push(url) };
});

const LOCKED = { locked: true as const, appStoreUrl: "https://apps.apple.com/app/id1" };

function renderLock(access: typeof LOCKED | { locked: false }, pro?: boolean) {
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

  it("sends the bowler to the App Store", () => {
    store.opened.length = 0;
    renderLock(LOCKED);
    fireEvent.click(screen.getByRole("button", { name: "Get the app" }));
    expect(store.opened).toEqual(["https://apps.apple.com/app/id1"]);
  });
});
