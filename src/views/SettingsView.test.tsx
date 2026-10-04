import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsView } from "./SettingsView";
import { db } from "../db/bowlingDb";
import { DEFAULT_DRIFT_MODEL } from "../lib/driftModel";
import { getGripStyle, setGripStyle, setSetting } from "../services/bowlingRepository";
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
    expect(text).toMatch(/no thumb hole/i);
    expect(text).toMatch(/fitted to a thumb-in release/i);
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
