import { t } from "@lingui/core/macro";
import { Pencil } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { getLaneNotes } from "../services/ballRepository";
import type { LaneNote } from "../types/bowling";
import { IconButton } from "./ui/IconButton";
import { EmptyState } from "./ui/EmptyState";
import { LanePairIcon } from "./icons";
import { LaneNoteFormDialog } from "./LaneNoteFormDialog";

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
 * active game's pair, and scrolls to it. A lane's pencil opens the same edit
 * sheet the Lane notes screen uses (`LaneNoteFormDialog`), not an editor in
 * the cell: one way to change a note, wherever it is opened from.
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
  // The note open in the edit sheet. A lane with no note yet opens one with
  // no id, its alley and lane already set.
  const [editing, setEditing] = useState<LaneNote | null>(null);
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

  if (loading) return <p className="px-1 py-4 text-sm text-ink-secondary">{t`Loading…`}</p>;
  if (rows.length === 0)
    return (
      <EmptyState icon={LanePairIcon} title={t`No lane notes yet`} />
    );

  const open = (lane: string, note?: LaneNote) => setEditing(note ?? { alley, lane, notes: "" });

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
            onEdit={() => open(row.left, row.leftNote)}
          />
          <LaneCell
            lane={row.right}
            note={row.rightNote}
            current={currentLaneSet.has(row.right)}
            onEdit={() => open(row.right, row.rightNote)}
          />
        </div>
      ))}
      {/* To the body: the session sheet's panel carries a transform, which
          would hold a fixed sheet inside it rather than over the screen. */}
      {editing &&
        createPortal(
          <LaneNoteFormDialog
            key={editing.id ?? `new-${editing.lane}`}
            note={editing}
            alleys={[alley]}
            onClose={() => setEditing(null)}
            onSaved={() => setEditing(null)}
          />,
          document.body
        )}
    </div>
  );
}

interface LaneCellProps {
  lane: string;
  note?: LaneNote;
  current: boolean;
  onEdit: () => void;
}

function LaneCell({ lane, note, current, onEdit }: LaneCellProps) {
  return (
    <div
      className={`rounded-lg border p-2.5 ${
        current ? "border-accent-fill bg-accent-fill/5" : "border-edge bg-surface"
      }`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="text-caption-2 font-bold uppercase tracking-wide text-ink-secondary">
          {t`Lane ${{ lane }}`}
        </span>
        <IconButton compact onClick={onEdit} label={t`Edit lane ${{ lane }} notes`}>
          <Pencil size={15} aria-hidden="true" />
        </IconButton>
      </div>
      {note?.notes ? (
        <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-snug text-ink-secondary">
          {note.notes}
        </p>
      ) : (
        <p className="mt-1 text-xs italic text-ink-tertiary">{t`No notes`}</p>
      )}
    </div>
  );
}
