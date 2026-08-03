import { BookOpen, ChevronRight, Search, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useOverlay } from "../lib/useOverlay";
import { getAllCatalog, getCatalogBall, syncCatalog } from "../services/ballCatalogRepository";
import { addBall, updateBall } from "../services/ballRepository";
import type { Ball } from "../types/bowling";
import type { CatalogBall, Manufacturer } from "../types/catalog";
import { DEFAULT_WEIGHT } from "../types/catalog";
import { CatalogBallImage } from "./CatalogBallImage";
import { ErrorBanner } from "./ErrorBanner";
import { Button } from "./ui/Button";
import { IconButton } from "./ui/IconButton";

const WEIGHT_OPTIONS = [10, 11, 12, 13, 14, 15, 16];

const FIELD =
  "h-11 w-full rounded-lg border border-edge-strong bg-surface px-3 text-sm text-ink outline-none focus:border-accent-fill focus:ring-2 focus:ring-accent-fill/20";

type WeightSpecs = { rg: number | null; diff: number | null; mbDiff: number | null };

interface BallFormDialogProps {
  /** The ball being edited, or null when adding a new one. */
  ball: Ball | null;
  onClose: () => void;
  onSaved: () => void;
  /** Only supplied when editing — deletion lives with the ball it destroys. */
  onDelete?: () => void;
}

/**
 * Add / edit a ball. A dismissable modal rather than a panel spliced into the
 * arsenal list: the inline version pushed the list down and left the catalog
 * link stranded below the fold, so nobody found it.
 */
