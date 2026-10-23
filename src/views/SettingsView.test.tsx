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
      onOpenLayoutLab={vi.fn()}
      onOpenOilPatternsScreen={vi.fn()}
      onOpenCatalog={vi.fn()}
      onOpenGuides={vi.fn()}
    />
  );
}

describe("SettingsView", () => {
  it("opens Tools and reference, the same list as Home's", () => {
    const onSectionChange = vi.fn();
    renderMenu(onSectionChange);
    fireEvent.click(screen.getByRole("button", { name: /Tools and reference/ }));
    expect(onSectionChange).toHaveBeenCalledWith("tools");
  });

  it("lists the tools in that section, each opening its screen", async () => {
    const onOpenCatalog = vi.fn();
    const onOpenLayoutLab = vi.fn();
    render(
      <SettingsView
        section="tools"
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
        onOpenLayoutLab={onOpenLayoutLab}
        onOpenOilPatternsScreen={vi.fn()}
        onOpenCatalog={onOpenCatalog}
        onOpenGuides={vi.fn()}
      />
    );
    const tools = await screen.findByRole("region", { name: "Tools and reference" });
    fireEvent.click(within(tools).getByRole("button", { name: /Ball catalog/ }));
    fireEvent.click(within(tools).getByRole("button", { name: /Layouts/ }));
    expect(onOpenCatalog).toHaveBeenCalled();
    expect(onOpenLayoutLab).toHaveBeenCalled();
  });

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

    // Privacy and terms is a screen in the app now, not a link out.
    expect(screen.getByRole("button", { name: /Privacy and terms/ })).toBeInTheDocument();
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

  it("opens privacy and terms as a screen in Settings", () => {
    const onSectionChange = vi.fn();
    renderMenu(onSectionChange);
    expect(screen.queryByRole("link", { name: "Privacy and terms" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Privacy and terms" }));
    expect(onSectionChange).toHaveBeenCalledWith("legal");
  });

  it("shows the site's privacy and terms text in place, with its links kept in the app", async () => {
    const onSectionChange = vi.fn();
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    render(
      <SettingsView
        section="legal"
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
        onOpenLayoutLab={vi.fn()}
        onOpenOilPatternsScreen={vi.fn()}
        onOpenCatalog={vi.fn()}
        onOpenGuides={vi.fn()}
      />
    );
    expect(await screen.findByRole("heading", { name: "The short version" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Terms of use" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /← Headpin/ })).toBeNull();

    // A contents link scrolls the screen and leaves the app's address alone.
    const terms = screen.getByRole("heading", { name: "Terms of use" });
    terms.scrollIntoView = vi.fn();
    const before = window.location.hash;
    fireEvent.click(screen.getByRole("link", { name: "Terms of use" }));
    expect(terms.scrollIntoView).toHaveBeenCalled();
    expect(window.location.hash).toBe(before);

    // An outside link leaves, on the web, in a new tab.
    fireEvent.click(screen.getByRole("link", { name: "Vercel's privacy policy" }));
    expect(open).toHaveBeenCalledWith("https://vercel.com/legal/privacy-policy", "_blank", "noopener");

    // In the store app, through the in-app browser.
    vi.stubGlobal("Capacitor", { isNativePlatform: () => true });
    try {
      fireEvent.click(screen.getByRole("link", { name: "Umami's privacy policy" }));
      expect(openInAppBrowser).toHaveBeenCalledWith("https://umami.is/privacy");
    } finally {
      vi.unstubAllGlobals();
      open.mockRestore();
    }

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() => expect(onSectionChange).toHaveBeenCalledWith("menu"));
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
          onOpenLayoutLab={vi.fn()}
          onOpenOilPatternsScreen={vi.fn()}
          onOpenCatalog={vi.fn()}
          onOpenGuides={vi.fn()}
        />
      </ProStoreContext.Provider>
    );
  }

  const base: ProStore = { owned: false, buy: async () => "cancelled", restore: async () => false };

  it("is not there on the web, where Pro is not sold", () => {
    renderWithStore(null);
    expect(screen.queryByText("Restore purchase")).not.toBeInTheDocument();
  });

  it("offers Pro without a price, and buys it", async () => {
    const buy = vi.fn(async () => "purchased" as const);
    renderWithStore({ ...base, buy });
    expect(screen.getByText("One purchase: every analysis, and every one added later")).toBeInTheDocument();
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

  it("does not offer to restore Pro once it is here", () => {
    renderWithStore({ ...base, owned: true });
    expect(screen.getByText("Unlocked. Thank you for backing Headpin.")).toBeInTheDocument();
    expect(screen.queryByText("Restore purchase")).not.toBeInTheDocument();
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
            onOpenLayoutLab={vi.fn()}
            onOpenOilPatternsScreen={vi.fn()}
            onOpenCatalog={vi.fn()}
            onOpenGuides={vi.fn()}
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
              onOpenLayoutLab={vi.fn()}
              onOpenOilPatternsScreen={vi.fn()}
              onOpenCatalog={vi.fn()}
              onOpenGuides={vi.fn()}
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
        <ProStoreContext.Provider value={{ owned: false, buy, restore: async () => false }}>
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
              onOpenLayoutLab={vi.fn()}
              onOpenOilPatternsScreen={vi.fn()}
              onOpenCatalog={vi.fn()}
              onOpenGuides={vi.fn()}
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
