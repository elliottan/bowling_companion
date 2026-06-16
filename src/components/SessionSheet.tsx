import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getFrameShotSymbols } from "../lib/scoreDisplay";
import { laneForFrame } from "../lib/lanes";
import { calculateGameScore } from "../lib/scoring";
import { getBalls } from "../services/ballRepository";
import type { Ball, Frame, LineSpec, SessionSummary } from "../types/bowling";
import { MiniPins } from "./MiniPins";

interface SessionSheetProps {
  summary: SessionSummary;
  currentGameId?: number;
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

/** Read-only "cheat sheet" of every shot in the session, current game first. */
export function SessionSheet({ summary, currentGameId, onClose }: SessionSheetProps) {
  const [balls, setBalls] = useState<Ball[]>([]);

  useEffect(() => {
    getBalls().then(setBalls).catch(() => {});
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const ballName = (id?: number) => balls.find((b) => b.id === id)?.name;

  // Chronological order — latest game at the bottom.
  const games = [...summary.games].sort((a, b) => a.game_number - b.game_number);

  // Auto-scroll to the game the sheet was opened from.
  const currentRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: "start" });
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
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
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
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
                  <span className="text-sm font-semibold text-felt-700">{total}</span>
                  {game.id === currentGameId && (
                    <span className="rounded-full bg-felt-700 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                      Current
                    </span>
                  )}
                </div>
                {game.frames.length === 0 ? (
                  <p className="text-xs text-slate-400">No shots yet.</p>
                ) : (
                  <GameGrid game={game} ballName={ballName} />
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
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

function FrameCell({ frame, ballName }: { frame: Frame; ballName: (id?: number) => string | undefined }) {
  const symbols = getFrameShotSymbols(frame).filter(Boolean).join(" ");
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-bold uppercase text-slate-400">F{frame.frame_number}</span>
        <span className="text-sm font-bold text-slate-900">{symbols}</span>
      </div>
      <div className="mt-1 space-y-1">
        {frame.shots.map((shot, i) => {
          const intended = formatLine(shot.intended);
          const actual = formatLine(shot.actual);
          const name = ballName(shot.ball_id);
          return (
            <div key={i} className="flex items-start gap-1.5">
              <MiniPins standing={shot.pins_standing} />
              <div className="min-w-0 flex-1 text-[11px] leading-tight text-slate-600">
                {name && <span className="font-medium text-slate-800">{name} </span>}
                {intended && <span>{intended}</span>}
                {actual && <span className="text-slate-400"> → {actual}</span>}
                {shot.notes && <p className="break-words text-slate-500">{shot.notes}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
