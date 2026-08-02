import { ChevronDown, ChevronLeft, Settings2, X } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { OilPatternManager } from "./OilPatternManager";
import { Button } from "./ui/Button";
import type { CreateSessionInput } from "../services/bowlingRepository";
import type { OilPattern } from "../types/bowling";
import { getOilPattern, getOilPatterns } from "../services/ballRepository";
import { getDistinctAlleys, getDistinctDescriptions } from "../services/bowlingRepository";

export interface NewSessionFormValues extends CreateSessionInput {
  lanes: string[];
  start_lane?: string;
}

export interface SessionFormInitial {
  alley_name?: string;
  date?: string;
  description?: string;
  oil_pattern_id?: number;
  general_notes?: string;
}

interface SessionFormProps {
  onSubmit: (values: NewSessionFormValues) => Promise<void> | void;
  isSubmitting?: boolean;
  /** Prefill for the edit flow; blank for create. */
  initial?: SessionFormInitial;
  /** Heading shown above the fields. */
  title?: string;
  /** Submit-button label (and its in-flight label). */
  submitLabel?: string;
  /** When provided, a Cancel button is shown (used in the modal). */
  onCancel?: () => void;
}

const inputClass =
  "h-11 w-full min-w-0 box-border rounded-lg border border-edge-strong px-3 text-sm outline-none focus:border-accent-fill focus:ring-2 focus:ring-accent-fill/20";

// appearance-none so the clear button and chevron can share the right edge;
// pr-16 keeps a long pattern name from running underneath them.
const selectClass =
  "h-11 w-full appearance-none rounded-lg border border-edge-strong pl-3 pr-16 text-sm outline-none focus:border-accent-fill focus:ring-2 focus:ring-accent-fill/20 bg-surface";

const today = () => new Date().toISOString().slice(0, 10);

