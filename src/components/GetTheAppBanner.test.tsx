import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GetTheAppBanner } from "./GetTheAppBanner";
import { ProAccessContext } from "../lib/useProAccess";
import type { ProAccess } from "../lib/pro";
import { db } from "../db/bowlingDb";

const LISTED: ProAccess = { locked: true, appStoreUrl: "https://apps.apple.com/app/id1" };
const DESKTOP = "Mozilla/5.0 (X11; Linux x86_64)";

function renderBanner(access: ProAccess, userAgent = DESKTOP) {
  return render(
    <ProAccessContext.Provider value={access}>
      <GetTheAppBanner userAgent={userAgent} />
    </ProAccessContext.Provider>
  );
}

describe("the get-the-app banner on Home (ADR-170)", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("offers the app, and Get starts with the steps for moving games over", async () => {
    renderBanner(LISTED);
    expect(await screen.findByText("Free on the App Store")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Get" }));
    expect(screen.getByRole("dialog", { name: "Bowled with Headpin on the web?" })).toBeInTheDocument();
  });

  it("says the app is coming, with nothing to press, before it is listed", async () => {
    renderBanner({ locked: true, appStoreUrl: null });
    expect(await screen.findByText("Coming soon to the App Store")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Get" })).not.toBeInTheDocument();
  });

  it("goes when waved away", async () => {
    renderBanner(LISTED);
    fireEvent.click(await screen.findByRole("button", { name: "Not now" }));
    await waitFor(() => expect(screen.queryByText("Headpin for iPhone")).not.toBeInTheDocument());
  });

  it("is not on Android, where Pro is owned, or inside the app", () => {
    expect(renderBanner(LISTED, "Mozilla/5.0 (Linux; Android 14)").container).toBeEmptyDOMElement();
    expect(renderBanner({ locked: false, owned: true }).container).toBeEmptyDOMElement();
    expect(renderBanner({ locked: false }).container).toBeEmptyDOMElement();
  });
});
