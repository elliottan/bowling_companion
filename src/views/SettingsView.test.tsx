import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsView } from "./SettingsView";
import { db } from "../db/bowlingDb";
import { DEFAULT_DRIFT_MODEL } from "../lib/driftModel";
import { setSetting } from "../services/bowlingRepository";

function renderMenu() {
  render(
    <SettingsView
      section="menu"
      onSectionChange={vi.fn()}
      handedness="right"
      onHandednessChange={vi.fn()}
      driftModel={DEFAULT_DRIFT_MODEL}
      onDriftModelChange={vi.fn()}
      onOpenArsenal={vi.fn()}
      onOpenSpareLines={vi.fn()}
      onOpenBackup={vi.fn()}
      onOpenCatalog={vi.fn()}
      onOpenLineVisualizer={vi.fn()}
    />
  );
}

describe("SettingsView", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("lists every place Settings can take you", () => {
    renderMenu();

    for (const label of [
      "Arsenal",
      "Spare lines",
      "Lane notes",
      "Oil patterns",
      "Preferences",
      "Catalog",
      "Line visualizer",
      "Backup & restore",
      "Send feedback"
    ]) {
      expect(screen.getByRole("button", { name: new RegExp(label) })).toBeInTheDocument();
    }

    // The two rows that leave the app are links, not buttons.
    expect(screen.getByRole("link", { name: /Privacy and terms/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Buy me a coffee/ })).toBeInTheDocument();
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
