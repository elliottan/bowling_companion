import { plural, t } from "@lingui/core/macro";
import { ClearAllButton } from "../components/ui/ClearAllButton";
import { Select } from "../components/ui/Select";
import { Trans } from "@lingui/react/macro";
import { BookOpen, ChartScatter, Check, Columns3, ExternalLink, Loader2, MailPlus, MoreHorizontal, Palette, X } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CatalogBallImage } from "../components/CatalogBallImage";
import { Button } from "../components/ui/Button";
import { RangeSlider } from "../components/ui/RangeSlider";
import { Chip, TAP_TARGET_44 } from "../components/ui/Chip";
import { SearchField } from "../components/ui/SearchField";
import { ChoiceInput } from "../components/ui/SuggestInput";
import { EmptyState } from "../components/ui/EmptyState";
import { CatalogRequestEmpty, CatalogRequestRow } from "../components/CatalogRequest";
import { FormSheet } from "../components/ui/FormSheet";
import { PushScreen } from "../components/PushScreen";
import { BallCompareView, type CompareTab } from "../components/BallCompareView";
import { IconButton } from "../components/ui/IconButton";
import { ANCHORED_MENU_WIDTH, AnchoredMenu, AnchoredMenuItem } from "../components/ui/AnchoredMenu";
import { anchorUnder, type MenuAnchor } from "../lib/menuAnchor";
import { catalogRequestMailto, openMail } from "../lib/links";
import { entryKey, MAX_COMPARE, nextWeight, specsAt, type CompareEntry, type WeighedBall } from "../lib/ballCompare";
import { useRememberedState } from "../lib/viewMemory";
import {
  getAllCatalog,
  syncCatalog,
  type SyncState,
} from "../services/ballCatalogRepository";
import { DEFAULT_WEIGHT, MANUFACTURERS, type CatalogBall, type CoverstockCategory, type Manufacturer } from "../types/catalog";
import type { Ball } from "../types/bowling";
import { getBalls } from "../services/ballRepository";
import { BallFormDialog } from "../components/BallFormDialog";
import { RemoveFromCompare } from "../components/RemoveFromCompare";
import { getDefaultBallWeight } from "../services/bowlingRepository";
import { GROUP_HEADING } from "../components/ui/typography";
import { formatReleaseDate } from "../lib/dates";
import { formatDate, formatFixed, formatNumber } from "../lib/format";
import { matchesCatalogSearch } from "../lib/catalogSearch";
import { kinKey, kinNames, sameCore, sameCover } from "../lib/catalogKin";
import { DRAWN_PAGES, kinListPage, parseKinListPage, type KinList } from "../lib/catalogPages";
import { coreTypeLabel, coverstockLabel } from "../components/catalogLabels";

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

const lb = (weight: number) => t({ message: `${{ weight }} lb`, comment: "A ball weight in pounds, short" });

const RG_MIN = 2.40;
const RG_MAX = 2.95;
const DIFF_MIN = 0;
const DIFF_MAX = 0.065;
const ALL_COVERSTOCK: CoverstockCategory[] = ["Solid", "Pearl", "Hybrid", "Urethane", "Polyester"];

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

/** Filters and sorts read each ball at the bowler's default weight
 *  (ADR-262), as the rows show it. */
function applyFilters(balls: CatalogBall[], filters: Filters, sort: SortKey, weight: number): CatalogBall[] {
  const at = new Map(balls.map((b) => [b.id, specsAt(b, weight)]));
  const rg = (b: CatalogBall) => at.get(b.id)!.rg;
  const diff = (b: CatalogBall) => at.get(b.id)!.diff;
  const coreKey = kinKey(filters.core);
  const coverKey = kinKey(filters.cover);
  const filtered = balls.filter((b) => {
    if (!matchesCatalogSearch([b.name, b.brand, b.coverstockRaw, b.coreName], filters.search)) return false;
    if (filters.brands.size > 0 && !filters.brands.has(b.brand)) return false;
    if (filters.coverstockCategories.size > 0 && (b.coverstockCategory === null || !filters.coverstockCategories.has(b.coverstockCategory))) return false;
    if (filters.coreType !== null && b.coreType !== filters.coreType) return false;
    if (coreKey !== null && kinKey(b.coreName) !== coreKey) return false;
    if (coverKey !== null && kinKey(b.coverstockRaw) !== coverKey) return false;
    const r = rg(b);
    const d = diff(b);
    if (r !== null && (r < filters.rgMin || r > filters.rgMax)) return false;
    if (d !== null && (d < filters.diffMin || d > filters.diffMax)) return false;
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
        return (rg(a) ?? 99) - (rg(b) ?? 99);
      case "diff":
        return (diff(b) ?? 0) - (diff(a) ?? 0);
      case "name":
        return a.name.localeCompare(b.name);
    }
  });
}

// ---------------------------------------------------------------------------
// Detail panel
// ---------------------------------------------------------------------------

