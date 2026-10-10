import { useEffect, useMemo, useRef, useState } from "react";
import { ShareIosIcon } from "../components/icons";
import { Stats } from "../components/Stats";
import {
  SessionFilterButton,
  SessionFilterChips,
  SessionFilterSheet
} from "../components/SessionFilterBar";
import { CollapsingHeader } from "../components/CollapsingHeader";
import { IconButton } from "../components/ui/IconButton";
import { ShareCardDialog } from "../components/ShareCardDialog";
import {
  calculateBallPerformance,
  calculateCommonLeaves,
  calculateSessionMetrics,
  calculateSessionTrend,
  calculateStats,
  type BowlingStats
} from "../lib/stats";
import { buildStatsCard, describeFilter } from "../lib/shareCard";
import { getBalls } from "../services/ballRepository";
import { useLiveQuery } from "dexie-react-hooks";
import { useHandedness } from "../lib/handednessContext";
import { useSessionFilters } from "./useSessionFilters";
import type { Ball } from "../types/bowling";
import { ErrorBanner } from "../components/ErrorBanner";
import { PushScreen } from "../components/PushScreen";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { rememberScroll, restoreScroll, useRememberedState } from "../lib/viewMemory";
import { localDateKey } from "../lib/dates";
import {
  calculateRecentForm,
  sessionsInRange,
  STATS_RANGES,
  type StatsRange
} from "../lib/statsRange";

interface StatsViewProps {
  onOpenSession: (sessionId: number) => void;
  /** Open one game of a session directly, from a stats drill-down, carrying
   *  the ball it was about. */
  onOpenSessionGame?: (sessionId: number, gameId: number, ballId?: number) => void;
  /**
   * `tab` (default) is the Stats tab: its own screen, titled by its heading.
   * `push` is the same screen pushed over whatever opened it, which the game
   * plan does so that back returns to the callout that sent you here rather
   * than dropping you on a tab you never chose (ADR-083).
   */
  mode?: "tab" | "push";
  /** Required in `push` mode, ignored in `tab` mode. */
  onBack?: () => void;
}

const NO_BALLS: Ball[] = [];

/** The window, as the share card names it. "Last 10" alone is a count of
 *  nothing on a card seen out of context. */
const RANGE_ON_CARD: Record<StatsRange, string | undefined> = {
  last10: "Last 10 sessions",
  months3: "Last 3 months",
  all: undefined
};

const EMPTY: BowlingStats = {
  totalSessions: 0,
  totalGames: 0,
  completedGames: 0,
  averageScore: null,
  highGame: null,
  lowGame: null,
  strikePct: null,
  sparePct: null,
  pocketPct: null,
  carryPct: null,
  firstBallAverage: null,
  strikeOnStrikePct: null,
  bestStreak: null,
  byAlley: []
};

