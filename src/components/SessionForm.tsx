import { Settings2, X } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { localDateKey } from "../lib/dates";
import { createPortal } from "react-dom";
import { OilPatternManager } from "./OilPatternManager";
import { PushScreen } from "./PushScreen";
import { IconButton } from "./ui/IconButton";
import { FIELD, FIELD_LABEL, FIELD_TEXTAREA } from "./ui/field";
import { SuggestInput } from "./ui/SuggestInput";
import type { CreateSessionInput } from "../services/bowlingRepository";
import type { OilPattern } from "../types/bowling";
import { addOilPattern, getAllOilPatterns, getOilPattern, getOilPatterns } from "../services/ballRepository";
import { getDistinctAlleys, getDistinctDescriptions } from "../services/bowlingRepository";
import { patternLabel } from "../lib/oilPattern";

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
  /** Id of the rendered <form>, so the sheet's bar can submit it. */
  formId: string;
  /** Reports whether the form has enough to submit, so the sheet's commit can
   *  disable itself. The bar lives outside this component (DESIGN-LANGUAGE §6)
   *  but the field it depends on lives inside. */
  onCanSubmitChange?: (canSubmit: boolean) => void;
  /** Offered under the alley once it names one already bowled at. Omitted where
   *  the sheet cannot hand the screen over (editing a session). */
  onOpenAlleyReport?: (alley: string) => void;
}

// Room on the right for the clear button, so a long pattern name does not run
// under it.
const patternClass = `${FIELD} pr-10`;

function findPatternByName(patterns: readonly OilPattern[], text: string): OilPattern | undefined {
  const q = text.trim().toLowerCase();
  return q ? patterns.find((op) => op.name.toLowerCase() === q) : undefined;
}

const today = () => localDateKey();

