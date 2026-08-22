import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { freshRackShotIndices, laneForFrame } from "../lib/lanes";
import { knockedDownCount } from "../lib/pins";
import { calculateGameScore } from "../lib/scoring";
import { calculateBallPerformance, calculateCommonLeaves, calculateStats } from "../lib/stats";
import { useHandedness } from "../lib/handednessContext";
import { useOverlay } from "../lib/useOverlay";
import { getBalls } from "../services/ballRepository";
import type { Ball, Frame, LineSpec, SessionSummary, Shot } from "../types/bowling";
import { LaneNotesTab } from "./LaneNotesTab";
import { SessionHeaderText } from "./SessionHeaderText";
import { MiniPins } from "./MiniPins";
import { Stats } from "./Stats";
import { SwipePanes } from "./SwipePanes";
import { Chip } from "./ui/Chip";

export type SessionPanelTab = "sheet" | "stats" | "lanes";

interface SessionLanePanelProps {
  summary: SessionSummary;
  currentGameId?: number;
  defaultTab?: SessionPanelTab;
  /** When set, a pencil button in the header opens the session edit flow. */
  onEdit?: () => void;
  /** Tap a frame in the sheet to jump to it in score entry. */
  onSelectFrame?: (gameId: number, frameNumber: number, shotIndex: number) => void;
  /** Tap a game in the stats drill-down to switch the scorer to it. */
  onSelectGame?: (gameId: number) => void;
  onClose: () => void;
}

function formatLine(line?: LineSpec): string | null {
  if (!line) return null;
  const parts = [line.stance, line.target, line.breakpoint].map((n) => (n != null ? String(n) : "·"));
  return parts.join("/");
}

/**
 * Bottom-sheet "cheat sheet" with three swipeable tabs: the session sheet
 * (every first-ball shot, current game first), per-session stats, and lane
 * notes for this alley.
 */
