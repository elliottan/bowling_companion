import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ConfirmDialog } from "./ConfirmDialog";
import { SpareLineFormDialog } from "./SpareLineFormDialog";
import { deleteSpareLine, findSpareLineByPins, getSpareLinesAll } from "../services/ballRepository";
import type { LeaveStats } from "../lib/stats";
import { hasAnswer } from "../lib/spareLines";
import type { PinNumber, SpareLine } from "../types/bowling";

interface SpareDetailsSheetProps {
  /** The leave to show. Empty adds a new line, with the deck open to pick it. */
  pins: PinNumber[];
  /** The record each leave is shown with: filtered on Stats, all of it on the
   *  spare lines screen. */
  leaves?: LeaveStats[];
  /** Open straight into editing, for a leave the bowler came here to fill in. */
  edit?: boolean;
  /** A line to start from when the leave has none of its own, still editable:
   *  the line a suggestion offered to copy. */
  prefill?: Pick<SpareLine, "line" | "strike_offset">;
  onClose: () => void;
}

/**
 * One leave's details: its record and its saved line, read first and edited
 * behind the pencil. Opened from a spare line tile, from a leave on Stats, and
 * from the spare lines screen's add. It finds the saved line itself, so a
 * caller only has to say which leave.
 */
export function SpareDetailsSheet({ pins, leaves, edit = false, prefill, onClose }: SpareDetailsSheetProps) {
  const spareLines = useLiveQuery(() => getSpareLinesAll());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");

  // The form holds its fields from mount, so it waits for the saved line.
  if (spareLines === undefined) return null;
  const saved = pins.length ? findSpareLineByPins(spareLines, pins) : undefined;
  const adding = pins.length === 0;
  // What the form opens on: the saved answer, or the line it was offered.
  const start = hasAnswer(saved) || !prefill ? saved : { ...saved, ...prefill };

  async function handleDelete() {
    const id = saved?.id;
    setConfirmDelete(false);
    if (id == null) return;
    try {
      await deleteSpareLine(id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete spare line.");
    }
  }

  return (
    <>
      <SpareLineFormDialog
        key={pins.join("-") || "add"}
        initialPins={pins}
        lockPins={!adding}
        initialLine={start?.line}
        initialStrikeOffset={start?.strike_offset}
        initialNotes={saved?.notes}
        startInView={!adding && !edit}
        leaves={leaves}
        spareLines={spareLines}
        onSaved={onClose}
        onCancel={onClose}
        onDelete={saved?.id != null ? () => setConfirmDelete(true) : undefined}
        covered={confirmDelete}
        error={error}
      />
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this spare line?"
        message="The stance and target you saved for this leave are gone. Your shots keep their scores."
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
