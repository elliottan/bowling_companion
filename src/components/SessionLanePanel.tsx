import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { freshRackShotIndices, laneForFrame } from "../lib/lanes";
import { knockedDownCount } from "../lib/pins";
import { calculateGameScore } from "../lib/scoring";
import { calculateBallPerformance, calculateCommonLeaves, calculateStats } from "../lib/stats";
import { useHandedness } from "../lib/handednessContext";
import { useOverlay } from "../lib/useOverlay";
import { useSheetDismiss } from "../lib/useSheetDismiss";
import { getBalls } from "../services/ballRepository";
import type { Ball, Frame, LineSpec, SessionSummary, Shot } from "../types/bowling";
import type { Manufacturer } from "../types/catalog";
import { CatalogBallImage } from "./CatalogBallImage";
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
  /** Land on the sheet with the shots thrown with this ball lit up, the way a
   *  ball-performance drill-down arrives. */
  highlightBallId?: number;
  /** When set, a pencil button in the header opens the session edit flow. */
  onEdit?: () => void;
  /** Tap a frame in the sheet to jump to it in score entry. */
  onSelectFrame?: (gameId: number, frameNumber: number, shotIndex: number) => void;
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
  highlightBallId,
  onEdit,
  onSelectFrame,
  onClose
}: SessionLanePanelProps) {
  const [tab, setTab] = useState<SessionPanelTab>(defaultTab);
  // One game, chosen once, read by both tabs: the stats scope to it and the
  // sheet scrolls to it, so a game picked on either tab is still the game when
  // the other one is reached. The token re-fires the scroll on a re-tap.
  //
  // Nothing chosen is the whole series, which is what the stats show and what
  // the chips look like on the sheet: only the stats mark a selection, because
  // only there does it change what is on screen. Scrolling is a place, not a
  // state, so the sheet leaves its chips plain.
  const [selection, setSelection] = useState<{ gameId?: number; token: number }>({
    gameId: undefined,
    token: 0
  });
  // With nothing chosen the sheet still opens on the game being scored.
  const focusGameId = selection.gameId ?? currentGameId;
  // Which shots are lit on the sheet: a History drill-down names a game and a
  // ball on the way in, and a ball's column here names one later. The token
  // restarts the flash when the same ball is asked for twice.
  const [highlight, setHighlight] = useState<{
    gameId?: number;
    ballId?: number;
    token: number;
  }>({ gameId: currentGameId, ballId: highlightBallId, token: 0 });

  const chooseGame = (gameId: number | undefined) =>
    setSelection((prev) => ({ gameId, token: prev.token + 1 }));

  /** Show a game on the sheet: switch tab, scroll to it, light the ball's shots. */
  const goToGame = (gameId: number, ballId?: number) => {
    setTab("sheet");
    chooseGame(gameId);
    setHighlight((prev) => ({ gameId, ballId, token: prev.token + 1 }));
  };

  // The app's one sheet motion: slide up on mount, drag down to dismiss, slide
  // back down on close. `dragHandlers` go on the drag pill AND the header row,
  // and the hook skips a press that landed on a button so the header's own
  // controls still work.
  const { dismiss, backdropStyle, panelStyle, exiting, dragHandlers } = useSheetDismiss(onClose);
  const requestClose = useCallback(() => dismiss(), [dismiss]);

  // Escape + focus trap + focus restore, tied to the animated dismissal rather
  // than `onClose`, so Escape plays the same exit as the drag and backdrop.
  const overlayRef = useOverlay<HTMLDivElement>(requestClose);

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
      style={backdropStyle}
      onClick={requestClose}
    >
      <div
        ref={overlayRef}
        className={`flex h-[100dvh] w-full max-w-lg flex-col bg-surface shadow-xl sm:h-[95vh] sm:rounded-2xl ${
          exiting ? "" : "animate-slide-up"
        }`}
        onClick={(e) => e.stopPropagation()}
        style={panelStyle}
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
          {gameChips.map((g) => {
            // On the stats tab a chip is a filter that shows as one, and
            // tapping the one already on clears it. Elsewhere it is a way to a
            // place: it scrolls the sheet there and stays unmarked.
            const onStats = tab === "stats";
            const active = onStats && g.id === selection.gameId;
            return (
              <Chip
                key={g.id}
                selected={active}
                onClick={() => {
                  if (onStats) {
                    chooseGame(g.id === selection.gameId ? undefined : g.id);
                    return;
                  }
                  setTab("sheet");
                  // The token is bumped either way, so the sheet re-scrolls
                  // even when the same game chip is tapped twice.
                  chooseGame(g.id);
                }}
                className="shrink-0 gap-1.5"
              >
                {/* The score is the point of the chip, so it carries the weight
                    and the accent colour; the G-label recedes. */}
                <span className={active ? "font-medium opacity-80" : "font-medium text-ink-secondary"}>
                  G{g.number} ·
                </span>
                <span className={active ? "font-bold" : "font-bold text-accent"}>{g.label}</span>
              </Chip>
            );
          })}
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
                  focusToken={selection.token}
                  highlight={highlight}
                  onSelectFrame={onSelectFrame}
                />
              </div>,
              <div key="stats" className="px-4 py-3">
                {/* Two different questions, two answers. A game chip above
                    scopes these numbers to that game and stays put. A game
                    picked out of a chart or a ball's column is a request to
                    see it, so that one goes to the sheet. */}
                <StatsTab
                  summary={summary}
                  gameId={selection.gameId}
                  onGoToGame={goToGame}
                  onClearGame={() => chooseGame(undefined)}
                />
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
  gameId,
  onGoToGame,
  onClearGame
}: {
  summary: SessionSummary;
  /** Scope every number below to this game. Undefined is the whole series. */
  gameId?: number;
  /** Show a game on the sheet, with the shots of `ballId` lit if one is named. */
  onGoToGame?: (gameId: number, ballId?: number) => void;
  onClearGame?: () => void;
}) {
  const [balls, setBalls] = useState<Ball[]>([]);

  useEffect(() => {
    getBalls().then(setBalls).catch(() => {});
  }, []);

  const handedness = useHandedness();
  // The scoped session the numbers are read from. The chart below keeps the
  // whole series: it is how another game is picked, so narrowing it to the one
  // already chosen would take the picker away.
  const scoped = useMemo(
    () =>
      gameId == null ? summary : { ...summary, games: summary.games.filter((g) => g.id === gameId) },
    [summary, gameId]
  );
  const scopedNumber = summary.games.find((g) => g.id === gameId)?.game_number;
  const stats = useMemo(
    () => calculateStats([scoped], undefined, handedness),
    [scoped, handedness]
  );
  const leaves = useMemo(() => calculateCommonLeaves([scoped]), [scoped]);
  const ballPerformance = useMemo(
    () => calculateBallPerformance([scoped], balls, undefined, handedness),
    [scoped, balls, handedness]
  );

  return (
    <>
    {scopedNumber !== undefined && (
      <button
        type="button"
        onClick={onClearGame}
        className="mb-2 flex w-full items-center justify-between gap-2 rounded-lg border border-accent-fill bg-accent-soft px-3 py-2 text-left text-xs font-semibold text-accent"
      >
        <span>Game {scopedNumber} only</span>
        <span className="text-ink-secondary">Tap to clear</span>
      </button>
    )}
    <Stats
      stats={stats}
      leaves={leaves}
      ballPerformance={ballPerformance}
      memoryKey="session"
      onOpenGame={onGoToGame && ((_sessionId, id, ballId) => onGoToGame(id, ballId))}
      // A game picked off the score line: show me that game.
      onOpenGameId={onGoToGame && ((id) => onGoToGame(id))}
      games={summary.games}
    />
    </>
  );
}

