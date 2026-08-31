import { Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { deleteLaneNote, upsertLaneNote } from "../services/ballRepository";
import type { LaneNote } from "../types/bowling";
import { ConfirmDialog } from "./ConfirmDialog";
import { ErrorBanner } from "./ErrorBanner";
import { Button } from "./ui/Button";
import { FormSheet } from "./ui/FormSheet";
import { FIELD, FIELD_LABEL, FIELD_TEXTAREA } from "./ui/field";

const isPositiveInt = (s: string) => /^\d+$/.test(s.trim());

interface LaneNoteFormDialogProps {
  /** The note being edited, or null when adding a new one. */
  note: LaneNote | null;
  /** Every alley the user has bowled at, for the add form's suggestions. */
  alleys: string[];
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Add / edit one lane note. A sheet rather than a panel spliced into the list,
 * which is what this was: the inline form pushed the whole list down the screen
 * and put its own save button wherever the note happened to end (§1a, and the
 * same mistake the ball editor already made once).
 *
 * Editing does not re-open the alley and lane fields. They are the note's
 * identity, not fields of it, so they read as a header and the sheet is about
 * the one thing you actually came to change.
 */
export function LaneNoteFormDialog({ note, alleys, onClose, onSaved }: LaneNoteFormDialogProps) {
  const editing = note !== null;
  const [alley, setAlley] = useState(note?.alley ?? "");
  const [showAlleyList, setShowAlleyList] = useState(false);
  const [lane, setLane] = useState(note?.lane ?? "");
  const [notes, setNotes] = useState(note?.notes ?? "");
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const alleyMatches = useMemo(() => {
    const q = alley.trim().toLowerCase();
    const list = q
      ? alleys.filter((a) => a.toLowerCase().includes(q) && a.toLowerCase() !== q)
      : alleys;
    return list.slice(0, 6);
  }, [alley, alleys]);

  async function submit() {
    if (!alley.trim() || !lane.trim()) {
      setError("Alley and lane are required.");
      return;
    }
    if (!isPositiveInt(lane)) {
      setError("Lane must be a whole number.");
      return;
    }
    try {
      await upsertLaneNote(alley, lane, notes.trim());
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    }
  }

  async function remove() {
    if (note?.id == null) return;
    try {
      await deleteLaneNote(note.id);
      onSaved();
    } catch (err) {
      setConfirmDelete(false);
      setError(err instanceof Error ? err.message : "Failed to delete.");
    }
  }

  return (
    <>
      <FormSheet
        title={editing ? "Edit lane note" : "Add lane note"}
        onClose={onClose}
        onConfirm={() => void submit()}
        confirmLabel={editing ? "Save" : "Add"}
        banner={error ? <ErrorBanner>{error}</ErrorBanner> : undefined}
      >
        <div className="space-y-4">
          {editing ? (
            <div className="flex items-center gap-3 rounded-xl border border-edge bg-surface p-3">
              <LaneBadge lane={note.lane} />
              <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{note.alley}</p>
            </div>
          ) : (
            <>
              <div>
                <label htmlFor="lane-note-alley" className={FIELD_LABEL}>
                  Alley
                </label>
                <div className="relative">
                  <input
                    id="lane-note-alley"
                    value={alley}
                    onChange={(e) => {
                      setAlley(e.target.value);
                      setShowAlleyList(true);
                    }}
                    onFocus={() => setShowAlleyList(true)}
                    onBlur={() => setTimeout(() => setShowAlleyList(false), 120)}
                    placeholder="Orchid Bowl"
                    autoComplete="off"
                    className={FIELD}
                  />
                  {showAlleyList && alleyMatches.length > 0 && (
                    <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-edge bg-surface py-1 shadow-lg">
                      {alleyMatches.map((a) => (
                        <li key={a}>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setAlley(a);
                              setShowAlleyList(false);
                            }}
                            className="block w-full px-3 py-2 text-left text-sm text-ink-strong hover:bg-surface-muted"
                          >
                            {a}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              <div>
                <label htmlFor="lane-note-lane" className={FIELD_LABEL}>
                  Lane
                </label>
                {/* Width lives on a wrapper: `FIELD` carries `w-full`, and a
                    `w-28` beside it loses to whichever Tailwind emits last. */}
                <div className="w-28">
                  <input
                    id="lane-note-lane"
                    value={lane}
                    onChange={(e) => setLane(e.target.value)}
                    inputMode="numeric"
                    placeholder="12"
                    className={FIELD}
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label htmlFor="lane-note-notes" className={FIELD_LABEL}>
              Notes
            </label>
            <textarea
              id="lane-note-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={5}
              placeholder="How this lane plays: transition, where it hooks, ball reaction…"
              className={FIELD_TEXTAREA}
            />
          </div>

          {editing && (
            <Button variant="danger-ghost" onClick={() => setConfirmDelete(true)} className="w-full">
              <Trash2 size={16} aria-hidden="true" />
              Delete note
            </Button>
          )}
        </div>
      </FormSheet>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete the note for lane ${note?.lane ?? ""}?`}
        message="What you wrote about how this lane plays is gone. Nothing else changes."
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}

/** The lane number as a plate, so a list of notes reads by lane rather than by
 *  the alley name repeated down the left edge. */
export function LaneBadge({ lane }: { lane: string }) {
  return (
    <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-accent-soft">
      <span className="text-[9px] font-semibold uppercase leading-none tracking-wide text-accent">
        Lane
      </span>
      <span className="mt-0.5 text-base font-bold leading-none tabular-nums text-accent">
        {lane}
      </span>
    </span>
  );
}
