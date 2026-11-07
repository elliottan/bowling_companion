import { t } from "@lingui/core/macro";
import {
  ArrowUpLeft,
  BarChart3,
  BookA,
  BookOpen,
  CalendarDays,
  ChevronRight,
  Compass,
  Download,
  GraduationCap,
  History,
  MapPin,
  Search,
  Settings,
  type LucideIcon
} from "lucide-react";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { SearchField } from "../components/ui/SearchField";
import { ListGroup, LIST_DIVIDER_BASE, LIST_DIVIDER_INSET } from "../components/ui/ListGroup";
import { GROUP_HEADING } from "../components/ui/typography";
import { Chip } from "../components/ui/Chip";
import { EmptyState } from "../components/ui/EmptyState";
import { CatalogBallImage } from "../components/CatalogBallImage";
import {
  BowlingBallIcon,
  GamePlanIcon,
  LanePairIcon,
  LaneViewIcon,
  OilPatternIcon,
  SpareLineIcon
} from "../components/icons";
import { useOverlay } from "../lib/useOverlay";
import { useSheetDismiss } from "../lib/useSheetDismiss";
import {
  SECTION_LIMIT,
  buildSearchIndex,
  highlightParts,
  searchIndex,
  searchSuggestions,
  type ScreenEntry,
  type SearchItem,
  type SearchSection,
  type SearchTarget
} from "../lib/search";
import { SUGGESTED_TERMS } from "../lib/guides";
import {
  addRecentSearch,
  clearRecentSearches,
  readRecentSearches
} from "../lib/recentSearches";
import { getGamesPerPattern, getSessionList } from "../services/bowlingRepository";
import { getAllOilPatterns, getBalls } from "../services/ballRepository";
import { getAllCatalog } from "../services/ballCatalogRepository";
import type { Ball, OilPattern, SessionSummary } from "../types/bowling";
import type { CatalogBall, Manufacturer } from "../types/catalog";

/**
 * The search over everything (ADR-247).
 *
 * It opens over the screen it was called from, which stays in sight behind a
 * blur, with the field focused so the keyboard comes up with it. Before
 * anything is typed it offers the last searches and a few suggestions; once
 * something is, the best answer leads on its own, then every kind of thing
 * the app holds in its own group, the bowler's first.
 *
 * Whatever a result opens is pushed over this, so back comes home to the
 * results exactly as they were typed.
 *
 * Not lazy, unlike the other pushed screens: iOS raises the keyboard only for
 * a focus made inside the tap, and a screen that waits for its code to arrive
 * focuses its field too late for that.
 */

interface SearchViewProps {
  onClose: () => void;
  /** Open what a result points at. */
  onOpen: (target: SearchTarget) => void;
  /** Open the ball catalog, already searched for what was typed. */
  onSearchCatalog: (query: string) => void;
  /** False while a screen a result opened is on top of it. */
  active?: boolean;
}

const NO_SESSIONS: SessionSummary[] = [];
const NO_PATTERNS: OilPattern[] = [];
const NO_BALLS: Ball[] = [];
const NO_CATALOG: CatalogBall[] = [];
const NO_GAMES: ReadonlyMap<number, number> = new Map();

function sectionHeading(section: SearchSection): string {
  switch (section) {
    case "sessions":
      return t`Your sessions`;
    case "patterns":
      return t`Oil patterns`;
    case "arsenal":
      return t`Arsenal`;
    case "catalog":
      return t`Ball catalog`;
    case "terms":
      return t({ message: "Bowling terms", comment: "A group of search results: words bowlers use, and what each means" });
    case "guides":
      return t`Guides`;
    case "screens":
      return t({ message: "Go to", comment: "A group of search results: screens of the app to open" });
  }
}

