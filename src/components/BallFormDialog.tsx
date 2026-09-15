import { BookOpen, ChevronRight, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getAllCatalog, getCatalogBall, syncCatalog } from "../services/ballCatalogRepository";
import { addBall, updateBall } from "../services/ballRepository";
import { getLayoutSystem } from "../services/bowlingRepository";
import {
  DEFAULT_ASYMMETRIC,
  DEFAULT_SYMMETRIC,
  makeLayoutSpec,
  specToBall,
  specToLayout,
  type DualAngleLayout
} from "../lib/ballLayout";
import type { Ball, BallLayoutSpec, LayoutSystem } from "../types/bowling";
import type { CatalogBall, Manufacturer } from "../types/catalog";
import { DEFAULT_WEIGHT } from "../types/catalog";
import { CatalogBallImage } from "./CatalogBallImage";
import { LayoutEditor } from "./LayoutEditor";
import { Measure } from "./ui/Measure";
import { SegmentedControl } from "./ui/SegmentedControl";
import { GROUP_HEADING } from "./ui/typography";
import { ConfirmDialog } from "./ConfirmDialog";
import { ErrorBanner } from "./ErrorBanner";
import { Button } from "./ui/Button";
import { FIELD } from "./ui/field";
import { FormSheet } from "./ui/FormSheet";

const WEIGHT_OPTIONS = [10, 11, 12, 13, 14, 15, 16];

/** What a fresh layout opens on: the benchmark every chart is read against,
 *  and the same one the layout lab starts from. */
const BENCHMARK_LAYOUT: DualAngleLayout = { drillingAngle: 45, pinToPap: 4.5, valAngle: 45 };

type WeightSpecs = { rg: number | null; diff: number | null; mbDiff: number | null };

interface BallFormDialogProps {
  /** The ball being edited, or null when adding a new one. */
  ball: Ball | null;
  onClose: () => void;
  onSaved: () => void;
  /** Only supplied when editing, deletion lives with the ball it destroys. */
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
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  // The drilling as numbers, and the free text the field used to take. The old
  // text is never written again and never thrown away: a ball entered before
  // this screen could hold numbers still has to show what was typed on it
  // (ADR-095). Entering a layout is what retires it.
  const [layoutSpec, setLayoutSpec] = useState<BallLayoutSpec | null>(ball?.layout_spec ?? null);
  const legacyLayout = ball?.layout_spec ? undefined : ball?.layout;
  const [notes, setNotes] = useState(ball?.notes ?? "");
  const [catalogRef, setCatalogRef] = useState<CatalogBall | null>(null);
  const [weightSpecs, setWeightSpecs] = useState<WeightSpecs | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  // Which notation a ball with no notation of its own is read in. Undefined
  // while it loads, which the field shows as the app's own default rather than
  // flashing the wrong words.
  const systemPreference = useLiveQuery(getLayoutSystem, [], undefined) ?? "dual";


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

