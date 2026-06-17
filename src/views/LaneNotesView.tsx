import { Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          {error}
        </p>
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

      {isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : laneNotes.length === 0 ? (
        <p className="text-sm text-slate-500">No lane notes yet.</p>
      ) : (
        <ul className="space-y-2">
          {laneNotes.map((n) => (
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
