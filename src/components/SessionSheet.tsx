import { X } from "lucide-react";
import { useEffect, useState } from "react";
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

  // Current game first, then the rest in order.
  const games = [...summary.games].sort((a, b) => {
    if (a.id === currentGameId) return -1;
    if (b.id === currentGameId) return 1;
    return a.game_number - b.game_number;
  });

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
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-base font-bold text-slate-950">{summary.session.alley_name} · sheet</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {games.map((game) => {
            const score = calculateGameScore(game.frames);
            const total = game.final_score ?? (score.isComplete ? score.total : `${score.total}+`);
            return (
              <section key={game.id} className="mb-4 last:mb-0">
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

// Two columns = the two lanes (cross-lane). Odd frames (1,3,5,7,9) sit in the
// start-lane column, even frames in the other; single-lane games head both
// columns with the same lane.
function GameGrid({
  game,
  ballName
}: {
  game: SessionSummary["games"][number];
  ballName: (id?: number) => string | undefined;
}) {
  const col1Lane = laneForFrame(game, 1);
  const col2Lane = laneForFrame(game, 2);
  const byNumber = new Map(game.frames.map((f) => [f.frame_number, f]));
  const cells: number[] = [];
  for (let n = 1; n <= 10; n++) cells.push(n);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <div className="grid grid-cols-2 bg-slate-50 text-center text-[10px] font-bold uppercase tracking-wide text-slate-500">
        <div className="border-b border-r border-slate-200 py-1">{col1Lane ? `Lane ${col1Lane}` : "Lane"}</div>
        <div className="border-b border-slate-200 py-1">{col2Lane ? `Lane ${col2Lane}` : "Lane"}</div>
      </div>
      <div className="grid grid-cols-2">
        {cells.map((n, idx) => {
          const frame = byNumber.get(n);
          const isLeft = idx % 2 === 0;
          return (
            <div
              key={n}
              className={`border-b border-slate-100 p-2 ${isLeft ? "border-r" : ""} ${
                idx >= 8 ? "border-b-0" : ""
              }`}
            >
              {frame ? (
                <FrameCell frame={frame} ballName={ballName} />
              ) : (
                <span className="text-[10px] font-bold uppercase text-slate-300">F{n}</span>
              )}
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