export function SessionLanePanel({
  summary,
  currentGameId,
  defaultTab = "sheet",
  onEdit,
  onSelectFrame,
  onSelectGame,
  onClose
}: SessionLanePanelProps) {
  const [tab, setTab] = useState<SessionPanelTab>(defaultTab);
  // Which game the sheet scrolls to; the token re-fires the scroll on re-tap.
  const [focus, setFocus] = useState({ id: currentGameId, token: 0 });
  const focusGameId = focus.id;

  // Bottom-sheet feel: slide up on mount, drag down to dismiss, slide down on
  // close — same pattern as the arsenal sheet in App.tsx.
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);
  const [dragY, setDragY] = useState(0);
  const dragStartY = useRef<number | null>(null);

  useEffect(() => {
    // Flip a frame after mount so the sheet transitions from translateY(100%).
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const requestClose = useCallback(() => {
    setClosing((was) => {
      if (!was) window.setTimeout(onClose, 250);
      return true;
    });
  }, [onClose]);

  // Escape + focus trap + focus restore. Tied to `requestClose` (the animated
  // dismissal), not `onClose` directly, so Escape plays the same slide-down
  // exit as the drag/backdrop/X paths.
  const overlayRef = useOverlay<HTMLDivElement>(requestClose);

  // Shared by the drag pill and the header row.
  const dragHandlers = {
    onPointerDown(e: React.PointerEvent<HTMLElement>) {
      // Don't hijack presses on the header's buttons (pencil / close).
      if ((e.target as HTMLElement).closest("button")) return;
      dragStartY.current = e.clientY;
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove(e: React.PointerEvent<HTMLElement>) {
      if (dragStartY.current === null) return;
      const delta = e.clientY - dragStartY.current;
      if (delta > 0) setDragY(delta);
    },
    onPointerUp() {
      if (dragStartY.current === null) return;
      if (dragY > 80) requestClose();
      setDragY(0);
      dragStartY.current = null;
    },
    onPointerCancel() {
      setDragY(0);
      dragStartY.current = null;
    }
  };

  const currentGame = summary.games.find((g) => g.id === currentGameId);
  const currentLanes = currentGame?.lanes ?? (currentGame?.lane_number ? [currentGame.lane_number] : []);
  const sortedLanes = [...currentLanes]
    .filter(Boolean)
    .sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));

  const tabs: SessionPanelTab[] = ["sheet", "stats", "lanes"];

  // Series total counts every game (running total for one in progress); the
  // average is over completed games only — same rule as the history rows.
  const seriesTotal = summary.games.reduce(
    (sum, g) => sum + (g.final_score ?? calculateGameScore(g.frames).total),
    0
  );
  const finalScores = summary.games.flatMap((g) => (g.final_score !== undefined ? [g.final_score] : []));
  const seriesAvg = finalScores.length
    ? Math.round(finalScores.reduce((a, b) => a + b, 0) / finalScores.length)
    : null;
  const gameChips = [...summary.games]
    .sort((a, b) => a.game_number - b.game_number)
    .map((g) => {
      const score = calculateGameScore(g.frames);
      return {
        id: g.id,
        number: g.game_number,
        label: g.final_score ?? (score.isComplete ? score.total : `${score.total}+`)
      };
    });

  // Portal to body: callers can live inside SwipePanes, whose translateX
  // transform would otherwise become the containing block for this fixed
  // overlay and shove it off-screen.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      role="dialog"
      aria-modal="true"
      onClick={requestClose}
    >
      <div
        ref={overlayRef}
        className="flex h-[100dvh] w-full max-w-lg flex-col bg-surface shadow-xl sm:h-[95vh] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{
          transform: closing || !mounted ? "translateY(100%)" : `translateY(${dragY}px)`,
          transition: dragY === 0 || closing ? "transform 0.25s ease-out" : "none"
        }}
      >
        {/* Drag pill */}
        <div
          className="flex touch-none cursor-grab justify-center pb-1 pt-[calc(env(safe-area-inset-top)+0.75rem)] active:cursor-grabbing sm:pt-3"
          {...dragHandlers}
        >
          <div className="h-1.5 w-10 rounded-full bg-edge-strong" />
        </div>
        <div
          className="flex touch-none items-start justify-between gap-3 border-b border-edge px-4 py-3"
          {...dragHandlers}
        >
          <SessionHeaderText session={summary.session} games={summary.games} onEdit={onEdit} />
          {/* Series total + average, matching the score-entry header. The sheet
              is dismissed by dragging it down, so there's no close button. */}
          <div className="shrink-0 text-right">
            <p className="text-2xl font-extrabold leading-none text-accent" aria-label="Series total">
              {seriesTotal}
            </p>
            {seriesAvg !== null && (
              <p className="text-xs font-semibold text-ink-secondary">{seriesAvg} avg</p>
            )}
          </div>
        </div>

        {/* Read-only mirror of the score-entry game chips. */}
        <div className="flex items-center gap-2 overflow-x-auto border-b border-edge px-4 py-2">
          {gameChips.map((g) => (
            <Chip
              key={g.id}
              selected={tab === "sheet" && g.id === focusGameId}
              onClick={() => {
                setTab("sheet");
                // Bump the token so the sheet re-scrolls even if the same game
                // chip is tapped twice.
                setFocus({ id: g.id, token: focus.token + 1 });
              }}
              className="shrink-0 gap-1.5"
            >
              {/* The score is the point of the chip, so it carries the weight
                  and the accent colour; the G-label recedes. */}
              <span className={tab === "sheet" && g.id === focusGameId ? "font-medium opacity-80" : "font-medium text-ink-secondary"}>
                G{g.number} ·
              </span>
              <span className={tab === "sheet" && g.id === focusGameId ? "font-bold" : "font-bold text-accent"}>{g.label}</span>
            </Chip>
          ))}
        </div>

        {/* Session sheet / Stats / Lane notes toggle */}
        <div className="grid grid-cols-3 gap-2 border-b border-edge px-4 py-2">
          {([
            ["sheet", "Session sheet"],
            ["stats", "Stats"],
            ["lanes", "Lane notes"]
          ] as const).map(([key, label]) => (
            <Chip key={key} selected={tab === key} onClick={() => setTab(key)} className="w-full">
              {label}
            </Chip>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          <SwipePanes
            className="h-full"
            index={tabs.indexOf(tab)}
            onIndexChange={(i) => setTab(tabs[i])}
            panes={[
              <div key="sheet" className="px-4 py-3">
                <SessionSheetTab
                  summary={summary}
                  currentGameId={currentGameId}
                  focusGameId={focusGameId}
                  focusToken={focus.token}
                  onSelectFrame={onSelectFrame}
                />
              </div>,
              <div key="stats" className="px-4 py-3">
                {/* Closing is the caller's job, same as onSelectFrame: it
                    switches the scorer's game and drops the sheet together. */}
                <StatsTab summary={summary} onSelectGame={onSelectGame} />
              </div>,
              <div key="lanes" className="px-4 py-3">
                <LaneNotesTab alley={summary.session.alley_name} currentLanes={sortedLanes} />
              </div>
            ]}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}

/** Per-session stats: the History Stats pane scoped to a single session. */
function StatsTab({
  summary,
  onSelectGame
}: {
  summary: SessionSummary;
  onSelectGame?: (gameId: number) => void;
}) {
  const [balls, setBalls] = useState<Ball[]>([]);

  useEffect(() => {
    getBalls().then(setBalls).catch(() => {});
  }, []);

  const handedness = useHandedness();
  const stats = useMemo(
    () => calculateStats([summary], undefined, handedness),
    [summary, handedness]
  );
  const leaves = useMemo(() => calculateCommonLeaves([summary]), [summary]);
  const ballPerformance = useMemo(
    () => calculateBallPerformance([summary], balls, undefined, handedness),
    [summary, balls, handedness]
  );

  return (
    <Stats
      stats={stats}
      leaves={leaves}
      ballPerformance={ballPerformance}
      onOpenGame={onSelectGame && ((_sessionId, gameId) => onSelectGame(gameId))}
      games={summary.games}
    />
  );
}

function SessionSheetTab({
  summary,
  currentGameId,
  focusGameId,
  focusToken,
  onSelectFrame
}: {
  summary: SessionSummary;
  currentGameId?: number;
  focusGameId?: number;
  focusToken: number;
  onSelectFrame?: (gameId: number, frameNumber: number, shotIndex: number) => void;
}) {
  const [balls, setBalls] = useState<Ball[]>([]);

  useEffect(() => {
    getBalls().then(setBalls).catch(() => {});
  }, []);

  const ballName = (id?: number) => balls.find((b) => b.id === id)?.name;

  // Chronological order — latest game at the bottom.
  const games = [...summary.games].sort((a, b) => a.game_number - b.game_number);

  // Auto-scroll to the game the sheet was opened from, and to whichever game
  // chip is tapped afterwards.
  const focusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    focusRef.current?.scrollIntoView({ block: "start", behavior: focusToken ? "smooth" : "auto" });
  }, [focusGameId, focusToken]);

  return (
    <>
      {games.map((game) => {
        const score = calculateGameScore(game.frames);
        const total = game.final_score ?? (score.isComplete ? score.total : `${score.total}+`);
        return (
          <section
            key={game.id}
            ref={game.id === focusGameId ? focusRef : undefined}
            className="mb-4 scroll-mt-2 last:mb-0"
          >
            <div className="mb-1.5 flex items-center gap-2">
              <h3 className="text-sm font-bold text-ink">Game {game.game_number}</h3>
              {/* A finished game is never "current", even if score entry is
                  parked on it. */}
              {game.id === currentGameId && game.final_score === undefined && !score.isComplete && (
                <span className="rounded-full bg-accent-fill px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-accent-on-fill">
                  Current
                </span>
              )}
              <span className="ml-auto text-base font-extrabold text-accent">{total}</span>
            </div>
            {game.frames.length === 0 ? (
              <p className="text-xs text-ink-secondary">No shots yet.</p>
            ) : (
              <GameGrid
                game={game}
                ballName={ballName}
                onSelectFrame={
                  onSelectFrame && game.id
                    ? (frameNumber, shotIndex) => onSelectFrame(game.id as number, frameNumber, shotIndex)
                    : undefined
                }
              />
            )}
          </section>
        );
      })}
    </>
  );
}

