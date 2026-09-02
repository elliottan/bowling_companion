import { BookOpen, ExternalLink, Loader2, Palette, RefreshCw, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CatalogBallImage } from "../components/CatalogBallImage";
import { ErrorBanner } from "../components/ErrorBanner";
import { Button } from "../components/ui/Button";
import { Chip, TAP_TARGET_44 } from "../components/ui/Chip";
import { IconButton } from "../components/ui/IconButton";
import { EmptyState } from "../components/ui/EmptyState";
import { FormSheet } from "../components/ui/FormSheet";
import { PushScreen } from "../components/PushScreen";
import {
  getAllCatalog,
  syncCatalog,
  type SyncState,
} from "../services/ballCatalogRepository";
import type { CatalogBall, CoverstockCategory, Manufacturer } from "../types/catalog";
import type { Ball } from "../types/bowling";
import { addBall, getBalls } from "../services/ballRepository";
import { GROUP_HEADING } from "../components/ui/typography";
import { FIELD, FIELD_LABEL } from "../components/ui/field";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SortKey = "releaseDate" | "rg" | "diff" | "name";

interface Filters {
  search: string;
  brands: Set<Manufacturer>;
  coverstockCategories: Set<CoverstockCategory>;
  coreType: "Symmetric" | "Asymmetric" | null;
  rgMin: number;
  rgMax: number;
  diffMin: number;
  diffMax: number;
}

const RG_MIN = 2.40;
const RG_MAX = 2.95;
const DIFF_MIN = 0;
const DIFF_MAX = 0.065;
const ALL_BRANDS: Manufacturer[] = ["Storm", "Roto Grip", "900 Global", "Motiv", "Pyramid"];
const ALL_COVERSTOCK: CoverstockCategory[] = ["Solid", "Pearl", "Hybrid", "Urethane", "Polyester"];

const EMPTY_FILTERS: Filters = {
  search: "",
  brands: new Set(),
  coverstockCategories: new Set(),
  coreType: null,
  rgMin: RG_MIN,
  rgMax: RG_MAX,
  diffMin: DIFF_MIN,
  diffMax: DIFF_MAX,
};

// ---------------------------------------------------------------------------
// Filter/sort logic (pure, memoized in component)
// ---------------------------------------------------------------------------

