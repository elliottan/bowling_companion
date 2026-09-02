import { useEffect, useMemo, useRef, useState } from "react";
import { LayoutGrid, Share2 } from "lucide-react";
import { RackIcon } from "../components/icons";
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
import { rememberScroll, restoreScroll } from "../lib/viewMemory";
import { useSessionFilters } from "./useSessionFilters";
import type { Ball } from "../types/bowling";
import { ListGroup, ListRow } from "../components/ui/ListGroup";
import { ErrorBanner } from "../components/ErrorBanner";

interface StatsViewProps {
  onOpenSession: (sessionId: number) => void;
  /** Open one game of a session directly, from a stats drill-down, carrying
   *  the ball it was about. */
  onOpenSessionGame?: (sessionId: number, gameId: number, ballId?: number) => void;
  onOpenFrames: () => void;
  onOpenGameTrend: () => void;
}

const NO_BALLS: Ball[] = [];

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
  byAlley: []
};

export function StatsView({
  onOpenSession,
  onOpenSessionGame,
  onOpenFrames,
  onOpenGameTrend
}: StatsViewProps) {
  const filters = useSessionFilters();
  const { filtered, activeLanes, isLoading } = filters;
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
          lanes: activeLanes
        })
      ),
    [stats, filters.alley, filters.pattern, filters.event, filters.gameNumber, activeLanes]
  );

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollerRef.current;
    return el ? restoreScroll(el, "stats:scroll") : undefined;
  }, []);

  return (
    <section className="mx-auto flex h-full w-full max-w-3xl flex-col px-3 pt-3 sm:px-6 sm:pt-5">
      <CollapsingHeader scrollerRef={scrollerRef}>
        <div className="mb-3 flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-ink">Stats</h1>
        <div className="flex shrink-0 items-center gap-1">
          <SessionFilterButton filters={filters} onOpen={() => setFiltersOpen(true)} />
          {/* The two drill-downs used to live behind this control, which meant
              a screen full of numbers hid the two screens that explain them
              behind a menu with no name on it. They are rows under the tiles
              now (ADR-063b put them there to get them off the bottom of a long
              scroll; under the tiles is neither the bottom nor a menu), and the
              header keeps its one action, which is the share. */}
          <IconButton label="Share these stats" variant="round" onClick={() => setShareOpen(true)}>
            <Share2 size={20} aria-hidden="true" />
          </IconButton>
        </div>
      </div>


        <SessionFilterChips filters={filters} />
      </CollapsingHeader>
      {filtersOpen && (
        <SessionFilterSheet filters={filters} onClose={() => setFiltersOpen(false)} />
      )}

      <ShareCardDialog open={shareOpen} card={shareCard} onClose={() => setShareOpen(false)} />

      <div
        ref={scrollerRef}
        onScroll={(e) => rememberScroll("stats:scroll", e.currentTarget.scrollTop)}
        className="-mx-3 min-h-0 flex-1 overflow-y-auto overscroll-contain sm:-mx-6"
      >
        <div className="px-3 pb-5 sm:px-6 sm:pb-8">
          {filters.error && (
            <ErrorBanner className="mb-3">
              Your sessions could not be read. Reload the app, then try again.
            </ErrorBanner>
          )}
          <Stats
            stats={isLoading ? EMPTY : stats}
            isLoading={isLoading}
            leaves={leaves}
            ballPerformance={ballPerformance}
            sessionTrend={sessionTrend}
            sessionMetrics={sessionMetrics}
            memoryKey="history"
            underTiles={
              <ListGroup>
                <ListRow
                  icon={LayoutGrid}
                  label="Game by game"
                  description="How your first game compares with your last"
                  onClick={onOpenGameTrend}
                />
                <ListRow
                  icon={RackIcon}
                  label="Open frames"
                  description="The leaves you keep missing, most often first"
                  onClick={onOpenFrames}
                />
              </ListGroup>
            }
            onOpenSession={onOpenSession}
            onOpenGame={onOpenSessionGame}
          />

        </div>
      </div>
    </section>
  );
}
