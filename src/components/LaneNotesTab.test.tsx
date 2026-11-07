import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LaneNotesTab } from "./LaneNotesTab";
import type { LaneNote } from "../types/bowling";

const NOTES: LaneNote[] = [{ id: 7, alley: "Pinecrest", lane: "11", notes: "Hooks early" }];
const upsertLaneNote = vi.fn((..._args: unknown[]) => Promise.resolve());

vi.mock("../services/ballRepository", () => ({
  getLaneNotes: () => Promise.resolve(NOTES),
  upsertLaneNote: (...args: unknown[]) => upsertLaneNote(...args),
  deleteLaneNote: () => Promise.resolve()
}));

// jsdom has no layout, so the scroll to the current pair is a no-op.
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

describe("the session sheet's lane notes", () => {
  it("edits a note in the Lane notes screen's sheet, not in the cell", async () => {
    render(<LaneNotesTab alley="Pinecrest" currentLanes={["11", "12"]} />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit lane 11 notes" }));

    const sheet = await screen.findByRole("dialog", { name: "Edit lane note" });
    expect(sheet).toHaveTextContent("Pinecrest");
    expect(screen.getByLabelText("Notes")).toHaveValue("Hooks early");
    // The sheet holds the delete, as it does on the Lane notes screen.
    expect(screen.getByRole("button", { name: "Delete note" })).toBeInTheDocument();
  });

  it("adds a note to an empty lane with its alley and lane already set", async () => {
    upsertLaneNote.mockClear();
    render(<LaneNotesTab alley="Pinecrest" currentLanes={["11", "12"]} />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit lane 12 notes" }));

    await screen.findByRole("dialog", { name: "Add lane note" });
    expect(screen.queryByLabelText("Alley")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete note" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "Dry right" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(upsertLaneNote).toHaveBeenCalledWith("Pinecrest", "12", "Dry right"));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add lane note" })).not.toBeInTheDocument());
  });
});
