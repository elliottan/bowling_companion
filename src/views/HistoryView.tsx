import { plural, t } from "@lingui/core/macro";
import { TAB_TITLE, TAB_TITLE_ROW } from "../components/ui/typography";
import { useEffect, useRef, useState } from "react";
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
              <h1 className={TAB_TITLE}>{t`History`}</h1>
              {/* Nothing to narrow before the first session, and a control
                  that can only ever filter an empty list is noise on the
                  screen a new bowler is deciding about. */}
              {filters.history.length > 0 && (
                <div className="flex shrink-0 items-center gap-1">
                  <SessionFilterButton filters={filters} onOpen={() => setFiltersOpen(true)} />
                </div>
              )}
            </div>
            )}

            {error && <ErrorBanner className="mb-3">{t`Your sessions could not be read. Reload the app, then try again.`}</ErrorBanner>}
            {deleteError && <ErrorBanner className="mb-3">{deleteError}</ErrorBanner>}

            <SessionFilterChips filters={filters} />
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