export function SessionForm({
  onSubmit,
  isSubmitting = false,
  initial,
  title = "Start new session",
  submitLabel = "Start session",
  onCancel
}: SessionFormProps) {
  const [alleyName, setAlleyName] = useState(initial?.alley_name ?? "");
  const [date, setDate] = useState(initial?.date ?? today());
  const [description, setDescription] = useState(initial?.description ?? "");
  const [notes, setNotes] = useState(initial?.general_notes ?? "");

  const [alleys, setAlleys] = useState<string[]>([]);
  const [showAlleyList, setShowAlleyList] = useState(false);
  const [descriptions, setDescriptions] = useState<string[]>([]);
  const [showDescList, setShowDescList] = useState(false);

  const [oilPatterns, setOilPatterns] = useState<OilPattern[]>([]);
  const [selectedPatternId, setSelectedPatternId] = useState<number | undefined>(initial?.oil_pattern_id);
  const [showPatternManager, setShowPatternManager] = useState(false);

  // The picker offers active patterns only, but a session being edited may
  // point at an archived one — keep it selectable so saving can't clear it.
  const loadPatterns = useCallback(async (selectedId?: number) => {
    const active = await getOilPatterns();
    if (selectedId == null || active.some((op) => op.id === selectedId)) return active;
    const archived = await getOilPattern(selectedId);
    return archived ? [...active, archived] : active;
  }, []);

  useEffect(() => {
    loadPatterns(initial?.oil_pattern_id).then(setOilPatterns).catch(() => {});
    getDistinctAlleys().then(setAlleys).catch(() => {});
    getDistinctDescriptions().then(setDescriptions).catch(() => {});
  }, []);

  const alleyMatches = useMemo(() => {
    const q = alleyName.trim().toLowerCase();
    const list = q ? alleys.filter((a) => a.toLowerCase().includes(q) && a.toLowerCase() !== q) : alleys;
    return list.slice(0, 6);
  }, [alleyName, alleys]);

  const descMatches = useMemo(() => {
    const q = description.trim().toLowerCase();
    const list = q
      ? descriptions.filter((d) => d.toLowerCase().includes(q) && d.toLowerCase() !== q)
      : descriptions;
    return list.slice(0, 6);
  }, [description, descriptions]);

  // Patterns may have been renamed, added, archived or deleted while the
  // manager was open — and the current selection may no longer exist.
  async function closePatternManager() {
    setShowPatternManager(false);
    const refreshed = await loadPatterns(selectedPatternId).catch(() => null);
    if (!refreshed) return;
    setOilPatterns(refreshed);
    if (selectedPatternId != null && !refreshed.some((op) => op.id === selectedPatternId)) {
      setSelectedPatternId(undefined);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit({
      alley_name: alleyName.trim(),
      description: description.trim() || undefined,
      lanes: [],
      start_lane: undefined,
      date,
      oil_pattern_id: selectedPatternId,
      general_notes: notes.trim() || undefined
    });
  }

  return (
    <>
      <form onSubmit={handleSubmit}>
        <h2 className="text-lg font-bold text-ink">{title}</h2>

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
                <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-edge bg-surface py-1 shadow-lg">
                  {alleyMatches.map((a) => (
                    <li key={a}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { setAlleyName(a); setShowAlleyList(false); }}
                        className="block w-full px-3 py-2 text-left text-sm text-ink-strong hover:bg-surface-muted"
                      >
                        {a}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
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

          <Field label="Description">
            <div className="relative">
              <input
                value={description}
                onChange={(e) => { setDescription(e.target.value); setShowDescList(true); }}
                onFocus={() => setShowDescList(true)}
                onBlur={() => setTimeout(() => setShowDescList(false), 120)}
                className={inputClass}
                placeholder="League night, practice, tournament..."
                autoComplete="off"
              />
              {showDescList && descMatches.length > 0 && (
                <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-edge bg-surface py-1 shadow-lg">
                  {descMatches.map((d) => (
                    <li key={d}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { setDescription(d); setShowDescList(false); }}
                        className="block w-full px-3 py-2 text-left text-sm text-ink-strong hover:bg-surface-muted"
                      >
                        {d}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Field>

          {/* Not a <Field>: the header carries its own action button, which a
              wrapping <label> would turn into a second way to focus the select. */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="oil-pattern"
                className="text-xs font-semibold uppercase tracking-wide text-ink-secondary"
              >
                Oil pattern
              </label>
              <button
                type="button"
                onClick={() => setShowPatternManager(true)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
              >
                <Settings2 size={12} aria-hidden="true" />
                Manage
              </button>
            </div>

            <div className="relative">
              <select
                id="oil-pattern"
                value={selectedPatternId ?? ""}
                onChange={(e) => setSelectedPatternId(e.target.value ? Number(e.target.value) : undefined)}
                className={selectClass}
              >
                {/* A native select can only show placeholder text through an
                    option, so this one is hidden from the list. Clearing a real
                    choice is the ✕ button's job. */}
                <option value="" disabled hidden>
                  No pattern selected
                </option>
                {oilPatterns.map((op) => (
                  <option key={op.id} value={op.id}>
                    {op.archived ? `${op.name} (archived)` : op.name}
                  </option>
                ))}
              </select>

              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center gap-0.5 pr-2">
                {selectedPatternId != null && (
                  <button
                    type="button"
                    aria-label="Clear oil pattern"
                    onClick={() => setSelectedPatternId(undefined)}
                    className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full text-ink-tertiary hover:bg-surface-muted hover:text-ink-secondary"
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                )}
                <ChevronDown size={16} aria-hidden="true" className="text-ink-tertiary" />
              </div>
            </div>
          </div>

          <Field label="Notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-20 w-full rounded-lg border border-edge-strong px-3 py-2 text-sm outline-none focus:border-accent-fill focus:ring-2 focus:ring-accent-fill/20"
              placeholder="Ball choice, surface, carry..."
            />
          </Field>
        </div>

        <div className="mt-4 flex gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex h-12 flex-1 items-center justify-center rounded-lg border border-edge-strong bg-surface px-4 text-sm font-semibold text-ink-strong hover:bg-surface-muted"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={isSubmitting || alleyName.trim().length === 0}
            className="inline-flex h-12 flex-1 items-center justify-center rounded-lg bg-accent-fill px-4 text-sm font-semibold text-accent-on-fill shadow-sm hover:bg-accent-fill-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "Saving..." : submitLabel}
          </button>
        </div>

      </form>

      {/* Portalled out of the <form>: the manager hosts its own <form>, and
          nesting one inside another is invalid HTML. It also sits outside the
          <form> in the React tree: a portal's events bubble up the React tree,
          so rendering it inside would fire the session form's submit handler
          when the pattern dialog is saved. */}
      {showPatternManager &&
        createPortal(
          <div className="fixed inset-0 z-[70] overflow-y-auto bg-surface-sunken">
            <div className="mx-auto w-full max-w-3xl px-3 pt-4 sm:px-6">
              <Button variant="ghost" onClick={closePatternManager}>
                <ChevronLeft size={16} aria-hidden="true" />
                Back to session
              </Button>
            </div>
            <OilPatternManager />
          </div>,
          document.body
        )}
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
        {label}
      </span>
      {children}
    </label>
  );
}
