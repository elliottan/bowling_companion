import { MapPin, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ErrorBanner } from "../components/ErrorBanner";
import { PushScreen } from "../components/PushScreen";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { Chip } from "../components/ui/Chip";
import { IconButton } from "../components/ui/IconButton";
import {
  deleteLaneNote,
  getLaneNotes,
  upsertLaneNote
} from "../services/ballRepository";
import { getDistinctAlleys } from "../services/bowlingRepository";
import type { LaneNote } from "../types/bowling";
import { GROUP_HEADING } from "../components/ui/typography";
import { FIELD } from "../components/ui/field";

const isPositiveInt = (s: string) => /^\d+$/.test(s.trim());

// A stable empty list: `?? []` would be a new array on every render, which
// invalidates every useMemo downstream of it.
const NO_NOTES: LaneNote[] = [];
const NO_ALLEYS: string[] = [];

interface LaneNotesViewProps {
  /** Present when pushed as a screen — draws the shared nav bar. */
  onBack?: () => void;
  /** `overlay` when pushed over another tab, `inline` inside Settings. */
  mode?: "inline" | "overlay";
}

export function LaneNotesView({ onBack, mode = "inline" }: LaneNotesViewProps = {}) {
  // Live: writing a note updates the list, with no refresh call per site.
  const liveNotes = useLiveQuery(() => getLaneNotes());
  const liveAlleys = useLiveQuery(() => getDistinctAlleys());
  const laneNotes = liveNotes ?? NO_NOTES;
  const alleys = liveAlleys ?? NO_ALLEYS;
  const isLoading = liveNotes === undefined;
  const [error, setError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [alley, setAlley] = useState("");
  const [showAlleyList, setShowAlleyList] = useState(false);
  const [lane, setLane] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState("");

  // List filters (mirrors the History page): location dropdown, then lane chips.
  const [filterAlley, setFilterAlley] = useState("");
  const [selectedLanes, setSelectedLanes] = useState<string[]>([]);

  const noteAlleys = useMemo(
    () => [...new Set(laneNotes.map((n) => n.alley))].sort(),
    [laneNotes]
  );
  // Lanes are only meaningful within a location, so offer them only once an
  // alley is picked — and only the lanes that have notes at that alley.
  const noteLanes = useMemo(() => {
    if (!filterAlley) return [];
    return [...new Set(laneNotes.filter((n) => n.alley === filterAlley).map((n) => n.lane))]
      .sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
  }, [laneNotes, filterAlley]);

  // Only the lanes that exist at the chosen location count. Derived rather
  // than reset in an effect when the location changes: a selection left over
  // from another alley simply stops applying, with no extra render where the
  // list is filtered by a lane that is not on screen.
  const activeLanes = useMemo(
    () => selectedLanes.filter((l) => noteLanes.includes(l)),
    [selectedLanes, noteLanes]
  );

  const displayedNotes = useMemo(
    () =>
      laneNotes.filter((n) => {
        if (filterAlley && n.alley !== filterAlley) return false;
        if (activeLanes.length > 0 && !activeLanes.includes(n.lane)) return false;
        return true;
      }),
    [laneNotes, filterAlley, activeLanes]
  );

  function toggleLane(lane: string) {
    setSelectedLanes((prev) =>
      prev.includes(lane) ? prev.filter((l) => l !== lane) : [...prev, lane]
    );
  }

  const alleyMatches = useMemo(() => {
    const q = alley.trim().toLowerCase();
    const list = q ? alleys.filter((a) => a.toLowerCase().includes(q) && a.toLowerCase() !== q) : alleys;
    return list.slice(0, 6);
  }, [alley, alleys]);

  function openAdd() {
    setEditingId(null);
    setAlley("");
    setLane("");
    setNotes("");
    setFormError("");
    setShowForm(true);
  }

  function openEdit(n: LaneNote) {
    setEditingId(n.id ?? null);
    setAlley(n.alley);
    setLane(n.lane);
    setNotes(n.notes);
    setFormError("");
    setShowForm(true);
  }

  function cancel() {
    setShowForm(false);
    setEditingId(null);
  }

  async function submit() {
    if (!alley.trim() || !lane.trim()) {
      setFormError("Alley and lane are required.");
      return;
    }
    if (!isPositiveInt(lane)) {
      setFormError("Lane must be a whole number.");
      return;
    }
    try {
      await upsertLaneNote(alley, lane, notes.trim());
      cancel();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save.");
    }
  }

  async function remove(id: number) {
    try {
      await deleteLaneNote(id);
      cancel();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete.");
    }
  }

  const body = (
    <section className="mx-auto w-full max-w-3xl px-3 py-4 sm:px-6">

      {error && (
        <ErrorBanner className="mb-3">{error}</ErrorBanner>
      )}

      {showForm && (
        <div className="mb-4 rounded-lg border border-edge bg-surface p-4 shadow-sm">
          <h2 className="mb-3 text-base font-semibold text-ink">
            {editingId !== null ? "Edit lane note" : "Add lane note"}
          </h2>
          {formError && <p className="mb-3 text-sm font-semibold text-danger-700">{formError}</p>}
          <div className="space-y-3">
            <label className="block space-y-1.5">
              <span className={GROUP_HEADING}>Alley</span>
              <div className="relative">
                <input
                  value={alley}
                  onChange={(e) => { setAlley(e.target.value); setShowAlleyList(true); }}
                  onFocus={() => setShowAlleyList(true)}
                  onBlur={() => setTimeout(() => setShowAlleyList(false), 120)}
                  disabled={editingId !== null}
                  placeholder="Orchid Bowl"
                  autoComplete="off"
                  className={`${FIELD} disabled:bg-surface-muted disabled:text-ink-secondary`}
                />
                {showAlleyList && alleyMatches.length > 0 && (
                  <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-edge bg-surface py-1 shadow-lg">
                    {alleyMatches.map((a) => (
                      <li key={a}>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => { setAlley(a); setShowAlleyList(false); }}
                          className="block w-full px-3 py-2 text-left text-sm text-ink-strong hover:bg-surface-muted"
                        >
                          {a}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </label>
            <label className="block space-y-1.5">
              <span className={GROUP_HEADING}>Lane</span>
              <input
                value={lane}
                onChange={(e) => setLane(e.target.value)}
                disabled={editingId !== null}
                inputMode="numeric"
                placeholder="12"
                className="h-11 w-32 rounded-lg border border-edge-strong px-3 text-sm outline-none focus:border-accent-fill disabled:bg-surface-muted"
              />
            </label>
            <label className="block space-y-1.5">
              <span className={GROUP_HEADING}>Notes</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="How this lane plays: transition, where it hooks, ball reaction…"
                className="w-full rounded-lg border border-edge-strong px-3 py-2 text-sm outline-none focus:border-accent-fill"
              />
            </label>
            <div className="flex items-center gap-2 pt-1">
              <Button variant="primary" onClick={submit}>
                {editingId !== null ? "Save" : "Add"}
              </Button>
              <Button variant="secondary" onClick={cancel}>
                Cancel
              </Button>
              {editingId !== null && (
                <Button variant="secondary" onClick={() => remove(editingId)} className="ml-auto">
                  <Trash2 size={14} aria-hidden="true" />
                  Delete
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {!showForm && laneNotes.length > 0 && (
        <>
          <div className="mb-3">
            <select
              value={filterAlley}
              onChange={(e) => setFilterAlley(e.target.value)}
              className="h-9 rounded-lg border border-edge-strong bg-surface px-2 text-sm outline-none focus:border-accent-fill"
            >
              <option value="">All locations</option>
              {noteAlleys.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          {noteLanes.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className={GROUP_HEADING}>Lanes</span>
              {noteLanes.map((l) => (
                <Chip key={l} selected={activeLanes.includes(l)} onClick={() => toggleLane(l)}>
                  {l}
                </Chip>
              ))}
              {activeLanes.length > 0 && (
                <Button variant="ghost" className="px-2 text-xs font-medium text-ink-secondary" onClick={() => setSelectedLanes([])}>
                  Clear
                </Button>
              )}
            </div>
          )}
        </>
      )}

      {isLoading ? (
        <p className="text-sm text-ink-secondary">Loading…</p>
      ) : laneNotes.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="No lane notes yet"
          description="Save how a lane plays: where it hooks, when it transitions. It will be here next time you bowl there."
        >
          <Button variant="primary" size="lg" onClick={openAdd}>
            <Plus size={18} aria-hidden="true" />
            Add a lane note
          </Button>
        </EmptyState>
      ) : displayedNotes.length === 0 ? (
        <p className="text-sm text-ink-secondary">No notes match the current filters.</p>
      ) : (
        <ul className="space-y-2">
          {displayedNotes.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => openEdit(n)}
                className="block w-full rounded-lg border border-edge bg-surface p-3 text-left shadow-sm hover:border-accent-fill"
              >
                <p className="font-semibold text-ink">
                  {n.alley} · Lane {n.lane}
                </p>
                <p className="mt-0.5 text-sm text-ink-secondary">{n.notes || "-"}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  if (!onBack) return body;

  return (
    <PushScreen
      mode={mode}
      title="Lane notes"
      onBack={onBack}
      trailing={
        !showForm && (
          <IconButton onClick={openAdd} label="Add lane note" variant="round">
            <Plus size={24} aria-hidden="true" />
          </IconButton>
        )
      }
    >
      {body}
    </PushScreen>
  );
}
