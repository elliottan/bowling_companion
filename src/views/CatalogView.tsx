import { t } from "@lingui/core/macro";
import { Select } from "../components/ui/Select";
import { Trans } from "@lingui/react/macro";
import { BookOpen, ExternalLink, Loader2, Palette } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CatalogBallImage } from "../components/CatalogBallImage";
import { ErrorBanner } from "../components/ErrorBanner";
import { Button } from "../components/ui/Button";
import { RangeSlider } from "../components/ui/RangeSlider";
import { Chip, TAP_TARGET_44 } from "../components/ui/Chip";
import { SearchField } from "../components/ui/SearchField";
import { ChoiceInput } from "../components/ui/SuggestInput";
import { ViewAll } from "../components/ui/ViewAll";
import { EmptyState } from "../components/ui/EmptyState";
import { CatalogRequestEmpty, CatalogRequestRow } from "../components/CatalogRequest";
import { FormSheet } from "../components/ui/FormSheet";
import { PushScreen } from "../components/PushScreen";
import {
  getAllCatalog,
  syncCatalog,
  type SyncState,
} from "../services/ballCatalogRepository";
import { MANUFACTURERS, type CatalogBall, type CoverstockCategory, type Manufacturer } from "../types/catalog";
import type { Ball } from "../types/bowling";
import { addBall, getBalls } from "../services/ballRepository";
import { GROUP_HEADING } from "../components/ui/typography";
import { FIELD, FIELD_LABEL } from "../components/ui/field";
import { formatReleaseDate } from "../lib/dates";
import { formatDate, formatFixed } from "../lib/format";
import { matchesCatalogSearch } from "../lib/catalogSearch";
import { kinKey, kinNames, sameCore, sameCover } from "../lib/catalogKin";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SortKey = "releaseDate" | "rg" | "diff" | "name";

interface Filters {
  search: string;
  brands: Set<Manufacturer>;
  coverstockCategories: Set<CoverstockCategory>;
  coreType: "Symmetric" | "Asymmetric" | null;
  /** A core by name, matched by its key (`kinKey`), so every spelling of it
   *  counts. Null for any core. */
  core: string | null;
  /** A cover by name ("R2S DEEP Solid Reactive"), matched the same way. */
  cover: string | null;
  rgMin: number;
  rgMax: number;
  diffMin: number;
  diffMax: number;
}

const RG_MIN = 2.40;
const RG_MAX = 2.95;
const DIFF_MIN = 0;
const DIFF_MAX = 0.065;
const ALL_COVERSTOCK: CoverstockCategory[] = ["Solid", "Pearl", "Hybrid", "Urethane", "Polyester"];

/** What a coverstock category is called on screen. The stored value stays
 *  English; this is only the label. */
function coverstockLabel(category: CoverstockCategory): string {
  switch (category) {
    case "Solid":
      return t({ message: "Solid", comment: "Bowling term: a coverstock type, a matte cover that grips early" });
    case "Pearl":
      return t({ message: "Pearl", comment: "Bowling term: a coverstock type, a shiny cover with mica that skids and then hooks" });
    case "Hybrid":
      return t({ message: "Hybrid", comment: "Bowling term: a coverstock type that blends solid and pearl" });
    case "Urethane":
      return t({ message: "Urethane", comment: "Bowling term: a coverstock material, a smooth low-friction cover" });
    case "Polyester":
      return t({ message: "Polyester", comment: "Bowling term: a coverstock material, plastic, used for straight shots and spares" });
    default:
      return category;
  }
}

/** What a core type is called on screen. The stored value stays English. */
function coreTypeLabel(coreType: "Symmetric" | "Asymmetric"): string {
  return coreType === "Symmetric"
    ? t({ message: "Symmetric", comment: "Bowling term: a ball with a symmetric core, as opposed to asymmetric" })
    : t({ message: "Asymmetric", comment: "Bowling term: a ball with an asymmetric core, as opposed to symmetric" });
}

