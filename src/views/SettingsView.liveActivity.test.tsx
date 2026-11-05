import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveActivityRow } from "./SettingsView";
import { LiveActivityView } from "./LiveActivityView";
import { db } from "../db/bowlingDb";
import { getLiveActivityEnabled, setLiveActivityEnabled } from "../services/bowlingRepository";
import { liveActivity } from "../lib/nativeLiveActivity";
import { ProAccessContext } from "../lib/useProAccess";
import { ProOfferContext } from "../lib/proOffer";
import { PRO_OWNED, type ProAccess } from "../lib/pro";
import { sampleLiveActivityState } from "../lib/liveActivitySample";

vi.mock("../lib/nativeLiveActivity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/nativeLiveActivity")>()),
  liveActivity: { show: vi.fn(), finish: vi.fn(), stop: vi.fn() }
}));

const LOCKED: ProAccess = { locked: true, store: { owned: false, buy: vi.fn(), restore: vi.fn() } };

function withPro(access: ProAccess, ui: ReactNode, openOffer: (() => void) | null = null) {
  return (
    <ProAccessContext.Provider value={access}>
      <ProOfferContext.Provider value={openOffer}>{ui}</ProOfferContext.Provider>
    </ProAccessContext.Provider>
  );
}

describe("the Live Activity row in Settings", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });
  afterEach(cleanup);

  it("is not there where the phone cannot show one", () => {
    render(withPro(PRO_OWNED, <ul><LiveActivityRow status={null} onOpen={vi.fn()} /></ul>));
    expect(screen.queryByRole("button")).toBeNull();
    cleanup();
    render(withPro(PRO_OWNED, <ul><LiveActivityRow status={{ supported: false, enabled: false }} onOpen={vi.fn()} /></ul>));
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says whether it is on, and opens its page", async () => {
    const onOpen = vi.fn();
    render(withPro(PRO_OWNED, <ul><LiveActivityRow status={{ supported: true, enabled: true }} onOpen={onOpen} /></ul>));
    const row = await screen.findByRole("button", { name: /Live Activity/ });
    expect(row).toHaveTextContent("On");
    // No sentence under it: the page says what it does.
    expect(row).not.toHaveTextContent(/frame by frame/);
    fireEvent.click(row);
    expect(onOpen).toHaveBeenCalled();

    await setLiveActivityEnabled(false);
    await waitFor(() => expect(row).toHaveTextContent("Off"));
  });

  it("reads off while the iPhone's own setting is off", async () => {
    render(withPro(PRO_OWNED, <ul><LiveActivityRow status={{ supported: true, enabled: false }} onOpen={vi.fn()} /></ul>));
    expect(await screen.findByRole("button", { name: /Live Activity/ })).toHaveTextContent("Off");
  });

  it("carries the lock while Pro is not open, and still opens the page", async () => {
    const onOpen = vi.fn();
    render(withPro(LOCKED, <ul><LiveActivityRow status={{ supported: true, enabled: true }} onOpen={onOpen} /></ul>));
    const row = await screen.findByRole("button", { name: /Live Activity/ });
    expect(row).not.toHaveTextContent("On");
    expect(screen.getByLabelText("Pro")).toBeInTheDocument();
    fireEvent.click(row);
    expect(onOpen).toHaveBeenCalled();
  });
});

describe("the Live Activity page", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    vi.mocked(liveActivity.stop).mockClear();
  });
  afterEach(cleanup);

  it("shows the three places it is drawn", () => {
    render(withPro(PRO_OWNED, <LiveActivityView status={{ supported: true, enabled: true }} onBack={vi.fn()} />));
    expect(screen.getByRole("heading", { name: "On the Lock Screen" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "In the Dynamic Island" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "On your Apple Watch" })).toBeInTheDocument();
  });

  it("is on by default, and turning it off takes the activity down", async () => {
    render(withPro(PRO_OWNED, <LiveActivityView status={{ supported: true, enabled: true }} onBack={vi.fn()} />));
    const toggle = await screen.findByRole("switch", { name: /Show your game/ });
    await waitFor(() => expect(toggle).toBeChecked());

    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).not.toBeChecked());
    expect(await getLiveActivityEnabled()).toBe(false);
    expect(liveActivity.stop).toHaveBeenCalled();

    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toBeChecked());
    expect(await getLiveActivityEnabled()).toBe(true);
  });

  it("says where to allow it when the phone's own setting is off", () => {
    render(withPro(PRO_OWNED, <LiveActivityView status={{ supported: true, enabled: false }} onBack={vi.fn()} />));
    expect(screen.getByText(/Switched off for Headpin in the iPhone's Settings/)).toBeInTheDocument();
  });

  it("veils the switch without Pro, and the veil opens the Pro page", async () => {
    const openOffer = vi.fn();
    render(withPro(LOCKED, <LiveActivityView status={{ supported: true, enabled: true }} onBack={vi.fn()} />, openOffer));
    // The switch is under the veil, out of reach; the pictures are not.
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.getByRole("heading", { name: "On the Lock Screen" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Show your game as a Live Activity/ }));
    expect(openOffer).toHaveBeenCalled();
    expect(await getLiveActivityEnabled()).toBe(true);
  });
});

describe("the pictures' sample game", () => {
  it("is the scorecard's own marks and totals, mid-game", () => {
    const state = sampleLiveActivityState();
    expect(state.game).toBe(2);
    expect(state.frame).toBe(7);
    expect(state.done).toBe(false);
    expect(state.frames.slice(0, 7).map((f) => f.marks.join(""))).toEqual(["X", "9/", "X", "X", "81", "7/", "9"]);
    // Strike, spare, a double into an open 8 1, a spare, and the 9 on the way.
    expect(state.frames.slice(0, 6).map((f) => f.score)).toEqual(["20", "40", "68", "87", "96", "115"]);
    expect(state.max).not.toBeNull();
  });
});
