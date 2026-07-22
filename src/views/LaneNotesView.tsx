import { Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ErrorBanner } from "../components/ErrorBanner";
import {
  deleteLaneNote,
  getLaneNotes,
  upsertLaneNote
} from "../services/ballRepository";
import { getDistinctAlleys } from "../services/bowlingRepository";
import type { LaneNote } from "../types/bowling";

const isPositiveInt = (s: string) => /^\d+$/.test(s.trim());

export function LaneNotesView() {
  const [laneNotes, setLaneNotes] = useState<LaneNote[]>([]);
  const [alleys, setAlleys] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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

  // Drop selected lanes when the location changes — a lane from another alley
  // would otherwise filter everything out.
  useEffect(() => {
    setSelectedLanes([]);
  }, [filterAlley]);

  const displayedNotes = useMemo(
    () =>
      laneNotes.filter((n) => {
        if (filterAlley && n.alley !== filterAlley) return false;
        if (selectedLanes.length > 0 && !selectedLanes.includes(n.lane)) return false;
        return true;
      }),
    [laneNotes, filterAlley, selectedLanes]
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

  async function load() {
    setIsLoading(true);
    try {
      setLaneNotes(await getLaneNotes());
      setAlleys(await getDistinctAlleys());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load lane notes.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

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
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save.");
    }
  }

  async function remove(id: number) {
    try {
      await deleteLaneNote(id);
      cancel();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete.");
    }
  }

  return (
    <section className="mx-auto w-full max-w-3xl px-3 py-5 sm:px-6 sm:py-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-950">Lane Notes</h1>
        {!showForm && (
          <button
            type="button"
            onClick={openAdd}
            aria-label="Add lane note"
            className="text-2xl leading-none text-slate-500 hover:text-slate-800 px-1"
          >
            +
          </button>
        )}
      </div>

      {error && (
        <ErrorBanner className="mb-3">{error}</ErrorBanner>
      )}

      {showForm && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-base font-semibold text-slate-950">
            {editingId !== null ? "Edit lane note" : "Add lane note"}
          </h2>
          {formError && <p className="mb-3 text-sm font-semibold text-red-600">{formError}</p>}
          <div className="space-y-3">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Alley</span>
              <div className="relative">
                <input
                  value={alley}
                  onChange={(e) => { setAlley(e.target.value); setShowAlleyList(true); }}
                  onFocus={() => setShowAlleyList(true)}
                  onBlur={() => setTimeout(() => setShowAlleyList(false), 120)}
                  disabled={editingId !== null}
                  placeholder="Orchid Bowl"
                  autoComplete="off"
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-felt-700 disabled:bg-slate-50"
                />
                {showAlleyList && alleyMatches.length > 0 && (
                  <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                    {alleyMatches.map((a) => (
                      <li key={a}>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => { setAlley(a); setShowAlleyList(false); }}
                          className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
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
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Lane</span>
              <input
                value={lane}
                onChange={(e) => setLane(e.target.value)}
                disabled={editingId !== null}
                inputMode="numeric"
                placeholder="12"
                className="h-11 w-32 rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-felt-700 disabled:bg-slate-50"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="How this lane plays — transition, where it hooks, ball reaction…"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-felt-700"
              />
            </label>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={submit}
                className="inline-flex h-10 items-center rounded-lg border border-felt-700 bg-felt-700 px-4 text-sm font-semibold text-white hover:bg-felt-600"
              >
                {editingId !== null ? "Save" : "Add"}
              </button>
              <button
                type="button"
                onClick={cancel}
                className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              {editingId !== null && (
                <button
                  type="button"
                  onClick={() => remove(editingId)}
                  className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 size={14} aria-hidden="true" />
                  Delete
                </button>
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
              className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm outline-none focus:border-felt-700"
            >
              <option value="">All locations</option>
              {noteAlleys.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          {noteLanes.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">Lanes</span>
              {noteLanes.map((l) => {
                const on = selectedLanes.includes(l);
                return (
                  <button
                    key={l}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleLane(l)}
                    className={`h-8 rounded-md border px-3 text-xs font-semibold ${
                      on ? "border-felt-700 bg-felt-700 text-white" : "border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    {l}
                  </button>
                );
              })}
              {selectedLanes.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedLanes([])}
                  className="h-8 rounded-md px-2 text-xs font-medium text-slate-500 hover:bg-slate-100"
                >
                  Clear
                </button>
              )}
            </div>
          )}
        </>
      )}

      {isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : laneNotes.length === 0 ? (
        <p className="text-sm text-slate-500">No lane notes yet.</p>
      ) : displayedNotes.length === 0 ? (
        <p className="text-sm text-slate-500">No notes match the current filters.</p>
      ) : (
        <ul className="space-y-2">
          {displayedNotes.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => openEdit(n)}
                className="block w-full rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm hover:border-felt-700"
              >
                <p className="font-semibold text-slate-950">
                  {n.alley} · Lane {n.lane}
                </p>
                <p className="mt-0.5 text-sm text-slate-600">{n.notes || "—"}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
