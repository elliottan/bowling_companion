import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsView } from "./SettingsView";
import { db } from "../db/bowlingDb";
import { DEFAULT_DRIFT_MODEL } from "../lib/driftModel";
import { getBowlerName, getGripStyle, setBowlerName, setGripStyle, setSetting } from "../services/bowlingRepository";
import { findGuide } from "../lib/guides";

function renderBowler(onOpenGuide = vi.fn()) {
  render(
    <SettingsView
      section="bowler"
      onSectionChange={vi.fn()}
      handedness="right"
      onHandednessChange={vi.fn()}
      driftModel={DEFAULT_DRIFT_MODEL}
      onDriftModelChange={vi.fn()}
      onOpenBackup={vi.fn()}
      onOpenLineVisualizer={vi.fn()}
      onOpenGuide={onOpenGuide}
    />
  );
}

function renderMenu(onOpenGuide = vi.fn(), onSectionChange = vi.fn()) {
  render(
    <SettingsView
      section="menu"
      onSectionChange={onSectionChange}
      handedness="right"
      onHandednessChange={vi.fn()}
      driftModel={DEFAULT_DRIFT_MODEL}
      onDriftModelChange={vi.fn()}
      onOpenBackup={vi.fn()}
      onOpenLineVisualizer={vi.fn()}
      onOpenGuide={onOpenGuide}
    />
  );
}

describe("SettingsView", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("holds settings only, and leaves the places to keep things to Home", () => {
    renderMenu();

    for (const label of [
      "Appearance",
      "PAP, release and drift",
      "Backup & restore",
      "Send feedback"
    ]) {
      expect(screen.getByRole("button", { name: new RegExp(label) })).toBeInTheDocument();
    }
    for (const gone of ["Arsenal", "Spare lines", "Lane notes", "Oil patterns", "Catalog", "Line visualizer"]) {
      expect(screen.queryByRole("button", { name: new RegExp(gone) })).not.toBeInTheDocument();
    }

    // The two rows that leave the app are links, not buttons.
    expect(screen.getByRole("link", { name: /Privacy and terms/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Buy me a coffee/ })).toBeInTheDocument();
  });

  it("groups the bowler's own numbers under Bowler, and the app's under App", () => {
    renderMenu();
    const bowler = screen.getByRole("heading", { name: "Bowler" }).closest("section")!;
    const app = screen.getByRole("heading", { name: "App" }).closest("section")!;
    for (const label of ["Name", "Hand and grip", "PAP, release and drift"]) {
      expect(within(bowler).getByRole("button", { name: new RegExp(label) })).toBeInTheDocument();
    }
    for (const label of ["Appearance", "Backup & restore"]) {
      expect(within(app).getByRole("button", { name: new RegExp(label) })).toBeInTheDocument();
    }
  });

  it("answers hand and grip with the controls alone, no prose", () => {
    renderBowler();
    expect(screen.queryByText(/Boards count in from your side/)).not.toBeInTheDocument();
    expect(screen.queryByText(/How the layout lab draws your ball/)).not.toBeInTheDocument();
  });

  it("changes the name Home greets you by, and forgets it when cleared", async () => {
    await setBowlerName("Sam");
    renderMenu();
    fireEvent.click(await screen.findByRole("button", { name: /Name.*Sam/ }));
    const field = screen.getByLabelText(/What do you want to be called/);
    expect(field).toHaveValue("Sam");
    fireEvent.change(field, { target: { value: "Alex" } });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));
    await waitFor(async () => expect(await getBowlerName()).toBe("Alex"));
    expect(await screen.findByRole("button", { name: /Name.*Alex/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Name.*Alex/ }));
    fireEvent.change(screen.getByLabelText(/What do you want to be called/), { target: { value: "  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));
    await waitFor(async () => expect(await getBowlerName()).toBeNull());
  });

  /**
   * Flipping the hand mirrors every board in the app, so it is not answered on
   * the list, one stray tap away. The row says what is set and opens the page.
   */
  it("keeps hand and grip behind their own row", async () => {
    const onSectionChange = vi.fn();
    renderMenu(vi.fn(), onSectionChange);
    expect(screen.queryByRole("group", { name: "Handedness" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Two-handed" })).not.toBeInTheDocument();
    const row = await screen.findByRole("button", { name: /Hand and grip.*Right-handed · One-handed/ });
    fireEvent.click(row);
    expect(onSectionChange).toHaveBeenCalledWith("bowler");
  });

  it("answers the grip on its page, one-handed until told otherwise", async () => {
    renderBowler();
    expect(screen.getAllByRole("group", { name: "Handedness" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "One-handed" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Two-handed" }));
    await waitFor(async () => expect(await getGripStyle()).toBe("2h"));
  });

  it("fills the grip from what was saved", async () => {
    await setGripStyle("2h");
    renderBowler();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Two-handed" })).toHaveAttribute("aria-pressed", "true")
    );
  });

  it("keeps the long explanation in a guide, one tap away", () => {
    const openGuide = vi.fn();
    renderBowler(openGuide);
    fireEvent.click(screen.getByRole("button", { name: "Why it matters" }));
    expect(openGuide).toHaveBeenCalledWith("your-settings");
    // What a two-handed grip changes, and what it leaves alone, still says so.
    const text = JSON.stringify(findGuide("your-settings")?.body);
    expect(text).toMatch(/without a thumb hole/i);
  });

  /**
   * The row read the setting once on mount, and Settings does not unmount when
   * the backup screen is pushed over it, so it still said "Never backed up"
   * after a backup had just been taken.
   */
  it("follows the backup age instead of reading it once", async () => {
    renderMenu();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Never backed up/ })).toBeInTheDocument()
    );

    await setSetting("last_backup_at", new Date().toISOString());

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Last backup/ })).toBeInTheDocument()
    );
  });
});
