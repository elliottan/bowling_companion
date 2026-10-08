import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SpareLinesView } from "./SpareLinesView";
import { db } from "../db/bowlingDb";
import { addBall, getBalls, getSpareLinesAll, upsertSpareLine } from "../services/ballRepository";
import type { PinNumber } from "../types/bowling";

/**
 * Deleting a spare line used to fire straight off the form's Delete button.
 * The line is hand-tuned over a season and there is no undo behind it, so it
 * now goes through the same confirm every other destructive action uses.
 */
/** A session in which `pins` is left, and then picked up, `times` times. */
async function seedHistoryWithLeave(pins: PinNumber[], times: number) {
  const sessionId = Number(await db.sessions.add({ date: "2026-10-01", alley_name: "Test Lanes" }));
  const gameId = Number(await db.games.add({ session_id: sessionId, game_number: 1 }));
  for (let i = 1; i <= times; i += 1) {
    await db.frames.add({
      game_id: gameId,
      frame_number: i,
      shots: [{ pins_standing: pins }, { pins_standing: [] }],
      is_strike: false,
      is_spare: true
    });
  }
}

describe("SpareLinesView", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  /** The confirm sheet, which shares its Cancel wording with the form behind it. */
  async function confirm() {
    return (await screen.findByText("Delete this spare line?")).closest(
      "[role=dialog]"
    ) as HTMLElement;
  }

  /** Renders, waits for the seeded lines, and opens the first one's editor. */
  async function openTheFirstLine() {
    render(<SpareLinesView onBack={vi.fn()} />);
    const cards = await screen.findAllByRole("button", { name: /Open spare line for pins/ });
    const card = cards[0];
    const before = (await getSpareLinesAll()).length;
    fireEvent.click(card);
    const del = await screen.findByRole("button", { name: /Delete spare line for pins/ });
    return { before, del };
  }

  it("asks before it deletes a spare line", async () => {
    const { before, del } = await openTheFirstLine();
    expect(before).toBeGreaterThan(0);

    fireEvent.click(del);

    expect(await screen.findByText("Delete this spare line?")).toBeInTheDocument();
    expect(await getSpareLinesAll()).toHaveLength(before);
  });

  it("deletes only once the confirm is answered", async () => {
    const { before, del } = await openTheFirstLine();
    expect(before).toBeGreaterThan(0);

    fireEvent.click(del);
    fireEvent.click(within(await confirm()).getByRole("button", { name: "Delete" }));

    await waitFor(async () => expect(await getSpareLinesAll()).toHaveLength(before - 1));
  });

  it("keeps the line when the confirm is cancelled", async () => {
    const { before, del } = await openTheFirstLine();
    expect(before).toBeGreaterThan(0);

    fireEvent.click(del);
    fireEvent.click(within(await confirm()).getByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(screen.queryByText("Delete this spare line?")).not.toBeInTheDocument()
    );
    expect(await getSpareLinesAll()).toHaveLength(before);
  });

  it("never lists a pocket leave, even one with a line saved for it (ADR-123)", async () => {
    await upsertSpareLine([10], { stance: 35, target: 20 });
    await upsertSpareLine([1, 2, 3, 5], { stance: 20, target: 12 });
    render(<SpareLinesView onBack={vi.fn()} />);

    await screen.findAllByRole("button", { name: /Open spare line for pins/ });
    expect(
      screen.queryByRole("button", { name: "Open spare line for pins 1, 2, 3, 5" })
    ).not.toBeInTheDocument();
    // Hidden, not deleted.
    expect((await getSpareLinesAll()).some((sl) => sl.pins.join("-") === "1-2-3-5")).toBe(true);
  });

  it("puts leaves that share a line on one row, each tile opening its own leave", async () => {
    await upsertSpareLine([2, 4, 5, 8], { stance: 25, target: 12 });
    await upsertSpareLine([2, 4, 8], { stance: 25, target: 12 });
    render(<SpareLinesView onBack={vi.fn()} />);

    const row = await screen.findByRole("region", { name: "Stance 25, target 12" });
    expect(within(row).getByRole("button", { name: "Open spare line for pins 2, 4, 5, 8" })).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Open spare line for pins 2, 4, 8" })).toBeInTheDocument();
    // One set of boards for the two of them, in the row's heading.
    expect(within(row).getAllByRole("heading")).toHaveLength(1);
  });

  it("puts the leave left most often first on its row, with how often", async () => {
    await upsertSpareLine([10], { stance: 15, target: 10 });
    await upsertSpareLine([7], { stance: 15, target: 10 });
    await seedHistoryWithLeave([7], 3);
    render(<SpareLinesView onBack={vi.fn()} />);

    const row = await screen.findByRole("region", { name: "Stance 15, target 10" });
    await waitFor(() => expect(within(row).getByText(/^3×/)).toBeInTheDocument());
    const tiles = within(row).getAllByRole("button", { name: /^Open spare line/ });
    expect(tiles[0]).toHaveAccessibleName("Open spare line for pins 7");
  });

  it("does not call a leave with only a strike ball move lineless", async () => {
    await upsertSpareLine([2, 8], undefined, undefined, { stance: -2, target: -1 });
    render(<SpareLinesView onBack={vi.fn()} />);
    const row = await screen.findByRole("region", { name: "Strike ball move" });
    expect(within(row).getByText("2 right")).toBeInTheDocument();
    expect(within(row).getByText("1 right")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "No line yet" })?.textContent ?? "").not.toContain("2, 8");
  });

  it("says a strike ball move as a direction, not a sign", async () => {
    await upsertSpareLine([7], { stance: 35, target: 20 }, undefined, { stance: 2, target: -1 });
    render(<SpareLinesView onBack={vi.fn()} />);
    const card = await screen.findByRole("button", { name: "Open spare line for pins 7" });
    expect(within(card).getByText("2 left")).toBeInTheDocument();
    expect(within(card).getByText("1 right")).toBeInTheDocument();
  });

  it("offers a line for the same shot, and Add opens it filled in to change before saving", async () => {
    await upsertSpareLine([2, 4, 5, 8], { stance: 25, target: 12 }, undefined, { stance: 2 });
    await upsertSpareLine([2, 4, 8]);
    render(<SpareLinesView onBack={vi.fn()} />);

    expect(await screen.findByText(/is\s+likely the same shot as/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    // The form for that leave, open to edit, with the offered line in it.
    expect(await screen.findByRole("button", { name: "Save spare line" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("25")).toBeInTheDocument();
    expect(screen.getByDisplayValue("12")).toBeInTheDocument();
    // Nothing is written until it is saved.
    expect((await getSpareLinesAll()).find((sl) => sl.pins.join("-") === "2-4-8")?.line).toBeUndefined();

    fireEvent.click(screen.getByRole("button", { name: "Save spare line" }));
    await waitFor(async () => {
      const copied = (await getSpareLinesAll()).find((sl) => sl.pins.join("-") === "2-4-8");
      expect(copied?.line).toEqual({ stance: 25, target: 12 });
      expect(copied?.strike_offset).toEqual({ stance: 2 });
    });
  });

  it("asks for the leave left most with no line, Add opens it, and the X puts it away for a while", async () => {
    await upsertSpareLine([4, 6]);
    await seedHistoryWithLeave([4, 6], 4);
    render(<SpareLinesView onBack={vi.fn()} />);

    expect(await screen.findByText(/most often/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    await waitFor(() => expect(screen.queryByText(/most often/)).toBeNull());
    // Turned down for now, not for good: it is a snooze with an end.
    const stored = await db.settings.get("spareLineHintSnoozes");
    expect(Object.keys(JSON.parse(stored?.value ?? "{}"))).toEqual(["ask:4-6"]);
  });

  it("lets the spare ball be chosen here, one at a time", async () => {
    await addBall({ name: "Plastic", is_spare_ball: false, weight: 15 });
    await addBall({ name: "Other", is_spare_ball: false, weight: 15 });
    render(<SpareLinesView onBack={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: /Spare ball.*Choose one/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Plastic" }));
    await waitFor(async () => expect((await getBalls()).filter((b) => b.is_spare_ball).map((b) => b.name)).toEqual(["Plastic"]));
    expect(await screen.findByRole("button", { name: /Spare ball.*Plastic/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Spare ball.*Plastic/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Other" }));
    await waitFor(async () => expect((await getBalls()).filter((b) => b.is_spare_ball).map((b) => b.name)).toEqual(["Other"]));
  });

  it("filters by the pins picked on the deck, and by exactly those pins", async () => {
    await upsertSpareLine([2, 10], { stance: 25, target: 12 });
    await upsertSpareLine([3, 10], { stance: 25, target: 12 });
    render(<SpareLinesView onBack={vi.fn()} />);
    await screen.findByRole("button", { name: "Open spare line for pins 2, 10" });

    // jsdom has no pointer capture, which the deck takes on a press.
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
    fireEvent.click(screen.getByRole("button", { name: "Pins" }));
    const sheet = await screen.findByRole("dialog", { name: "Pins" });
    // The deck is a pointer gesture, as on the scorer.
    fireEvent.pointerDown(within(sheet).getByRole("button", { name: /Pin 2 (down|standing)/ }));
    fireEvent.pointerUp(window);
    fireEvent.pointerDown(within(sheet).getByRole("button", { name: /Pin 10 (down|standing)/ }));
    fireEvent.pointerUp(window);
    // Every leave with both: the 2-10 only.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Open spare line for pins 3, 10" })).toBeNull()
    );
    expect(screen.getByRole("button", { name: "Open spare line for pins 2, 10" })).toBeInTheDocument();
  });

  it("does not ask again about a suggestion turned down", async () => {
    await upsertSpareLine([2, 4, 5, 8], { stance: 25, target: 12 });
    await upsertSpareLine([2, 4, 8]);
    const { unmount } = render(<SpareLinesView onBack={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Not the same shot" }));
    await waitFor(() => expect(screen.queryByText(/likely the same shot/)).toBeNull());
    unmount();

    render(<SpareLinesView onBack={vi.fn()} />);
    await screen.findByRole("button", { name: /Open spare line for pins 2, 4, 8/ });
    expect(screen.queryByText(/likely the same shot/)).toBeNull();
  });

  it("filters the list with chips, and All clears them", async () => {
    await upsertSpareLine([2, 8], { stance: 25, target: 12 });
    await upsertSpareLine([10], { stance: 15, target: 10 });
    render(<SpareLinesView onBack={vi.fn()} />);
    await screen.findByRole("button", { name: "Open spare line for pins 2, 8" });

    fireEvent.click(screen.getByRole("button", { name: "Sleepers" }));
    expect(screen.getAllByRole("button", { name: /^Open spare line/ })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "No line yet" }));
    expect(screen.getByText("Nothing matches")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getAllByRole("button", { name: /^Open spare line/ }).length).toBeGreaterThan(1);
  });
});
