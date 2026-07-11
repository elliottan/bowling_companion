import { Pencil, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { laneForFrame } from "../lib/lanes";
import { knockedDownCount } from "../lib/pins";
import { calculateGameScore } from "../lib/scoring";
import { calculateBallUsage, calculateCommonLeaves, calculateStats } from "../lib/stats";
import { getBalls } from "../services/ballRepository";
import type { Ball, Frame, LineSpec, SessionSummary, Shot } from "../types/bowling";
import { LaneNotesTab } from "./LaneNotesTab";
import { MiniPins } from "./MiniPins";
import { Stats } from "./Stats";
import { SwipePanes } from "./SwipePanes";

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const currentGame = summary.games.find((g) => g.id === currentGameId);
  const currentLanes = currentGame?.lanes ?? (currentGame?.lane_number ? [currentGame.lane_number] : []);
  const sortedLanes = [...currentLanes]
    .filter(Boolean)
    .sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));

  const tabs: SessionPanelTab[] = ["sheet", "stats", "lanes"];

  // Portal to body: callers can live inside SwipePanes, whose translateX
  // transform would otherwise become the containing block for this fixed
  // overlay and shove it off-screen.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="flex h-[85vh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-slate-950">{summary.session.alley_name}</h2>
            {summary.session.description && (
              <p className="truncate text-xs font-medium text-slate-600">{summary.session.description}</p>
            )}
            <p className="truncate text-xs text-slate-500">
              {[
                summary.session.date,
                `${summary.games.length} ${summary.games.length === 1 ? "game" : "games"}`,
                laneSummary(summary.games),
                summary.session.oil_pattern
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                aria-label="Edit session"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
              >
                <Pencil size={18} aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Session sheet / Stats / Lane notes toggle */}
        <div className="grid grid-cols-3 gap-1 border-b border-slate-200 px-4 py-2">
          {([
            ["sheet", "Session sheet"],
            ["stats", "Stats"],
            ["lanes", "Lane notes"]
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`h-9 rounded-md text-sm font-semibold ${
                tab === key ? "bg-felt-700 text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              {label}
            </button>
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
              <h3 className="text-sm font-bold text-slate-900">Game {game.game_number}</h3>
              {game.id === currentGameId && (
                <span className="rounded-full bg-felt-700 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                  Current
                </span>
              )}
              <span className="ml-auto text-base font-extrabold text-felt-700">{total}</span>
            </div>
            {game.frames.length === 0 ? (
              <p className="text-xs text-slate-400">No shots yet.</p>
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
  <span className="text-[10px] font-bold uppercase text-slate-300">F{n}</span>
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
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <div className="border-b border-slate-200 bg-slate-50 py-1 text-center text-[10px] font-bold uppercase tracking-wide text-slate-500">
          {laneLabel ? `Lane ${laneLabel}` : "Lane"}
        </div>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
          const frame = byNumber.get(n);
          return (
            <div key={n} className="border-b border-slate-100 p-2 last:border-b-0">
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
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <div className="grid grid-cols-2 bg-slate-50 text-center text-[10px] font-bold uppercase tracking-wide text-slate-500">
        <div className="border-b border-r border-slate-200 py-1">Lane {leftLane}</div>
        <div className="border-b border-slate-200 py-1">Lane {rightLane}</div>
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
              <div className={`border-r border-slate-100 p-2 ${last ? "" : "border-b"}`}>
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
  if (frame.frame_number !== 10) {
    return frame.shots[0] ? [frame.shots[0]] : [];
  }
  return frame.shots.filter((_, i) => i === 0 || frame.shots[i - 1].pins_standing.length === 0);
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
      <span className="text-[10px] font-bold uppercase text-slate-400">F{frame.frame_number}</span>
      <div className="mt-1 flex flex-col items-center gap-2">
        {shots.map((shot, i) => {
          const intended = formatLine(shot.intended);
          const actual = formatLine(shot.actual);
          const name = ballName(shot.ball_id);
          const symbol = shotSymbol(shot);
          return (
            <div key={i} className="flex flex-col items-center gap-0.5">
              <span
                className={`text-sm font-bold ${symbol === "X" ? "text-felt-700" : "text-slate-900"}`}
              >
                {symbol}
              </span>
              <MiniPins standing={shot.pins_standing} />
              <div className="text-[11px] leading-tight">
                {name && <p className="font-medium text-slate-800">{name}</p>}
                {intended && <p className="text-slate-600">{intended}</p>}
                {actual && <p className="text-slate-400">{actual}</p>}
                {shot.notes && <p className="break-words text-slate-500">{shot.notes}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
