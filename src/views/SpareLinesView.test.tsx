import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SpareLinesView } from "./SpareLinesView";
import { db } from "../db/bowlingDb";
import { getSpareLinesAll } from "../services/ballRepository";

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
    const cards = await screen.findAllByRole("button", { name: /Edit spare line for pins/ });
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
});