export function SessionForm({
  onSubmit,
  isSubmitting = false,
  initial,
  formId,
  onCanSubmitChange,
  onOpenAlleyReport
}: SessionFormProps) {
  const [alleyName, setAlleyName] = useState(initial?.alley_name ?? "");
  const [date, setDate] = useState(initial?.date ?? today());
  const [description, setDescription] = useState(initial?.description ?? "");
  const [notes, setNotes] = useState(initial?.general_notes ?? "");

  const [alleys, setAlleys] = useState<string[]>([]);
  const [descriptions, setDescriptions] = useState<string[]>([]);

  const [oilPatterns, setOilPatterns] = useState<OilPattern[]>([]);
  // Typed, like the alley: a name that matches a pattern is that pattern, and
  // one that matches none becomes a new pattern when the session is saved.
  const [patternText, setPatternText] = useState("");
  const [showPatternManager, setShowPatternManager] = useState(false);

  // The picker offers active patterns only, but a session being edited may
  // point at an archived one, keep it selectable so saving can't clear it.
  const loadPatterns = useCallback(async (selectedId?: number) => {
    const active = await getOilPatterns();
    if (selectedId == null || active.some((op) => op.id === selectedId)) return active;
    const archived = await getOilPattern(selectedId);
    return archived ? [...active, archived] : active;
  }, []);

  // Mount only: the form is remounted (via `key`) whenever the prefill changes,
  // so re-running on `initial` would refetch the same three lists for nothing.
  useEffect(() => {
    loadPatterns(initial?.oil_pattern_id)
      .then((list) => {
        setOilPatterns(list);
        const current = list.find((op) => op.id === initial?.oil_pattern_id);
        if (current) setPatternText((t) => t || current.name);
      })
      .catch(() => {});
    getDistinctAlleys().then(setAlleys).catch(() => {});
    getDistinctDescriptions().then(setDescriptions).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Nothing here is required (ADR-080). A bowler standing at the lane with a
  // ball on the return can start scoring and name the alley afterwards, and the
  // commit in the sheet's bar is live from the moment the sheet opens.
  const canSubmit = !isSubmitting;
  useEffect(() => {
    onCanSubmitChange?.(canSubmit);
  }, [canSubmit, onCanSubmitChange]);

  // The alley as it is stored, when what is typed names one bowled before.
  const knownAlley = useMemo(() => {
    const q = alleyName.trim().toLowerCase();
    return q ? alleys.find((a) => a.toLowerCase() === q) : undefined;
  }, [alleyName, alleys]);

  const matchedPattern = useMemo(() => findPatternByName(oilPatterns, patternText), [oilPatterns, patternText]);

  const patternSuggestions = useMemo(
    () =>
      oilPatterns.map((op) => ({
        value: op.name,
        label: op.archived ? `${patternLabel(op)} (archived)` : patternLabel(op)
      })),
    [oilPatterns]
  );

  // Patterns may have been renamed, added, archived or deleted while the
  // manager was open, and the current selection may no longer exist.
  async function closePatternManager() {
    setShowPatternManager(false);
    const before = matchedPattern?.id;
    const refreshed = await loadPatterns(before).catch(() => null);
    if (!refreshed) return;
    setOilPatterns(refreshed);
    if (before == null) return;
    // Follow a rename, and let go of a pattern that was deleted, rather than
    // saving its old name back as a new one.
    const now = refreshed.find((op) => op.id === before);
    setPatternText(now ? now.name : "");
  }

  /** The pattern the typed name means, adding it when it is a new one. */
  async function resolvePattern(): Promise<number | undefined> {
    const name = patternText.trim();
    if (!name) return undefined;
    if (matchedPattern?.id != null) return matchedPattern.id;
    // Archived patterns are not offered, but typing one's name still means it.
    const existing = findPatternByName(await getAllOilPatterns(), name);
    if (existing?.id != null) return existing.id;
    return addOilPattern(name);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const oilPatternId = await resolvePattern();
    await onSubmit({
      alley_name: alleyName.trim(),
      description: description.trim() || undefined,
      lanes: [],
      start_lane: undefined,
      date,
      oil_pattern_id: oilPatternId,
      general_notes: notes.trim() || undefined
    });
  }

  return (
    <>
      <form id={formId} onSubmit={handleSubmit}>
        <div className="space-y-3">
          <Field label="Alley (optional)">
            <SuggestInput
              value={alleyName}
              onChange={setAlleyName}
              suggestions={alleys}
              placeholder="Pinecrest Lanes"
            />
            {knownAlley && onOpenAlleyReport && (
              <button
                type="button"
                onClick={() => onOpenAlleyReport(knownAlley)}
                className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-accent"
              >
                See your lines here
              </button>
            )}
          </Field>

          <Field label="Date">
            <input
              required
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={FIELD}
            />
          </Field>

          <Field label="Description">
            <SuggestInput
              value={description}
              onChange={setDescription}
              suggestions={descriptions}
              placeholder="League, practice, tournament…"
            />
          </Field>

          {/* Not a <Field>: the header carries its own action button, which a
              wrapping <label> would turn into a second way to focus the field. */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="oil-pattern" className={`${FIELD_LABEL} mb-0`}>
                Oil pattern
              </label>
              <IconButton
                onClick={() => setShowPatternManager(true)}
                label="Manage oil patterns"
                className="-my-2 text-accent"
              >
                <Settings2 size={18} aria-hidden="true" />
              </IconButton>
            </div>

            <div className="relative">
              <SuggestInput
                id="oil-pattern"
                value={patternText}
                onChange={setPatternText}
                suggestions={patternSuggestions}
                placeholder="Kegel Chromium"
                className={patternClass}
              />
              {patternText !== "" && (
                <button
                  type="button"
                  aria-label="Clear oil pattern"
                  onClick={() => setPatternText("")}
                  className="absolute inset-y-0 right-1 my-auto flex h-8 w-8 items-center justify-center rounded-full text-ink-tertiary hover:bg-surface-muted hover:text-ink-secondary"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              )}
            </div>
            {patternText.trim() !== "" && !matchedPattern && (
              <p className="text-xs text-ink-secondary">
                A new pattern. Saving adds it to your oil patterns, where you can give it a load table.
              </p>
            )}
          </div>

          <Field label="Notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={`${FIELD_TEXTAREA} min-h-20`}
              placeholder="Ball choice, surface, carry…"
            />
          </Field>
        </div>

      </form>

      {/* Portalled out of the <form>: the manager hosts its own <form>, and
          nesting one inside another is invalid HTML. It also sits outside the
          <form> in the React tree: a portal's events bubble up the React tree,
          so rendering it inside would fire the session form's submit handler
          when the pattern dialog is saved. */}
      {showPatternManager &&
        createPortal(
          // A PushScreen rather than a hand-rolled `fixed inset-0`: that one had
          // no Escape and no platform back, so Android's back closed the
          // session form underneath and threw away everything typed into it.
          // Going through PushScreen puts it on `useOverlay` and the sheet back
          // stack, where back closes the topmost layer and nothing else.
          <PushScreen title="Oil patterns" onBack={closePatternManager} backCloses>
            <div className="mx-auto w-full max-w-3xl">
              <OilPatternManager />
            </div>
          </PushScreen>,
          document.body
        )}
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className={FIELD_LABEL}>{label}</span>
      {children}
    </label>
  );
}
