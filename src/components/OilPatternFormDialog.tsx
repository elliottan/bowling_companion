import { Plus, Trash2, X } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Button } from "./ui/Button";
import { FormSheet } from "./ui/FormSheet";
import { FIELD, FIELD_DENSE, FIELD_DENSE_SELECT, FIELD_LABEL, FIELD_MICRO_LABEL } from "./ui/field";
import { GROUP_HEADING } from "./ui/typography";
import type { OilPass, OilPattern } from "../types/bowling";
import {
  formatSheetBoard, headlineRatio, oilStats, parseSheetBoard, trackZoneRatios,
} from "../lib/oilPattern";
import { ErrorBanner } from "./ErrorBanner";

/** A fresh row, sized like a typical house-shot forward pass so the first one
 *  only needs the numbers changed rather than every field filled from zero. */
const NEW_PASS: OilPass = {
  direction: "forward",
  left_board: 10,
  right_board: 30,
  loads: 2,
  microliters: 40,
  start_distance: 0,
  end_distance: 35,
};

const FORM_ID = "oil-pattern-form";

interface OilPatternFormDialogProps {
  open: boolean;
  /** Prefill for the edit flow; omit to create. */
  initial?: OilPattern;
  onSubmit: (values: { name: string; url?: string; passes?: OilPass[] }) => Promise<void>;
  onCancel: () => void;
  /** Only supplied when editing: removal lives with the thing it removes (§2). */
  onRemove?: () => void;
}

