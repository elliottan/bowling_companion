import { Pencil, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ConfirmDialog } from "./ConfirmDialog";
import { deleteLaneNote, getLaneNotes, upsertLaneNote } from "../services/ballRepository";
import type { LaneNote } from "../types/bowling";
import { Button } from "./ui/Button";
import { IconButton } from "./ui/IconButton";
import { EmptyState } from "./ui/EmptyState";
import { LanePairIcon } from "./icons";
import { FIELD_DENSE_TEXTAREA } from "./ui/field";

interface LaneNotesTabProps {
  alley: string;
  /** The active game's lanes (lower-first); highlighted and scrolled into view. */
  currentLanes: string[];
}

interface PairRow {
  leftLaneNum: number; // odd lane number anchoring the physical pair
  left: string;
  right: string;
  leftNote?: LaneNote;
  rightNote?: LaneNote;
}

// A stable empty list: `?? []` would be a new array on every render, which
// invalidates every useMemo downstream of it.
const NO_NOTES: LaneNote[] = [];

/** The lower (odd) lane of the physical pair a lane belongs to. */
function pairLeft(n: number): number {
  return n % 2 === 1 ? n : n - 1;
}

/**
 * Lane notes for one alley, laid out as physical pairs (odd lane left, even lane
 * right) just like the session sheet. Shows every pair with a note plus the
 * active game's pair, scrolls to it, and allows quick inline edits.
 */
export function LaneNotesTab({ alley, currentLanes }: LaneNotesTabProps) {
  // Live, and re-run when the alley changes: editing a note here or on the
  // Lane notes screen shows up either way.
  const live = useLiveQuery(
    async () => (await getLaneNotes()).filter((n) => n.alley === alley),
    [alley]
  );
  const notes = live ?? NO_NOTES;
  const loading = live === undefined;
  const [editingLane, setEditingLane] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pendingDelete, setPendingDelete] = useState<LaneNote | null>(null);
  const currentRowRef = useRef<HTMLDivElement | null>(null);

  const currentLaneSet = useMemo(
    () => new Set(currentLanes.filter(Boolean)),
    [currentLanes]
  );
  const currentPairLeft = currentLanes.length ? pairLeft(Number(currentLanes[0])) : null;

  const rows = useMemo<PairRow[]>(() => {
    const byLeft = new Map<number, PairRow>();
    const ensure = (leftNum: number) => {
      let row = byLeft.get(leftNum);
      if (!row) {
        row = { leftLaneNum: leftNum, left: String(leftNum), right: String(leftNum + 1) };
        byLeft.set(leftNum, row);
      }
      return row;
    };
    for (const note of notes) {
      const n = Number(note.lane);
      if (!Number.isFinite(n)) continue;
      const row = ensure(pairLeft(n));
      if (n % 2 === 1) row.leftNote = note;
      else row.rightNote = note;
    }
    // Always surface the active game's pair so empty lanes are still addable.
    for (const lane of currentLaneSet) {
      const n = Number(lane);
      if (Number.isFinite(n)) ensure(pairLeft(n));
    }
    return [...byLeft.values()].sort((a, b) => a.leftLaneNum - b.leftLaneNum);
  }, [notes, currentLaneSet]);

  useEffect(() => {
    if (!loading) currentRowRef.current?.scrollIntoView({ block: "center" });
  }, [loading, rows]);

  async function save(lane: string) {
    await upsertLaneNote(alley, lane, draft.trim());
    setEditingLane(null);
  }

  async function remove(note: LaneNote) {
    if (note.id == null) return;
    await deleteLaneNote(note.id);
    setEditingLane(null);
  }

  if (loading) return <p className="px-1 py-4 text-sm text-ink-secondary">Loading…</p>;
  if (rows.length === 0)
    return (
      <EmptyState
        icon={LanePairIcon}
        title={`No lanes yet for ${alley}`}
        description="Set the lanes on a game and the pair shows up here, ready for a note."
      />
    );

  function openEdit(lane: string, note?: LaneNote) {
    setEditingLane(lane);
    setDraft(note?.notes ?? "");
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div
          key={row.leftLaneNum}
          ref={row.leftLaneNum === currentPairLeft ? currentRowRef : undefined}
          className="grid grid-cols-2 gap-2 scroll-mt-2"
        >
          <LaneCell
            lane={row.left}
            note={row.leftNote}
            current={currentLaneSet.has(row.left)}
            editing={editingLane === row.left}
            draft={draft}
            onDraft={setDraft}
            onEdit={() => openEdit(row.left, row.leftNote)}
            onCancel={() => setEditingLane(null)}
            onSave={() => save(row.left)}
            onDelete={row.leftNote ? () => setPendingDelete(row.leftNote!) : undefined}
          />
          <LaneCell
            lane={row.right}
            note={row.rightNote}
            current={currentLaneSet.has(row.right)}
            editing={editingLane === row.right}
            draft={draft}
            onDraft={setDraft}
            onEdit={() => openEdit(row.right, row.rightNote)}
            onCancel={() => setEditingLane(null)}
            onSave={() => save(row.right)}
            onDelete={row.rightNote ? () => setPendingDelete(row.rightNote!) : undefined}
          />
        </div>
      ))}
      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Delete the note for lane ${pendingDelete?.lane ?? ""}?`}
        message="What you wrote about how this lane plays is gone. Nothing else changes."
        onConfirm={() => {
          const note = pendingDelete;
          setPendingDelete(null);
          if (note) void remove(note);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

interface LaneCellProps {
  lane: string;
  note?: LaneNote;
  current: boolean;
  editing: boolean;
  draft: string;
  onDraft: (s: string) => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onDelete?: () => void;
}

function LaneCell({
  lane,
  note,
  current,
  editing,
  draft,
  onDraft,
  onEdit,
  onCancel,
  onSave,
  onDelete
}: LaneCellProps) {
  return (
    <div
      className={`rounded-lg border p-2.5 ${
        current ? "border-accent-fill bg-accent-fill/5" : "border-edge bg-surface"
      }`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="text-[11px] font-bold uppercase tracking-wide text-ink-secondary">
          Lane {lane}
        </span>
        {!editing && (
          <IconButton onClick={onEdit} label={`Edit lane ${lane} notes`}>
            <Pencil size={12} aria-hidden="true" />
          </IconButton>
        )}
      </div>
      {editing ? (
        <div className="mt-1.5 space-y-1.5">
          <textarea
            value={draft}
            onChange={(e) => onDraft(e.target.value)}
            rows={3}
            autoFocus
            placeholder="How this lane plays…"
            className={FIELD_DENSE_TEXTAREA}
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <Button variant="primary" onClick={onSave} className="text-xs">
              Save
            </Button>
            <Button variant="secondary" onClick={onCancel} className="text-xs">
              Cancel
            </Button>
            {onDelete && (
              <IconButton onClick={onDelete} label={`Delete lane ${lane} notes`} variant="danger" className="ml-auto">
                <Trash2 size={13} aria-hidden="true" />
              </IconButton>
            )}
          </div>
        </div>
      ) : note?.notes ? (
        <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-snug text-ink-secondary">
          {note.notes}
        </p>
      ) : (
        <p className="mt-1 text-xs italic text-ink-tertiary">No notes</p>
      )}
    </div>
  );
}
