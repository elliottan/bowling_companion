import type { FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import type { CreateSessionInput } from "../services/bowlingRepository";
import type { OilPattern } from "../types/bowling";
import { addOilPattern, getOilPatterns } from "../services/ballRepository";

export interface NewSessionFormValues extends CreateSessionInput {
  lane_number: string;
}

interface SessionFormProps {
  onSubmit: (values: NewSessionFormValues) => Promise<void> | void;
  isSubmitting?: boolean;
}

const inputClass =
  "h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-felt-700 focus:ring-2 focus:ring-felt-700/20";

const selectClass =
  "h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-felt-700 focus:ring-2 focus:ring-felt-700/20 bg-white";

export function SessionForm({ onSubmit, isSubmitting = false }: SessionFormProps) {
  const [alleyName, setAlleyName] = useState("");
  const [laneNumber, setLaneNumber] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  const [oilPatterns, setOilPatterns] = useState<OilPattern[]>([]);
  const [selectedPatternId, setSelectedPatternId] = useState<number | undefined>(undefined);
  const [isAddingPattern, setIsAddingPattern] = useState(false);
  const [newPatternName, setNewPatternName] = useState("");
  const [addPatternError, setAddPatternError] = useState("");

  useEffect(() => {
    getOilPatterns().then(setOilPatterns).catch(() => {});
  }, []);

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selectedPattern = oilPatterns.find((op) => op.id === selectedPatternId);
    await onSubmit({
      alley_name: alleyName.trim(),
      lane_number: laneNumber.trim(),
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

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Alley">
          <input
            required
            value={alleyName}
            onChange={(e) => setAlleyName(e.target.value)}
            className={inputClass}
            placeholder="Orchid Bowl"
          />
        </Field>
        <Field label="Lane">
          <input
            value={laneNumber}
            onChange={(e) => setLaneNumber(e.target.value)}
            className={inputClass}
            placeholder="12"
          />
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
