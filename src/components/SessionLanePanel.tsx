import { Pencil } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { freshRackShotIndices, laneForFrame } from "../lib/lanes";
import { knockedDownCount } from "../lib/pins";
import { calculateGameScore } from "../lib/scoring";
import { calculateBallUsage, calculateCommonLeaves, calculateStats } from "../lib/stats";
import { useOverlay } from "../lib/useOverlay";
import { getBalls } from "../services/ballRepository";
import type { Ball, Frame, LineSpec, SessionSummary, Shot } from "../types/bowling";
import { LaneNotesTab } from "./LaneNotesTab";
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
  onClose: () => void;
}

function formatLine(line?: LineSpec): string | null {
  if (!line) return null;
  const parts = [line.stance, line.target, line.breakpoint].map((n) => (n != null ? String(n) : "·"));
  return parts.join("/");
}

// Lanes are per-game, so show each distinct lane PAIR bowled this session,
// e.g. "Lanes 9/10, 11/12" (or "Lane 5" for a single-lane game).
function laneSummary(games: SessionSummary["games"]): string {
  const pairs: string[] = [];
  for (const g of games) {
    const lanes = (g.lanes ?? (g.lane_number ? [g.lane_number] : [])).filter(Boolean);
    if (!lanes.length) continue;
    const label = lanes.join("/");
    if (!pairs.includes(label)) pairs.push(label);
  }
  if (!pairs.length) return "";
  const noun = pairs.length === 1 && pairs[0].includes("/") ? "Lanes" : pairs.length > 1 ? "Lanes" : "Lane";
  return `${noun} ${pairs.join(", ")}`;
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
  onClose
}: SessionLanePanelProps) {
  const [tab, setTab] = useState<SessionPanelTab>(defaultTab);

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
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1">
              <h2 className="truncate text-base font-bold text-ink">{summary.session.alley_name}</h2>
              {onEdit && (
                <button
                  type="button"
                  onClick={onEdit}
                  aria-label="Edit session"
                  className="shrink-0 rounded p-1 text-ink-tertiary hover:bg-surface-muted hover:text-ink-secondary"
                >
                  <Pencil size={14} aria-hidden="true" />
                </button>
              )}
            </div>
            {summary.session.description && (
              <p className="truncate text-xs font-medium text-ink-secondary">{summary.session.description}</p>
            )}
            <p className="truncate text-xs text-ink-secondary">
              {[
                summary.session.date,
                `${summary.games.length} ${summary.games.length === 1 ? "game" : "games"}`,
                laneSummary(summary.games)
              ]
                .filter(Boolean)
                .join(" · ")}
              {summary.session.oil_pattern && (
                <>
                  {" · "}
                  {/* The pattern sheet is worth a tap mid-session, so link it here. */}
                  {summary.session.oil_pattern_url ? (
                    <a
                      href={summary.session.oil_pattern_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-accent underline underline-offset-2"
                    >
                      {summary.session.oil_pattern}
                    </a>
                  ) : (
                    summary.session.oil_pattern
                  )}
                </>
              )}
            </p>
          </div>
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
            <Chip key={g.id} selected={false} disabled className="shrink-0 gap-1.5 opacity-100">
              G{g.number}
              <span className="opacity-80">· {g.label}</span>
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
                <SessionSheetTab summary={summary} currentGameId={currentGameId} />
              </div>,
              <div key="stats" className="px-4 py-3">
                <StatsTab summary={summary} />
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
function StatsTab({ summary }: { summary: SessionSummary }) {
  const [balls, setBalls] = useState<Ball[]>([]);

  useEffect(() => {
    getBalls().then(setBalls).catch(() => {});
  }, []);

  const stats = useMemo(() => calculateStats([summary]), [summary]);
  const leaves = useMemo(() => calculateCommonLeaves([summary]), [summary]);
  const ballUsage = useMemo(() => calculateBallUsage([summary], balls), [summary, balls]);

  return <Stats stats={stats} leaves={leaves} ballUsage={ballUsage} />;
}

function SessionSheetTab({
  summary,
  currentGameId
}: {
  summary: SessionSummary;
  currentGameId?: number;
}) {
  const [balls, setBalls] = useState<Ball[]>([]);

  useEffect(() => {
    getBalls().then(setBalls).catch(() => {});
  }, []);

  const ballName = (id?: number) => balls.find((b) => b.id === id)?.name;

  // Chronological order — latest game at the bottom.
  const games = [...summary.games].sort((a, b) => a.game_number - b.game_number);

  // Auto-scroll to the game the sheet was opened from.
  const currentRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: "start" });
  }, []);

  return (
    <>
      {games.map((game) => {
        const score = calculateGameScore(game.frames);
        const total = game.final_score ?? (score.isComplete ? score.total : `${score.total}+`);
        return (
          <section
            key={game.id}
            ref={game.id === currentGameId ? currentRef : undefined}
            className="mb-4 scroll-mt-2 last:mb-0"
          >
            <div className="mb-1.5 flex items-center gap-2">
              <h3 className="text-sm font-bold text-ink">Game {game.game_number}</h3>
              {game.id === currentGameId && (
                <span className="rounded-full bg-accent-fill px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-accent-on-fill">
                  Current
                </span>
              )}
              <span className="ml-auto text-base font-extrabold text-accent">{total}</span>
            </div>
            {game.frames.length === 0 ? (
              <p className="text-xs text-ink-secondary">No shots yet.</p>
            ) : (
              <GameGrid game={game} ballName={ballName} />
            )}
          </section>
        );
      })}
    </>
  );
}

