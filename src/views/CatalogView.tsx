import { ChevronLeft, Loader2, RefreshCw, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CatalogBallImage } from "../components/CatalogBallImage";
import {
  getAllCatalog,
  syncCatalog,
  type SyncState,
} from "../services/ballCatalogRepository";
import type { CatalogBall, CoverstockCategory, Manufacturer } from "../types/catalog";
import type { Ball } from "../types/bowling";
import { addBall } from "../services/ballRepository";

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
  releaseYear: number | null;
}

const RG_MIN = 2.40;
const RG_MAX = 2.95;
const DIFF_MIN = 0;
const DIFF_MAX = 0.065;
const ALL_BRANDS: Manufacturer[] = ["Storm", "Roto Grip", "900 Global", "Motiv"];
const ALL_COVERSTOCK: CoverstockCategory[] = ["Solid", "Pearl", "Hybrid", "Urethane"];

const EMPTY_FILTERS: Filters = {
  search: "",
  brands: new Set(),
  coverstockCategories: new Set(),
  coreType: null,
  rgMin: RG_MIN,
  rgMax: RG_MAX,
  diffMin: DIFF_MIN,
  diffMax: DIFF_MAX,
  releaseYear: null,
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
    if (filters.releaseYear !== null && b.releaseYear !== filters.releaseYear) return false;
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
  onBack: () => void;
  onAddToArsenal: (ball: CatalogBall) => void;
}

function DetailPanel({ ball, onBack, onAddToArsenal }: DetailPanelProps) {
  return (
    <div className="mx-auto w-full max-w-xl px-3 py-5 sm:px-6">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex h-9 items-center gap-1 rounded-md px-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
      >
        <ChevronLeft size={16} aria-hidden="true" />
        Back
      </button>

      <CatalogBallImage src={ball.imageFull} alt={ball.name} brand={ball.brand} size="full" />

      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ball.brand}</p>
        <h2 className="mt-0.5 text-xl font-bold text-slate-950">{ball.name}</h2>
        {ball.releaseYear && (
          <p className="mt-0.5 text-sm text-slate-500">{ball.releaseYear}</p>
        )}
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3">
        <SpecItem label="Coverstock" value={ball.coverstockRaw} />
        <SpecItem label="Category" value={ball.coverstockCategory ?? "Unclassified"} />
        {ball.factoryFinish && <SpecItem label="Factory Finish" value={ball.factoryFinish} />}
        {ball.coreName && <SpecItem label="Core" value={ball.coreName} />}
        <SpecItem label="Core Type" value={ball.coreType ?? "—"} />
        <SpecItem label="RG" value={ball.rg !== null ? ball.rg.toFixed(2) : "—"} />
        <SpecItem label="Diff" value={ball.diff !== null ? ball.diff.toFixed(3) : "—"} />
        {ball.mbDiff !== null && <SpecItem label="MB Diff" value={ball.mbDiff.toFixed(3)} />}
      </dl>

      <a
        href={ball.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 block text-xs text-felt-700 underline hover:no-underline"
      >
        View on manufacturer site
      </a>

      <button
        type="button"
        onClick={() => onAddToArsenal(ball)}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-felt-700 px-4 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-felt-500"
      >
        Add to my arsenal
      </button>
    </div>
  );
}

function SpecItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <dt className="text-xs font-semibold text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-950">{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Range slider (dual-handle via two overlapping inputs)
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
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-slate-700">{label}</span>
        <span className="text-xs text-slate-500">{format(valueMin)} – {format(valueMax)}</span>
      </div>
      <div className="relative flex items-center gap-1">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={valueMin}
          onChange={(e) => {
            const v = Number(e.target.value);
            onChange(Math.min(v, valueMax - step), valueMax);
          }}
          className="h-1 w-full cursor-pointer accent-felt-700"
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={valueMax}
          onChange={(e) => {
            const v = Number(e.target.value);
            onChange(valueMin, Math.max(v, valueMin + step));
          }}
          className="h-1 w-full cursor-pointer accent-felt-700"
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
  onConfirm: (name: string) => void;
  onCancel: () => void;
  isSaving: boolean;
  error: string;
}

