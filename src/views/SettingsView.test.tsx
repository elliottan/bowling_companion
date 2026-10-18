import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsView } from "./SettingsView";
import { db } from "../db/bowlingDb";
import { DEFAULT_DRIFT_MODEL } from "../lib/driftModel";
import { getBowlerName, setBowlerName, setSetting } from "../services/bowlingRepository";
import { ProStoreContext } from "../lib/useProAccess";
import type { ProStore } from "../lib/pro";

function renderMenu(onSectionChange = vi.fn()) {
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

    // The row that leaves the app is a link, not a button.
    expect(screen.getByRole("link", { name: /Privacy and terms/ })).toBeInTheDocument();
    // Headpin earns from Pro now, not from a tip jar (ADR-154).
    expect(screen.queryByRole("link", { name: /Buy me a coffee/ })).not.toBeInTheDocument();
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
    renderMenu(onSectionChange);
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

describe("SettingsView's Headpin Pro", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  function renderWithStore(store: ProStore | null) {
    render(
      <ProStoreContext.Provider value={store}>
        <SettingsView
          section="menu"
          onSectionChange={vi.fn()}
          handedness="right"
          onHandednessChange={vi.fn()}
          driftModel={DEFAULT_DRIFT_MODEL}
          onDriftModelChange={vi.fn()}
          onOpenBackup={vi.fn()}
          onOpenLineVisualizer={vi.fn()}
          onOpenArsenal={vi.fn()}
          onOpenSpareLines={vi.fn()}
          onOpenLaneNotes={vi.fn()}
        />
      </ProStoreContext.Provider>
    );
  }

  const base: ProStore = { owned: false, price: "$9.99", buy: async () => "cancelled", restore: async () => false };

  it("is not there on the web, where Pro is not sold", () => {
    renderWithStore(null);
    expect(screen.queryByText("Restore purchase")).not.toBeInTheDocument();
  });

  it("offers Pro at its price, and buys it", async () => {
    const buy = vi.fn(async () => "purchased" as const);
    renderWithStore({ ...base, buy });
    expect(screen.getByText("$9.99, once: every analysis, for good")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Get Headpin Pro/ }));
    await waitFor(() => expect(buy).toHaveBeenCalledTimes(1));
  });

  it("says when a purchase waits on approval", async () => {
    renderWithStore({ ...base, buy: async () => "pending" });
    fireEvent.click(screen.getByRole("button", { name: /Get Headpin Pro/ }));
    expect(await screen.findByRole("status")).toHaveTextContent("Waiting for approval");
  });

  it("shows Pro as unlocked once it is owned", () => {
    renderWithStore({ ...base, owned: true });
    expect(screen.getByText("Unlocked. Thank you for backing Headpin.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Get Headpin Pro/ })).not.toBeInTheDocument();
  });

  it("restores a purchase, and says when there is none", async () => {
    const restore = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    renderWithStore({ ...base, restore });
    fireEvent.click(screen.getByRole("button", { name: /Restore purchase/ }));
    expect(await screen.findByRole("status")).toHaveTextContent("Headpin Pro is restored.");
    fireEvent.click(screen.getByRole("button", { name: /Restore purchase/ }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("This Apple ID has not bought Headpin Pro."));
  });

  it("says when the App Store does not answer", async () => {
    renderWithStore({ ...base, restore: () => Promise.reject(new Error("offline")) });
    fireEvent.click(screen.getByRole("button", { name: /Restore purchase/ }));
    expect(await screen.findByRole("status")).toHaveTextContent("did not answer");
  });
});
