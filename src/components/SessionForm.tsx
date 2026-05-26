import { CalendarPlus } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import type { CreateSessionInput } from "../services/bowlingRepository";

export interface NewSessionFormValues extends CreateSessionInput {
  lane_number: string;
}

interface SessionFormProps {
  onSubmit: (values: NewSessionFormValues) => Promise<void> | void;
  isSubmitting?: boolean;
}

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
      className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-felt-700 text-white">
          <CalendarPlus aria-hidden="true" size={22} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-950">Start New Session</h2>
          <p className="text-sm text-slate-600">Set the lane context before scoring.</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-700">Alley name</span>
          <input
            required
            value={alleyName}
            onChange={(event) => setAlleyName(event.target.value)}
            className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-felt-700 focus:ring-2 focus:ring-felt-700/20"
            placeholder="Orchid Bowl"
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-700">Lane</span>
          <input
            value={laneNumber}
            onChange={(event) => setLaneNumber(event.target.value)}
            className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-felt-700 focus:ring-2 focus:ring-felt-700/20"
            placeholder="12"
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-700">Date</span>
          <input
            required
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-felt-700 focus:ring-2 focus:ring-felt-700/20"
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-700">Oil pattern</span>
          <input
            value={oilPattern}
            onChange={(event) => setOilPattern(event.target.value)}
            className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-felt-700 focus:ring-2 focus:ring-felt-700/20"
            placeholder="House"
          />
        </label>
      </div>

      <label className="mt-4 block space-y-2">
        <span className="text-sm font-semibold text-slate-700">Notes</span>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-felt-700 focus:ring-2 focus:ring-felt-700/20"
          placeholder="Warmup, ball choice, surface, carry notes..."
        />
      </label>

      <button
        type="submit"
        disabled={isSubmitting || alleyName.trim().length === 0}
        className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-lg bg-felt-700 px-4 text-sm font-semibold text-white shadow-sm hover:bg-felt-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting ? "Starting..." : "Start session"}
      </button>
    </form>
  );
}
