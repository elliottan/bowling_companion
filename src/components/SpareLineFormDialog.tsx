import { Eye, Trash2 } from "lucide-react";
import { useState } from "react";
import { PinGrid } from "./PinGrid";
import { LaneVisualizer } from "./LaneVisualizer";
import { derivePinBoard } from "../lib/pinGeometry";
import { upsertSpareLine } from "../services/ballRepository";
import type { LineSpec, PinNumber } from "../types/bowling";

const EMPTY_LINE: LineSpec = {};
const ALL_PINS: PinNumber[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

interface SpareLineFormDialogProps {
  /** Leave being shot at (standing pins). Empty = user picks pins. */
  initialPins: PinNumber[];
  /** Lock the pin grid (editing an existing leave / a known live leave). */
  lockPins: boolean;
  initialLine?: LineSpec;
  initialNotes?: string;
  onSaved: () => void;
  onCancel: () => void;
  /** When provided, shows a Delete button (edit context only). */
  onDelete?: () => void;
}

/**
 * Add/edit dialog for a Spare Line. Mounts fresh per open — callers give it a
 * `key` (e.g. the editing id or leave) so internal state resets. Used by the
 * Spares tab and by the live scorer when capturing a just-converted spare.
 */
export function SpareLineFormDialog({
  initialPins,
  lockPins,
  initialLine,
  initialNotes,
  onSaved,
  onCancel,
  onDelete
}: SpareLineFormDialogProps) {
  const [pins, setPins] = useState<PinNumber[]>(initialPins);
  const [line, setLine] = useState<LineSpec>(initialLine ?? EMPTY_LINE);
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [showViz, setShowViz] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pins.length === 0) {
      setError("Select at least one pin for this leave.");
      return;
    }

    const spec: LineSpec | undefined =
      line.stance != null || line.laydown != null || line.target != null ||
      line.breakpoint != null || line.breakpoint_distance != null
        ? {
            ...(line.stance != null && { stance: line.stance }),
            ...(line.laydown != null && { laydown: line.laydown }),
            ...(line.target != null && { target: line.target }),
            ...(line.breakpoint != null && { breakpoint: line.breakpoint }),
            ...(line.breakpoint_distance != null && { breakpoint_distance: line.breakpoint_distance })
          }
        : undefined;

    setIsSaving(true);
    setError("");
    try {
      await upsertSpareLine(pins, spec, notes.trim() || undefined);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save spare line.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-3 sm:items-center"
      onClick={onCancel}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg border border-slate-200 bg-white p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-base font-semibold text-slate-950">
          {pins.length === 0
            ? "Add spare line"
            : `${pins.length === 1 ? "Pin" : "Pins"} ${pins.join(", ")}`}
        </h2>

        {error && (
          <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
            {error}
          </p>
        )}

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            {!lockPins && (
              <p className="mb-2 text-xs text-slate-500">
                Tap pins to select which pins are left standing for this leave.
              </p>
            )}
            <PinGrid
              standingPins={pins}
              availablePins={ALL_PINS}
              onChange={setPins}
              readOnly={lockPins}
            />
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-slate-600">
              Shooting line (board numbers)
            </p>
            <div className="grid grid-cols-4 gap-2">
              {(["stance", "laydown", "target", "breakpoint"] as const).map((field) => (
                <div key={field}>
                  <label className="mb-1 block text-xs font-medium text-slate-600 capitalize">
                    {field === "breakpoint" ? "Bkpt" : field}
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.5"
                    value={line[field] ?? ""}
                    onChange={(e) =>
                      setLine((l) => ({
                        ...l,
                        [field]: e.target.value === "" ? undefined : Number(e.target.value)
                      }))
                    }
                    placeholder={field === "stance" ? "35" : field === "laydown" ? "18" : field === "target" ? "10" : "6"}
                    className="h-10 w-full rounded-lg border border-slate-300 px-2 text-sm outline-none focus:border-felt-700 focus:ring-2 focus:ring-felt-700/20"
                  />
                </div>
              ))}
            </div>
            <div className="mt-2 w-32">
              <label className="mb-1 block text-xs font-medium text-slate-600">Bkpt dist (ft)</label>
              <input
                type="number"
                inputMode="decimal"
                step="1"
                value={line.breakpoint_distance ?? ""}
                onChange={(e) =>
                  setLine((l) => ({
                    ...l,
                    breakpoint_distance: e.target.value === "" ? undefined : Number(e.target.value)
                  }))
                }
                placeholder="42"
                className="h-10 w-full rounded-lg border border-slate-300 px-2 text-sm outline-none focus:border-felt-700 focus:ring-2 focus:ring-felt-700/20"
              />
            </div>
            {derivePinBoard(line, pins) != null && (
              <p className="mt-2 text-xs text-slate-500">
                Straight-line board at the front pin:{" "}
                <span className="font-semibold text-felt-700">{derivePinBoard(line, pins)}</span>
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowViz(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Eye size={14} aria-hidden="true" />
            View line
          </button>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Notes <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Any notes about this spare…"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-felt-700 focus:ring-2 focus:ring-felt-700/20"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-felt-700 bg-felt-700 px-4 text-sm font-semibold text-white hover:bg-felt-600 disabled:opacity-50"
            >
              {isSaving ? "Saving…" : "Save spare line"}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={isSaving}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                disabled={isSaving}
                aria-label={`Delete spare line for pins ${pins.join(", ")}`}
                className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
              >
                <Trash2 size={14} aria-hidden="true" />
                Delete
              </button>
            )}
          </div>
        </form>
        {showViz && (
          <LaneVisualizer
            title="Spare line"
            line={line}
            leave={pins}
            onChange={(l) => setLine(l ?? {})}
            onClose={() => setShowViz(false)}
          />
        )}
      </div>
    </div>
  );
}