  async function handleSubmit(e?: React.SyntheticEvent) {
    e?.preventDefault();
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
        layout_spec: layoutSpec ?? undefined,
        // Kept rather than migrated: parsing "45 x 4.5 x 35" out of free text
        // would be guessing at a core type and a pin-to-PSA distance nobody
        // wrote down, and a guessed layout is worse than a remembered string.
        layout: layoutSpec ? undefined : legacyLayout,
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
      <FormSheet
        title={editing ? "Edit ball" : "Add ball"}
        onClose={onClose}
        onConfirm={() => void handleSubmit()}
        confirmLabel={editing ? "Save" : "Add"}
        confirmDisabled={isSaving}
        banner={error ? <ErrorBanner>{error}</ErrorBanner> : undefined}
      >
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">

            {/* Catalog link, first thing in the form, and always visible, so
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
                    <p className="text-xs text-ink-secondary">Fills in the core, coverstock, RG and diff.</p>
                  </div>
                  <ChevronRight size={18} className="shrink-0 text-ink-tertiary" aria-hidden="true" />
                </>
              )}
            </button>
            {catalogRef && (
              <button
                type="button"
                onClick={() => setConfirmUnlink(true)}
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

            <LayoutField
              spec={layoutSpec}
              onChange={setLayoutSpec}
              preference={systemPreference}
              legacyText={legacyLayout}
              // What the catalog says about the core, where the ball is linked
              // to one. An unlinked ball opens asymmetric, which is what the
              // lab opens on and what most balls carrying a layout worth
              // recording are: a guess either way, and this is the likelier.
              defaultSymmetric={
                catalogRef?.coreType
                  ? catalogRef.coreType !== "Asymmetric"
                  : weightSpecs?.mbDiff != null
                    ? weightSpecs.mbDiff === 0
                    : false
              }
            />

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
      </FormSheet>

      {pickerOpen && <CatalogPickerSheet onPick={linkCatalog} onClose={() => setPickerOpen(false)} />}

      <ConfirmDialog
        open={confirmUnlink}
        title="Unlink from the catalog?"
        message="The photo and specs come off this ball. Shots keep their scores."
        confirmLabel="Unlink"
        onConfirm={() => {
          setConfirmUnlink(false);
          setCatalogRef(null);
        }}
        onCancel={() => setConfirmUnlink(false)}
      />
    </>
  );
}

interface CatalogPickerSheetProps {
  onPick: (ball: CatalogBall) => void;
  onClose: () => void;
}

/**
 * Catalog search, layered over the ball form. A sheet like every other picker
 * in the app (the spare line picker is the same shape): it used to be an opaque
 * full-screen page that slid in like a push but closed with an X, so it read as
 * a place you had navigated to and dismissed like a task. What it must not be
 * is a short scroll region nested inside the form, which is where it started
 * and where nobody found it.
 */
function CatalogPickerSheet({ onPick, onClose }: CatalogPickerSheetProps) {
  const [balls, setBalls] = useState<CatalogBall[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

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
    <FormSheet
      title="Catalog"
      onClose={onClose}
      // Fixed height: the list arrives asynchronously and then filters as you
      // type, and a sheet that hugs its content would jump on both.
      size="tall"
      // The search rides in the banner slot, outside the scroll area, so it
      // stays put while the results move under it.
      banner={
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-tertiary"
            aria-hidden="true"
          />
          <input
            type="search"
            autoFocus
            placeholder="Search name, brand, coverstock…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={`${FIELD} rounded-xl pl-9`}
          />
        </div>
      }
    >
      {loading ? (
        <p className="text-sm text-ink-secondary">Loading catalog…</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-ink-secondary">
          {balls.length === 0
            ? "The catalog has not loaded yet. It needs one connection, then it works offline."
            : `Nothing in the catalog matches "${query}".`}
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
    </FormSheet>
  );
}

/**
 * A ball's drilling, as the numbers it is: the same sliders the layout lab
 * carries, on the ball that owns them.
 *
 * It replaced a free text box that took `45 x 4 1/2 x 35` as a string. The box
 * asked the bowler to be the formatter, so it held whatever they typed, in
 * whichever notation, with whatever punctuation, and nothing downstream could
 * read it: the arsenal could show it and that was the whole of what a stored
 * layout could do. Numbers convert between notations, draw on a ball, and read
 * back out as motion. That is the reason for the change, not tidiness.
 *
 * A layout is optional and stays optional. A ball with none shows one control
 * that offers one, rather than three sliders parked on a benchmark layout
 * nobody drilled, which would be the form inventing a fact about the ball.
 */
function LayoutField({
  spec,
  onChange,
  preference,
  legacyText,
  defaultSymmetric
}: {
  spec: BallLayoutSpec | null;
  onChange: (spec: BallLayoutSpec | null) => void;
  preference: LayoutSystem;
  /** What the old free text field holds on this ball, if it has not been
   *  replaced by numbers yet. */
  legacyText?: string;
  /** What the catalog says this ball's core is, so adding a layout opens on the
   *  right one. A guess the bowler can correct, not a fact stored anywhere. */
  defaultSymmetric: boolean;
}) {
  const ball = spec ? specToBall(spec) : null;
  const layout = spec ? specToLayout(spec) : null;
  // What the sliders are editing in. A ball that has never been given a
  // notation of its own follows the preference, and keeps following it: that is
  // what makes the preference worth having.
  const system = spec?.system ?? preference;

  const setLayout = (next: DualAngleLayout) => {
    if (!spec) return;
    onChange({ ...spec, ...next });
  };

  const setCore = (symmetric: boolean) => {
    if (!spec || spec.symmetric === symmetric) return;
    // The core marker moves with the core type: a symmetric ball is measured to
    // its CG, an asymmetric one to a PSA the core puts much further out, so
    // carrying the old distance across would describe a ball that does not
    // exist.
    const base = symmetric ? DEFAULT_SYMMETRIC : DEFAULT_ASYMMETRIC;
    onChange({ ...spec, symmetric, pinToCore: base.pinToCore });
  };

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className={GROUP_HEADING}>Layout</h2>
        {spec && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-xs font-semibold text-ink-secondary underline"
          >
            Remove layout
          </button>
        )}
      </div>

      {legacyText && (
        <p className="rounded-lg bg-surface-muted p-2.5 text-xs text-ink-secondary">
          This ball carries the layout you typed before:{" "}
          <span className="font-semibold text-ink">
            <Measure>{legacyText}</Measure>
          </span>
          . Entering it below replaces the text with numbers.
        </p>
      )}

      {spec == null || ball == null || layout == null ? (
        <button
          type="button"
          onClick={() =>
            onChange(
              makeLayoutSpec(BENCHMARK_LAYOUT, defaultSymmetric ? DEFAULT_SYMMETRIC : DEFAULT_ASYMMETRIC)
            )
          }
          className="flex w-full items-center gap-3 rounded-xl border border-dashed border-edge-strong bg-surface p-3 text-left hover:border-accent-fill"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Plus size={18} aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">Add a layout</p>
            <p className="text-xs text-ink-secondary">
              Dual angle or Storm VLS, on sliders. Opens on the benchmark.
            </p>
          </div>
        </button>
      ) : (
        <>
          {/* The core type first, because it changes what the drilling angle
              means and therefore what every slider under it does. Same order,
              and the same reason, as the layout lab. */}
          <SegmentedControl
            label="Core type"
            value={spec.symmetric ? "sym" : "asym"}
            onChange={(v) => setCore(v === "sym")}
            options={[
              { value: "asym", label: "Asym", srLabel: "Asymmetric" },
              { value: "sym", label: "Sym", srLabel: "Symmetric" }
            ]}
          />

          <LayoutEditor
            layout={layout}
            onChange={setLayout}
            ball={ball}
            system={system}
            // Picking a notation here is picking how this ball is written down,
            // not just how it is being typed: the arsenal reads it back in the
            // same one. A ball that never asked keeps following the preference.
            onSystemChange={(next) => onChange({ ...spec, system: next })}
            idPrefix="ball"
          />

          {spec.system && (
            <button
              type="button"
              onClick={() => {
                const { system: _dropped, ...rest } = spec;
                onChange(rest);
              }}
              className="text-xs font-semibold text-ink-secondary underline"
            >
              Read this ball in my default notation
            </button>
          )}
        </>
      )}
    </section>
  );
}
