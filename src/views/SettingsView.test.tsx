import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsView } from "./SettingsView";
import { db } from "../db/bowlingDb";
import { DEFAULT_DRIFT_MODEL } from "../lib/driftModel";
import { getBowlerName, setBowlerName, setSetting } from "../services/bowlingRepository";

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
      onOpenArsenal={vi.fn()}
      onOpenSpareLines={vi.fn()}
      onOpenLaneNotes={vi.fn()}
      onOpenGuide={onOpenGuide}
    />
  );
}

describe("SettingsView", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("holds settings and the bowler's own places, but not the tools or patterns", () => {
    renderMenu();

    for (const label of ["Appearance", "Bowling profile", "Backup & restore", "Send feedback"]) {
      expect(screen.getByRole("button", { name: new RegExp(label) })).toBeInTheDocument();
    }
    for (const gone of ["Oil patterns", "Catalog", "Line visualizer"]) {
      expect(screen.queryByRole("button", { name: new RegExp(gone) })).not.toBeInTheDocument();
    }

    // The two rows that leave the app are links, not buttons.
    expect(screen.getByRole("link", { name: /Privacy and terms/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Buy me a coffee/ })).toBeInTheDocument();
  });

  it("groups the bowler's own places under Your bowling", () => {
    renderMenu();
    const bowling = screen.getByRole("heading", { name: "Your bowling" }).closest("section")!;
    for (const label of ["Bowling profile", "Arsenal", "Spare lines", "Lane notes"]) {
      expect(within(bowling).getByRole("button", { name: new RegExp(label) })).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: /^Name/ })).not.toBeInTheDocument();
  });

  it("leads with the backup, alone, and ends on Appearance after Support", () => {
    renderMenu();
    const headings = screen.getAllByRole("heading").map((h) => h.textContent);
    expect(headings).toEqual(["Settings", "Your bowling", "Support", "App"]);
    const backup = screen.getByRole("button", { name: /Backup & restore/ });
    const profile = screen.getByRole("button", { name: /Bowling profile/ });
    expect(backup.compareDocumentPosition(profile) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const rows = screen.getAllByRole("button").map((b) => b.textContent ?? "");
    expect(rows[rows.length - 1]).toMatch(/Appearance/);
  });

  it("leaves the links to the outside with no sentence under them", () => {
    renderMenu();
    expect(screen.getByRole("link", { name: "Privacy and terms" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send feedback" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Buy me a coffee.*Thanks for your support!/ })).toHaveAttribute(
      "href",
      "https://buymeacoffee.com/elliotbowls"
    );
  });

  it("shows the name as a profile chip with the first letter, and changes it from there", async () => {
    await setBowlerName("sam");
    renderMenu();
    const chip = await screen.findByRole("button", { name: "Your name, sam" });
    expect(chip).toHaveTextContent("S");
    expect(chip).toHaveTextContent("sam");
    fireEvent.click(chip);
    const field = screen.getByLabelText(/What do you want to be called/);
    expect(field).toHaveValue("sam");
    fireEvent.change(field, { target: { value: "Alex" } });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));
    await waitFor(async () => expect(await getBowlerName()).toBe("Alex"));
    expect(await screen.findByRole("button", { name: "Your name, Alex" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Your name, Alex" }));
    fireEvent.change(screen.getByLabelText(/What do you want to be called/), { target: { value: "  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));
    await waitFor(async () => expect(await getBowlerName()).toBeNull());
    expect(await screen.findByRole("button", { name: "Add your name" })).toBeInTheDocument();
  });

  /**
   * Flipping the hand mirrors every board in the app, so it is not answered on
   * the list, one stray tap away. The row says what is set and opens the page.
   */
  it("keeps hand and grip behind the Bowling profile row", async () => {
    const onSectionChange = vi.fn();
    renderMenu(vi.fn(), onSectionChange);
    expect(screen.queryByRole("group", { name: "Handedness" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Two-handed" })).not.toBeInTheDocument();
    const row = await screen.findByRole("button", { name: /Bowling profile.*Right-handed · One-handed/ });
    fireEvent.click(row);
    expect(onSectionChange).toHaveBeenCalledWith("profile");
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
