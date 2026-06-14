import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import type { CreateSessionInput } from "../services/bowlingRepository";
import type { OilPattern } from "../types/bowling";
import { addOilPattern, getOilPatterns } from "../services/ballRepository";
import { getDistinctAlleys } from "../services/bowlingRepository";

export interface NewSessionFormValues extends CreateSessionInput {
  lanes: string[];
  start_lane?: string;
}

interface SessionFormProps {
  onSubmit: (values: NewSessionFormValues) => Promise<void> | void;
  isSubmitting?: boolean;
}

const inputClass =
  "h-11 w-full min-w-0 box-border rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-felt-700 focus:ring-2 focus:ring-felt-700/20";

const selectClass =
  "h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-felt-700 focus:ring-2 focus:ring-felt-700/20 bg-white";

const isPositiveInt = (s: string) => /^\d+$/.test(s.trim());

export function SessionForm({ onSubmit, isSubmitting = false }: SessionFormProps) {
  const [alleyName, setAlleyName] = useState("");
  const [laneA, setLaneA] = useState("");
  const [laneB, setLaneB] = useState("");
  const [startLane, setStartLane] = useState<"A" | "B">("A");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  const [alleys, setAlleys] = useState<string[]>([]);
  const [showAlleyList, setShowAlleyList] = useState(false);

  const [oilPatterns, setOilPatterns] = useState<OilPattern[]>([]);
  const [selectedPatternId, setSelectedPatternId] = useState<number | undefined>(undefined);
  const [isAddingPattern, setIsAddingPattern] = useState(false);
  const [newPatternName, setNewPatternName] = useState("");
  const [addPatternError, setAddPatternError] = useState("");

  const [laneError, setLaneError] = useState("");

  useEffect(() => {
    getOilPatterns().then(setOilPatterns).catch(() => {});
    getDistinctAlleys().then(setAlleys).catch(() => {});
  }, []);

  const alleyMatches = useMemo(() => {
    const q = alleyName.trim().toLowerCase();
    const list = q ? alleys.filter((a) => a.toLowerCase().includes(q) && a.toLowerCase() !== q) : alleys;
    return list.slice(0, 6);
  }, [alleyName, alleys]);

  async function handleAddPattern() {
    const name = newPatternName.trim();
    if (!name) return;
    try {
      const id = await addOilPattern(name);
      const updated = await getOilPatterns();
      setOilPatterns(updated);
      setSelectedPatternId(id);
      setIsAddingPattern(false);
      setNewPatternName("");
      setAddPatternError("");
    } catch (err) {
      setAddPatternError(err instanceof Error ? err.message : "Failed to add pattern.");
    }
  }

  function validateLanes(): { lanes: string[]; start_lane?: string } | null {
    const a = laneA.trim();
    const b = laneB.trim();
    if (a && !isPositiveInt(a)) return null;
    if (b && !isPositiveInt(b)) return null;
    if (!a && b) return null; // can't have only a second lane
    const lanes = [a, b].filter(Boolean);
    if (lanes.length === 0) return { lanes: [] };
    const start_lane = lanes.length === 2 ? (startLane === "A" ? a : b) : a;
    return { lanes, start_lane };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const laneResult = validateLanes();
    if (!laneResult) {
      setLaneError("Lane numbers must be whole numbers (and enter the first lane before the second).");
      return;
    }
    setLaneError("");
    const selectedPattern = oilPatterns.find((op) => op.id === selectedPatternId);
    await onSubmit({
      alley_name: alleyName.trim(),
      lanes: laneResult.lanes,
      start_lane: laneResult.start_lane,
      date,
      oil_pattern: selectedPattern?.name,
      oil_pattern_id: selectedPatternId,
      general_notes: notes.trim() || undefined
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
    >
      <h2 className="text-lg font-bold text-slate-950">Start new session</h2>

      <div className="mt-4 space-y-3">
        <Field label="Alley">
          <div className="relative">
            <input
              required
              value={alleyName}
              onChange={(e) => { setAlleyName(e.target.value); setShowAlleyList(true); }}
              onFocus={() => setShowAlleyList(true)}
              onBlur={() => setTimeout(() => setShowAlleyList(false), 120)}
              className={inputClass}
              placeholder="Orchid Bowl"
              autoComplete="off"
            />
            {showAlleyList && alleyMatches.length > 0 && (
              <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                {alleyMatches.map((a) => (
                  <li key={a}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { setAlleyName(a); setShowAlleyList(false); }}
                      className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                    >
                      {a}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Field>

        <Field label="Lane(s)">
          <div className="flex items-center gap-2">
            <input
              value={laneA}
              onChange={(e) => setLaneA(e.target.value)}
              inputMode="numeric"
              className={inputClass}
              placeholder="12"
              aria-label="First lane"
            />
            <span className="text-slate-400">/</span>
            <input
              value={laneB}
              onChange={(e) => setLaneB(e.target.value)}
              inputMode="numeric"
              className={inputClass}
              placeholder="13 (optional)"
              aria-label="Second lane (cross-lane)"
            />
          </div>
          {laneA.trim() && laneB.trim() && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-slate-500">Frame 1 on:</span>
              {(["A", "B"] as const).map((side) => {
                const lane = side === "A" ? laneA.trim() : laneB.trim();
                return (
                  <button
                    key={side}
                    type="button"
                    onClick={() => setStartLane(side)}
                    className={`h-8 rounded-md border px-3 text-xs font-semibold ${
                      startLane === side
                        ? "border-felt-700 bg-felt-700 text-white"
                        : "border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    {lane}
                  </button>
                );
              })}
            </div>
          )}
          {laneError && <p className="mt-1 text-xs text-red-600">{laneError}</p>}
        </Field>

        <Field label="Date">
          <input
            required
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      <details className="group mt-4 rounded-lg border border-slate-200 bg-slate-50/50">
        <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-slate-700 marker:hidden group-open:border-b group-open:border-slate-200">
          More details
          <span className="float-right text-slate-400 group-open:rotate-180">▾</span>
        </summary>
        <div className="space-y-3 p-3">
          <Field label="Oil pattern">
            {!isAddingPattern ? (
              <select
                value={selectedPatternId ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "__add_new__") {
                    setIsAddingPattern(true);
                    setNewPatternName("");
                  } else {
                    setSelectedPatternId(val ? Number(val) : undefined);
                  }
                }}
                className={selectClass}
              >
                <option value="">No pattern / unknown</option>
                {oilPatterns.map((op) => (
                  <option key={op.id} value={op.id}>{op.name}</option>
                ))}
                <option value="__add_new__">+ Add new pattern</option>
              </select>
            ) : (
              <>
                <div className="flex gap-2">
                  <input
                    autoFocus
                    value={newPatternName}
                    onChange={(e) => setNewPatternName(e.target.value)}
                    className={inputClass + " flex-1"}
                    placeholder="Pattern name"
                    onKeyDown={(e) => { if (e.key === "Escape") setIsAddingPattern(false); }}
                  />
                  <button
                    type="button"
                    onClick={handleAddPattern}
                    className="h-11 rounded-lg bg-felt-700 px-3 text-sm font-semibold text-white hover:bg-felt-500"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAddingPattern(false)}
                    className="h-11 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                </div>
                {addPatternError && <p className="text-xs text-red-600">{addPatternError}</p>}
              </>
            )}
          </Field>
          <Field label="Notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-20 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-felt-700 focus:ring-2 focus:ring-felt-700/20"
              placeholder="Ball choice, surface, carry..."
            />
          </Field>
        </div>
      </details>

      <button
        type="submit"
        disabled={isSubmitting || alleyName.trim().length === 0}
        className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-lg bg-felt-700 px-4 text-sm font-semibold text-white shadow-sm hover:bg-felt-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting ? "Starting..." : "Start session"}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}
