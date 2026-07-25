import { Eye, Trash2 } from "lucide-react";
import { useState } from "react";
import { ErrorBanner } from "./ErrorBanner";
import { PinGrid } from "./PinGrid";
import { LaneVisualizer } from "./LaneVisualizer";
import { useDriftModel } from "../lib/driftModelContext";
import { deriveLaydown, deriveSlide, syncStanceLaydown } from "../lib/driftModel";
import { useOverlay } from "../lib/useOverlay";
import { upsertSpareLine } from "../services/ballRepository";
import type { LineSpec, PinNumber } from "../types/bowling";
import { Button } from "./ui/Button";

const EMPTY_LINE: LineSpec = {};
const ALL_PINS: PinNumber[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// Field chrome mirrors the score-entry shot panel (ActiveGameScorer's LineInput)
// so a spare line reads the same way a shot does.
const floatLabel =
  "pointer-events-none absolute -top-1.5 left-2 z-10 bg-surface px-1 text-[11px] font-semibold uppercase tracking-[0.01em] text-ink-secondary";
const eyebrow = "text-[11px] font-semibold uppercase tracking-[0.01em] text-ink-secondary";
const boardInput =
  "h-9 w-full min-w-0 rounded-lg border border-edge bg-surface-muted text-center text-sm font-semibold tabular-nums text-ink focus:border-accent-fill focus:bg-surface focus:outline-none";

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
  // Notes are no longer editable here, but a stored note is carried through the
  // save so switching to the visualizer-first flow doesn't wipe it.
  const [notes] = useState(initialNotes ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [showViz, setShowViz] = useState(false);
  const driftModel = useDriftModel();

  const applyLine = (next: LineSpec) => setLine(syncStanceLaydown(line, next, driftModel));

  // Disabled while the nested LaneVisualizer is open (showViz) so Escape and
  // the focus trap apply only to that topmost overlay, not both at once.
  const overlayRef = useOverlay<HTMLDivElement>(onCancel, !showViz);

  const derivedSlide = line.stance != null ? deriveSlide(line.stance, driftModel) : undefined;
  const derivedLaydown =
    line.laydown ?? (line.stance != null ? deriveLaydown(line.stance, driftModel) : undefined);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pins.length === 0) {
      setError("Select at least one pin for this leave.");
      return;
    }

    // Store the spec whole — the hook timing set in the visualizer lives on the
    // same object, and picking fields off it here would quietly drop it.
    const spec: LineSpec | undefined =
      Object.values(line).some((v) => v != null) ? line : undefined;

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
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
    >
      <div
        ref={overlayRef}
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg border border-edge bg-surface p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-base font-semibold text-ink">
          {pins.length === 0
            ? "Add spare line"
            : `${pins.length === 1 ? "Pin" : "Pins"} ${pins.join(", ")}`}
        </h2>

        {error && (
          <ErrorBanner className="mb-3">{error}</ErrorBanner>
        )}

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            {!lockPins && (
              <p className="mb-2 text-xs text-ink-secondary">
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
            <p className={`mb-1 ${eyebrow}`}>Shooting line (boards)</p>
            <div className="flex gap-1.5">
              {(["stance", "target"] as const).map((field) => (
                <label key={field} className="relative min-w-0 flex-1">
                  <span className={floatLabel}>{field}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.5"
                    value={line[field] ?? ""}
                    onChange={(e) =>
                      applyLine({
                        ...line,
                        [field]: e.target.value === "" ? undefined : Number(e.target.value)
                      })
                    }
                    className={boardInput}
                  />
                </label>
              ))}
            </div>
            {(derivedSlide != null || derivedLaydown != null) && (
              <button
                type="button"
                onClick={() => setShowViz(true)}
                title="Derived from your stance. Tap to see it on the lane."
                className="mt-1 flex w-full flex-wrap items-center gap-x-1 text-left text-[11px] font-semibold uppercase tracking-[0.01em] text-ink-secondary tabular-nums hover:text-accent"
              >
                {derivedSlide != null && <span className="whitespace-nowrap">Slide {derivedSlide}</span>}
                {derivedSlide != null && derivedLaydown != null && (
                  <span aria-hidden="true" className="text-ink-tertiary">→</span>
                )}
                {derivedLaydown != null && (
                  <span className="whitespace-nowrap">Laydown {derivedLaydown}</span>
                )}
              </button>
            )}
            <p className="mt-2 text-xs text-ink-secondary">
              Tap <span className="font-medium text-ink-secondary">View line</span> to set the final
              target, hook strength and depth.
            </p>
          </div>

          <Button variant="secondary" onClick={() => setShowViz(true)}>
            <Eye size={14} aria-hidden="true" />
            View line
          </Button>

          <div className="flex items-center gap-2 pt-1">
            <Button type="submit" variant="primary" disabled={isSaving}>
              {isSaving ? "Saving…" : "Save spare line"}
            </Button>
            <Button variant="secondary" onClick={onCancel} disabled={isSaving}>
              Cancel
            </Button>
            {onDelete && (
              <Button
                variant="danger"
                onClick={onDelete}
                disabled={isSaving}
                aria-label={`Delete spare line for pins ${pins.join(", ")}`}
                className="ml-auto"
              >
                <Trash2 size={14} aria-hidden="true" />
                Delete
              </Button>
            )}
          </div>
        </form>
        {showViz && (
          <LaneVisualizer
            title="Spare line"
            line={line}
            leave={pins}
            spare
            onChange={(l) => applyLine(l ?? {})}
            onClose={() => setShowViz(false)}
          />
        )}
      </div>
    </div>
  );
}