export function BallFormDialog({ ball, onClose, onSaved, onDelete }: BallFormDialogProps) {
  const editing = ball !== null;
  const [name, setName] = useState(ball?.name ?? "");
  const [weight, setWeight] = useState<number>(ball?.weight ?? DEFAULT_WEIGHT);
  const [isSpare, setIsSpare] = useState(ball?.is_spare_ball ?? false);
  const [layout, setLayout] = useState(ball?.layout ?? "");
  const [notes, setNotes] = useState(ball?.notes ?? "");
  const [catalogRef, setCatalogRef] = useState<CatalogBall | null>(null);
  const [weightSpecs, setWeightSpecs] = useState<WeightSpecs | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const overlayRef = useOverlay<HTMLDivElement>(onClose, !pickerOpen);

  // Restore the existing catalog link so its image and weight specs resolve.
  useEffect(() => {
    if (!ball?.catalog_ref_id) return;
    void getCatalogBall(ball.catalog_ref_id).then((cb) => setCatalogRef(cb ?? null));
  }, [ball?.catalog_ref_id]);

  // Specs are per weight; fall back to the catalog's top-level (15 lb) numbers.
  useEffect(() => {
    if (!catalogRef) {
      setWeightSpecs(null);
      return;
    }
    void getCatalogBall(catalogRef.id).then((cb) => {
      if (!cb) return setWeightSpecs(null);
      const entry = cb.weights?.find((ws) => ws.weight === weight);
      setWeightSpecs(
        entry
          ? { rg: entry.rg, diff: entry.diff, mbDiff: entry.mbDiff }
          : { rg: cb.rg, diff: cb.diff, mbDiff: cb.mbDiff }
      );
    });
  }, [catalogRef, weight]);

  function linkCatalog(picked: CatalogBall) {
    setCatalogRef(picked);
    setPickerOpen(false);
    // Adding: the catalog entry is the fastest way to name the ball. Editing:
    // never overwrite a name the user already chose.
    if (!editing && !name.trim()) setName(`${picked.brand} ${picked.name}`);
  }

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Ball name is required.");
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      const payload: Omit<Ball, "id"> = {
        name: trimmed,
        is_spare_ball: isSpare,
        layout: layout.trim() || undefined,
        notes: notes.trim() || undefined,
        weight,
        ...(catalogRef
          ? {
              catalog_ref_id: catalogRef.id,
              catalog_snapshot: {
                brand: catalogRef.brand,
                name: catalogRef.name,
                coverstockCategory: catalogRef.coverstockCategory,
                coreName: catalogRef.coreName,
                rg: weightSpecs?.rg ?? catalogRef.rg,
                diff: weightSpecs?.diff ?? catalogRef.diff,
                mbDiff: weightSpecs?.mbDiff ?? catalogRef.mbDiff,
                imageThumb: catalogRef.imageThumb,
              },
            }
          : {}),
      };
      if (editing && ball.id != null) {
        await updateBall(ball.id, payload);
      } else {
        await addBall(payload);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save ball.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={editing ? "Edit ball" : "Add ball"}>
        <div className="absolute inset-0 bg-black/40" onClick={onClose} />
        <div
          ref={overlayRef}
          className="animate-sheet-up relative flex max-h-[92%] w-full max-w-lg flex-col rounded-t-2xl bg-surface-sunken shadow-xl sm:max-h-[85%] sm:rounded-2xl"
        >
          <div className="flex shrink-0 items-center gap-2 border-b border-edge px-2 py-2">
            <IconButton onClick={onClose} label="Close">
              <X size={20} aria-hidden="true" />
            </IconButton>
            <h2 className="flex-1 text-center text-[17px] font-semibold text-ink">
              {editing ? "Edit ball" : "Add ball"}
            </h2>
            <Button
              variant="primary"
              onClick={(e) => void handleSubmit(e)}
              disabled={isSaving}
              className="px-3"
            >
              {isSaving ? "Saving…" : editing ? "Save" : "Add"}
            </Button>
          </div>

          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
          >
            {error && <ErrorBanner>{error}</ErrorBanner>}

            {/* Catalog link — first thing in the form, and always visible, so
                the fastest path to a fully specced ball is also the obvious one. */}
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="flex w-full items-center gap-3 rounded-xl border border-edge bg-surface p-3 text-left hover:border-accent-fill"
            >
              {catalogRef ? (
                <>
                  <div className="h-12 w-12 shrink-0">
                    <CatalogBallImage src={catalogRef.imageThumb} alt={catalogRef.name} brand={catalogRef.brand} size="thumb" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">Linked to catalog</p>
                    <p className="truncate text-sm font-semibold text-ink">
                      {catalogRef.brand} {catalogRef.name}
                    </p>
                    <p className="truncate text-xs text-ink-secondary">
                      {[
                        catalogRef.coverstockCategory,
                        catalogRef.coreName,
                        weightSpecs?.rg != null ? `RG ${weightSpecs.rg.toFixed(2)}` : null,
                        weightSpecs?.diff != null ? `Diff ${weightSpecs.diff.toFixed(3)}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-accent">Change</span>
                </>
              ) : (
                <>
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                    <BookOpen size={20} aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">Link to catalog</p>
                    <p className="text-xs text-ink-secondary">Pulls in the core, coverstock, RG and diff.</p>
                  </div>
                  <ChevronRight size={18} className="shrink-0 text-ink-tertiary" aria-hidden="true" />
                </>
              )}
            </button>
            {catalogRef && (
              <button
                type="button"
                onClick={() => setCatalogRef(null)}
                className="-mt-2 text-xs font-semibold text-ink-secondary underline"
              >
                Unlink from catalog
              </button>
            )}

            <div>
              <label htmlFor="ball-name" className="mb-1 block text-sm font-medium text-ink-strong">
                Name <span className="text-danger-600">*</span>
              </label>
              <input
                id="ball-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Storm Phaze II"
                className={FIELD}
              />
            </div>

            <div>
              <label htmlFor="ball-weight" className="mb-1 block text-sm font-medium text-ink-strong">
                Weight <span className="font-normal text-ink-secondary">(lbs)</span>
              </label>
              <select id="ball-weight" value={weight} onChange={(e) => setWeight(Number(e.target.value))} className={FIELD}>
                {WEIGHT_OPTIONS.map((w) => (
                  <option key={w} value={w}>
                    {w} lb
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-start gap-3 rounded-xl border border-edge bg-surface p-3">
              <input
                type="checkbox"
                checked={isSpare}
                onChange={(e) => setIsSpare(e.target.checked)}
                className="mt-0.5 h-5 w-5 rounded border-edge-strong accent-[rgb(var(--color-accent-fill))]"
              />
              <span>
                <span className="block text-sm font-medium text-ink-strong">Spare ball</span>
                <span className="block text-xs text-ink-secondary">
                  Auto-selected for spare shots. Only one ball can be the spare ball.
                </span>
              </span>
            </label>

            <div>
              <label htmlFor="ball-layout" className="mb-1 block text-sm font-medium text-ink-strong">
                Layout <span className="font-normal text-ink-secondary">(optional)</span>
              </label>
              <input
                id="ball-layout"
                type="text"
                value={layout}
                onChange={(e) => setLayout(e.target.value)}
                placeholder="e.g. 45° × 4-1/2″ × 35°"
                className={FIELD}
              />
            </div>

            <div>
              <label htmlFor="ball-notes" className="mb-1 block text-sm font-medium text-ink-strong">
                Notes <span className="font-normal text-ink-secondary">(optional)</span>
              </label>
              <textarea
                id="ball-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Any notes about this ball…"
                className="w-full rounded-lg border border-edge-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent-fill focus:ring-2 focus:ring-accent-fill/20"
              />
            </div>

            {onDelete && (
              <Button variant="danger-ghost" onClick={onDelete} className="w-full">
                <Trash2 size={16} aria-hidden="true" />
                Delete ball
              </Button>
            )}
            {/* Enables the keyboard's Go/Return to submit without a visible row. */}
            <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true" />
          </form>
        </div>
      </div>

      {pickerOpen && <CatalogPickerDialog onPick={linkCatalog} onClose={() => setPickerOpen(false)} />}
    </>
  );
}

interface CatalogPickerDialogProps {
  onPick: (ball: CatalogBall) => void;
  onClose: () => void;
}

/**
 * Full-screen catalog search, layered above the form. Full-screen on purpose:
 * as a short scroll region nested inside the form it was invisible unless you
 * happened to scroll to it.
 */
function CatalogPickerDialog({ onPick, onClose }: CatalogPickerDialogProps) {
  const [balls, setBalls] = useState<CatalogBall[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const overlayRef = useOverlay<HTMLDivElement>(onClose);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Await the sync, don't just fire it: on a first run the local table is
      // empty, and reading past an in-flight sync showed "no catalog balls" on
      // a catalog that was seconds from arriving. Offline it fails fast and the
      // read below still serves whatever was cached.
      try {
        await syncCatalog();
      } catch {
        // fall through to whatever is already in the DB
      }
      const all = await getAllCatalog().catch(() => []);
      if (cancelled) return;
      setBalls(all);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const q = query.toLowerCase().trim();
  const shown = q
    ? balls.filter((b) => [b.name, b.brand, b.coverstockRaw].join(" ").toLowerCase().includes(q))
    : balls;

  return (
    <div
      ref={overlayRef}
      className="animate-push-in fixed inset-0 z-[70] flex flex-col bg-surface-sunken"
      role="dialog"
      aria-modal="true"
      aria-label="Pick from catalog"
    >
      <div className="shrink-0 border-b border-edge bg-surface pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-2 py-2">
          <IconButton onClick={onClose} label="Close catalog picker">
            <X size={20} aria-hidden="true" />
          </IconButton>
          <h2 className="flex-1 text-center text-[17px] font-semibold text-ink">Catalog</h2>
          <span className="w-11" aria-hidden="true" />
        </div>
        <div className="mx-auto w-full max-w-3xl px-3 pb-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-tertiary" aria-hidden="true" />
            <input
              type="search"
              autoFocus
              placeholder="Search name, brand, coverstock…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-11 w-full rounded-xl border border-edge-strong bg-surface pl-9 pr-3 text-sm text-ink outline-none focus:border-accent-fill focus:ring-2 focus:ring-accent-fill/20"
            />
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-3xl px-3 py-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {loading ? (
            <p className="text-sm text-ink-secondary">Loading catalog…</p>
          ) : shown.length === 0 ? (
            <p className="text-sm text-ink-secondary">
              {balls.length === 0 ? "No catalog balls found. Try refreshing the catalog." : `No matches for “${query}”.`}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {shown.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => onPick(b)}
                    className="flex w-full items-center gap-3 rounded-xl border border-edge bg-surface p-2.5 text-left hover:border-accent-fill"
                  >
                    <div className="h-12 w-12 shrink-0">
                      <CatalogBallImage src={b.imageThumb} alt={b.name} brand={b.brand as Manufacturer} size="thumb" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-secondary">{b.brand}</p>
                      <p className="truncate text-sm font-semibold text-ink">{b.name}</p>
                      <p className="truncate text-xs text-ink-secondary">
                        {[b.coverstockCategory, b.coreType, b.rg !== null ? `RG ${b.rg.toFixed(2)}` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <ChevronRight size={18} className="shrink-0 text-ink-tertiary" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