function SessionSheetTab({
  summary,
  currentGameId,
  focusGameId,
  focusToken,
  highlight,
  onSelectFrame
}: {
  summary: SessionSummary;
  currentGameId?: number;
  focusGameId?: number;
  focusToken: number;
  highlight?: { gameId?: number; ballId?: number; token: number };
  onSelectFrame?: (gameId: number, frameNumber: number, shotIndex: number) => void;
}) {
  const [balls, setBalls] = useState<Ball[]>([]);

  useEffect(() => {
    getBalls().then(setBalls).catch(() => {});
  }, []);

  const ballOf = (id?: number) => balls.find((b) => b.id === id);

  // Chronological order — latest game at the bottom.
  const games = [...summary.games].sort((a, b) => a.game_number - b.game_number);

  // Auto-scroll to the game the sheet was opened from, and to whichever game
  // is asked for afterwards.
  //
  // Not `scrollIntoView`: it aligns to the viewport and scrolls every ancestor
  // on the way, which inside this sheet lands the heading a panel's height too
  // far up. Scrolling the pane itself puts the game where "start" was meant to
  // put it.
  const focusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = focusRef.current;
    if (!el) return;
    const scroller = scrollParent(el);
    if (!scroller) return;
    const top =
      el.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top +
      scroller.scrollTop -
      FOCUS_MARGIN;
    if (typeof scroller.scrollTo === "function") {
      scroller.scrollTo({ top, behavior: focusToken ? "smooth" : "auto" });
    } else {
      scroller.scrollTop = top;
    }
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
                ballOf={ballOf}
                highlightBallId={
                  highlight && game.id === highlight.gameId ? highlight.ballId : undefined
                }
                highlightToken={highlight?.token ?? 0}
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

/** A few pixels above the game heading, so it does not sit on the pane's edge. */
const FOCUS_MARGIN = 8;

/** The nearest ancestor that scrolls vertically: the sheet's own tab pane. */
function scrollParent(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement;
  while (node) {
    const overflowY = getComputedStyle(node).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") return node;
    node = node.parentElement;
  }
  return null;
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
  ballOf,
  highlightBallId,
  highlightToken,
  onSelectFrame
}: {
  game: SessionSummary["games"][number];
  ballOf: (id?: number) => Ball | undefined;
  /** Shots thrown with this ball flash when the grid appears. */
  highlightBallId?: number;
  highlightToken: number;
  /** Tap a shot to jump to it in score entry. */
  onSelectFrame?: (frameNumber: number, shotIndex: number) => void;
}) {
  const lanes = game.lanes ?? (game.lane_number ? [game.lane_number] : []);
  const byNumber = new Map(game.frames.map((f) => [f.frame_number, f]));

  const cell = (n: number, frame?: Frame) =>
    frame ? (
      <FrameCell
        frame={frame}
        ballOf={ballOf}
        highlightBallId={highlightBallId}
        highlightToken={highlightToken}
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
 * The ball a frame opened with, in the corner of its box. The catalog picture
 * when there is one, and the ball's initial when there is not: an uncatalogued
 * ball still needs to be told apart from the one beside it.
 */
function BallCorner({ ball }: { ball: Ball }) {
  const snapshot = ball.catalog_snapshot;
  return (
    <span
      className="pointer-events-none absolute right-0 top-0 h-4 w-4 shrink-0 overflow-hidden rounded-full"
      title={ball.name}
    >
      {snapshot ? (
        <CatalogBallImage
          src={snapshot.imageThumb}
          alt=""
          brand={snapshot.brand as Manufacturer}
          size="thumb"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center rounded-full bg-surface-muted text-[8px] font-bold uppercase text-ink-secondary">
          {ball.name.trim().charAt(0)}
        </span>
      )}
    </span>
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
  flash = false,
  children
}: {
  onSelect?: () => void;
  frameNumber: number;
  /** Briefly tint this shot: it is one the drill-down was about. */
  flash?: boolean;
  children: ReactNode;
}) {
  const className = `flex w-full items-start gap-1.5 rounded text-left ${
    flash ? "animate-ball-flash" : ""
  }`;
  if (!onSelect) return <div className={className}>{children}</div>;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`Go to frame ${frameNumber}`}
      className={`${className} active:bg-surface-muted`}
    >
      {children}
    </button>
  );
}

