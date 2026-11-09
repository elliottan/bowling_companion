import { plural, t } from "@lingui/core/macro";
import { TAB_TITLE, TAB_TITLE_ROW } from "../components/ui/typography";
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ErrorBanner } from "../components/ErrorBanner";
import { alleyLabel } from "../lib/sessionLabels";
import { deleteSession } from "../services/bowlingRepository";
import { SessionHistory } from "../components/SessionHistory";
import {
  SessionFilterButton,
  SessionFilterChips,
  SessionFilterSheet
} from "../components/SessionFilterBar";
import { FloatingHeader } from "../components/FloatingHeader";
import { HistoryCalendar } from "../components/HistoryCalendar";
import { Expand } from "../components/ui/Expand";
import { IconButton } from "../components/ui/IconButton";
import {
  clampMonth,
  monthBounds,
  monthOfDate,
  readCalendarShown,
  weekStartFor,
  writeCalendarShown,
  type CalendarMonth
} from "../lib/historyCalendar";
import { PushScreen } from "../components/PushScreen";
import { rememberScroll, restoreScroll, useRememberedState } from "../lib/viewMemory";
import { useSessionFilters } from "./useSessionFilters";
import type { SessionSummary } from "../types/bowling";

interface HistoryViewProps {
  onOpenSession: (sessionId: number) => void;
  activeSessionId: number | null;
  /** `push` when a pattern's sheet or the search sends a bowler here with the
   *  filter set (ADR-247): the same list, as a pushed screen, so back returns
   *  to where the question was asked. The filter is the tab's own, shared, as
   *  the pushed Stats' is (ADR-083). */
  mode?: "tab" | "push";
  /** Required in `push` mode. */
  onBack?: () => void;
}

const PAGE = 15; // sessions loaded per infinite-scroll step

