import type { FormEvent, ReactNode } from "react";
import { useState } from "react";
import type { CreateSessionInput } from "../services/bowlingRepository";

export interface NewSessionFormValues extends CreateSessionInput {
  lane_number: string;
}

interface SessionFormProps {
  onSubmit: (values: NewSessionFormValues) => Promise<void> | void;
  isSubmitting?: boolean;
}

const inputClass =
  "h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-felt-700 focus:ring-2 focus:ring-felt-700/20";

export function SessionForm({ onSubmit, isSubmitting = false }: SessionFormProps) {
  const [alleyName, setAlleyName] = useState("");
  const [laneNumber, setLaneNumber] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [oilPattern, setOilPattern] = useState("");
  const [notes, setNotes] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit({
      alley_name: alleyName.trim(),
      lane_number: laneNumber.trim(),
      date,
      oil_pattern: oilPattern.trim() || undefined,
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
            <input
              value={oilPattern}
              onChange={(e) => setOilPattern(e.target.value)}
              className={inputClass}
              placeholder="House"
            />
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