/** The screens a search can find by name, in the names their own rows use. */
function screenEntries(): ScreenEntry[] {
  return [
    { screen: "arsenal", title: t`Arsenal` },
    { screen: "catalog", title: t`Ball catalog` },
    { screen: "oil-patterns", title: t`Oil patterns` },
    { screen: "spares", title: t`Spare lines` },
    { screen: "lanes", title: t`Lane notes` },
    { screen: "game-plan", title: t`Alley report` },
    { screen: "layout-lab", title: t`Layouts` },
    { screen: "line", title: t`Line visualizer` },
    { screen: "guides", title: t`Guides` },
    { screen: "backup", title: t`Backup & restore` },
    { screen: "history", title: t`History` },
    { screen: "stats", title: t`Stats` },
    { screen: "settings", title: t`Settings` }
  ];
}

export function SearchView({ onClose, onOpen, onSearchCatalog, active = true }: SearchViewProps) {
  const { dismiss, rootStyle, backdropStyle, panelStyle } = useSheetDismiss(onClose, "center");
  // Back closes it through history like any pushed screen, so the back stack
  // is not also asked (`backCloses` off); Escape and the focus trap are its.
  const panelRef = useOverlay<HTMLDivElement>(dismiss, active, false);
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>(() => readRecentSearches());
  const [expanded, setExpanded] = useState<ReadonlySet<SearchSection>>(new Set());

  const sessions = useLiveQuery(() => getSessionList()) ?? NO_SESSIONS;
  const patterns = useLiveQuery(() => getAllOilPatterns()) ?? NO_PATTERNS;
  const balls = useLiveQuery(() => getBalls()) ?? NO_BALLS;
  // Whatever the catalog screen last synced. The search never fetches it: a
  // first sync parses the whole catalog, which is the catalog screen's to pay.
  const catalog = useLiveQuery(() => getAllCatalog()) ?? NO_CATALOG;
  const patternGames = useLiveQuery(() => getGamesPerPattern()) ?? NO_GAMES;

  const index = useMemo(
    () => buildSearchIndex({ sessions, patterns, balls, catalog, patternGames, screens: screenEntries() }),
    [sessions, patterns, balls, catalog, patternGames]
  );
  const trimmed = query.trim();
  const results = useMemo(() => searchIndex(index, trimmed, Number.POSITIVE_INFINITY), [index, trimmed]);
  const suggestions = useMemo(() => searchSuggestions(sessions, SUGGESTED_TERMS), [sessions]);

  const changeQuery = useCallback((value: string) => {
    setQuery(value);
    setExpanded(new Set());
  }, []);

  const open = (target: SearchTarget) => {
    setRecent(addRecentSearch(trimmed));
    onOpen(target);
  };

  // A scroll of the results lets the keyboard go, as a phone's search does, so
  // the rows under it can be reached.
  const releaseKeyboard = () => {
    const el = document.activeElement;
    if (el instanceof HTMLInputElement && panelRef.current?.contains(el)) el.blur();
  };

  return (
    <div
      className="fixed inset-0 z-[55] [#app-shell>&]:absolute"
      style={rootStyle}
      role="dialog"
      aria-modal="true"
      aria-label={t`Search`}
    >
      {/* What it was opened over stays in sight, out of focus. */}
      <div aria-hidden="true" className="search-backdrop animate-fade-in absolute inset-0" style={backdropStyle} />
      <div ref={panelRef} className="relative flex h-full flex-col" style={panelStyle}>
        <div className="animate-search-in shrink-0 px-3 pt-[env(safe-area-inset-top)] sm:px-6">
          <div className="mx-auto w-full max-w-xl py-2">
            <SearchField
              value={query}
              onChange={changeQuery}
              autoFocus
              onCancel={() => dismiss()}
              onSubmit={() => trimmed && setRecent(addRecentSearch(trimmed))}
              placeholder={t({
                message: "Balls, patterns, alleys, terms",
                comment: "Placeholder of the app-wide search field: the kinds of thing it finds"
              })}
              label={t`Search Headpin`}
            />
          </div>
        </div>

        <div
          onTouchMove={releaseKeyboard}
          onWheel={releaseKeyboard}
          className="animate-fade-in min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-2 sm:px-6"
        >
          <div className="mx-auto w-full max-w-xl space-y-5">
            {trimmed === "" ? (
              <>
                {recent.length > 0 && (
                  <ListGroup
                    heading={t({ message: "Recent", comment: "Heading over the last few searches" })}
                    headingTrailing={
                      <button
                        type="button"
                        onClick={() => {
                          clearRecentSearches();
                          setRecent([]);
                        }}
                        className="relative text-footnote font-semibold text-accent active:opacity-60 after:absolute after:-inset-x-2 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-['']"
                      >
                        {t({ message: "Clear", comment: "Removes every recent search" })}
                      </button>
                    }
                  >
                    {recent.map((value) => (
                      <li key={value} className={LIST_DIVIDER_INSET}>
                        <button
                          type="button"
                          onClick={() => changeQuery(value)}
                          className="flex min-h-[52px] w-full items-center gap-3.5 px-4 py-2.5 text-left active:bg-surface-muted"
                        >
                          <Tile icon={History} muted />
                          <span className="min-w-0 flex-1 truncate text-body text-ink">{value}</span>
                          <ArrowUpLeft size={17} aria-hidden="true" className="shrink-0 text-ink-tertiary" />
                        </button>
                      </li>
                    ))}
                  </ListGroup>
                )}

                <section>
                  <h2 className={`${GROUP_HEADING} mb-2 px-4`}>
                    {t({ message: "Try", comment: "Heading over a few suggested searches" })}
                  </h2>
                  <div className="flex flex-wrap gap-2 px-1">
                    {suggestions.map((value) => (
                      <Chip key={value} selected={false} onClick={() => changeQuery(value)}>
                        <Search size={14} aria-hidden="true" className="-ml-0.5 mr-1.5 text-ink-tertiary" />
                        {value}
                      </Chip>
                    ))}
                  </div>
                </section>
              </>
            ) : results.total === 0 ? (
              <>
                <EmptyState
                  icon={Search}
                  title={t`No results for “${{ query: trimmed }}”`}
                  description={t`Try a ball, a pattern, an alley or a word you've heard, like pocket.`}
                />
                <CatalogLink query={trimmed} onSearchCatalog={onSearchCatalog} onUsed={() => setRecent(addRecentSearch(trimmed))} />
              </>
            ) : (
              <>
                {results.top && (
                  <ListGroup heading={t({ message: "Top hit", comment: "Heading over the single best search result" })}>
                    <ResultRow item={results.top} query={trimmed} onOpen={open} prominent />
                  </ListGroup>
                )}
                {results.sections.map(({ section, items }) => {
                  const shown = expanded.has(section) ? items : items.slice(0, SECTION_LIMIT);
                  const more = items.length - shown.length;
                  return (
                    <ListGroup
                      key={section}
                      heading={sectionHeading(section)}
                      headingTrailing={
                        more > 0 ? (
                          <button
                            type="button"
                            onClick={() => setExpanded((prev) => new Set(prev).add(section))}
                            className="relative text-footnote font-semibold text-accent active:opacity-60 after:absolute after:-inset-x-2 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-['']"
                          >
                            {t({ message: `Show all ${{ count: items.length }}`, comment: "Expands a group of search results to every one it found" })}
                          </button>
                        ) : undefined
                      }
                    >
                      {shown.map((item) => (
                        <ResultRow key={item.key} item={item} query={trimmed} onOpen={open} />
                      ))}
                    </ListGroup>
                  );
                })}
                <CatalogLink query={trimmed} onSearchCatalog={onSearchCatalog} onUsed={() => setRecent(addRecentSearch(trimmed))} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The catalog's own screen, already searched: it holds filters, sorts and
 *  balls this search may not have synced yet. */
function CatalogLink({
  query,
  onSearchCatalog,
  onUsed
}: {
  query: string;
  onSearchCatalog: (query: string) => void;
  onUsed: () => void;
}) {
  return (
    <ListGroup>
      <li className={LIST_DIVIDER_INSET}>
        <button
          type="button"
          onClick={() => {
            onUsed();
            onSearchCatalog(query);
          }}
          className="flex min-h-[52px] w-full items-center gap-3.5 px-4 py-2.5 text-left active:bg-surface-muted"
        >
          <Tile icon={BowlingBallIcon} />
          <span className="min-w-0 flex-1 break-words text-body leading-snug text-accent">
            {t`Search the ball catalog for “${{ query }}”`}
          </span>
          <ChevronRight size={17} strokeWidth={2.25} aria-hidden="true" className="shrink-0 text-ink-tertiary" />
        </button>
      </li>
    </ListGroup>
  );
}

function Tile({ icon: Icon, muted = false }: { icon: LucideIcon; muted?: boolean }) {
  return (
    <span
      className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] ${
        muted ? "bg-surface-muted text-ink-secondary" : "bg-accent-soft text-accent"
      }`}
    >
      <Icon size={17} aria-hidden="true" />
    </span>
  );
}

function iconFor(item: SearchItem): LucideIcon {
  const { target } = item;
  switch (target.kind) {
    case "sessions":
      return target.facet === "alley" ? MapPin : target.facet === "event" ? CalendarDays : History;
    case "pattern":
      return OilPatternIcon;
    case "arsenal-ball":
    case "catalog-ball":
      return BowlingBallIcon;
    case "guide":
      return item.section === "terms" ? BookA : GraduationCap;
    case "screen":
      return SCREEN_ICONS[target.screen];
  }
}

/** Each screen's own glyph, the one its row on Home or in Settings wears. */
const SCREEN_ICONS: Record<ScreenEntry["screen"], LucideIcon> = {
  arsenal: BowlingBallIcon,
  catalog: BookOpen,
  "oil-patterns": OilPatternIcon,
  spares: SpareLineIcon,
  lanes: LanePairIcon,
  "game-plan": GamePlanIcon,
  "layout-lab": Compass,
  line: LaneViewIcon,
  guides: GraduationCap,
  backup: Download,
  history: History,
  stats: BarChart3,
  settings: Settings
};

/** The title with what was typed in it drawn bold, as a phone's search marks
 *  the letters that matched. */
function Highlighted({ text, query }: { text: string; query: string }): ReactNode {
  const parts = highlightParts(text, query);
  if (!parts) return text;
  return (
    <>
      {parts[0]}
      <mark className="bg-transparent font-semibold text-ink">{parts[1]}</mark>
      {parts[2]}
    </>
  );
}

function ResultRow({
  item,
  query,
  onOpen,
  prominent = false
}: {
  item: SearchItem;
  query: string;
  onOpen: (target: SearchTarget) => void;
  prominent?: boolean;
}) {
  const isBall = item.target.kind === "arsenal-ball" || item.target.kind === "catalog-ball";
  const size = prominent ? 56 : 40;
  const leading =
    isBall && item.image ? (
      <span className="relative shrink-0 overflow-hidden rounded-[10px]" style={{ width: size, height: size }}>
        <CatalogBallImage src={item.image} alt="" brand={(item.brand ?? "Storm") as Manufacturer} size="thumb" />
      </span>
    ) : (
      <Tile icon={iconFor(item)} />
    );
  // A term is the one row that answers on the spot, so it keeps three lines
  // of its meaning; everything else is a name and one line about it.
  const clamp = item.section === "terms" ? "line-clamp-3" : "line-clamp-2";
  const inset = isBall && item.image
    ? `${LIST_DIVIDER_BASE} ${prominent ? "before:left-[5.25rem]" : "before:left-[4.375rem]"}`
    : LIST_DIVIDER_INSET;
  return (
    <li className={inset}>
      <button
        type="button"
        onClick={() => onOpen(item.target)}
        className="flex min-h-[52px] w-full items-center gap-3.5 px-4 py-2.5 text-left active:bg-surface-muted"
      >
        {leading}
        <span className="min-w-0 flex-1">
          <span
            className={`block break-words leading-snug text-ink ${prominent ? "text-headline" : "text-body"}`}
          >
            <Highlighted text={item.title} query={query} />
          </span>
          {item.subtitle && (
            <span className={`${clamp} block text-footnote leading-snug text-ink-secondary`}>{item.subtitle}</span>
          )}
        </span>
        <ChevronRight size={17} strokeWidth={2.25} aria-hidden="true" className="shrink-0 text-ink-tertiary" />
      </button>
    </li>
  );
}