export function HistoryView({
  onOpenSession,
  activeSessionId,
  mode = "tab",
  onBack
}: HistoryViewProps) {
  // Its own memory when pushed, so leaving it does not move the tab's list.
  const memory = mode === "push" ? "history-push" : "history";
  // The list reads scores, never shots, so it takes the loader that skips the
  // frames of games that already have one (ADR-066).
  const filters = useSessionFilters({ frames: "unscored" });
  const { sessionList, isLoading, error } = filters;
  const [filtersOpen, setFiltersOpen] = useState(false);
  // A session swiped aside and asked to be deleted, until the bowler answers.
  const [pendingDelete, setPendingDelete] = useState<SessionSummary | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [visibleCount, setVisibleCount] = useRememberedState(`${memory}:visible`, PAGE);
  // The list the window belongs to. Comparing it during render resets the
  // window when the filters change a list, which an effect would only do a
  // render later, after painting a short list scrolled to the wrong place.
  const [windowedList, setWindowedList] = useState<SessionSummary[] | null>(null);

  // The calendar over the list (ADR-252): on until hidden, remembered on this
  // device. The month is the tab's while the app is open, so leaving History
  // and coming back keeps the month being read.
  const [calendarShown, setCalendarShown] = useState(readCalendarShown);
  const [rememberedMonth, setMonth] = useRememberedState<CalendarMonth>(`${memory}:month`, monthOfDate(new Date()));
  // Never before the first session's month or after the last's: a month with
  // nothing in it either side of the bowler's history is a dead end.
  const bounds = useMemo(() => monthBounds(filters.history), [filters.history]);
  const month = clampMonth(rememberedMonth, bounds);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  // A day tapped whose heading the list has yet to scroll to: set on the tap,
  // taken once the heading is rendered, which may be after a longer window.
  const [jumpTo, setJumpTo] = useState<string | null>(null);
  const weekStart = useMemo(
    () => weekStartFor(typeof navigator === "undefined" ? undefined : navigator.language),
    []
  );
  const hasCalendar = mode === "tab" && filters.history.length > 0;

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // The list scrolls inside the view, not in the app shell, so the shell's own
  // scroll memory never sees it. SwipePanes used to own this; the split left
  // the scroller here.
  useEffect(() => {
    const el = scrollerRef.current;
    return el ? restoreScroll(el, `${memory}:sessions`) : undefined;
  }, [memory]);

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

  // Takes the list to the day tapped on the calendar, its heading just under
  // the floating header. The window grows first when the day is further down
  // than has loaded, so this runs again once its rows are there.
  useEffect(() => {
    if (!jumpTo) return;
    const scroller = scrollerRef.current;
    const heading = scroller?.querySelector<HTMLElement>(`[data-day="${CSS.escape(jumpTo)}"]`);
    if (!scroller || !heading) return;
    const header = scroller.parentElement?.querySelector<HTMLElement>("[data-floating-header]");
    const top =
      heading.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top +
      scroller.scrollTop -
      (header?.offsetHeight ?? 0) -
      8;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    scroller.scrollTo?.({ top: Math.max(0, top), behavior: reduce ? "auto" : "smooth" });
    setJumpTo(null);
  }, [jumpTo, visibleCount]);

  const selectDay = (key: string) => {
    setSelectedDay(key);
    const index = sessionList.findIndex((s) => s.session.date === key);
    if (index < 0) return;
    if (index >= visibleCount) setVisibleCount(index + PAGE);
    setJumpTo(key);
  };

  const body = (
    <section className="mx-auto flex h-full w-full max-w-3xl flex-col px-3 pt-3 sm:px-6 sm:pt-5">
      <FloatingHeader
        scrollerRef={scrollerRef}
        header={
          <>
            {/* Pushed, the bar names the screen and carries the filter, its one
                trailing action, so there is no title row to leave empty. */}
            {mode === "tab" && (
            <div className={`${TAB_TITLE_ROW} mb-3 justify-between gap-3`}>
              <h1 className={`${TAB_TITLE} min-w-0 flex-1`}>{t`History`}</h1>
              {/* Nothing to narrow before the first session, and a control
                  that can only ever filter an empty list is noise on the
                  screen a new bowler is deciding about. */}
              {filters.history.length > 0 && (
                <div className="flex shrink-0 items-center gap-1">
                  {/* The calendar's switch sits beside the filter, both trailing
                      actions over the list (ADR-252, moved at the owner's ask). */}
                  <IconButton
                    variant="round"
                    label={t`Calendar`}
                    aria-pressed={calendarShown}
                    onClick={() => {
                      const next = !calendarShown;
                      setCalendarShown(next);
                      writeCalendarShown(next);
                    }}
                  >
                    <CalendarDays size={20} aria-hidden="true" className={calendarShown ? "text-accent" : undefined} />
                  </IconButton>
                  <SessionFilterButton filters={filters} onOpen={() => setFiltersOpen(true)} />
                </div>
              )}
            </div>
            )}

            {error && <ErrorBanner className="mb-3">{t`Your sessions could not be read. Reload the app, then try again.`}</ErrorBanner>}
            {deleteError && <ErrorBanner className="mb-3">{deleteError}</ErrorBanner>}

            <SessionFilterChips filters={filters} />

            {/* Pinned with the title, not scrolled with the list: shown, it
                pushes the list down below it, so only the sessions scroll and
                a day tapped lands its first session right under it. Hidden,
                the list starts under the title as before. */}
            {/* Opens downward and closes back up (ADR-261): the switch
                pushes the list down and draws it back up rather than
                jumping it a calendar's height on a frame. */}
            {hasCalendar && !isLoading && (
              <Expand open={calendarShown}>
                <HistoryCalendar
                  sessions={sessionList}
                  month={month}
                  onMonthChange={setMonth}
                  selectedDay={selectedDay}
                  onSelectDay={selectDay}
                  weekStart={weekStart}
                  bounds={bounds}
                />
              </Expand>
            )}
          </>
        }
        onScroll={(e) => rememberScroll(`${memory}:sessions`, e.currentTarget.scrollTop)}
      >
        <div className="px-3 pb-5 sm:px-6 sm:pb-8">
          <SessionHistory
            sessions={sessionList.slice(0, visibleCount)}
            isLoading={isLoading}
            onOpenSession={onOpenSession}
            activeSessionId={activeSessionId}
            onDeleteSession={setPendingDelete}
          />
          <div ref={sentinelRef} className="h-6" aria-hidden="true" />
        </div>
      </FloatingHeader>
      {filtersOpen && (
        <SessionFilterSheet filters={filters} onClose={() => setFiltersOpen(false)} />
      )}
      {/* The same question the session's own editor asks, word for word. The
          list follows the database, so the row goes once it is deleted. */}
      <ConfirmDialog
        open={pendingDelete !== null}
        title={t`Delete this session?`}
        message={pendingDelete ? deleteSessionMessage(pendingDelete) : undefined}
        confirmLabel={t`Delete`}
        onConfirm={() => {
          const id = pendingDelete?.session.id;
          setPendingDelete(null);
          if (id == null) return;
          setDeleteError(null);
          deleteSession(id).catch((err: unknown) =>
            setDeleteError(err instanceof Error ? err.message : t`Unable to delete session.`)
          );
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </section>
  );

  if (mode === "tab") return body;
  return (
    <PushScreen
      history="route"
      title={t`History`}
      onBack={onBack ?? (() => {})}
      active={!filtersOpen && pendingDelete === null}
      trailing={
        filters.history.length > 0 ? (
          <SessionFilterButton filters={filters} onOpen={() => setFiltersOpen(true)} />
        ) : undefined
      }
    >
      {body}
    </PushScreen>
  );
}

/** One whole message per count, as the session editor words it, so a language
 *  with its own plural forms for "game" can have them. */
function deleteSessionMessage(summary: SessionSummary): string {
  const alley = alleyLabel(summary.session.alley_name);
  const gameCount = summary.games.length;
  return plural(gameCount, {
    one: `"${alley}" and its game will be permanently deleted. This can't be undone.`,
    other: `"${alley}" and all # games will be permanently deleted. This can't be undone.`
  });
}
