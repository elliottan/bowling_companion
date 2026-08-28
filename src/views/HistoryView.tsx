import { useEffect, useRef, useState } from "react";
import { BarChart3 } from "lucide-react";
import { ErrorBanner } from "../components/ErrorBanner";
import { SessionHistory } from "../components/SessionHistory";
import {
  SessionFilterButton,
  SessionFilterChips,
  SessionFilterSheet
} from "../components/SessionFilterBar";
import { IconButton } from "../components/ui/IconButton";
import { rememberScroll, restoreScroll, useRememberedState } from "../lib/viewMemory";
import { useSessionFilters } from "./useSessionFilters";
import type { SessionSummary } from "../types/bowling";

interface HistoryViewProps {
  onOpenSession: (sessionId: number) => void;
  activeSessionId: number | null;
  onSessionDeleted?: (sessionId: number) => void;
  /** Cross to the Stats tab, carrying the filter that is on screen. */
  onViewStats: () => void;
}

const PAGE = 15; // sessions loaded per infinite-scroll step

export function HistoryView({
  onOpenSession,
  activeSessionId,
  onSessionDeleted,
  onViewStats
}: HistoryViewProps) {
  // The list reads scores, never shots, so it takes the loader that skips the
  // frames of games that already have one (ADR-066).
  const filters = useSessionFilters({ frames: "unscored" });
  const { sessionList, isLoading } = filters;
  const [error] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [visibleCount, setVisibleCount] = useRememberedState("history:visible", PAGE);
  // The list the window belongs to. Comparing it during render resets the
  // window when the filters change a list, which an effect would only do a
  // render later, after painting a short list scrolled to the wrong place.
  const [windowedList, setWindowedList] = useState<SessionSummary[] | null>(null);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // The list scrolls inside the view, not in the app shell, so the shell's own
  // scroll memory never sees it. SwipePanes used to own this; the split left
  // the scroller here.
  useEffect(() => {
    const el = scrollerRef.current;
    return el ? restoreScroll(el, "history:sessions") : undefined;
  }, []);

  // React's documented "adjust state during render" rather than in an effect:
  // it re-renders before anything is shown, so no wasted paint.
  if (windowedList !== sessionList) {
    setWindowedList(sessionList);
    // Not on the first pass: `windowedList` starts null on every mount, and a
    // tab switch is a mount, so resetting here would throw away a remembered
    // window every time the tab is opened.
    if (windowedList !== null) setVisibleCount(PAGE);
  }

  // Infinite scroll: load PAGE more when the sentinel scrolls into view.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setVisibleCount((c) => (c < sessionList.length ? c + PAGE : c));
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
    // `setVisibleCount` is listed because it now comes from a custom hook, so
    // the linter cannot see that it is a `useState` setter and stable.
  }, [sessionList.length, setVisibleCount]);

  return (
    <section className="mx-auto flex h-full w-full max-w-3xl flex-col px-3 pt-3 sm:px-6 sm:pt-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-ink">History</h1>
        <div className="flex shrink-0 items-center gap-1">
          <SessionFilterButton filters={filters} onOpen={() => setFiltersOpen(true)} />
          {/* Icon only: the tab it crosses to is named in the tab bar already,
              and a word here would only repeat it (ADR-057). */}
          <IconButton label="View stats" variant="round" onClick={onViewStats}>
            <BarChart3 size={20} aria-hidden="true" />
          </IconButton>
        </div>
      </div>

      {error && <ErrorBanner className="mb-3">{error}</ErrorBanner>}

      <SessionFilterChips filters={filters} />
      {filtersOpen && (
        <SessionFilterSheet filters={filters} onClose={() => setFiltersOpen(false)} />
      )}

      <div
        ref={scrollerRef}
        onScroll={(e) => rememberScroll("history:sessions", e.currentTarget.scrollTop)}
        className="-mx-3 min-h-0 flex-1 overflow-y-auto overscroll-contain sm:-mx-6"
      >
        <div className="px-3 pb-5 sm:px-6 sm:pb-8">
          <SessionHistory
            sessions={sessionList.slice(0, visibleCount)}
            isLoading={isLoading}
            onOpenSession={onOpenSession}
            activeSessionId={activeSessionId}
            onSessionDeleted={onSessionDeleted}
          />
          <div ref={sentinelRef} className="h-6" aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}