const emptyCell = (n: number) => (
  <span className="text-[11px] font-bold uppercase text-ink-tertiary">F{n}</span>
);

// Cross-lane: columns are FIXED by lane number (lower = left, higher = right),
// so the physical left lane always sits on the left. Each frame lands in the
// column matching its actual lane, so the frame cells alternate columns.
// Single-lane: a single full-width column in frame order.
function GameGrid({
  game,
  ballName
}: {
  game: SessionSummary["games"][number];
  ballName: (id?: number) => string | undefined;
}) {
  const lanes = game.lanes ?? (game.lane_number ? [game.lane_number] : []);
  const byNumber = new Map(game.frames.map((f) => [f.frame_number, f]));

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
            <div key={n} className="border-b border-edge p-2 last:border-b-0">
              {frame ? <FrameCell frame={frame} ballName={ballName} /> : emptyCell(n)}
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
              <div className={`border-r border-edge p-2 ${last ? "" : "border-b"}`}>
                {lf ? <FrameCell frame={lf} ballName={ballName} /> : emptyCell(leftN)}
              </div>
              <div className={`p-2 ${last ? "" : "border-b"}`}>
                {rf ? <FrameCell frame={rf} ballName={ballName} /> : emptyCell(rightN)}
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
function freshRackShots(frame: Frame): Shot[] {
  return freshRackShotIndices(frame.shots).map((i) => frame.shots[i]);
}

function shotSymbol(shot: Shot): string {
  const down = knockedDownCount(shot.pins_standing);
  if (down === 10) return "X";
  return down === 0 ? "-" : String(down);
}

function FrameCell({ frame, ballName }: { frame: Frame; ballName: (id?: number) => string | undefined }) {
  const shots = freshRackShots(frame);
  return (
    <div className="flex flex-col items-center text-center">
      <span className="text-[11px] font-bold uppercase text-ink-secondary">F{frame.frame_number}</span>
      <div className="mt-1 flex flex-col items-center gap-2">
        {shots.map((shot, i) => {
          const intended = formatLine(shot.intended);
          const actual = formatLine(shot.actual);
          const name = ballName(shot.ball_id);
          const symbol = shotSymbol(shot);
          return (
            <div key={i} className="flex flex-col items-center gap-0.5">
              <span
                className={`text-sm font-bold ${symbol === "X" ? "text-accent" : "text-ink"}`}
              >
                {symbol}
              </span>
              <MiniPins standing={shot.pins_standing} />
              <div className="text-[11px] leading-tight">
                {name && <p className="font-medium text-ink">{name}</p>}
                {intended && <p className="text-ink-secondary">{intended}</p>}
                {actual && <p className="text-ink-secondary">{actual}</p>}
                {shot.notes && <p className="break-words text-ink-secondary">{shot.notes}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