/** Add or rename an oil pattern, and point it at its pattern sheet. */
export function OilPatternFormDialog({ open, initial, onSubmit, onCancel, onRemove }: OilPatternFormDialogProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [passes, setPasses] = useState<OilPass[]>(initial?.passes ?? []);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Derived live, so the numbers the sheet shows are the numbers the lane will
  // draw. They are never stored: the passes are the pattern (ADR-090).
  const stats = useMemo(() => oilStats(passes), [passes]);
  const ratio = useMemo(() => headlineRatio(passes), [passes]);
  const zones = useMemo(() => trackZoneRatios(passes), [passes]);

  function patchPass(index: number, patch: Partial<OilPass>) {
    setPasses((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  if (!open) return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    try {
      await onSubmit({ name, url, passes });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save pattern.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <FormSheet
      title={initial ? "Edit oil pattern" : "Add oil pattern"}
      onClose={onCancel}
      onConfirm={() => {
        const form = document.getElementById(FORM_ID);
        if (form instanceof HTMLFormElement) form.requestSubmit();
      }}
      confirmLabel="Save"
      confirmDisabled={isSaving || name.trim().length === 0}
    >
      <form id={FORM_ID} onSubmit={handleSubmit}>
        <div className="space-y-3">
            <label className="block">
              <span className={FIELD_LABEL}>Name</span>
              <input
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={FIELD}
                placeholder="Kegel Main Street"
              />
            </label>

            <label className="block">
              <span className={FIELD_LABEL}>Pattern sheet link (optional)</span>
              <input
                type="url"
                inputMode="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className={FIELD}
                placeholder="https://…/main-street.pdf"
                autoComplete="off"
              />
              <span className="mt-1 block text-xs text-ink-tertiary">
                Usually a PDF, and it opens in a new tab.
              </span>
            </label>

            {/* The load table. Optional, because a pattern that is only a name
                is still a useful label on a session, and every pattern saved
                before this existed is one. Fill it in and the lane draws it. */}
            <div className="rounded-xl border border-edge bg-surface-sunken p-3">
              <div className="flex items-center gap-2">
                <h3 className={`flex-1 ${GROUP_HEADING}`}>Load table (optional)</h3>
                <Button variant="ghost" onClick={() => setPasses((prev) => [...prev, { ...NEW_PASS }])}>
                  <Plus size={14} aria-hidden="true" />
                  Add pass
                </Button>
              </div>

              {passes.length === 0 ? (
                <p className="mt-2 text-xs text-ink-tertiary">
                  One row per machine pass, off the pattern sheet. Add them and the lane
                  draws the oil under your line, with the exit point where you leave it.
                </p>
              ) : (
                <p className="mt-2 text-xs tabular-nums text-ink-secondary">
                  {Math.round(stats.length)} ft · {stats.volumeMl.toFixed(2)} mL ·{" "}
                  {stats.forwardMl.toFixed(2)} forward / {stats.reverseMl.toFixed(2)} reverse
                  {ratio != null ? ` · ${ratio.toFixed(2)}:1` : ""}
                </p>
              )}

              {zones.length > 0 && (
                <p className="mt-1 text-xs tabular-nums text-ink-tertiary">
                  Track zones · {zones.map((z) => `${z.label} ${z.ratio.toFixed(2)}`).join(" · ")}
                </p>
              )}

              <div className="mt-2 space-y-2">
                {passes.map((pass, index) => (
                  <div key={index} className="rounded-lg border border-edge bg-surface p-2">
                    <div className="flex items-center gap-2">
                      <span className="flex-1 text-xs font-semibold text-ink-secondary">
                        Pass {index + 1}
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove pass ${index + 1}`}
                        onClick={() => setPasses((prev) => prev.filter((_, i) => i !== index))}
                        className="rounded-md p-1 text-ink-tertiary hover:bg-surface-muted"
                      >
                        <X size={14} aria-hidden="true" />
                      </button>
                    </div>
                    {/* The sheet's own column order, so a row transcribes left
                        to right without hunting: START and STOP boards, LOADS,
                        MICS, then the feet it runs over. */}
                    <div className="grid grid-cols-3 gap-2">
                      <label className="col-span-3 block">
                        <span className={FIELD_MICRO_LABEL}>Direction</span>
                        <select
                          value={pass.direction}
                          onChange={(e) => patchPass(index, { direction: e.target.value as OilPass["direction"] })}
                          className={FIELD_DENSE_SELECT}
                        >
                          <option value="forward">Forward</option>
                          <option value="reverse">Reverse</option>
                        </select>
                      </label>
                      <PassBoard label="Start board" value={pass.left_board}
                        onChange={(v) => patchPass(index, { left_board: v })} />
                      <PassBoard label="Stop board" value={pass.right_board}
                        onChange={(v) => patchPass(index, { right_board: v })} />
                      <PassNumber label="Loads" value={pass.loads}
                        onChange={(v) => patchPass(index, { loads: v })} />
                      <PassNumber label="Mics" value={pass.microliters}
                        onChange={(v) => patchPass(index, { microliters: v })} />
                      <PassNumber label="Start ft" value={pass.start_distance}
                        onChange={(v) => patchPass(index, { start_distance: v })} />
                      <PassNumber label="End ft" value={pass.end_distance}
                        onChange={(v) => patchPass(index, { end_distance: v })} />
                    </div>
                  </div>
                ))}
              </div>

              {passes.length > 0 && (
                <p className="mt-2 text-xs text-ink-tertiary">
                  Boards take the sheet's own notation, 2L or 7R, counted in from each
                  gutter. A reverse pass ends before it starts, and a buffer pass with
                  no loads still sets how far the pattern reaches.
                </p>
              )}
            </div>

            {error && <ErrorBanner>{error}</ErrorBanner>}

            {onRemove && (
              <Button variant="danger-ghost" onClick={onRemove} className="w-full">
                <Trash2 size={16} aria-hidden="true" />
                Remove pattern
              </Button>
            )}
          </div>
      </form>
    </FormSheet>
  );
}

/** One number in a pass row. Kept as text with a numeric keypad rather than a
 *  spinner: these are read off a sheet and typed, not nudged. */
function PassNumber({
  label, value, onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className={FIELD_MICRO_LABEL}>{label}</span>
      <input
        type="number"
        inputMode="decimal"
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => onChange(e.target.value === "" ? Number.NaN : Number(e.target.value))}
        className={`${FIELD_DENSE} tabular-nums`}
        aria-label={label}
      />
    </label>
  );
}

/** A board in the sheet's own notation. Typed as "2L" or "7R" and stored as an
 *  absolute board, so the transcription is the sheet's problem and not the
 *  bowler's. A bare number is taken as counted from the left. */
function PassBoard({
  label, value, onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const [text, setText] = useState(() => formatSheetBoard(value));
  const parsed = parseSheetBoard(text);

  return (
    <label className="block">
      <span className={FIELD_MICRO_LABEL}>{label}</span>
      <input
        type="text"
        inputMode="text"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const board = parseSheetBoard(e.target.value);
          if (board != null) onChange(board);
        }}
        onBlur={() => setText(formatSheetBoard(parsed ?? value))}
        aria-label={label}
        aria-invalid={parsed == null}
        className={`${FIELD_DENSE} uppercase ${parsed == null ? "border-danger-600" : ""}`}
      />
    </label>
  );
}