function FrameCell({
  frame,
  ballOf,
  highlightBallId,
  highlightToken,
  onSelect
}: {
  frame: Frame;
  ballOf: (id?: number) => Ball | undefined;
  highlightBallId?: number;
  highlightToken: number;
  /** Tap this shot to review it in score entry. Index is into `frame.shots`. */
  onSelect?: (shotIndex: number) => void;
}) {
  const shots = freshRackShots(frame);
  // The ball that started the frame, shown in the corner: reading down a game
  // then says which ball was up without reading a word of it.
  const opener = ballOf(shots[0]?.shot.ball_id);
  return (
    <div className="relative flex flex-col gap-1.5">
      {opener && <BallCorner ball={opener} />}
      {shots.map(({ shot, index }, i) => {
        const intended = formatLine(shot.intended);
        const actual = formatLine(shot.actual);
        const name = ballOf(shot.ball_id)?.name;
        const symbol = shotSymbol(shot);
        return (
          // Pin deck left, ball + lines + notes right — reads across in one
          // line per shot instead of a tall stacked column. The deck's bottom
          // rows narrow to one pin, so the frame number and the count tuck into
          // the empty corners beside it.
          // Each fresh-rack shot is its own tap target, so a 10th frame lands
          // on the shot that was actually tapped.
          // The token is in the key so a second drill-down into the same ball
          // replays the flash: a CSS animation only runs on mount.
          <Row
            key={`${i}-${highlightToken}`}
            onSelect={onSelect && (() => onSelect(index))}
            frameNumber={frame.frame_number}
            flash={highlightBallId != null && shot.ball_id === highlightBallId}
          >
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
              {/* Room for the corner icon on the first line only, which is the
                  line it sits beside. */}
              {name && <p className={`truncate font-medium text-ink ${i === 0 ? "pr-5" : ""}`}>{name}</p>}
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
