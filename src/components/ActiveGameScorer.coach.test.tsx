import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { db } from "../db/bowlingDb";
import { ActiveGameScorer } from "./ActiveGameScorer";
import type { Frame, PinNumber } from "../types/bowling";

// jsdom has no Pointer Capture API; PinGrid's drag gesture calls it.
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}

const NONE: PinNumber[] = [];
const COACH = /Tap the pins left standing after your shot/;

/** Nine strikes, so the tenth frame is one game-ending shot away. */
function nineStrikes(): Frame[] {
  return Array.from({ length: 9 }, (_, i) => ({
    game_id: 1,
    frame_number: i + 1,
    shots: [{ pins_standing: NONE }],
    is_strike: true,
    is_spare: false
  }));
}

describe("pin input coach line (ADR-006)", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("explains the inverted deck to a bowler who has never finished a game", async () => {
    render(<ActiveGameScorer gameKey={1} />);
    expect(await screen.findByText(COACH)).toBeInTheDocument();
  });

  it("goes away for good on Got it", async () => {
    render(<ActiveGameScorer gameKey={1} />);
    await screen.findByText(COACH);
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));

    await waitFor(() => expect(screen.queryByText(COACH)).not.toBeInTheDocument());
    expect(await db.settings.get("pin_input_coached_at")).toBeDefined();
  });

  it("stays away once a game has been finished", async () => {
    await db.settings.put({ key: "pin_input_coached_at", value: "2026-08-30T00:00:00.000Z" });
    render(<ActiveGameScorer gameKey={1} />);
    // The ball list resolves first, so waiting on the deck proves the scorer
    // is past its loading state and the line genuinely never rendered.
    await screen.findByRole("button", { name: /^Pin 1 / });
    expect(screen.queryByText(COACH)).not.toBeInTheDocument();
  });

  it("retires itself when the bowler finishes a game", async () => {
    render(<ActiveGameScorer gameKey={1} initialFrames={nineStrikes()} />);
    await screen.findByText(COACH);

    // Tenth frame: three strikes off the Strike button ends the game.
    for (let i = 0; i < 3; i += 1) {
      fireEvent.click(await screen.findByRole("button", { name: /^Strike$/ }));
    }

    await waitFor(() => expect(screen.queryByText(COACH)).not.toBeInTheDocument());
    expect(await db.settings.get("pin_input_coached_at")).toBeDefined();
  });
});