const EMPTY_FILTERS: Filters = {
  search: "",
  brands: new Set(),
  coverstockCategories: new Set(),
  coreType: null,
  core: null,
  cover: null,
  rgMin: RG_MIN,
  rgMax: RG_MAX,
  diffMin: DIFF_MIN,
  diffMax: DIFF_MAX,
};

// ---------------------------------------------------------------------------
// Filter/sort logic (pure, memoized in component)
// ---------------------------------------------------------------------------

/** Rows rendered before the first scroll, and per step after it. Forty fills
 *  a 390px screen several times over, so the sentinel is always below the
 *  fold when the list first paints. */
const CATALOG_PAGE = 40;

/** A row below or above the screen is neither laid out nor painted until it
 *  nears it, so a list grown to hundreds of balls scrolls as cheaply as the
 *  first forty. `auto` remembers each row's real height once it has been seen,
 *  and the length stands in for it until then. */
const ROW_PAINT = { contentVisibility: "auto", containIntrinsicSize: "auto 4.25rem" } as const;

function applyFilters(balls: CatalogBall[], filters: Filters, sort: SortKey): CatalogBall[] {
  const coreKey = kinKey(filters.core);
  const coverKey = kinKey(filters.cover);
  const filtered = balls.filter((b) => {
    if (!matchesCatalogSearch([b.name, b.brand, b.coverstockRaw, b.coreName], filters.search)) return false;
    if (filters.brands.size > 0 && !filters.brands.has(b.brand)) return false;
    if (filters.coverstockCategories.size > 0 && (b.coverstockCategory === null || !filters.coverstockCategories.has(b.coverstockCategory))) return false;
    if (filters.coreType !== null && b.coreType !== filters.coreType) return false;
    if (coreKey !== null && kinKey(b.coreName) !== coreKey) return false;
    if (coverKey !== null && kinKey(b.coverstockRaw) !== coverKey) return false;
    if (b.rg !== null && (b.rg < filters.rgMin || b.rg > filters.rgMax)) return false;
    if (b.diff !== null && (b.diff < filters.diffMin || b.diff > filters.diffMax)) return false;
    return true;
  });

  return filtered.slice().sort((a, b) => {
    switch (sort) {
      case "releaseDate":
        // Partial ISO dates sort as strings: "2024-05" before "2024-03" before
        // "2024", so a ball known only to its year sits after that year's
        // dated ones. Undated balls go last.
        return (b.releaseDate ?? "").localeCompare(a.releaseDate ?? "");
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
  /** The whole catalog, for the balls that share this one's core or cover. */
  allBalls: readonly CatalogBall[];
  onSelectBall: (ballId: string) => void;
  /** Back to the list, filtered to one core or one cover. */
  onViewAll: (filter: { core: string } | { cover: string }) => void;
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
          alt={current.color ? t`${{ name: ball.name }}, ${{ color: current.color }}` : ball.name}
          brand={ball.brand}
          size="full"
        />
      </div>
      {current.color && (
        <p className="mt-2 text-center text-sm font-medium text-ink-secondary">{current.color}</p>
      )}
      {/* Pagination dots */}
      {/* An 8px dot is not a target. The row gets the height and each dot a
          44pt hit region vertically; the gap is widened so two neighbouring
          regions meet rather than overlap (see TAP_TARGET_44). */}
      <div className="mt-2 flex min-h-11 items-center justify-center gap-3">
        {colorways.map((cw, i) => (
          <button
            key={cw.sku}
            type="button"
            onClick={() => setIdx(i)}
            aria-label={cw.color ? t`View colorway ${{ number: i + 1 }}: ${{ color: cw.color }}` : t`View colorway ${{ number: i + 1 }}`}
            aria-current={i === idx}
            className={`relative h-2 rounded-full transition-all ${TAP_TARGET_44} ${
              i === idx ? "w-5 bg-accent-fill" : "w-2 bg-edge-strong hover:bg-ink-tertiary"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function DetailPanel({ ball, owned, onBack, onAddToArsenal, addDialogOpen, allBalls, onSelectBall, onViewAll }: DetailPanelProps) {
  const releaseDate = formatReleaseDate(ball.releaseDate);
  const coreKin = useMemo(() => sameCore(allBalls, ball), [allBalls, ball]);
  const coverKin = useMemo(() => sameCover(allBalls, ball), [allBalls, ball]);
  return (
    // A ball detail is one level deeper than the list, so it pushes like one
    //, same nav bar, same back gesture, opened at the top regardless of where
    // the list was scrolled to.
    <PushScreen title={ball.name} eyebrow={ball.brand} onBack={onBack} active={!addDialogOpen}>
      <div>
        <div className="mx-auto w-full max-w-xl px-3 py-4 sm:px-6">
          <ColorwayCarousel ball={ball} />

          {releaseDate && (
            <p className="mt-3 text-sm text-ink-secondary">{t`Released ${{ date: releaseDate }}`}</p>
          )}

          <dl className="mt-4 space-y-2">
            {/* The brand rides over the name only until the name scrolls
                under the bar, so the specs carry it too. */}
            <SpecItem label={t`Brand`} value={ball.brand} />
            <SpecItem label={t({ message: "Coverstock", comment: "Bowling term: the outer shell material of a ball" })} value={ball.coverstockRaw} />
            <SpecItem label={t`Category`} value={ball.coverstockCategory ? coverstockLabel(ball.coverstockCategory) : t`Unclassified`} />
            {ball.factoryFinish && <SpecItem label={t({ message: "Factory finish", comment: "Bowling term: the surface finish a ball ships with, such as polished or sanded" })} value={ball.factoryFinish} />}
            {ball.coreName && <SpecItem label={t({ message: "Core", comment: "Bowling term: the weight block inside a ball" })} value={ball.coreName} />}
            <SpecItem label={t({ message: "Core type", comment: "Bowling term: whether a ball has a symmetric or asymmetric core" })} value={ball.coreType ? coreTypeLabel(ball.coreType) : "-"} />
            <SpecItem label={t({ message: "RG", comment: "Bowling term: radius of gyration, a ball spec" })} value={ball.rg !== null ? formatFixed(ball.rg, 2) : "-"} />
            <SpecItem label={t({ message: "Diff", comment: "Bowling term: the differential, a ball spec (short for differential RG)" })} value={ball.diff !== null ? formatFixed(ball.diff, 3) : "-"} />
            {ball.mbDiff !== null && <SpecItem label={t({ message: "MB diff", comment: "Bowling term: the mass bias differential, a ball spec" })} value={formatFixed(ball.mbDiff, 3)} />}
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
              {t`View on ${{ brand: ball.brand }}`}
            </a>
          )}

          {owned ? (
            <div className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg border border-accent-fill/30 bg-accent-soft px-4 py-3.5 text-sm font-semibold text-accent">
              {t`Already in your arsenal`}
            </div>
          ) : (
            <Button variant="primary" size="lg" onClick={() => onAddToArsenal(ball)} className="mt-5 w-full">
              {t`Add to arsenal`}
            </Button>
          )}

          {ball.coreName && coreKin.length > 0 && (
            <KinRow
              heading={t({ message: `Same core: ${{ core: ball.coreName }}`, comment: "Bowling term: a heading over other balls built on the same core (weight block), followed by the core's name" })}
              balls={coreKin}
              onSelect={onSelectBall}
              onViewAll={() => onViewAll({ core: ball.coreName! })}
            />
          )}
          {coverKin.length > 0 && (
            <KinRow
              heading={t({ message: `Same cover: ${{ cover: ball.coverstockRaw }}`, comment: "Bowling term: a heading over other balls with the same coverstock, followed by the coverstock's name" })}
              balls={coverKin}
              onSelect={onSelectBall}
              onViewAll={() => onViewAll({ cover: ball.coverstockRaw })}
            />
          )}

        </div>
      </div>
    </PushScreen>
  );
}

/** Balls in one row of a ball's page, and the rest under View all. */
const KIN_SHOWN = 3;

/**
 * Other balls on the same core or in the same cover (ADR-251): one row of
 * three that does not scroll, and the rest under View all, as a card holds
 * what it shows (ADR-196). View all is the catalog filtered to the same name.
 */
function KinRow({
  heading,
  balls,
  onSelect,
  onViewAll
}: {
  heading: string;
  balls: readonly CatalogBall[];
  onSelect: (ballId: string) => void;
  onViewAll: () => void;
}) {
  return (
    <section className="mt-7" aria-label={heading}>
      <h2 className={`mb-2 ${GROUP_HEADING}`}>{heading}</h2>
      <ul className="grid grid-cols-3 gap-2">
        {balls.slice(0, KIN_SHOWN).map((kin) => (
          <li key={kin.id} className="min-w-0">
            <button
              type="button"
              onClick={() => onSelect(kin.id)}
              className="flex w-full flex-col items-center gap-1.5 rounded-xl p-1.5 text-center transition-colors hover:bg-surface-muted"
            >
              <span className="block w-16">
                <CatalogBallImage src={kin.imageThumb} alt="" brand={kin.brand} size="thumb" />
              </span>
              <span className="w-full min-w-0">
                {/* Wrapped, never cut: a third of a phone at the largest
                    text size is narrower than "900 Global". */}
                <span className="block break-words text-caption-2 font-semibold uppercase tracking-wide text-ink-secondary">{kin.brand}</span>
                <span className="block break-words text-footnote font-semibold leading-tight text-ink">{kin.name}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {/* Counts the list it opens, which has this ball in it too. */}
      {balls.length > KIN_SHOWN && <ViewAll count={balls.length + 1} noun="balls" onClick={onViewAll} />}
    </section>
  );
}

function SpecItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-edge py-1.5">
      <dt className="max-w-[50%] shrink-0 text-xs font-semibold text-ink-secondary">{label}</dt>
      <dd className="min-w-0 break-words text-right text-sm font-medium text-ink">{value}</dd>
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
      title={t`Add to arsenal`}
      onClose={onCancel}
      onConfirm={() => onConfirm(name.trim(), colorwaySku)}
      confirmLabel={t`Add to arsenal`}
      confirmDisabled={isSaving || !name.trim()}
      banner={error ? <ErrorBanner>{error}</ErrorBanner> : undefined}
    >
      <p className="mb-3 text-sm text-ink-secondary">
        {t`The specs come across with it. Change the name now if you call it something else.`}
      </p>
      <label className={FIELD_LABEL} htmlFor="catalog-ball-name">
        {t`Name`}
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
          <p className={FIELD_LABEL}>{t`Colorway`}</p>
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
  /** What the list opens already searched for, from the app's search. */
  initialSearch?: string;
}

/** The nearest ancestor that scrolls vertically, or null for the page. */
function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll") return node;
  }
  return null;
}

export function CatalogView({ onBack, selectedBallId, onSelectBall, initialSearch }: CatalogViewProps) {
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
  const [filters, setFilters] = useState<Filters>(() =>
    initialSearch ? { ...EMPTY_FILTERS, search: initialSearch } : EMPTY_FILTERS
  );
  const [sort, setSort] = useState<SortKey>("releaseDate");
  const [addingBall, setAddingBall] = useState<CatalogBall | null>(null);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  // Set of catalog IDs the user already owns
  const [ownedIds, setOwnedIds] = useState<Set<string>>(new Set());
  const syncStarted = useRef(false);
  const filterBarRef = useRef<HTMLDivElement | null>(null);

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
  // Twelve brands is a lot of chips, and a brand the loaded catalog has no
  // ball for would only filter the list down to nothing.
  const brandsPresent = useMemo(() => {
    const present = new Set(allBalls.map((b) => b.brand));
    return MANUFACTURERS.filter((brand) => present.has(brand));
  }, [allBalls]);
  // One name per core and per cover, however many ways the sources spell it.
  const coreNames = useMemo(() => kinNames(allBalls.map((b) => b.coreName)), [allBalls]);
  const coverNames = useMemo(() => kinNames(allBalls.map((b) => b.coverstockRaw)), [allBalls]);

  // The catalog is 250 rows, each carrying a photo, and every one of them was
  // in the DOM whether or not it had been scrolled to. Windowed the way History
  // pages its sessions: a page at a time, grown by a sentinel below the list.
  const [visibleCount, setVisibleCount] = useState(CATALOG_PAGE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // A filter change is a new list, so the window starts again. Adjusted during
  // render rather than in an effect, which would paint the old window first.
  const [windowedList, setWindowedList] = useState<CatalogBall[] | null>(null);
  if (windowedList !== displayed) {
    setWindowedList(displayed);
    if (windowedList !== null) setVisibleCount(CATALOG_PAGE);
  }

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    // Watched from the scroller itself, a screenful early: against the page
    // the sentinel only counted once it was on screen, so the list stalled at
    // its end while the next forty rows rendered, and the scroll jumped.
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((c) => (c < displayed.length ? c + CATALOG_PAGE : c));
        }
      },
      { root: scrollParent(el), rootMargin: "0px 0px 100% 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [displayed.length]);

  const shown = displayed.slice(0, visibleCount);

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
      setAddError(err instanceof Error ? err.message : t`Failed to save ball.`);
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

  const syncMessage = syncState.status === "error" ? syncState.message : "";

  const activeFilterCount = (() => {
    let count = 0;
    if (filters.brands.size) count++;
    if (filters.coverstockCategories.size) count++;
    if (filters.coreType) count++;
    if (filters.core) count++;
    if (filters.cover) count++;
    if (filters.rgMin > RG_MIN || filters.rgMax < RG_MAX) count++;
    if (filters.diffMin > DIFF_MIN || filters.diffMax < DIFF_MAX) count++;
    return count;
  })();

  return (
    <PushScreen
      title={t`Catalog`}
      onBack={onBack}
      active={selectedBallId === null && addingBall === null && !showFilters}
    >
      {/* Search + filters stay pinned above the list they narrow, stopping
          under the nav bar. They used to reach up behind the bar so the list
          passed under the two as one opaque band, but that block now sits
          below the large title and reaching up covered it (ADR-226). The
          bar's own ground is the page's colour nearly solid, so the list
          passing under it between the two is a soft shape, as on every other
          pushed screen. */}
      <div ref={filterBarRef} className="sticky top-0 z-10 mx-auto w-full max-w-3xl border-b border-edge bg-surface-sunken px-3 pt-3 sm:px-6">
        {/* Sync state banner */}
        {syncState.status === "syncing" && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-edge bg-surface-muted px-3 py-2 text-sm text-ink-secondary">
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            {t`Syncing catalog…`}
          </div>
        )}
        {syncState.status === "error" && (
          <div className="mb-3 rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-sm text-warning-700">
            <Trans>
              <span className="font-semibold">Could not update the catalog:</span> {syncMessage}.
              Showing last saved data.
            </Trans>
          </div>
        )}

        {/* Search */}
        <SearchField
          className="mb-3"
          label={t`Search the catalog`}
          placeholder={t`Search name, brand, coverstock…`}
          value={filters.search}
          onChange={(search) => setFilters((f) => ({ ...f, search }))}
        />

        {/* Filter toggle + sort row */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {/* Lit while any filter is on, with how many: the list carries no
              chips or count of its own, so this is the one place that says
              it is narrowed, and the sheet is where a filter comes off. */}
          <Chip selected={activeFilterCount > 0} onClick={() => setShowFilters(true)}>
            {t`Filters`}
            {activeFilterCount > 0 ? (
              <span className="ml-1 rounded-full bg-accent-on-fill/25 px-1.5 py-0.5 text-xs font-bold leading-none">{activeFilterCount}</span>
            ) : null}
          </Chip>

          {/* Not shrinkable: the select is as wide as its longest option in
              this language, and where that does not fit beside Filters the
              sort takes the next line rather than clipping its value. Where
              even a line of its own is too narrow for the word and the select
              together (Spanish at the largest size), the select drops under
              the word. */}
          <label className="ml-auto flex max-w-full shrink-0 flex-wrap items-center gap-1.5 text-sm text-ink-strong">
            <span className="font-medium">{t`Sort:`}</span>
            {/* Sized by its wrapper, which is as wide as the longest option:
                the select chrome carries `w-full`, and on a wrapping row a
                full-width item always takes a line of its own. */}
            <div className="max-w-full shrink-0">
            <Select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              variant="menu"
            >
              <option value="releaseDate">{t`Newest first`}</option>
              <option value="rg">{t({ message: "RG, low to high", comment: "Bowling term: RG is the radius of gyration, a ball spec. A sort order." })}</option>
              <option value="diff">{t({ message: "Diff, high to low", comment: "Bowling term: Diff is the differential, a ball spec. A sort order." })}</option>
              <option value="name">{t`Name, A to Z`}</option>
            </Select>
            </div>
          </label>
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl px-3 pb-5 pt-3 sm:px-6">
        {/* B2: Row list instead of card grid */}
        {allBalls.length === 0 && syncState.status !== "syncing" ? (
          <EmptyState
            icon={BookOpen}
            title={online ? t`The catalog has not loaded` : t`Connect once to load the catalog`}
            description={t`It downloads once and then works offline. Each ball comes with its core, coverstock, RG and diff filled in.`}
          >
            <Button variant="primary" onClick={handleRefresh} disabled={!online}>
              {online ? t`Load the catalog` : t`Waiting for a connection`}
            </Button>
          </EmptyState>
        ) : displayed.length === 0 ? (
          // A typed search that found nothing means the catalog may be missing
          // the ball. Filters alone emptying the list mean it is only hidden.
          filters.search.trim() ? (
            <CatalogRequestEmpty kind="ball" query={filters.search}>
              {activeFilterCount > 0 && (
                <Button variant="ghost" onClick={() => setFilters({ ...EMPTY_FILTERS, search: filters.search })}>
                  {t`Clear filters`}
                </Button>
              )}
            </CatalogRequestEmpty>
          ) : (
            <EmptyState
              icon={BookOpen}
              title={t`No balls match these filters`}
              description={t`Loosen a filter to see more of the catalog.`}
            >
              <Button variant="primary" onClick={() => setFilters(EMPTY_FILTERS)}>
                {t`Clear filters`}
              </Button>
            </EmptyState>
          )
        ) : (
          <ul className="divide-y divide-edge rounded-xl border border-edge bg-surface shadow-sm">
            {shown.map((ball) => (
              <li key={ball.id} style={ROW_PAINT}>
                <button
                  type="button"
                  onClick={() => onSelectBall(ball.id)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-muted transition-colors"
                >
                  <div className="h-10 w-10 shrink-0">
                    <CatalogBallImage src={ball.imageThumb} alt={ball.name} brand={ball.brand} size="thumb" lazy />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-caption-2 font-semibold uppercase tracking-wide text-ink-secondary">{ball.brand}</span>
                      {/* B8: Owned badge */}
                      {isOwned(ball) && (
                        <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-caption-2 font-bold uppercase tracking-wide text-accent">
                          {t({ message: "Owned", comment: "A badge on a ball you already have in your arsenal" })}
                        </span>
                      )}
                      {/* Multi-colorway badge */}
                      {(ball.colorways?.length ?? 0) > 1 && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-surface-muted px-1.5 py-0.5 text-caption-2 font-bold uppercase tracking-wide text-ink-secondary">
                          <Palette size={9} aria-hidden="true" />
                          {t`${{ count: ball.colorways!.length }} colors`}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-ink">{ball.name}</p>
                    {/* Always-visible compact specs (mobile-first) */}
                    <p className="mt-0.5 text-xs text-ink-secondary">
                      {[
                        formatReleaseDate(ball.releaseDate),
                        ball.coverstockCategory ? coverstockLabel(ball.coverstockCategory) : null,
                        ball.coreType ? coreTypeLabel(ball.coreType) : null,
                        ball.rg !== null ? t({ message: `RG ${{ rg: formatFixed(ball.rg, 2) }}`, comment: "Bowling term: RG is the radius of gyration, a ball spec, followed by its value" }) : null,
                        ball.diff !== null ? t({ message: `Diff ${{ diff: formatFixed(ball.diff, 3) }}`, comment: "Bowling term: the differential, a ball spec (short for differential RG), followed by its value" }) : null,
                      ].filter(Boolean).join(" · ") || "-"}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
        {/* Grows the window when it scrolls into view. Rendered only while
            there is more, so it cannot fire against a finished list. */}
        {shown.length < displayed.length && <div ref={sentinelRef} className="h-8" />}

        {displayed.length > 0 && shown.length >= displayed.length && <CatalogRequestRow kind="ball" query={filters.search} />}

        {/* Footer */}
        {doneState && (
          <p className="mt-6 text-center text-xs text-ink-secondary">
            {t`Catalog v${{ version: doneState.version }} · Updated ${{ date: formatDate(new Date(doneState.generatedAt), { dateStyle: "medium" }) }}`}
          </p>
        )}
      </div>

      {/* Detail panel, a self-contained fixed modal (see DetailPanel) */}
      {selectedBall && (
        <DetailPanel
          key={selectedBall.id}
          ball={selectedBall}
          owned={isOwned(selectedBall)}
          onBack={onBack}
          onAddToArsenal={(b) => { setAddingBall(b); setAddError(""); }}
          addDialogOpen={addingBall != null}
          allBalls={allBalls}
          onSelectBall={onSelectBall}
          onViewAll={(filter) => {
            // A fresh list of just those balls: the search and every other
            // filter would only hide some of what the row counted.
            setFilters({ ...EMPTY_FILTERS, ...filter });
            // From the top: the list was left wherever the ball was tapped,
            // and a few balls at the foot of a long scroll read as none.
            const bar = filterBarRef.current;
            (bar && scrollParent(bar))?.scrollTo({ top: 0 });
            onBack();
          }}
        />
      )}

      {/* Add-to-arsenal dialog, always rendered at top level so it's reachable from detail view */}
      {/* The filters rise from the bottom edge, as every other filter sheet
          in the app does (History, Stats, Oil patterns): it was a card that
          dropped down over the list from under the Filters chip, which read
          as a web page's menu rather than a sheet. Each choice applies as it
          is made, so the sheet is left with a tick, not saved. */}
      {showFilters && (
        <FormSheet
          title={t`Filters`}
          onClose={() => setShowFilters(false)}
          dismissAs="done"
          // Where the X would be: it undoes every choice in the sheet, and
          // leaves the search, which is not one of them.
          leading={
            <button
              type="button"
              onClick={() => setFilters((f) => ({ ...EMPTY_FILTERS, search: f.search }))}
              disabled={activeFilterCount === 0}
              className="glass glass-press inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold text-ink [--press-scale:1.04] disabled:opacity-40"
            >
              {t({ message: "Clear all", comment: "A button that removes every filter at once" })}
            </button>
          }
        >
          <div className="space-y-5">
            {/* Brand */}
            <div>
              <p className={`mb-2 ${GROUP_HEADING}`}>{t`Brand`}</p>
              <div className="flex flex-wrap gap-2">
                {brandsPresent.map((brand) => (
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
              <p className={`mb-2 ${GROUP_HEADING}`}>{t({ message: "Cover type", comment: "Bowling term: the kind of coverstock (solid, pearl or hybrid), as opposed to one cover by name" })}</p>
              <div className="flex flex-wrap gap-2">
                {ALL_COVERSTOCK.map((cat) => (
                  <Chip
                    key={cat}
                    selected={filters.coverstockCategories.has(cat)}
                    onClick={() => setFilters((f) => ({ ...f, coverstockCategories: toggleSetValue(f.coverstockCategories, cat) }))}
                  >
                    {coverstockLabel(cat)}
                  </Chip>
                ))}
              </div>
            </div>

            {/* One cover by name, typed with suggestions: there are hundreds. */}
            <div>
              <label className={`mb-2 block ${GROUP_HEADING}`} htmlFor="catalog-filter-cover">
                {t({ message: "Cover", comment: "Bowling term: one coverstock by name, a filter field" })}
              </label>
              <ChoiceInput
                id="catalog-filter-cover"
                value={filters.cover ?? ""}
                onChange={(cover) => setFilters((f) => ({ ...f, cover: cover || null }))}
                options={coverNames}
                placeholder={t({ message: "All covers", comment: "Bowling term: shown in the cover filter while no cover is chosen" })}
                clearLabel={t`Clear cover filter`}
              />
            </div>

            {/* Core type */}
            <div>
              <p className={`mb-2 ${GROUP_HEADING}`}>{t({ message: "Core type", comment: "Bowling term: whether a ball has a symmetric or asymmetric core" })}</p>
              <div className="flex gap-2">
                {(["Symmetric", "Asymmetric"] as const).map((ct) => (
                  <Chip
                    key={ct}
                    selected={filters.coreType === ct}
                    onClick={() => setFilters((f) => ({ ...f, coreType: f.coreType === ct ? null : ct }))}
                  >
                    {coreTypeLabel(ct)}
                  </Chip>
                ))}
              </div>
            </div>

            {/* One core by name, the same way. */}
            <div>
              <label className={`mb-2 block ${GROUP_HEADING}`} htmlFor="catalog-filter-core">
                {t({ message: "Core", comment: "Bowling term: the weight block inside a ball" })}
              </label>
              <ChoiceInput
                id="catalog-filter-core"
                value={filters.core ?? ""}
                onChange={(core) => setFilters((f) => ({ ...f, core: core || null }))}
                options={coreNames}
                placeholder={t({ message: "All cores", comment: "Bowling term: shown in the core filter while no core is chosen" })}
                clearLabel={t`Clear core filter`}
              />
            </div>

            {/* RG range */}
            <RangeSlider
              label={t({ message: "RG", comment: "Bowling term: radius of gyration, a ball spec" })}
              min={RG_MIN}
              max={RG_MAX}
              step={0.01}
              valueMin={filters.rgMin}
              valueMax={filters.rgMax}
              format={(v) => formatFixed(v, 2)}
              onChange={(min, max) => setFilters((f) => ({ ...f, rgMin: min, rgMax: max }))}
            />

            {/* Diff range */}
            <RangeSlider
              label={t({ message: "Diff", comment: "Bowling term: the differential, a ball spec (short for differential RG)" })}
              min={DIFF_MIN}
              max={DIFF_MAX}
              step={0.001}
              valueMin={filters.diffMin}
              valueMax={filters.diffMax}
              format={(v) => formatFixed(v, 3)}
              onChange={(min, max) => setFilters((f) => ({ ...f, diffMin: min, diffMax: max }))}
            />
          </div>
        </FormSheet>
      )}
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