function applyFilters(balls: CatalogBall[], filters: Filters, sort: SortKey): CatalogBall[] {
  const q = filters.search.toLowerCase().trim();

  const filtered = balls.filter((b) => {
    if (q) {
      const haystack = [b.name, b.brand, b.coverstockRaw, b.coreName ?? ""].join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (filters.brands.size > 0 && !filters.brands.has(b.brand)) return false;
    if (filters.coverstockCategories.size > 0 && (b.coverstockCategory === null || !filters.coverstockCategories.has(b.coverstockCategory))) return false;
    if (filters.coreType !== null && b.coreType !== filters.coreType) return false;
    if (b.rg !== null && (b.rg < filters.rgMin || b.rg > filters.rgMax)) return false;
    if (b.diff !== null && (b.diff < filters.diffMin || b.diff > filters.diffMax)) return false;
    return true;
  });

  return filtered.slice().sort((a, b) => {
    switch (sort) {
      case "releaseDate":
        return (b.releaseYear ?? 0) - (a.releaseYear ?? 0);
      case "rg":
        return (a.rg ?? 99) - (b.rg ?? 99);
      case "diff":
        return (b.diff ?? 0) - (a.diff ?? 0);
      case "name":
        return a.name.localeCompare(b.name);
    }
  });
}

// ---------------------------------------------------------------------------
// Detail panel
// ---------------------------------------------------------------------------

interface DetailPanelProps {
  ball: CatalogBall;
  owned: boolean;
  onBack: () => void;
  onAddToArsenal: (ball: CatalogBall) => void;
  /** True while AddFromCatalogDialog is stacked on top, disables this
   *  panel's own Escape/focus-trap so only the topmost overlay responds. */
  addDialogOpen: boolean;
}

// Swipeable colorway image carousel with pagination dots. Falls back to a
// single image when the ball has 0–1 colorways.
function ColorwayCarousel({ ball }: { ball: CatalogBall }) {
  const colorways = ball.colorways ?? [];
  const [idx, setIdx] = useState(0);
  const touchX = useRef<number | null>(null);

  if (colorways.length <= 1) {
    const cw = colorways[0];
    return (
      <CatalogBallImage
        src={cw?.imageFull ?? ball.imageFull}
        alt={ball.name}
        brand={ball.brand}
        size="full"
      />
    );
  }

  const current = colorways[idx];
  const go = (next: number) => setIdx((next + colorways.length) % colorways.length);

  return (
    <div>
      <div
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX.current === null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          if (Math.abs(dx) > 40) go(dx < 0 ? idx + 1 : idx - 1);
          touchX.current = null;
        }}
      >
        <CatalogBallImage
          src={current.imageFull ?? ball.imageFull}
          alt={`${ball.name}${current.color ? `, ${current.color}` : ""}`}
          brand={ball.brand}
          size="full"
        />
      </div>
      {current.color && (
        <p className="mt-2 text-center text-sm font-medium text-ink-secondary">{current.color}</p>
      )}
      {/* Pagination dots */}
      <div className="mt-2 flex items-center justify-center gap-1.5">
        {colorways.map((cw, i) => (
          <button
            key={cw.sku}
            type="button"
            onClick={() => setIdx(i)}
            aria-label={`View colorway ${i + 1}${cw.color ? `: ${cw.color}` : ""}`}
            aria-current={i === idx}
            className={`h-2 rounded-full transition-all ${
              i === idx ? "w-5 bg-accent-fill" : "w-2 bg-edge-strong hover:bg-ink-tertiary"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function DetailPanel({ ball, owned, onBack, onAddToArsenal, addDialogOpen }: DetailPanelProps) {
  return (
    // A ball detail is one level deeper than the list, so it pushes like one
    //, same nav bar, same back gesture, opened at the top regardless of where
    // the list was scrolled to.
    <PushScreen title={ball.name} onBack={onBack} active={!addDialogOpen}>
      <div>
        <div className="mx-auto w-full max-w-xl px-3 py-5 sm:px-6">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-secondary">{ball.brand}</p>
          <div className="mt-2" />
          <ColorwayCarousel ball={ball} />

          {ball.releaseYear && (
            <p className="mt-3 text-sm text-ink-secondary">{ball.releaseYear}</p>
          )}

          <dl className="mt-4 space-y-2">
            <SpecItem label="Coverstock" value={ball.coverstockRaw} />
            <SpecItem label="Category" value={ball.coverstockCategory ?? "Unclassified"} />
            {ball.factoryFinish && <SpecItem label="Factory finish" value={ball.factoryFinish} />}
            {ball.coreName && <SpecItem label="Core" value={ball.coreName} />}
            <SpecItem label="Core type" value={ball.coreType ?? "-"} />
            <SpecItem label="RG" value={ball.rg !== null ? ball.rg.toFixed(2) : "-"} />
            <SpecItem label="Diff" value={ball.diff !== null ? ball.diff.toFixed(3) : "-"} />
            {ball.mbDiff !== null && <SpecItem label="MB diff" value={ball.mbDiff.toFixed(3)} />}
          </dl>

          {/* The manufacturer's own page for the ball, so the specs above can
              be checked against the source. MOTIV's licence asks for it. */}
          {ball.productUrl && (
            <a
              href={ball.productUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent underline underline-offset-2"
            >
              <ExternalLink size={14} aria-hidden="true" />
              View on {ball.brand}
            </a>
          )}

          {owned ? (
            <div className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg border border-accent-fill/30 bg-accent-soft px-4 py-3.5 text-sm font-semibold text-accent">
              Already in your arsenal
            </div>
          ) : (
            <Button variant="primary" size="lg" onClick={() => onAddToArsenal(ball)} className="mt-5 w-full">
              Add to arsenal
            </Button>
          )}
        </div>
      </div>
    </PushScreen>
  );
}

function SpecItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-edge py-1.5">
      <dt className="text-xs font-semibold text-ink-secondary">{label}</dt>
      <dd className="text-sm font-medium text-ink">{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Range slider, single track, fill between handles, commit on release
// ---------------------------------------------------------------------------

interface RangeSliderProps {
  label: string;
  min: number;
  max: number;
  step: number;
  valueMin: number;
  valueMax: number;
  format: (v: number) => string;
  onChange: (min: number, max: number) => void;
}

function RangeSlider({ label, min, max, step, valueMin, valueMax, format, onChange }: RangeSliderProps) {
  // Draft state: live while dragging, committed on release
  const [draft, setDraft] = useState<{ min: number; max: number } | null>(null);
  const displayMin = draft?.min ?? valueMin;
  const displayMax = draft?.max ?? valueMax;

  // Percent helpers for the filled track
  const range = max - min;
  const leftPct = ((displayMin - min) / range) * 100;
  const rightPct = ((displayMax - min) / range) * 100;

  function commitDraft(dMin: number, dMax: number) {
    setDraft(null);
    onChange(dMin, dMax);
  }

  // A range input only fires mouseup or touchend when the pointer is released
  // over the input itself, and dragging a handle to an end value normally takes
  // the thumb off the track. Released anywhere else, the draft was never
  // committed and the filter silently did not apply. The window always sees the
  // release, so that is where the commit hangs.
  useEffect(() => {
    if (!draft) return;
    const commit = () => {
      setDraft(null);
      onChange(draft.min, draft.max);
    };
    window.addEventListener("pointerup", commit);
    window.addEventListener("pointercancel", commit);
    return () => {
      window.removeEventListener("pointerup", commit);
      window.removeEventListener("pointercancel", commit);
    };
  }, [draft, onChange]);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-ink-strong">{label}</span>
        <span className="text-xs text-ink-secondary">{format(displayMin)} to {format(displayMax)}</span>
      </div>
      <div className="relative h-5 flex items-center">
        {/* Track background */}
        <div className="absolute inset-x-0 h-1 rounded-full bg-edge" />
        {/* Filled segment between handles */}
        <div
          className="absolute h-1 rounded-full bg-accent-fill"
          style={{ left: `${leftPct}%`, right: `${100 - rightPct}%` }}
        />
        {/* Min handle */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={displayMin}
          onChange={(e) => {
            const v = Math.min(Number(e.target.value), displayMax - step);
            setDraft({ min: v, max: displayMax });
          }}
          onKeyUp={() => commitDraft(displayMin, displayMax)}
          className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent accent-[rgb(var(--color-accent-fill))] [&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-10"
        />
        {/* Max handle */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={displayMax}
          onChange={(e) => {
            const v = Math.max(Number(e.target.value), displayMin + step);
            setDraft({ min: displayMin, max: v });
          }}
          onKeyUp={() => commitDraft(displayMin, displayMax)}
          className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent accent-[rgb(var(--color-accent-fill))] [&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-10"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add-to-arsenal confirm dialog
// ---------------------------------------------------------------------------

interface AddFromCatalogDialogProps {
  ball: CatalogBall;
  onConfirm: (name: string, colorwaySku?: string) => void;
  onCancel: () => void;
  isSaving: boolean;
  error: string;
}

function AddFromCatalogDialog({ ball, onConfirm, onCancel, isSaving, error }: AddFromCatalogDialogProps) {
  const [name, setName] = useState(`${ball.brand} ${ball.name}`);
  const colorways = ball.colorways ?? [];
  const [colorwaySku, setColorwaySku] = useState<string | undefined>(colorways[0]?.sku);

  return (
    <FormSheet
      title="Add to arsenal"
      onClose={onCancel}
      onConfirm={() => onConfirm(name.trim(), colorwaySku)}
      confirmLabel="Add to arsenal"
      confirmDisabled={isSaving || !name.trim()}
      banner={error ? <ErrorBanner>{error}</ErrorBanner> : undefined}
    >
      <p className="mb-3 text-sm text-ink-secondary">
        The specs come across with it. Change the name now if you call it something else.
      </p>
      <label className={FIELD_LABEL} htmlFor="catalog-ball-name">
        Name
      </label>
      <input
        id="catalog-ball-name"
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className={FIELD}
      />
      {colorways.length > 1 && (
        <div className="mt-3">
          <p className={FIELD_LABEL}>Colorway</p>
          <div className="flex flex-wrap gap-2">
            {colorways.map((cw) => (
              <Chip
                key={cw.sku}
                selected={colorwaySku === cw.sku}
                onClick={() => setColorwaySku(cw.sku)}
              >
                {cw.color ?? cw.sku}
              </Chip>
            ))}
          </div>
        </div>
      )}
    </FormSheet>
  );
}

/** Removable active-filter chip shown under the search bar while the filter panel is closed. */
/** Removes an active filter. Deliberately NOT a `Chip`, this is an action,
 *  not a toggle, so it must not claim `aria-pressed`. It borrows Chip's
 *  tap-target expansion to stay compact while still clearing 44pt. */
function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Remove filter: ${label}`}
      className={`relative inline-flex h-9 items-center gap-1 rounded-md bg-accent-soft px-3 text-xs font-semibold text-accent ${TAP_TARGET_44}`}
    >
      {label}
      <X size={12} aria-hidden="true" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main CatalogView, renders as fixed full-screen overlay (covers bottom nav)
// ---------------------------------------------------------------------------

interface CatalogViewProps {
  /** Pops whatever is on top: the ball detail if one is open, else the catalog
   *  itself. Routed through the app's history-backed back, so the platform's
   *  own back gesture pops exactly the same layer (see useHistoryRoute). */
  onBack: () => void;
  /** The open ball's catalog id, or null. Held in nav state rather than here so
   *  the detail is a real history entry. */
  selectedBallId: string | null;
  onSelectBall: (ballId: string) => void;
}

export function CatalogView({ onBack, selectedBallId, onSelectBall }: CatalogViewProps) {
  const [syncState, setSyncState] = useState<SyncState>({ status: "idle" });
  // The catalog is the one thing in the app that needs the network once. An
  // offline empty state that says "Refresh" offers a button that cannot work,
  // so it says what will work instead.
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  const [allBalls, setAllBalls] = useState<CatalogBall[]>([]);
  // Resolved from the id rather than stored: the detail can be restored from a
  // URL before the catalog has loaded, and this simply renders once it has.
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortKey>("releaseDate");
  const [addingBall, setAddingBall] = useState<CatalogBall | null>(null);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  // Set of catalog IDs the user already owns
  const [ownedIds, setOwnedIds] = useState<Set<string>>(new Set());
  const syncStarted = useRef(false);

  // Load balls from DB into state.
  async function loadBalls() {
    const balls = await getAllCatalog();
    setAllBalls(balls);
  }

  // Load arsenal to build owned-id set.
  async function loadOwned() {
    const arsenalBalls = await getBalls();
    const ids = new Set<string>();
    for (const b of arsenalBalls) {
      if (b.catalog_ref_id) {
        ids.add(b.catalog_ref_id);
      } else if (b.catalog_snapshot) {
        // Fallback: match by brand+name against catalog
        const key = `${b.catalog_snapshot.brand} ${b.catalog_snapshot.name}`.toLowerCase();
        ids.add(key);
      }
    }
    setOwnedIds(ids);
  }

  // Sync on mount (once).
  useEffect(() => {
    if (syncStarted.current) return;
    syncStarted.current = true;

    void syncCatalog((state) => {
      setSyncState(state);
      if (state.status === "done") {
        void loadBalls();
      }
    }).then(() => {
      // Always load from DB after sync attempt (catches version-unchanged case).
      void loadBalls();
    });
    void loadOwned();
  }, []);

  function handleRefresh() {
    syncStarted.current = false;
    setSyncState({ status: "idle" });
    syncStarted.current = true;
    void syncCatalog((state) => {
      setSyncState(state);
      if (state.status === "done") {
        void loadBalls();
      }
    }).then(() => {
      void loadBalls();
    });
  }

  // Memoized filtered + sorted list.
  const displayed = useMemo(() => applyFilters(allBalls, filters, sort), [allBalls, filters, sort]);

  function toggleSetValue<T>(set: Set<T>, value: T): Set<T> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value); else next.add(value);
    return next;
  }

  function isOwned(ball: CatalogBall): boolean {
    if (ownedIds.has(ball.id)) return true;
    // Fallback key for balls added before catalog_ref_id was stored
    const key = `${ball.brand} ${ball.name}`.toLowerCase();
    return ownedIds.has(key);
  }

  async function handleAddToArsenal(catalogBall: CatalogBall, name: string, colorwaySku?: string) {
    setAddSaving(true);
    setAddError("");
    try {
      const colorway = catalogBall.colorways?.find((c) => c.sku === colorwaySku);
      const payload: Omit<Ball, "id"> = {
        name,
        is_spare_ball: false,
        catalog_ref_id: catalogBall.id,
        ...(colorwaySku ? { colorway_sku: colorwaySku } : {}),
        catalog_snapshot: {
          brand: catalogBall.brand,
          name: catalogBall.name,
          coverstockCategory: catalogBall.coverstockCategory,
          coreName: catalogBall.coreName,
          rg: catalogBall.rg,
          diff: catalogBall.diff,
          mbDiff: catalogBall.mbDiff,
          imageThumb: colorway?.imageThumb ?? catalogBall.imageThumb,
        },
      };
      await addBall(payload);
      setAddingBall(null);
      // Refresh owned set after adding
      await loadOwned();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to save ball.");
    } finally {
      setAddSaving(false);
    }
  }

  // Catalog version info from done state.
  const doneState = syncState.status === "done" ? syncState : null;

  // Active filter count badge (no year filter any more)
  const selectedBall = selectedBallId
    ? (allBalls.find((b) => b.id === selectedBallId) ?? null)
    : null;

  const activeFilterCount = (() => {
    let count = 0;
    if (filters.brands.size) count++;
    if (filters.coverstockCategories.size) count++;
    if (filters.coreType) count++;
    if (filters.rgMin > RG_MIN || filters.rgMax < RG_MAX) count++;
    if (filters.diffMin > DIFF_MIN || filters.diffMax < DIFF_MAX) count++;
    return count;
  })();

  return (
    <PushScreen
      title="Catalog"
      onBack={onBack}
      active={selectedBallId === null && addingBall === null}
      trailing={
        <IconButton onClick={handleRefresh} label="Refresh catalog" variant="round">
          <RefreshCw size={20} aria-hidden="true" />
        </IconButton>
      }
    >
      {/* Search + filters stay pinned above the list they narrow. */}
      <div className="sticky top-0 z-10 border-b border-edge bg-surface-sunken mx-auto w-full max-w-3xl px-3 pt-3 sm:px-6">
        {/* Sync state banner */}
        {syncState.status === "syncing" && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-edge bg-surface-muted px-3 py-2 text-sm text-ink-secondary">
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            Syncing catalog…
          </div>
        )}
        {syncState.status === "error" && (
          <div className="mb-3 rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-sm text-warning-700">
            <span className="font-semibold">Could not update the catalog:</span> {syncState.message}. Showing last saved data.
          </div>
        )}

        {/* Search */}
        <div className="relative mb-3">
          <input
            type="search"
            placeholder="Search name, brand, coverstock…"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            className={`${FIELD} pr-10`}
          />
          {filters.search && (
            <IconButton
              onClick={() => setFilters((f) => ({ ...f, search: "" }))}
              label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2"
            >
              <X size={14} aria-hidden="true" />
            </IconButton>
          )}
        </div>

        {/* Filter toggle + sort row */}
        <div className="mb-3 flex items-center gap-2">
          <Chip selected={showFilters} onClick={() => setShowFilters((v) => !v)}>
            Filters
            {activeFilterCount > 0 ? (
              <span className="ml-1 rounded-full bg-accent-on-fill/25 px-1.5 py-0.5 text-xs font-bold leading-none">{activeFilterCount}</span>
            ) : null}
          </Chip>

          <div className="flex-1" />

          <label className="flex items-center gap-1.5 text-sm text-ink-strong">
            <span className="font-medium">Sort:</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="rounded-md border border-edge-strong bg-surface px-2 py-1.5 text-sm outline-none focus:border-accent-fill"
            >
              <option value="releaseDate">Newest first</option>
              <option value="rg">RG, low to high</option>
              <option value="diff">Diff, high to low</option>
              <option value="name">Name, A to Z</option>
            </select>
          </label>
        </div>

        {/* Active-filter chips: visible while the panel is closed so the
            narrowing state stays legible; tap a chip to remove that filter. */}
        {!showFilters && activeFilterCount > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {[...filters.brands].map((brand) => (
              <FilterChip
                key={`b-${brand}`}
                label={brand}
                onRemove={() => setFilters((f) => ({ ...f, brands: toggleSetValue(f.brands, brand) }))}
              />
            ))}
            {[...filters.coverstockCategories].map((cs) => (
              <FilterChip
                key={`c-${cs}`}
                label={cs}
                onRemove={() =>
                  setFilters((f) => ({
                    ...f,
                    coverstockCategories: toggleSetValue(f.coverstockCategories, cs)
                  }))
                }
              />
            ))}
            {filters.coreType && (
              <FilterChip
                label={filters.coreType}
                onRemove={() => setFilters((f) => ({ ...f, coreType: null }))}
              />
            )}
            {(filters.rgMin > RG_MIN || filters.rgMax < RG_MAX) && (
              <FilterChip
                label={`RG ${filters.rgMin.toFixed(2)} to ${filters.rgMax.toFixed(2)}`}
                onRemove={() => setFilters((f) => ({ ...f, rgMin: RG_MIN, rgMax: RG_MAX }))}
              />
            )}
            {(filters.diffMin > DIFF_MIN || filters.diffMax < DIFF_MAX) && (
              <FilterChip
                label={`Diff ${filters.diffMin.toFixed(3)} to ${filters.diffMax.toFixed(3)}`}
                onRemove={() => setFilters((f) => ({ ...f, diffMin: DIFF_MIN, diffMax: DIFF_MAX }))}
              />
            )}
          </div>
        )}

        {/* Filters panel */}
        {showFilters && (
          <div className="mb-4 rounded-lg border border-edge bg-surface p-4 space-y-4 shadow-sm">
            {/* Brand */}
            <div>
              <p className={`mb-2 ${GROUP_HEADING}`}>Brand</p>
              <div className="flex flex-wrap gap-2">
                {ALL_BRANDS.map((brand) => (
                  <Chip
                    key={brand}
                    selected={filters.brands.has(brand)}
                    onClick={() => setFilters((f) => ({ ...f, brands: toggleSetValue(f.brands, brand) }))}
                  >
                    {brand}
                  </Chip>
                ))}
              </div>
            </div>

            {/* Coverstock */}
            <div>
              <p className={`mb-2 ${GROUP_HEADING}`}>Coverstock</p>
              <div className="flex flex-wrap gap-2">
                {ALL_COVERSTOCK.map((cat) => (
                  <Chip
                    key={cat}
                    selected={filters.coverstockCategories.has(cat)}
                    onClick={() => setFilters((f) => ({ ...f, coverstockCategories: toggleSetValue(f.coverstockCategories, cat) }))}
                  >
                    {cat}
                  </Chip>
                ))}
              </div>
            </div>

            {/* Core type */}
            <div>
              <p className={`mb-2 ${GROUP_HEADING}`}>Core type</p>
              <div className="flex gap-2">
                {(["Symmetric", "Asymmetric"] as const).map((ct) => (
                  <Chip
                    key={ct}
                    selected={filters.coreType === ct}
                    onClick={() => setFilters((f) => ({ ...f, coreType: f.coreType === ct ? null : ct }))}
                  >
                    {ct}
                  </Chip>
                ))}
              </div>
            </div>

            {/* RG range */}
            <RangeSlider
              label="RG"
              min={RG_MIN}
              max={RG_MAX}
              step={0.01}
              valueMin={filters.rgMin}
              valueMax={filters.rgMax}
              format={(v) => v.toFixed(2)}
              onChange={(min, max) => setFilters((f) => ({ ...f, rgMin: min, rgMax: max }))}
            />

            {/* Diff range */}
            <RangeSlider
              label="Diff"
              min={DIFF_MIN}
              max={DIFF_MAX}
              step={0.001}
              valueMin={filters.diffMin}
              valueMax={filters.diffMax}
              format={(v) => v.toFixed(3)}
              onChange={(min, max) => setFilters((f) => ({ ...f, diffMin: min, diffMax: max }))}
            />

            {/* Reset */}
            <button
              type="button"
              onClick={() => setFilters(EMPTY_FILTERS)}
              className={`relative text-xs font-semibold text-accent hover:underline ${TAP_TARGET_44}`}
            >
              Reset all filters
            </button>
          </div>
        )}

        {/* Results count */}
        <p className="mb-3 text-xs text-ink-secondary">
          {displayed.length} {displayed.length === 1 ? "ball" : "balls"}
          {allBalls.length !== displayed.length ? ` of ${allBalls.length}` : ""}
        </p>
      </div>

      <div className="mx-auto w-full max-w-3xl px-3 pb-5 pt-3 sm:px-6">
        {/* B2: Row list instead of card grid */}
        {allBalls.length === 0 && syncState.status !== "syncing" ? (
          <EmptyState
            icon={BookOpen}
            title={online ? "The catalog has not loaded" : "Connect once to load the catalog"}
            description="It downloads once, then it is yours offline: the core, coverstock, RG and diff of every ball in it."
          >
            <Button variant="primary" onClick={handleRefresh} disabled={!online}>
              {online ? "Load the catalog" : "Waiting for a connection"}
            </Button>
          </EmptyState>
        ) : (
          <ul className="divide-y divide-edge rounded-lg border border-edge bg-surface shadow-sm">
            {displayed.map((ball) => (
              <li key={ball.id}>
                <button
                  type="button"
                  onClick={() => onSelectBall(ball.id)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-muted transition-colors"
                >
                  <div className="h-10 w-10 shrink-0">
                    <CatalogBallImage src={ball.imageThumb} alt={ball.name} brand={ball.brand} size="thumb" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-secondary">{ball.brand}</span>
                      {/* B8: Owned badge */}
                      {isOwned(ball) && (
                        <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-accent">
                          Owned
                        </span>
                      )}
                      {/* Multi-colorway badge */}
                      {(ball.colorways?.length ?? 0) > 1 && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-surface-muted px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-ink-secondary">
                          <Palette size={9} aria-hidden="true" />
                          {ball.colorways!.length} colors
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-ink">{ball.name}</p>
                    {/* Always-visible compact specs (mobile-first) */}
                    <p className="mt-0.5 text-xs text-ink-secondary">
                      {[
                        ball.releaseYear ? String(ball.releaseYear) : null,
                        ball.coverstockCategory ?? null,
                        ball.coreType ?? null,
                        ball.rg !== null ? `RG ${ball.rg.toFixed(2)}` : null,
                        ball.diff !== null ? `Diff ${ball.diff.toFixed(3)}` : null,
                      ].filter(Boolean).join(" · ") || "-"}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Footer */}
        {doneState && (
          <p className="mt-6 text-center text-xs text-ink-secondary">
            Catalog v{doneState.version} · Updated {new Date(doneState.generatedAt).toLocaleDateString()}
          </p>
        )}
      </div>

      {/* Detail panel, a self-contained fixed modal (see DetailPanel) */}
      {selectedBall && (
        <DetailPanel
          ball={selectedBall}
          owned={isOwned(selectedBall)}
          onBack={onBack}
          onAddToArsenal={(b) => { setAddingBall(b); setAddError(""); }}
          addDialogOpen={addingBall != null}
        />
      )}

      {/* Add-to-arsenal dialog, always rendered at top level so it's reachable from detail view */}
      {addingBall && (
        <AddFromCatalogDialog
          ball={addingBall}
          onConfirm={(name, colorwaySku) => void handleAddToArsenal(addingBall, name, colorwaySku)}
          onCancel={() => { setAddingBall(null); setAddError(""); }}
          isSaving={addSaving}
          error={addError}
        />
      )}
    </PushScreen>
  );
}
