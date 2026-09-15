import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HandednessView } from "./HandednessView";
import { db } from "../db/bowlingDb";
import { DEFAULT_DRIFT_MODEL } from "../lib/driftModel";
import { getGripStyle, getPap, setGripStyle, setPap } from "../services/bowlingRepository";

const renderPrefs = () => {
  render(
    <HandednessView
      value="right"
      onChange={vi.fn()}
      driftModel={DEFAULT_DRIFT_MODEL}
      onDriftModelChange={vi.fn()}
    />
  );
};

describe("HandednessView", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("opens one-handed, which is the grip that needs no answering", () => {
    renderPrefs();
    expect(screen.getByRole("button", { name: "One-handed" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("saves the grip, so the layout lab opens on it", async () => {
    renderPrefs();
    fireEvent.click(screen.getByRole("button", { name: "Two-handed" }));
    await waitFor(async () => expect(await getGripStyle()).toBe("2h"));
  });

  it("fills the grip from what was saved", async () => {
    await setGripStyle("2h");
    renderPrefs();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Two-handed" })).toHaveAttribute(
        "aria-pressed",
        "true"
      )
    );
  });

  it("says out loud that a two-handed layout is not modelled yet", () => {
    // The app would rather say it does not know than quietly hand back a
    // number computed for a grip it has not been taught.
    renderPrefs();
    expect(screen.getByText(/not modelled yet/i)).toBeInTheDocument();
  });

  it("edits the same stored PAP the layout lab does", async () => {
    await setPap({ over: 4, up: 0.5 });
    renderPrefs();
    await waitFor(() =>
      expect((screen.getByLabelText("Over") as HTMLSelectElement).value).toBe("4")
    );
    fireEvent.change(screen.getByLabelText("Over"), { target: { value: "5" } });
    await waitFor(async () => expect(await getPap()).toEqual({ over: 5, up: 0.5 }));
  });

  it("puts the PAP back to the default from the reset beside it", async () => {
    await setPap({ over: 2, up: -1 });
    renderPrefs();
    await waitFor(() =>
      expect((screen.getByLabelText("Over") as HTMLSelectElement).value).toBe("2")
    );
    fireEvent.click(screen.getByRole("button", { name: "Reset PAP" }));
    await waitFor(async () => expect(await getPap()).toEqual({ over: 5, up: 0.5 }));
  });

  it("reads each PAP measurement as one line, with no heading band above it", async () => {
    await setPap({ over: 5.5, up: -0.5 });
    renderPrefs();
    await waitFor(() =>
      expect((screen.getByLabelText("Over") as HTMLSelectElement).value).toBe("5")
    );
    // The number, its fraction, then what it is: "5 1/2 over", "1/2 down". The
    // labels used to sit in a band above each row, naming two things the row
    // already says, at the cost of two bands of a phone screen.
    expect((screen.getByLabelText("Over fraction") as HTMLSelectElement).value).toBe("4");
    expect((screen.getByLabelText("Up or down direction") as HTMLSelectElement).value).toBe("down");
    expect(screen.queryByText("Up or down", { selector: "span" })).not.toBeInTheDocument();
  });

  it("keeps the sign on the whole measurement, so half an inch down is reachable", async () => {
    await setPap({ over: 5, up: 0.5 });
    renderPrefs();
    await waitFor(() =>
      expect((screen.getByLabelText("Up or down fraction") as HTMLSelectElement).value).toBe("4")
    );
    fireEvent.change(screen.getByLabelText("Up or down direction"), { target: { value: "down" } });
    // Not a negative zero, which is the whole reason the direction is its own
    // control rather than a minus on the whole inches.
    await waitFor(async () => expect(await getPap()).toEqual({ over: 5, up: -0.5 }));
  });
});