/** One of the bowler's own copies of a catalog ball, for its page. */
interface OwnedCopy {
  id: number;
  name: string;
  weight: number;
  imageThumb: string | null;
}

interface DetailPanelProps {
  ball: CatalogBall;
  /** The bowler's copies of this ball still in the bag, in arsenal order. */
  owned: readonly OwnedCopy[];
  onBack: () => void;
  onAddToArsenal: (ball: CatalogBall) => void;
  /** True while the ball form is stacked on top, disables this
   *  panel's own Escape/focus-trap so only the topmost overlay responds. */
  addDialogOpen: boolean;
  /** The whole catalog, for the balls that share this one's core or cover. */
  allBalls: readonly CatalogBall[];
  onSelectBall: (ballId: string) => void;
  /** Pushes the balls on one core or in one cover over this page (ADR-264). */
  onViewAll: (list: KinList) => void;
  /** The weights this ball is compared at, and how many balls are. */
  comparedAt: readonly number[];
  /** Asks before one weight of this ball leaves the comparison (ADR-266). */
  onAskRemove: (weight: number, el: Element) => void;
  /** The compare tray, at the foot of this page too (ADR-266). */
  tray?: ReactNode;
  /** Null when the comparison is full or holds the ball at every weight. */
  onAddToCompare: (() => void) | null;
  /** The bowler's default weight, which the specs are read at (ADR-262). */
  weight: number;
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

function DetailPanel({ ball, owned, onBack, onAddToArsenal, addDialogOpen, allBalls, onSelectBall, onViewAll, comparedAt, onAskRemove, tray, onAddToCompare, weight }: DetailPanelProps) {
  const releaseDate = formatReleaseDate(ball.releaseDate);
  const specs = specsAt(ball, weight);
  const comparing = comparedAt.length > 0;
  const coreKin = useMemo(() => sameCore(allBalls, ball), [allBalls, ball]);
  const coverKin = useMemo(() => sameCover(allBalls, ball), [allBalls, ball]);
  return (
    // A ball detail is one level deeper than the list, so it pushes like one
    //, same nav bar, same back gesture, opened at the top regardless of where
    // the list was scrolled to.
    <PushScreen title={ball.name} eyebrow={ball.brand} onBack={onBack} active={!addDialogOpen} footer={tray}>
      <div>
        <div className="mx-auto w-full max-w-xl px-3 py-4 sm:px-6">
          <ColorwayCarousel ball={ball} />

          {releaseDate && (
            <p className="mt-3 text-sm text-ink-secondary">{t`Released ${{ date: releaseDate }}`}</p>
          )}

          {/* The bowler's own, over the catalog's specs (ADR-263). */}
          {owned.length > 0 && <OwnedCopies ball={ball} copies={owned} />}

          <dl className="mt-4 space-y-2">
            {/* The brand rides over the name only until the name scrolls
                under the bar, so the specs carry it too. */}
            <SpecItem label={t`Brand`} value={ball.brand} />
            <SpecItem label={t({ message: "Coverstock", comment: "Bowling term: the outer shell material of a ball" })} value={ball.coverstockRaw} />
            <SpecItem label={t`Category`} value={ball.coverstockCategory ? coverstockLabel(ball.coverstockCategory) : t`Unclassified`} />
            {ball.factoryFinish && <SpecItem label={t({ message: "Factory finish", comment: "Bowling term: the surface finish a ball ships with, such as polished or sanded" })} value={ball.factoryFinish} />}
            {ball.coreName && <SpecItem label={t({ message: "Core", comment: "Bowling term: the weight block inside a ball" })} value={ball.coreName} />}
            <SpecItem label={t({ message: "Core type", comment: "Bowling term: whether a ball has a symmetric or asymmetric core" })} value={ball.coreType ? coreTypeLabel(ball.coreType) : "-"} />
            {/* The numbers under it are at the bowler's default weight, or
                the ball's 15 lb ones where it lists none for it (ADR-262). */}
            <SpecItem
              label={t`Weight`}
              value={
                specs.exact
                  ? lb(weight)
                  : t({ message: `${{ weight: lb(weight) }}, 15 lb specs shown`, comment: "A ball's weight on its catalog page, where the catalog lists no specs at that weight so the 15 lb ones are shown" })
              }
            />
            <SpecItem label={t({ message: "RG", comment: "Bowling term: radius of gyration, a ball spec" })} value={specs.rg !== null ? formatFixed(specs.rg, 2) : "-"} />
            <SpecItem label={t({ message: "Diff", comment: "Bowling term: the differential, a ball spec (short for differential RG)" })} value={specs.diff !== null ? formatFixed(specs.diff, 3) : "-"} />
            {specs.mbDiff !== null && <SpecItem label={t({ message: "MB diff", comment: "Bowling term: the mass bias differential, a ball spec" })} value={formatFixed(specs.mbDiff, 3)} />}
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

          {/* Always offered: a bowler can own the same ball twice, in one
              weight or two (ADR-263). */}
          <Button variant={owned.length > 0 ? "secondary" : "primary"} size="lg" onClick={() => onAddToArsenal(ball)} className="mt-5 w-full">
            {owned.length > 0
              ? t({ message: "Add another to arsenal", comment: "Adds a second copy of a bowling ball the bowler already owns to their arsenal" })
              : t`Add to arsenal`}
          </Button>

          {/* Into the comparison from the ball itself, beside the list's own
              picking (ADR-258); once in, again at another weight (ADR-262).
              The comparison itself is the tray at the foot (ADR-266). */}
          <div className="mt-2 flex gap-2">
            <Button
              variant="secondary"
              onClick={onAddToCompare ?? undefined}
              disabled={onAddToCompare === null}
              className="flex-1"
            >
              {comparing ? <Check size={16} aria-hidden="true" /> : <Columns3 size={16} aria-hidden="true" />}
              {comparing
                ? t({ message: "Add another weight", comment: "Adds this bowling ball to the comparison again, at another weight" })
                : t({ message: "Add to compare", comment: "Picks this bowling ball to compare with others" })}
            </Button>
          </div>

          {/* Each weight it is in at, a tap away from leaving, which asks
              first (ADR-266). */}
          {comparing && (
            <div className="mt-2 flex flex-wrap items-center gap-2 px-1">
              <span className="text-footnote text-ink-secondary">
                {t({ message: "In compare", comment: "Before the weights a bowling ball is being compared at, each a button that takes it out" })}
              </span>
              {comparedAt.map((w) => (
                <Chip
                  key={w}
                  selected
                  aria-label={t({ message: `Remove ${{ ball: ball.name }}, ${{ weight: lb(w) }}`, comment: "Takes one bowling ball, at one weight, out of the comparison" })}
                  onClick={(e) => onAskRemove(w, e.currentTarget)}
                >
                  {lb(w)}
                  <X size={14} aria-hidden="true" className="ml-1" />
                </Chip>
              ))}
            </div>
          )}

          {ball.coreName && coreKin.length > 0 && (
            <KinRow
              heading={t({ message: `Same core: ${{ core: ball.coreName }}`, comment: "Bowling term: a heading over other balls built on the same core (weight block), followed by the core's name" })}
              balls={coreKin}
              onSelect={onSelectBall}
              onViewAll={() => onViewAll({ kind: "core", name: ball.coreName! })}
            />
          )}
          {coverKin.length > 0 && (
            <KinRow
              heading={t({ message: `Same cover: ${{ cover: ball.coverstockRaw }}`, comment: "Bowling term: a heading over other balls with the same coverstock, followed by the coverstock's name" })}
              balls={coverKin}
              onSelect={onSelectBall}
              onViewAll={() => onViewAll({ kind: "cover", name: ball.coverstockRaw })}
            />
          )}

        </div>
      </div>
    </PushScreen>
  );
}

/**
 * The bowler's own copies of a ball, on its page (ADR-263): one card at a
 * time, its name, weight and the numbers at that weight, swiped sideways with
 * dots under it when there are several, so a bag with three of one ball still
 * takes one card's height.
 */
function OwnedCopies({ ball, copies }: { ball: CatalogBall; copies: readonly OwnedCopy[] }) {
  const [index, setIndex] = useState(0);
  const track = useRef<HTMLDivElement | null>(null);
  const go = (i: number) => {
    const el = track.current;
    el?.scrollTo?.({ left: i * el.clientWidth, behavior: "smooth" });
    setIndex(i);
  };
  return (
    <section className="mt-4" aria-label={t({ message: "In your arsenal", comment: "A heading on a catalog ball's page over the bowler's own copies of it" })}>
      <h2 className={`mb-2 ${GROUP_HEADING}`}>
        {t({ message: "In your arsenal", comment: "A heading on a catalog ball's page over the bowler's own copies of it" })}
      </h2>
      <div
        ref={track}
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.clientWidth > 0) setIndex(Math.round(el.scrollLeft / el.clientWidth));
        }}
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-none scrollbar-none rounded-xl border border-accent-fill/30 bg-accent-soft"
      >
        {copies.map((c) => {
          const s = specsAt(ball, c.weight);
          return (
            <div key={c.id} className="flex w-full shrink-0 snap-start items-center gap-3 px-3 py-2.5">
              <span className="block h-10 w-10 shrink-0">
                <CatalogBallImage src={c.imageThumb ?? ball.imageThumb} alt="" brand={ball.brand} size="thumb" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block break-words text-sm font-semibold text-ink">{c.name}</span>
                <span className="block text-xs tabular-nums text-ink-secondary">
                  {[
                    lb(c.weight),
                    s.rg !== null ? t({ message: `RG ${{ rg: formatFixed(s.rg, 2) }}`, comment: "Bowling term: RG is the radius of gyration, a ball spec, followed by its value" }) : null,
                    s.diff !== null ? t({ message: `Diff ${{ diff: formatFixed(s.diff, 3) }}`, comment: "Bowling term: the differential, a ball spec (short for differential RG), followed by its value" }) : null
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
            </div>
          );
        })}
      </div>
      {copies.length > 1 && (
        <div className="mt-1 flex min-h-11 items-center justify-center gap-3">
          {copies.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onClick={() => go(i)}
              aria-label={t({ message: `${{ name: c.name }}, ${{ weight: lb(c.weight) }}`, comment: "One of the bowler's own copies of a ball: its name and weight, on a dot that shows it" })}
              aria-current={i === index}
              className={`relative h-2 rounded-full transition-all ${TAP_TARGET_44} ${i === index ? "w-5 bg-accent-fill" : "w-2 bg-edge-strong"}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * One ball in a list of the catalog: its photo, brand, Owned and colours,
 * name, and its numbers at the bowler's default weight (ADR-262). `picked` is
 * how many times it is in the comparison while picking, null when not.
 */
function CatalogRow({
  ball,
  owned,
  weight,
  picked = null,
  disabled = false,
  inCompare = false,
  onClick
}: {
  ball: CatalogBall;
  owned: boolean;
  /** In the comparison: the row is tinted, so it reads at a glance (ADR-266). */
  inCompare?: boolean;
  weight: number;
  picked?: number | null;
  disabled?: boolean;
  onClick: () => void;
}) {
  const specs = specsAt(ball, weight);
  return (
                <button
                  type="button"
                  onClick={onClick}
                  aria-pressed={picked !== null ? picked > 0 : undefined}
                  disabled={disabled}
                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors disabled:opacity-50 ${
                    inCompare ? "bg-accent-soft" : "hover:bg-surface-muted"
                  }`}
                >
                  {picked !== null && (
                    <span
                      aria-hidden="true"
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-caption-2 font-bold tabular-nums ${
                        picked > 0 ? "border-transparent bg-accent-fill text-accent-on-fill" : "border-edge-strong"
                      }`}
                    >
                      {/* A tick, or how many times once it is in at two weights. */}
                      {picked === 1 && <Check size={14} strokeWidth={3} />}
                      {picked > 1 && formatNumber(picked)}
                    </span>
                  )}
                  <div className="h-10 w-10 shrink-0">
                    <CatalogBallImage src={ball.imageThumb} alt={ball.name} brand={ball.brand} size="thumb" lazy />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-caption-2 font-semibold uppercase tracking-wide text-ink-secondary">{ball.brand}</span>
                      {/* B8: Owned badge */}
                      {owned && (
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
                        specs.rg !== null ? t({ message: `RG ${{ rg: formatFixed(specs.rg, 2) }}`, comment: "Bowling term: RG is the radius of gyration, a ball spec, followed by its value" }) : null,
                        specs.diff !== null ? t({ message: `Diff ${{ diff: formatFixed(specs.diff, 3) }}`, comment: "Bowling term: the differential, a ball spec (short for differential RG), followed by its value" }) : null,
                      ].filter(Boolean).join(" · ") || "-"}
                    </p>
                  </div>
                </button>
  );
}

/**
 * Every ball on one core or in one cover, pushed over the ball whose View all
 * asked for it (ADR-264), so back returns to that ball rather than to the
 * catalog's own list, whose search and filters it leaves as they were. A row
 * opens its ball over this page in turn.
 */
function KinListPage({
  list,
  balls,
  isOwned,
  weight,
  active,
  onBack,
  onSelectBall,
  inCompare,
  tray
}: {
  inCompare: (id: string) => boolean;
  tray?: ReactNode;
  list: KinList;
  balls: readonly CatalogBall[];
  isOwned: (ball: CatalogBall) => boolean;
  weight: number;
  active: boolean;
  onBack: () => void;
  onSelectBall: (id: string) => void;
}) {
  return (
    <PushScreen
      title={list.name}
      eyebrow={
        list.kind === "core"
          ? t({ message: "Same core", comment: "Bowling term: over a list of balls built on one core (weight block), named under it" })
          : t({ message: "Same cover", comment: "Bowling term: over a list of balls with one coverstock, named under it" })
      }
      subtitle={plural(balls.length, { one: "# result", other: "# results" })}
      onBack={onBack}
      active={active}
      footer={tray}
    >
      <div className="mx-auto w-full max-w-3xl px-3 pb-5 pt-3 sm:px-6">
        <ul className="divide-y divide-edge overflow-hidden rounded-xl border border-edge bg-surface shadow-sm">
          {balls.map((ball) => (
            <li key={ball.id} style={ROW_PAINT}>
              <CatalogRow ball={ball} owned={isOwned(ball)} inCompare={inCompare(ball.id)} weight={weight} onClick={() => onSelectBall(ball.id)} />
            </li>
          ))}
        </ul>
      </div>
    </PushScreen>
  );
}

/**
 * The balls in the comparison, at the foot of every catalog screen while any
 * are (ADR-266): each its own photo and weight, apart so each is easy to tap,
 * a tap asking before it leaves, and a faint ring for each slot still free,
 * so how many more fit reads without counting. Eight do not fit a phone, so
 * the row scrolls sideways; Compare stays put at its end.
 */
function CompareTray({
  balls,
  onAskRemove,
  onCompare
}: {
  balls: readonly WeighedBall[];
  onAskRemove: (key: string, el: Element) => void;
  onCompare: () => void;
}) {
  return (
    <div className="flex items-center gap-2 border-t border-edge bg-surface pb-[max(env(safe-area-inset-bottom),0.75rem)] pl-1 pr-3 pt-2 sm:pr-6">
      <ul
        aria-label={t({ message: "In compare", comment: "Before the weights a bowling ball is being compared at, each a button that takes it out" })}
        className="flex min-w-0 flex-1 items-start gap-1 overflow-x-auto overscroll-x-none scrollbar-none px-2"
      >
        {balls.map((b) => {
          const key = entryKey({ id: b.ball.id, weight: b.weight });
          return (
            <li key={key} className="shrink-0">
              <button
                type="button"
                onClick={(e) => onAskRemove(key, e.currentTarget)}
                aria-label={t({ message: `Remove ${{ ball: b.ball.name }}, ${{ weight: lb(b.weight) }}`, comment: "Takes one bowling ball, at one weight, out of the comparison" })}
                className="flex w-11 flex-col items-center gap-0.5 rounded-lg py-0.5 active:opacity-60"
              >
                <span className="block h-9 w-9">
                  <CatalogBallImage src={b.ball.imageThumb} alt="" brand={b.ball.brand} size="thumb" />
                </span>
                <span className="text-caption-2 font-semibold tabular-nums text-ink-secondary">{lb(b.weight)}</span>
              </button>
            </li>
          );
        })}
        {Array.from({ length: Math.max(0, MAX_COMPARE - balls.length) }, (_, i) => (
          <li key={`free-${i}`} aria-hidden="true" className="flex w-11 shrink-0 justify-center py-0.5">
            <span className="block h-9 w-9 rounded-full border border-dashed border-edge-strong/60" />
          </li>
        ))}
      </ul>
      <Button variant="primary" onClick={onCompare} className="shrink-0">
        {t({ message: "Compare", comment: "Opens the comparison of the picked bowling balls" })}
      </Button>
    </div>
  );
}

/** Balls in one row of a ball's page, and the rest under View all. */
const KIN_SHOWN = 3;

/**
 * Other balls on the same core or in the same cover (ADR-253): one row of
 * three that does not scroll, and the rest under View all, beside the heading
 * (ADR-257). View all is the catalog filtered to the same name.
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
  // What View all opens counts this ball too.
  const count = balls.length + 1;
  return (
    <section className="mt-7" aria-label={heading}>
      {/* View all on the heading's line, as iOS puts See All beside a
          section's title: a pill under the row cost a row's height and read
          as a second primary button under Add to arsenal (ADR-257). */}
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className={`min-w-0 ${GROUP_HEADING}`}>{heading}</h2>
        {balls.length > KIN_SHOWN && (
          <button
            type="button"
            onClick={onViewAll}
            // Counts the list it opens, which has this ball in it too.
            aria-label={plural(count, { one: "View all # ball", other: "View all # balls" })}
            className={`relative shrink-0 text-footnote font-semibold text-accent active:opacity-50 ${TAP_TARGET_44}`}
          >
            {t`View all ${{ count }}`}
          </button>
        )}
      </div>
      <ul className="grid grid-cols-3 gap-2">
        {balls.slice(0, KIN_SHOWN).map((kin) => (
          <li key={kin.id} className="min-w-0">
            <button
              type="button"
              onClick={() => onSelect(kin.id)}
              // A touch listener on the element is what makes iOS Safari
              // apply :active to it at all.
              onTouchStart={() => {}}
              // Answers the finger as a native tile does: it sinks and dims
              // while held, and springs back (`.tile-press`).
              className="tile-press flex w-full flex-col items-center gap-1.5 rounded-xl p-1.5 text-center"
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
  /** Balls opened under the open one, oldest first: each stays drawn beneath
   *  the ball opened from its page, so back slides to it (ADR-257). */
  ballTrail?: readonly string[];
  /** Back to the list past every open ball, for View all. */
  onShowList?: () => void;
  /** What the list opens already searched for, from the app's search. */
  initialSearch?: string;
  /** Opens straight on the comparison's graph, from the arsenal (ADR-261):
   *  the graph is then the screen, and back from it leaves the catalog. */
  openGraph?: boolean;
}

/** The nearest ancestor that scrolls vertically, or null for the page. */
function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll") return node;
  }
  return null;
}

export function CatalogView({ onBack, selectedBallId, onSelectBall, ballTrail = [], onShowList, initialSearch, openGraph = false }: CatalogViewProps) {
  // The weight the catalog reads its specs at and adds balls at (ADR-262).
  const defaultWeight = useLiveQuery(getDefaultBallWeight, [], null) ?? DEFAULT_WEIGHT;
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
  const [showFilters, setShowFilters] = useState(false);
  // The balls picked to compare, each at its own weight, kept while the
  // catalog is closed and opened again (ADR-258, ADR-262). Picking is a mode
  // of the list: on, a tap on a row adds the ball rather than opening it.
  const [compared, setCompared] = useRememberedState<CompareEntry[]>("catalog:compared", []);
  const [picking, setPicking] = useState(false);
  // Opened from the arsenal, the graph is the screen and the list is not
  // drawn under it, until View all on a ball or Add a ball asks for the list.
  const [graphOnly, setGraphOnly] = useState(openGraph);
  const [compareOpen, setCompareOpen] = useState(openGraph);
  const [compareTab, setCompareTab] = useState<CompareTab>(openGraph ? "graph" : "specs");
  // The ball the comparison was opened over, null for the list: a ball opened
  // from the comparison's graph goes over it, and those under it stay under.
  const [compareOver, setCompareOver] = useState<string | null>(null);
  const openCompare = (tab: CompareTab = "specs") => {
    setCompareTab(tab);
    setCompareOver(selectedBallId);
    setCompareOpen(true);
  };
  const [menuAt, setMenuAt] = useState<MenuAnchor | null>(null);
  // A compared ball asks before it leaves (ADR-266).
  const [removing, setRemoving] = useState<{ key: string; anchor: DOMRect } | null>(null);
  const askRemove = (key: string, el: Element) => setRemoving({ key, anchor: el.getBoundingClientRect() });
  // Set of catalog IDs the user already owns
  const [ownedIds, setOwnedIds] = useState<Set<string>>(new Set());
  // The bag itself, for the weights its balls are in.
  const [arsenal, setArsenal] = useState<Ball[]>([]);
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
    setArsenal(arsenalBalls);
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
  const displayed = useMemo(() => applyFilters(allBalls, filters, sort, defaultWeight), [allBalls, filters, sort, defaultWeight]);
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

  // The picked balls in the order they were picked, each at its weight, and
  // the bowler's own catalog balls at the weights they hold them in, for the
  // graph (ADR-258, ADR-262). A ball out of the bag is not on it.
  const byId = useMemo(() => new Map(allBalls.map((b) => [b.id, b])), [allBalls]);
  const byName = useMemo(() => new Map(allBalls.map((b) => [`${b.brand} ${b.name}`.toLowerCase(), b])), [allBalls]);
  const compareBalls: WeighedBall[] = compared.flatMap((e) => {
    const ball = byId.get(e.id);
    return ball ? [{ ball, weight: e.weight }] : [];
  });
  const ownedBalls = useMemo(() => {
    const seen = new Set<string>();
    return arsenal.flatMap((b): WeighedBall[] => {
      if (b.retired) return [];
      const snap = b.catalog_snapshot;
      const ball = (b.catalog_ref_id ? byId.get(b.catalog_ref_id) : undefined) ?? (snap ? byName.get(`${snap.brand} ${snap.name}`.toLowerCase()) : undefined);
      if (!ball) return [];
      const weight = b.weight ?? DEFAULT_WEIGHT;
      const key = entryKey({ id: ball.id, weight });
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ ball, weight }];
    });
  }, [arsenal, byId, byName]);

  /** The bowler's copies of a catalog ball still in the bag (ADR-263). */
  const ownedCopies = (ball: CatalogBall): OwnedCopy[] =>
    arsenal.flatMap((b) => {
      if (b.retired || b.id === undefined) return [];
      const snap = b.catalog_snapshot;
      const match = b.catalog_ref_id
        ? b.catalog_ref_id === ball.id
        : snap !== undefined && `${snap.brand} ${snap.name}`.toLowerCase() === `${ball.brand} ${ball.name}`.toLowerCase();
      if (!match) return [];
      const colorway = ball.colorways?.find((c) => c.sku === b.colorway_sku);
      return [{ id: b.id, name: b.name, weight: b.weight ?? DEFAULT_WEIGHT, imageThumb: colorway?.imageThumb ?? snap?.imageThumb ?? null }];
    });

  /** The weights a ball is compared at, in the order they were added. */
  const comparedAt = (id: string) => compared.filter((e) => e.id === id).map((e) => e.weight);
  /** The weight a ball would come into the comparison at, or null when it is
   *  full or already holds the ball at every weight. */
  const weightToAdd = (ball: CatalogBall): number | null => {
    if (compared.length >= MAX_COMPARE) return null;
    const owns = ownedBalls.filter((o) => o.ball.id === ball.id).map((o) => o.weight);
    return nextWeight(ball, comparedAt(ball.id), defaultWeight, owns);
  };
  const addToCompare = (ball: CatalogBall) => {
    const weight = weightToAdd(ball);
    if (weight !== null) setCompared((entries) => [...entries, { id: ball.id, weight }]);
  };

  // Catalog version info from done state.
  const doneState = syncState.status === "done" ? syncState : null;

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

  // The open ball over the balls it was reached through, each drawn where it
  // was left, so a ball opened from another's row slides in over that ball,
  // and back (or the drag) uncovers it (ADR-257). The comparison sits in
  // that stack where it was opened: over the ball it came from, or under
  // every ball when it came from the list, so a ball opened from its graph
  // goes over it and back comes back to it (ADR-261).
  const stack = [...ballTrail, selectedBallId].filter((id): id is string => id !== null);
  const overAt = compareOver === null ? -1 : stack.indexOf(compareOver);
  // Opened over a ball no longer open, the comparison went with it.
  if (compareOpen && compareOver !== null && overAt < 0) {
    setCompareOpen(false);
    setCompareOver(null);
  }
  const compareAt = compareOpen ? overAt + 1 : Infinity;
  const coveredCompare = compareAt < stack.length;

  // The tray at the foot of the list, a ball's page and a View all list alike
  // (ADR-266), while any ball is in the comparison.
  const tray =
    compared.length > 0 ? (
      <CompareTray balls={compareBalls} onAskRemove={askRemove} onCompare={() => openCompare()} />
    ) : undefined;
  const inCompare = (id: string) => compared.some((e) => e.id === id);

  const detailFor = (id: string, i: number) => {
    const top = i === stack.length - 1;
    const list = parseKinListPage(id);
    if (list) {
      return (
        <KinListPage
          key={id}
          list={list}
          // Every spelling of the core or cover, newest first, whatever the
          // list under it is searched or filtered to.
          balls={applyFilters(allBalls, { ...EMPTY_FILTERS, [list.kind]: list.name }, "releaseDate", defaultWeight)}
          isOwned={isOwned}
          weight={defaultWeight}
          active={top && addingBall === null && !(compareOpen && i < compareAt) && menuAt === null && removing === null}
          onBack={onBack}
          onSelectBall={onSelectBall}
          inCompare={inCompare}
          tray={tray}
        />
      );
    }
    const ball = allBalls.find((b) => b.id === id);
    if (!ball) return null;
    return (
      <DetailPanel
        key={ball.id}
        ball={ball}
        owned={ownedCopies(ball)}
        onBack={onBack}
        onAddToArsenal={setAddingBall}
        addDialogOpen={!top || addingBall != null || (compareOpen && i < compareAt) || menuAt !== null || removing !== null}
        comparedAt={comparedAt(ball.id)}
        onAskRemove={(w, el) => askRemove(entryKey({ id: ball.id, weight: w }), el)}
        tray={tray}
        onAddToCompare={weightToAdd(ball) === null ? null : () => addToCompare(ball)}
        weight={defaultWeight}
        allBalls={allBalls}
        onSelectBall={onSelectBall}
        // Over this ball, on the catalog's own stack, so back comes back
        // here (ADR-264).
        onViewAll={(list) => onSelectBall(kinListPage(list))}
      />
    );
  };

  const compareScreen = compareOpen ? (
    <BallCompareView
      compared={compareBalls}
      owned={ownedBalls}
      onRemove={(key) => setCompared((entries) => entries.filter((e) => entryKey(e) !== key))}
      onWeightChange={(key, weight) =>
        setCompared((entries) => entries.map((e) => (entryKey(e) === key ? { ...e, weight } : e)))
      }
      // Back to the list, picking, for another ball (ADR-262). Any ball the
      // comparison was opened over goes with it: the list is what was asked for.
      onAddBall={() => {
        setCompareOpen(false);
        setPicking(true);
        if (graphOnly) setGraphOnly(false);
        else if (selectedBallId !== null) (onShowList ?? onBack)();
      }}
      // From the arsenal, the graph is the screen, so back leaves the catalog.
      onBack={graphOnly ? onBack : () => setCompareOpen(false)}
      backCloses={!graphOnly}
      initialTab={compareTab}
      onOpenBall={onSelectBall}
      active={addingBall === null && !coveredCompare}
    />
  ) : null;

  const layers = (
    <>
      {/* Detail panel, a self-contained fixed modal (see DetailPanel) */}
      {/* The open ball over the balls it was reached through, each drawn
          where it was left, so a ball opened from another's row slides in
          over that ball, and back (or the drag) uncovers it (ADR-257). */}
      {/* Only the top few are drawn (DRAWN_PAGES): the rest come back as
          back reaches them (ADR-264). */}
      {stack.map((id, i) => (
        <Fragment key={`${i}:${id}`}>
          {i === compareAt && compareScreen}
          {i >= stack.length - DRAWN_PAGES && detailFor(id, i)}
        </Fragment>
      ))}
      {compareAt >= stack.length && compareScreen}

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
            <ClearAllButton
              onClick={() => setFilters((f) => ({ ...EMPTY_FILTERS, search: f.search }))}
              disabled={activeFilterCount === 0}
            />
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
        // The arsenal's own ball form, already linked to this ball, so a
        // ball from the catalog gets its weight and layout as any other
        // does (ADR-265).
        <BallFormDialog
          ball={null}
          catalogBall={addingBall}
          onClose={() => setAddingBall(null)}
          onSaved={() => {
            setAddingBall(null);
            void loadOwned();
          }}
        />
      )}
      {removing && (
        <RemoveFromCompare
          anchor={removing.anchor}
          onRemove={() => setCompared((entries) => entries.filter((e) => entryKey(e) !== removing.key))}
          onClose={() => setRemoving(null)}
        />
      )}
      {menuAt && (
        <AnchoredMenu left={menuAt.left} top={menuAt.top} align="end" onClose={() => setMenuAt(null)}>
          <AnchoredMenuItem
            icon={Columns3}
            onClick={() => {
              setMenuAt(null);
              setPicking(true);
            }}
          >
            {t({ message: "Compare balls", comment: "A menu item: starts picking bowling balls in the catalog to compare them" })}
          </AnchoredMenuItem>
          <AnchoredMenuItem
            icon={MailPlus}
            onClick={() => {
              setMenuAt(null);
              openMail(catalogRequestMailto("ball", filters.search.trim()));
            }}
          >
            {t`Request a ball`}
          </AnchoredMenuItem>
        </AnchoredMenu>
      )}
    </>
  );

  // From the arsenal, the graph alone: no list under it to show on its way out.
  if (graphOnly) return layers;

  return (
    <PushScreen
      title={t`Catalog`}
      // Under the title rather than over the list: the title's block scrolls
      // away, and the bar carries the same line once it has, so the count
      // costs the pinned search and filters no height (ADR-253).
      // With the weight the rows' numbers are at, the bowler's default
      // (ADR-262).
      subtitle={
        allBalls.length > 0
          ? `${plural(displayed.length, {
              one: "# result",
              other: "# results"
            })} · ${t({ message: `Specs at ${{ weight: lb(defaultWeight) }}`, comment: "Under the catalog's title: the ball weight the listed specs are for, such as 15 lb" })}`
          : undefined
      }
      onBack={onBack}
      active={selectedBallId === null && addingBall === null && !showFilters && !compareOpen && menuAt === null && removing === null}
      trailing={
        picking ? (
          <IconButton
            variant="confirm"
            label={t({ message: "Done picking", comment: "Leaves the mode where tapping a ball picks it to compare" })}
            aria-pressed
            onClick={() => setPicking(false)}
          >
            <Check size={20} aria-hidden="true" />
          </IconButton>
        ) : (
          <>
            {/* Straight to the graph of the bag and any balls picked
                (ADR-262), beside the menu. */}
            <IconButton
              variant="round"
              label={t({ message: "Ball graph", comment: "Opens a graph placing bowling balls by RG and differential" })}
              onClick={() => openCompare("graph")}
            >
              <ChartScatter size={20} aria-hidden="true" />
            </IconButton>
            {/* Comparing and asking for a ball, in one menu (ADR-261): a
                compare glyph alone in the bar did not say what it did. */}
            <IconButton
              variant="round"
              label={t`More`}
              className="ml-1"
              onClick={(e) => setMenuAt(anchorUnder(e.currentTarget, ANCHORED_MENU_WIDTH))}
            >
              <MoreHorizontal size={20} aria-hidden="true" />
            </IconButton>
          </>
        )
      }
      footer={tray}
      // The list grows as it scrolls, so a scroll bar only ever says "more"
      // (ADR-266).
      hideScrollbar
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
          <ul className="divide-y divide-edge overflow-hidden rounded-xl border border-edge bg-surface shadow-sm">
            {shown.map((ball) => (
              <li key={ball.id} style={ROW_PAINT}>
                <CatalogRow
                  ball={ball}
                  owned={isOwned(ball)}
                  inCompare={inCompare(ball.id)}
                  weight={defaultWeight}
                  picked={picking ? comparedAt(ball.id).length : null}
                  disabled={picking && weightToAdd(ball) === null}
                  // Picking, a tap adds the ball to the comparison at the
                  // bowler's default weight, and again at another (ADR-262);
                  // else it opens the ball (ADR-258).
                  onClick={() => (picking ? addToCompare(ball) : onSelectBall(ball.id))}
                />
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

      {layers}
    </PushScreen>
  );
}
