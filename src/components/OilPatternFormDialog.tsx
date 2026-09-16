import { Check, FileUp, Plus, Trash2, TriangleAlert, X } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Button } from "./ui/Button";
import { FormSheet } from "./ui/FormSheet";
import { FIELD, FIELD_DENSE, FIELD_DENSE_SELECT, FIELD_LABEL, FIELD_MICRO_LABEL } from "./ui/field";
import { GROUP_HEADING } from "./ui/typography";
import type { OilPass, OilPattern } from "../types/bowling";
import {
  formatSheetBoard, headlineRatio, oilStats, parseSheetBoard, trackZoneRatios, type OilStats,
} from "../lib/oilPattern";
import { ErrorBanner } from "./ErrorBanner";
import type { ParsedSheet } from "../lib/oilPatternSheet";

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
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [reading, setReading] = useState(false);
  const [sheetUrl, setSheetUrl] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Derived live, so the numbers the sheet shows are the numbers the lane will
  // draw. They are never stored: the passes are the pattern (ADR-090).
  const stats = useMemo(() => oilStats(passes), [passes]);
  const ratio = useMemo(() => headlineRatio(passes), [passes]);
  const zones = useMemo(() => trackZoneRatios(passes), [passes]);

  /**
   * Fill the form from a sheet, whichever way it arrived. Everything the sheet
   * knows is filled in: the passes, which the distance, the volume and the
   * ratio are all derived from, and the name off its title. Nothing already
   * typed is overwritten, because the bowler's own name for a pattern beats the
   * one printed on the sheet.
   */
  async function runImport(read: () => Promise<ParsedSheet>, sourceUrl?: string) {
    setReading(true);
    setError("");
    setSheet(null);
    try {
      const parsed = await read();
      if (parsed.passes.length === 0) {
        throw new Error("No load table in that file. Is it a pattern sheet?");
      }
      setSheet(parsed);
      setPasses(parsed.passes);
      if (parsed.name && !name.trim()) setName(parsed.name);
      // A link that produced a sheet is the sheet link, so it fills that in too
      // rather than making the bowler paste the same URL twice.
      if (sourceUrl && !url.trim()) setUrl(sourceUrl.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to read that sheet.");
    } finally {
      setReading(false);
    }
  }

  async function importFile(file: File) {
    await runImport(async () => {
      const { readPatternSheet } = await import("../lib/oilPatternPdf");
      return readPatternSheet(file);
    });
  }

  async function importUrl() {
    const link = sheetUrl.trim();
    if (!link) return;
    await runImport(async () => {
      const { readPatternSheetFromUrl } = await import("../lib/oilPatternPdf");
      return readPatternSheetFromUrl(link);
    }, link);
  }

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
            {/* The import leads the form, for the same reason the catalog link
                leads the ball editor (DESIGN-LANGUAGE §6): it fills in every
                field under it, and typing fifteen rows off a sheet by hand is
                the worst job in the app. */}
            <div className="rounded-xl border border-edge bg-surface-sunken p-3">
              <h3 className={GROUP_HEADING}>Import a pattern sheet</h3>
              <p className="mt-1 text-xs text-ink-tertiary">
                A Kegel style sheet. It is read on your own phone, nothing is uploaded,
                and it fills in the name and the whole load table.
              </p>

              <label className="mt-2.5 block">
                <span className={FIELD_MICRO_LABEL}>From a file</span>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  disabled={reading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = ""; // so the same file re-imports
                    if (file) void importFile(file);
                  }}
                  className="block w-full text-sm text-ink-secondary file:mr-3 file:h-10 file:rounded-lg file:border file:border-edge-strong file:bg-surface file:px-3 file:text-sm file:font-semibold file:text-ink"
                />
              </label>

              <div className="mt-2.5">
                <span className={FIELD_MICRO_LABEL}>From a link</span>
                <div className="flex gap-2">
                  <input
                    type="url"
                    inputMode="url"
                    value={sheetUrl}
                    disabled={reading}
                    onChange={(e) => setSheetUrl(e.target.value)}
                    onKeyDown={(e) => {
                      // Enter in a link box means fetch it, not submit the form
                      // and save a pattern the bowler has not seen yet.
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void importUrl();
                      }
                    }}
                    className={FIELD}
                    placeholder="https://…/chromium-6742.pdf"
                    autoComplete="off"
                  />
                  <Button
                    variant="secondary"
                    onClick={() => void importUrl()}
                    disabled={reading || sheetUrl.trim().length === 0}
                  >
                    <FileUp size={16} aria-hidden="true" />
                    Read
                  </Button>
                </div>
                <span className="mt-1 block text-xs text-ink-tertiary">
                  {reading
                    ? "Reading the sheet…"
                    : "Some sites do not let other pages read their files. If a link will not load, open it and import the file."}
                </span>
              </div>

              {sheet && (
                <div className="mt-3">
                  <SheetReceipt sheet={sheet} stats={stats} ratio={ratio} />
                </div>
              )}
            </div>

            <label className="block">
              <span className={FIELD_LABEL}>Name</span>
              <input
                required
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

/**
 * What the import read, and whether the sheet agrees with it. Every row prints
 * its own crossings and oil, and the header prints the totals, so a misread
 * column shows up here as arithmetic that does not add up. The passes are
 * filled in either way: a sheet that fails a check is usually one odd row, and
 * the rows are right there to fix. What the app will not do is call it verified.
 */
function SheetReceipt({
  sheet, stats, ratio,
}: {
  sheet: ParsedSheet;
  stats: OilStats;
  ratio: number | null;
}) {
  const failed = sheet.checks.filter((c) => !c.ok);

  return (
    <div
      className={`mb-3 rounded-lg border p-2.5 ${
        sheet.verified ? "border-success-200 bg-success-50" : "border-warning-200 bg-warning-50"
      }`}
    >
      <p className="flex items-center gap-2 text-sm font-semibold text-ink">
        {sheet.verified ? (
          <Check size={16} aria-hidden="true" className="shrink-0 text-success-700" />
        ) : (
          <TriangleAlert size={16} aria-hidden="true" className="shrink-0 text-warning-700" />
        )}
        {sheet.passes.length} passes read
        {sheet.verified ? ", and the sheet checks out" : ", but the sheet does not add up"}
      </p>
      {/* What it filled in. The distance, the volume and the ratio are not
          fields: they fall out of the passes (ADR-101), so showing them here is
          showing the sheet read correctly, not offering another thing to type. */}
      <p className="mt-1 text-sm tabular-nums text-ink">
        {Math.round(stats.length)} ft · {stats.volumeMl.toFixed(2)} mL
        {ratio != null ? ` · ${ratio.toFixed(1)}:1` : ""}
      </p>
      <p className="mt-1 text-xs text-ink-secondary">
        {sheet.verified
          ? `Every row matches its own crossings and oil, and the totals match the header. ${sheet.checks.length} checks.`
          : "Check the rows below against the sheet before saving."}
      </p>
      {failed.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-xs tabular-nums text-ink-secondary">
          {failed.slice(0, 4).map((c) => (
            <li key={c.label}>
              {c.label}: sheet says {c.stated}, rows come to {Math.round(c.derived * 100) / 100}
            </li>
          ))}
          {failed.length > 4 && <li>and {failed.length - 4} more</li>}
        </ul>
      )}
    </div>
  );
}
