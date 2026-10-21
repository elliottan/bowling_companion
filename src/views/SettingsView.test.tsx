import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsView } from "./SettingsView";
import { db } from "../db/bowlingDb";
import { DEFAULT_DRIFT_MODEL } from "../lib/driftModel";
import { getBowlerName, setBowlerName, setSetting } from "../services/bowlingRepository";
import { ProAccessContext, ProStoreContext } from "../lib/useProAccess";
import { ProOfferContext } from "../lib/proOffer";
import type { ProAccess, ProStore } from "../lib/pro";
import { openInAppBrowser } from "../lib/inAppBrowser";

vi.mock("../lib/inAppBrowser", () => ({ openInAppBrowser: vi.fn().mockResolvedValue(undefined) }));

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

  it("opens privacy and terms over the app, in the store app", () => {
    vi.stubGlobal("Capacitor", { isNativePlatform: () => true });
    try {
      renderMenu();
      expect(screen.queryByRole("link", { name: "Privacy and terms" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Privacy and terms" }));
      expect(openInAppBrowser).toHaveBeenCalledWith("https://headpin.app/legal");
    } finally {
      vi.unstubAllGlobals();
    }
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

  it("says when the App Store does not answer, and why when it said", async () => {
    renderWithStore({ ...base, restore: () => Promise.reject(new Error("offline")) });
    fireEvent.click(screen.getByRole("button", { name: /Restore purchase/ }));
    expect(await screen.findByRole("status")).toHaveTextContent("The App Store did not answer: offline");
  });

  it("shows the tap was taken while the App Store thinks", async () => {
    let finish: (v: "purchased") => void = () => {};
    renderWithStore({ ...base, buy: () => new Promise((resolve) => (finish = resolve)) });
    fireEvent.click(screen.getByRole("button", { name: /Get Headpin Pro/ }));
    expect(await screen.findByText("Asking the App Store…")).toBeInTheDocument();
    finish("purchased");
    await waitFor(() => expect(screen.queryByText("Asking the App Store…")).not.toBeInTheDocument());
  });

  describe("the Pro mark and the Pro page (ADR-164)", () => {
    function renderWith(access: { locked: false; owned?: true }) {
      setBowlerName("Sam");
      render(
        <ProAccessContext.Provider value={access}>
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
        </ProAccessContext.Provider>
      );
    }

    it("labels the bowler Pro when Pro was bought, and only then", async () => {
      renderWith({ locked: false, owned: true });
      const chip = await screen.findByRole("button", { name: "Your name, Sam" });
      expect(within(chip).getByText("Pro")).toBeInTheDocument();
    });

    it("does not label a bowler Pro where Pro is merely open", async () => {
      renderWith({ locked: false });
      const chip = await screen.findByRole("button", { name: "Your name, Sam" });
      expect(within(chip).queryByText("Pro")).not.toBeInTheDocument();
    });

    function renderOnWeb(access: ProAccess, openOffer = vi.fn()) {
      render(
        <ProAccessContext.Provider value={access}>
          <ProOfferContext.Provider value={openOffer}>
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
          </ProOfferContext.Provider>
        </ProAccessContext.Provider>
      );
      return openOffer;
    }

    it("has one row to the Pro page on the web, locked or owned, and none where Pro is merely open (ADR-167)", () => {
      const openOffer = renderOnWeb({ locked: true, appStoreUrl: null });
      fireEvent.click(screen.getByRole("button", { name: /Headpin Pro\s*See what Pro adds/ }));
      expect(openOffer).toHaveBeenCalledTimes(1);
      expect(screen.queryByText("Restore purchase")).not.toBeInTheDocument();
      cleanup();

      renderOnWeb({ locked: false, owned: true });
      expect(screen.getByRole("button", { name: /Headpin Pro\s*Unlocked on this copy/ })).toBeInTheDocument();
      cleanup();

      renderOnWeb({ locked: false });
      expect(screen.queryByRole("button", { name: /^Headpin Pro/ })).not.toBeInTheDocument();
    });

    it("opens the Pro page from Get Headpin Pro instead of buying", () => {
      const openOffer = vi.fn();
      const buy = vi.fn(async () => "purchased" as const);
      render(
        <ProStoreContext.Provider value={{ owned: false, price: "$9.99", buy, restore: async () => false }}>
          <ProOfferContext.Provider value={openOffer}>
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
          </ProOfferContext.Provider>
        </ProStoreContext.Provider>
      );
      fireEvent.click(screen.getByRole("button", { name: /Get Headpin Pro/ }));
      expect(openOffer).toHaveBeenCalledTimes(1);
      expect(buy).not.toHaveBeenCalled();
    });
  });
});
