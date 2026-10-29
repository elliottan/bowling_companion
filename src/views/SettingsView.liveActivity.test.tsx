import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveActivityRow } from "./SettingsView";
import { db } from "../db/bowlingDb";
import { getLiveActivityEnabled } from "../services/bowlingRepository";
import { liveActivity } from "../lib/nativeLiveActivity";

vi.mock("../lib/nativeLiveActivity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/nativeLiveActivity")>()),
  liveActivity: { show: vi.fn(), finish: vi.fn(), stop: vi.fn() }
}));

describe("the Live Activity row in Settings", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });
  afterEach(cleanup);

  it("is not there where the phone cannot show one", () => {
    render(<ul><LiveActivityRow status={null} /></ul>);
    expect(screen.queryByRole("switch")).toBeNull();
    cleanup();
    render(<ul><LiveActivityRow status={{ supported: false, enabled: false }} /></ul>);
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("is on by default, and turning it off takes the activity down", async () => {
    render(<ul><LiveActivityRow status={{ supported: true, enabled: true }} /></ul>);
    const toggle = await screen.findByRole("switch", { name: /Live Activity on the Lock Screen/ });
    expect(toggle).toBeChecked();

    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).not.toBeChecked());
    expect(await getLiveActivityEnabled()).toBe(false);
    expect(liveActivity.stop).toHaveBeenCalled();

    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toBeChecked());
    expect(await getLiveActivityEnabled()).toBe(true);
  });

  it("says where to allow it when the phone's own setting is off", async () => {
    render(<ul><LiveActivityRow status={{ supported: true, enabled: false }} /></ul>);
    await screen.findByRole("switch");
    expect(screen.getByText(/Switched off for Headpin in the iPhone's Settings/)).toBeInTheDocument();
  });
});
