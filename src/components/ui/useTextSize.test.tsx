import { beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { db } from "../../db/bowlingDb";
import { getTextSize, setTextSize } from "../../services/bowlingRepository";
import { AppearanceView } from "../../views/AppearanceView";
import { ProAccessContext } from "../../lib/useProAccess";

function renderAppearance() {
  render(
    <ProAccessContext.Provider value={{ locked: false }}>
      <AppearanceView />
    </ProAccessContext.Provider>
  );
}

const userScale = () => document.documentElement.style.getPropertyValue("--user-text-scale");

describe("the Text size setting (ADR-219)", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    localStorage.clear();
    document.documentElement.style.removeProperty("--user-text-scale");
  });

  it("starts on Default and changes the page, the device copy and the saved setting", async () => {
    renderAppearance();
    expect(screen.getByRole("button", { name: "Default" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Larger" }));

    expect(screen.getByRole("button", { name: "Larger" })).toHaveAttribute("aria-pressed", "true");
    expect(userScale()).toBe("1.3");
    expect(localStorage.getItem("textSize")).toBe("larger");
    await waitFor(async () => expect(await getTextSize()).toBe("larger"));
  });

  it("forgets the size when it goes back to Default", async () => {
    renderAppearance();
    fireEvent.click(screen.getByRole("button", { name: "Largest" }));
    await waitFor(async () => expect(await getTextSize()).toBe("largest"));

    fireEvent.click(screen.getByRole("button", { name: "Default" }));

    expect(userScale()).toBe("1");
    expect(localStorage.getItem("textSize")).toBeNull();
    await waitFor(async () => expect(await getTextSize()).toBeNull());
  });

  it("takes up a size the settings table holds that this device has not seen", async () => {
    // A backup restored on a new phone: the table has it, localStorage does not.
    await setTextSize("large");
    renderAppearance();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Large" })).toHaveAttribute("aria-pressed", "true")
    );
    expect(userScale()).toBe("1.15");
    expect(localStorage.getItem("textSize")).toBe("large");
  });

  it("reads a stored value that is not a size as no size at all", async () => {
    await db.settings.put({ key: "text_size", value: "gigantic" });
    expect(await getTextSize()).toBeNull();
    await act(async () => {
      renderAppearance();
    });
    expect(screen.getByRole("button", { name: "Default" })).toHaveAttribute("aria-pressed", "true");
  });
});
