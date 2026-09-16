import { Library, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "./ui/Button";
import { FormSheet } from "./ui/FormSheet";
import { FIELD, FIELD_LABEL } from "./ui/field";
import type { OilPass, OilPattern } from "../types/bowling";
import { oilStats, patternClass, PATTERN_CLASS_LABEL, headlineRatio } from "../lib/oilPattern";
import { ErrorBanner } from "./ErrorBanner";

const FORM_ID = "oil-pattern-form";

interface OilPatternFormDialogProps {
  open: boolean;
  /** Prefill for the edit flow; omit to create. */
  initial?: OilPattern;
  onSubmit: (values: {
    name: string;
    url?: string;
    passes?: OilPass[];
    distance?: number;
  }) => Promise<void>;
  onCancel: () => void;
  /** Only supplied when editing: removal lives with the thing it removes (§2). */
  onRemove?: () => void;
  /** Offered when this pattern has no load table and the catalog has one to
   *  lend. Enriches the pattern in place, keeping it and everything already
   *  pointing at it. */
  onLinkCatalog?: () => void;
}

/**
 * Add or rename an oil pattern.
 *
 * A pattern you add yourself is a name, a link to its sheet and its length. It
 * is NOT a load table: typing one is fifteen rows of seven numbers, and the
 * patterns worth drawing come from the catalog already read and checked
 * (ADR-104). So there is no table editor here, and a pattern without a table
 * draws no oil on the lane, only its length.
 *
 * A pattern that DOES carry a table, because it came from the catalog, keeps it
 * through an edit. The table is shown, never offered for editing, and passed
 * straight back out: dropping it silently would destroy the only thing that
 * makes the lane drawable.
 */
export function OilPatternFormDialog({ open, initial, onSubmit, onCancel, onRemove, onLinkCatalog }: OilPatternFormDialogProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [distance, setDistance] = useState(initial?.distance != null ? String(initial.distance) : "");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Carried, not edited. See the note above.
  const passes = initial?.passes;
  const linked = initial?.catalog_id != null;
  const table = oilStats(passes);
  const ratio = headlineRatio(passes);
  const shape = patternClass(ratio);

  if (!open) return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    try {
      const feet = Number(distance);
      await onSubmit({
        name,
        url: linked ? initial?.url : url,
        passes,
        distance: distance.trim() !== "" && Number.isFinite(feet) && feet > 0 ? feet : undefined,
      });
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

          {/* Only for a pattern with no table. With one, the length is the
              table's and offering a box for it would invite a contradiction. */}
          {table.length === 0 && (
            <label className="block">
              <span className={FIELD_LABEL}>Length (optional)</span>
              <input
                type="number"
                inputMode="decimal"
                value={distance}
                onChange={(e) => setDistance(e.target.value)}
                className={`${FIELD} tabular-nums`}
                placeholder="40"
                min={1}
                max={70}
              />
              <span className="mt-1 block text-xs text-ink-tertiary">
                In feet. The lane draws oil only for a pattern from the catalog, which
                comes with its load table.
              </span>
            </label>
          )}

          {table.length > 0 && (
            <div className="rounded-xl border border-edge bg-surface-sunken p-3">
              <p className="text-sm font-semibold text-ink">
                {linked ? "This is a catalog pattern" : "From the catalog"}
              </p>
              <p className="mt-1 text-xs tabular-nums text-ink-secondary">
                {Math.round(table.length)} ft · {table.volumeMl.toFixed(2)} mL
                {ratio != null ? ` · ${ratio.toFixed(1)}:1` : ""}
                {shape ? ` · ${PATTERN_CLASS_LABEL[shape]}` : ""}
              </p>
              <p className="mt-1 text-xs text-ink-tertiary">
                {linked
                  ? `${passes?.length} passes, kept current by the catalog. The name is yours to change.`
                  : `${passes?.length} passes, kept as they were read from the sheet.`}
              </p>
            </div>
          )}

          {!linked && (
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
          )}

          {/* For a pattern that predates the catalog, or one typed in by hand.
              The sessions already on it keep pointing at it: it is the same
              pattern, now with the table it never had. */}
          {onLinkCatalog && table.length === 0 && (
            <Button variant="secondary" onClick={onLinkCatalog} className="w-full">
              <Library size={16} aria-hidden="true" />
              Use a load table from the catalog
            </Button>
          )}

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
