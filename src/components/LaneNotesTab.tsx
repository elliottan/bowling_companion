import { Pencil, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { deleteLaneNote, getLaneNotes, upsertLaneNote } from "../services/ballRepository";
import type { LaneNote } from "../types/bowling";

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
  const [notes, setNotes] = useState<LaneNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingLane, setEditingLane] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const currentRowRef = useRef<HTMLDivElement | null>(null);

  async function load() {
    const all = await getLaneNotes();
    setNotes(all.filter((n) => n.alley === alley));
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alley]);

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
    await load();
  }

  async function remove(note: LaneNote) {
    if (note.id == null) return;
    await deleteLaneNote(note.id);
    setEditingLane(null);
    await load();
  }

  if (loading) return <p className="px-1 py-4 text-sm text-slate-500">Loading…</p>;
  if (rows.length === 0)
    return <p className="px-1 py-4 text-sm text-slate-500">No lanes to show for {alley}.</p>;

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
            onDelete={row.leftNote ? () => remove(row.leftNote!) : undefined}
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
            onDelete={row.rightNote ? () => remove(row.rightNote!) : undefined}
          />
        </div>
      ))}
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
        current ? "border-felt-700 bg-felt-700/5" : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
          Lane {lane}
        </span>
        {!editing && (
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit lane ${lane} notes`}
            className="text-slate-400 hover:text-slate-700"
          >
            <Pencil size={12} aria-hidden="true" />
          </button>
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
            className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs outline-none focus:border-felt-700"
          />
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onSave}
              className="rounded-md bg-felt-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-felt-500"
            >
              Save
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                aria-label={`Delete lane ${lane} notes`}
                className="ml-auto text-slate-400 hover:text-red-600"
              >
                <Trash2 size={13} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      ) : note?.notes ? (
        <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-snug text-slate-600">
          {note.notes}
        </p>
      ) : (
        <p className="mt-1 text-xs italic text-slate-300">No notes</p>
      )}
    </div>
  );
}