const emptyCell = (n: number) => (
  <span className="text-[10px] font-bold uppercase leading-none text-ink-tertiary">F{n}</span>
);

// Cross-lane: columns are FIXED by lane number (lower = left, higher = right),
// so the physical left lane always sits on the left. Each frame lands in the
// column matching its actual lane, so the frame cells alternate columns.
// Single-lane: a single full-width column in frame order.
function GameGrid({
  game,
  ballName,
  onSelectFrame
}: {
  game: SessionSummary["games"][number];
  ballName: (id?: number) => string | undefined;
  /** Tap a shot to jump to it in score entry. */
  onSelectFrame?: (frameNumber: number, shotIndex: number) => void;
}) {
  const lanes = game.lanes ?? (game.lane_number ? [game.lane_number] : []);
  const byNumber = new Map(game.frames.map((f) => [f.frame_number, f]));

  const cell = (n: number, frame?: Frame) =>
    frame ? (
      <FrameCell
        frame={frame}
        ballName={ballName}
        onSelect={onSelectFrame && ((shotIndex) => onSelectFrame(n, shotIndex))}
      />
    ) : (
      emptyCell(n)
    );

  if (lanes.length < 2) {
    const laneLabel = lanes[0];
    return (
      <div className="overflow-hidden rounded-lg border border-edge">
        <div className="border-b border-edge bg-surface-muted py-1 text-center text-[11px] font-bold uppercase tracking-wide text-ink-secondary">
          {laneLabel ? `Lane ${laneLabel}` : "Lane"}
        </div>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
          const frame = byNumber.get(n);
          return (
            <div key={n} className="border-b border-edge p-1.5 last:border-b-0">
              {cell(n, frame)}
            </div>
          );
        })}
      </div>
    );
  }

  const [leftLane, rightLane] = [...lanes].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
  const pairs = [
    [1, 2],
    [3, 4],
    [5, 6],
    [7, 8],
    [9, 10]
  ];

  return (
    <div className="overflow-hidden rounded-lg border border-edge">
      <div className="grid grid-cols-2 bg-surface-muted text-center text-[11px] font-bold uppercase tracking-wide text-ink-secondary">
        <div className="border-b border-r border-edge py-1">Lane {leftLane}</div>
        <div className="border-b border-edge py-1">Lane {rightLane}</div>
      </div>
      <div className="grid grid-cols-2">
        {pairs.map((pair, rowIdx) => {
          const leftN = pair.find((n) => laneForFrame(game, n) === leftLane) ?? pair[0];
          const rightN = pair.find((n) => laneForFrame(game, n) === rightLane) ?? pair[1];
          const lf = byNumber.get(leftN);
          const rf = byNumber.get(rightN);
          const last = rowIdx === pairs.length - 1;
          return (
            <div key={rowIdx} className="contents">
              <div className={`border-r border-edge p-1.5 ${last ? "" : "border-b border-edge"}`}>
                {cell(leftN, lf)}
              </div>
              <div className={`p-1.5 ${last ? "" : "border-b border-edge"}`}>
                {cell(rightN, rf)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The shots thrown at a full rack ("first" / strike attempts). Frames 1–9 are
 * just the first ball. The 10th frame can have several: any ball whose previous
 * ball cleared the deck (a strike, or a spare that reset the pins) is fresh.
 */
function freshRackShots(frame: Frame): Array<{ shot: Shot; index: number }> {
  return freshRackShotIndices(frame.shots).map((i) => ({ shot: frame.shots[i], index: i }));
}

function shotSymbol(shot: Shot): string {
  const down = knockedDownCount(shot.pins_standing);
  if (down === 10) return "X";
  return down === 0 ? "-" : String(down);
}

/** One shot line — a button when the sheet can jump to it, a plain row otherwise. */
function Row({
  onSelect,
  frameNumber,
  children
}: {
  onSelect?: () => void;
  frameNumber: number;
  children: ReactNode;
}) {
  const className = "flex w-full items-start gap-1.5 text-left";
  if (!onSelect) return <div className={className}>{children}</div>;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`Go to frame ${frameNumber}`}
      className={`${className} rounded active:bg-surface-muted`}
    >
      {children}
    </button>
  );
}

function FrameCell({
  frame,
  ballName,
  onSelect
}: {
  frame: Frame;
  ballName: (id?: number) => string | undefined;
  /** Tap this shot to review it in score entry. Index is into `frame.shots`. */
  onSelect?: (shotIndex: number) => void;
}) {
  const shots = freshRackShots(frame);
  return (
    <div className="flex flex-col gap-1.5">
      {shots.map(({ shot, index }, i) => {
        const intended = formatLine(shot.intended);
        const actual = formatLine(shot.actual);
        const name = ballName(shot.ball_id);
        const symbol = shotSymbol(shot);
        return (
          // Pin deck left, ball + lines + notes right — reads across in one
          // line per shot instead of a tall stacked column. The deck's bottom
          // rows narrow to one pin, so the frame number and the count tuck into
          // the empty corners beside it.
          // Each fresh-rack shot is its own tap target, so a 10th frame lands
          // on the shot that was actually tapped.
          <Row key={i} onSelect={onSelect && (() => onSelect(index))} frameNumber={frame.frame_number}>
            <div className="relative shrink-0">
              <MiniPins standing={shot.pins_standing} />
              {i === 0 && (
                <span className="absolute bottom-0 left-0 text-[10px] font-bold uppercase leading-none text-ink-tertiary">
                  F{frame.frame_number}
                </span>
              )}
              <span className="absolute bottom-0 right-0 text-xs font-bold leading-none text-accent">
                {symbol}
              </span>
            </div>
            <div className="min-w-0 flex-1 text-[11px] leading-tight">
              {name && <p className="truncate font-medium text-ink">{name}</p>}
              {intended && <p className="text-ink-secondary">{intended}</p>}
              {actual && <p className="text-ink-secondary">{actual}</p>}
              {shot.notes && <p className="break-words text-ink-secondary">{shot.notes}</p>}
            </div>
          </Row>
        );
      })}
    </div>
  );
}