export function StatsView({
  onOpenSession,
  onOpenSessionGame,
  mode = "tab",
  onBack
}: StatsViewProps) {
  const filters = useSessionFilters();
  const { activeLanes, isLoading } = filters;
  // How far back to read, on top of the shared filters. Stats only: History
  // is a list in date order and has no use for a window (ADR-126).
  const [range, setRange] = useRememberedState<StatsRange>("stats:range", "all");
  const filtered = useMemo(
    () => sessionsInRange(filters.filtered, range, localDateKey(), activeLanes),
    [filters.filtered, range, activeLanes]
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  // Anchored to the control that opened it, so it needs that control's box.

  const liveBalls = useLiveQuery(() => getBalls());
  const balls = liveBalls ?? NO_BALLS;
  const handedness = useHandedness();

  const stats = useMemo(
    () => calculateStats(filtered, activeLanes, handedness),
    [filtered, activeLanes, handedness]
  );
  const leaves = useMemo(
    () => calculateCommonLeaves(filtered, activeLanes),
    [filtered, activeLanes]
  );
  const sessionTrend = useMemo(
    () => calculateSessionTrend(filtered, activeLanes),
    [filtered, activeLanes]
  );
  const sessionMetrics = useMemo(
    () => calculateSessionMetrics(filtered, activeLanes, handedness),
    [filtered, activeLanes, handedness]
  );
  const form = useMemo(
    () => calculateRecentForm(filtered, stats.averageScore, activeLanes, handedness),
    [filtered, stats.averageScore, activeLanes, handedness]
  );
  const ballPerformance = useMemo(
    () => calculateBallPerformance(filtered, balls, activeLanes, handedness),
    [filtered, balls, activeLanes, handedness]
  );

  // The share card describes the filtered set, not the whole history: the
  // numbers on screen are the filtered ones, and a picture that silently
  // widened its scope would be a lie.
  const shareCard = useMemo(
    () =>
      buildStatsCard(
        stats,
        describeFilter({
          alley: filters.alley,
          pattern: filters.pattern,
          event: filters.event,
          gameNumber: filters.gameNumber,
          lanes: activeLanes,
          range: RANGE_ON_CARD[range]
        })
      ),
    [stats, filters.alley, filters.pattern, filters.event, filters.gameNumber, activeLanes, range]
  );

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollerRef.current;
    return el ? restoreScroll(el, "stats:scroll") : undefined;
  }, []);

  // Pushed, the nav bar already carries the title, so a second "Stats" under
  // it would name the screen twice. The two controls stay where they are: they
  // belong to the filter chips they sit above, and only one of them could have
  // moved into the nav bar's single trailing slot anyway.
  const body = (
    <section className="mx-auto flex h-full w-full max-w-3xl flex-col px-3 pt-3 sm:px-6 sm:pt-5">
      <CollapsingHeader
        scrollerRef={scrollerRef}
        header={
          <>
            <div
              className={`mb-3 flex items-center gap-3 ${
                mode === "push" ? "justify-end" : "justify-between"
              }`}
            >
              {mode === "tab" && <h1 className="text-xl font-bold text-ink">Stats</h1>}
              <div className="flex shrink-0 items-center gap-1">
                <SessionFilterButton filters={filters} onOpen={() => setFiltersOpen(true)} />
                {/* The two drill-downs used to live behind this control, which meant
                    a screen full of numbers hid the two screens that explain them
                    behind a menu with no name on it. They are rows under the tiles
                    now (ADR-063b put them there to get them off the bottom of a long
                    scroll; under the tiles is neither the bottom nor a menu), and the
                    header keeps its one action, which is the share. */}
                <IconButton label="Share these stats" variant="round" onClick={() => setShareOpen(true)}>
                  <ShareIosIcon size={20} aria-hidden="true" />
                </IconButton>
              </div>
            </div>

            <SessionFilterChips filters={filters} />
          </>
        }
        onScroll={(e) => rememberScroll("stats:scroll", e.currentTarget.scrollTop)}
      >
        <div className="px-3 pb-5 sm:px-6 sm:pb-8">
          {filters.error && (
            <ErrorBanner className="mb-3">
              Your sessions could not be read. Reload the app, then try again.
            </ErrorBanner>
          )}
          {/* Hidden until there is something to narrow: on a device with no
              games the empty state is the whole screen. */}
          {filters.filtered.length > 0 && (
            <div className="mb-3">
              <SegmentedControl
                label="Sessions counted"
                options={STATS_RANGES}
                value={range}
                onChange={setRange}
                dense
              />
            </div>
          )}
          <Stats
            stats={isLoading ? EMPTY : stats}
            isLoading={isLoading}
            leaves={leaves}
            ballPerformance={ballPerformance}
            sessionTrend={sessionTrend}
            sessionMetrics={sessionMetrics}
            memoryKey="history"
            form={form}
            empty={
              range === "months3" && filters.filtered.length > 0
                ? {
                    title: "Nothing in the last 3 months",
                    description: "Your earlier games are under All."
                  }
                : undefined
            }
            // "Game by game" and "Open frames" sat here too. Both are hidden
            // until they are worth opening: their screens and routes still
            // exist (`game-trend`, `open-frames`), only the rows are gone.
            // The Alley report moved to Home's Tools, next to the other
            // places you read, rather than sitting in the middle of Stats.
            onOpenSession={onOpenSession}
            onOpenGame={onOpenSessionGame}
          />
        </div>
      </CollapsingHeader>
      {filtersOpen && (
        <SessionFilterSheet filters={filters} onClose={() => setFiltersOpen(false)} />
      )}

      <ShareCardDialog open={shareOpen} card={shareCard} onClose={() => setShareOpen(false)} />
    </section>
  );

  if (mode === "tab") return body;
  return (
    <PushScreen title="Stats" onBack={onBack ?? (() => {})} active={!filtersOpen && !shareOpen}>
      {body}
    </PushScreen>
  );
}