function AddFromCatalogDialog({ ball, onConfirm, onCancel, isSaving, error }: AddFromCatalogDialogProps) {
  const [name, setName] = useState(`${ball.brand} ${ball.name}`);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-sm rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-xl">
        <h2 className="mb-3 text-base font-bold text-slate-950">Add to arsenal</h2>
        {error && (
          <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2 text-sm font-semibold text-red-700">{error}</p>
        )}
        <p className="mb-3 text-sm text-slate-600">
          Specs snapshot from catalog. You can edit the name before saving.
        </p>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-felt-700 focus:ring-2 focus:ring-felt-700/20"
        />
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={isSaving || !name.trim()}
            onClick={() => onConfirm(name.trim())}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-felt-700 px-4 text-sm font-semibold text-white hover:bg-felt-500 disabled:opacity-50"
          >
            {isSaving ? "Saving…" : "Add ball"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main CatalogView
// ---------------------------------------------------------------------------

interface CatalogViewProps {
  onBack: () => void;
}

export function CatalogView({ onBack }: CatalogViewProps) {
  const [syncState, setSyncState] = useState<SyncState>({ status: "idle" });
  const [allBalls, setAllBalls] = useState<CatalogBall[]>([]);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortKey>("releaseDate");
  const [selectedBall, setSelectedBall] = useState<CatalogBall | null>(null);
  const [addingBall, setAddingBall] = useState<CatalogBall | null>(null);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const syncStarted = useRef(false);

  // Load balls from DB into state.
  async function loadBalls() {
    const balls = await getAllCatalog();
    setAllBalls(balls);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Unique years in the dataset for the year facet.
  const allYears = useMemo(() => {
    const years = Array.from(new Set(allBalls.map((b) => b.releaseYear).filter((y): y is number => y !== null)));
    return years.sort((a, b) => b - a);
  }, [allBalls]);

  function toggleSetValue<T>(set: Set<T>, value: T): Set<T> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value); else next.add(value);
    return next;
  }

  async function handleAddToArsenal(catalogBall: CatalogBall, name: string) {
    setAddSaving(true);
    setAddError("");
    try {
      const payload: Omit<Ball, "id"> = {
        name,
        is_spare_ball: false,
        catalog_ref_id: catalogBall.id,
        catalog_snapshot: {
          brand: catalogBall.brand,
          name: catalogBall.name,
          coverstockCategory: catalogBall.coverstockCategory,
          coreName: catalogBall.coreName,
          rg: catalogBall.rg,
          diff: catalogBall.diff,
          mbDiff: catalogBall.mbDiff,
          imageThumb: catalogBall.imageThumb,
        },
      };
      await addBall(payload);
      setAddingBall(null);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to save ball.");
    } finally {
      setAddSaving(false);
    }
  }

  // Detail view.
  if (selectedBall) {
    return (
      <DetailPanel
        ball={selectedBall}
        onBack={() => setSelectedBall(null)}
        onAddToArsenal={(b) => { setAddingBall(b); setAddError(""); }}
      />
    );
  }

  // Catalog version info from done state.
  const doneState = syncState.status === "done" ? syncState : null;

  return (
    <div className="mx-auto w-full max-w-3xl px-3 py-5 sm:px-6">
      {/* Header */}
      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
        >
          <ChevronLeft size={16} aria-hidden="true" />
          Back
        </button>
        <h1 className="flex-1 text-xl font-bold text-slate-950">Ball Catalog</h1>
        <button
          type="button"
          onClick={handleRefresh}
          aria-label="Refresh catalog"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
        >
          <RefreshCw size={15} aria-hidden="true" />
        </button>
      </div>

      {/* Sync state banner */}
      {syncState.status === "syncing" && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          Syncing catalog…
        </div>
      )}
      {syncState.status === "error" && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <span className="font-semibold">Could not update catalog:</span> {syncState.message}. Showing last saved data.
        </div>
      )}

      {/* Search */}
      <div className="relative mb-3">
        <input
          type="search"
          placeholder="Search name, brand, coverstock…"
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          className="h-11 w-full rounded-lg border border-slate-300 px-3 pr-10 text-sm outline-none focus:border-felt-700 focus:ring-2 focus:ring-felt-700/20"
        />
        {filters.search && (
          <button
            type="button"
            onClick={() => setFilters((f) => ({ ...f, search: "" }))}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            aria-label="Clear search"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Filter toggle + sort row */}
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium ${
            showFilters ? "border-felt-700 bg-felt-700 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          Filters
          {/* Active filter count badge */}
          {(() => {
            let count = 0;
            if (filters.brands.size) count++;
            if (filters.coverstockCategories.size) count++;
            if (filters.coreType) count++;
            if (filters.rgMin > RG_MIN || filters.rgMax < RG_MAX) count++;
            if (filters.diffMin > DIFF_MIN || filters.diffMax < DIFF_MAX) count++;
            if (filters.releaseYear !== null) count++;
            return count > 0 ? (
              <span className="ml-1 rounded-full bg-white/30 px-1.5 py-0.5 text-xs font-bold leading-none">{count}</span>
            ) : null;
          })()}
        </button>

        <div className="flex-1" />

        <label className="flex items-center gap-1.5 text-sm text-slate-700">
          <span className="font-medium">Sort:</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-felt-700"
          >
            <option value="releaseDate">Newest first</option>
            <option value="rg">RG (low→high)</option>
            <option value="diff">Diff (high→low)</option>
            <option value="name">Name A→Z</option>
          </select>
        </label>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4 space-y-4 shadow-sm">
          {/* Brand */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Brand</p>
            <div className="flex flex-wrap gap-2">
              {ALL_BRANDS.map((brand) => (
                <button
                  key={brand}
                  type="button"
                  onClick={() => setFilters((f) => ({ ...f, brands: toggleSetValue(f.brands, brand) }))}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                    filters.brands.has(brand)
                      ? "border-felt-700 bg-felt-700 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:border-felt-700"
                  }`}
                >
                  {brand}
                </button>
              ))}
            </div>
          </div>

          {/* Coverstock */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Coverstock</p>
            <div className="flex flex-wrap gap-2">
              {ALL_COVERSTOCK.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setFilters((f) => ({ ...f, coverstockCategories: toggleSetValue(f.coverstockCategories, cat) }))}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                    filters.coverstockCategories.has(cat)
                      ? "border-felt-700 bg-felt-700 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:border-felt-700"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Core type */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Core Type</p>
            <div className="flex gap-2">
              {(["Symmetric", "Asymmetric"] as const).map((ct) => (
                <button
                  key={ct}
                  type="button"
                  onClick={() => setFilters((f) => ({ ...f, coreType: f.coreType === ct ? null : ct }))}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                    filters.coreType === ct
                      ? "border-felt-700 bg-felt-700 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:border-felt-700"
                  }`}
                >
                  {ct}
                </button>
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

          {/* Release year */}
          {allYears.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Release Year</p>
              <div className="flex flex-wrap gap-2">
                {allYears.map((year) => (
                  <button
                    key={year}
                    type="button"
                    onClick={() => setFilters((f) => ({ ...f, releaseYear: f.releaseYear === year ? null : year }))}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                      filters.releaseYear === year
                        ? "border-felt-700 bg-felt-700 text-white"
                        : "border-slate-300 bg-white text-slate-700 hover:border-felt-700"
                    }`}
                  >
                    {year}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Reset */}
          <button
            type="button"
            onClick={() => setFilters(EMPTY_FILTERS)}
            className="text-xs font-semibold text-felt-700 hover:underline"
          >
            Reset all filters
          </button>
        </div>
      )}

      {/* Results count */}
      <p className="mb-3 text-xs text-slate-500">
        {displayed.length} {displayed.length === 1 ? "ball" : "balls"}
        {allBalls.length !== displayed.length ? ` of ${allBalls.length}` : ""}
      </p>

      {/* Grid */}
      {allBalls.length === 0 && syncState.status !== "syncing" ? (
        <p className="text-sm text-slate-500">No balls in catalog yet. Try refreshing.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {displayed.map((ball) => (
            <button
              key={ball.id}
              type="button"
              onClick={() => setSelectedBall(ball)}
              className="group rounded-lg border border-slate-200 bg-white shadow-sm hover:border-felt-700 hover:shadow-md text-left transition-shadow"
            >
              <CatalogBallImage src={ball.imageThumb} alt={ball.name} brand={ball.brand} size="thumb" />
              <div className="p-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{ball.brand}</p>
                <p className="mt-0.5 text-sm font-semibold leading-tight text-slate-950 group-hover:text-felt-700">
                  {ball.name}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {ball.coverstockCategory ?? "—"} · {ball.coreType ?? "—"}
                </p>
                {(ball.rg !== null || ball.diff !== null) && (
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {ball.rg !== null ? `RG ${ball.rg.toFixed(2)}` : ""}
                    {ball.rg !== null && ball.diff !== null ? " · " : ""}
                    {ball.diff !== null ? `Diff ${ball.diff.toFixed(3)}` : ""}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Footer */}
      {doneState && (
        <p className="mt-6 text-center text-xs text-slate-400">
          Catalog v{doneState.version} · Updated {new Date(doneState.generatedAt).toLocaleDateString()}
        </p>
      )}

      {/* Add-to-arsenal dialog */}
      {addingBall && (
        <AddFromCatalogDialog
          ball={addingBall}
          onConfirm={(name) => void handleAddToArsenal(addingBall, name)}
          onCancel={() => { setAddingBall(null); setAddError(""); }}
          isSaving={addSaving}
          error={addError}
        />
      )}
    </div>
  );
}
