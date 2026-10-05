import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SpareLinesView } from "./SpareLinesView";
import { db } from "../db/bowlingDb";
import { getSpareLinesAll, upsertSpareLine } from "../services/ballRepository";

/**
 * Deleting a spare line used to fire straight off the form's Delete button.
 * The line is hand-tuned over a season and there is no undo behind it, so it
 * now goes through the same confirm every other destructive action uses.
 */
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

  it("stacks leaves that share a line on one tile, and flips through them", async () => {
    await upsertSpareLine([2, 4, 5, 8], { stance: 25, target: 12 });
    await upsertSpareLine([2, 4, 8], { stance: 25, target: 12 });
    render(<SpareLinesView onBack={vi.fn()} />);

    const flip = await screen.findByRole("button", { name: /Next leave with this line, 1 of 2/ });
    expect(screen.getByRole("button", { name: "Open spare line for pins 2, 4, 5, 8" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open spare line for pins 2, 4, 8" })).toBeNull();

    fireEvent.click(flip);
    expect(screen.getByRole("button", { name: "Open spare line for pins 2, 4, 8" })).toBeInTheDocument();
  });

  it("offers a line for the same shot, and copies it on one tap", async () => {
    await upsertSpareLine([2, 4, 5, 8], { stance: 25, target: 12 }, undefined, { stance: 2 });
    await upsertSpareLine([2, 4, 8]);
    render(<SpareLinesView onBack={vi.fn()} />);

    expect(await screen.findByText(/is\s+likely the same shot as/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use line" }));

    await waitFor(async () => {
      const copied = (await getSpareLinesAll()).find((sl) => sl.pins.join("-") === "2-4-8");
      expect(copied?.line).toEqual({ stance: 25, target: 12 });
      expect(copied?.strike_offset).toEqual({ stance: 2 });
    });
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
