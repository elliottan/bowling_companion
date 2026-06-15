import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { getFrameShotSymbols } from "../lib/scoreDisplay";
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
                  <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {[...game.frames]
                      .sort((a, b) => a.frame_number - b.frame_number)
                      .map((frame) => (
                        <FrameRow key={frame.frame_number} frame={frame} ballName={ballName} />
                      ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function FrameRow({ frame, ballName }: { frame: Frame; ballName: (id?: number) => string | undefined }) {
  const symbols = getFrameShotSymbols(frame).filter(Boolean).join(" ");
  return (
    <li className="flex gap-3 px-3 py-2">
      <div className="flex w-8 shrink-0 flex-col items-center">
        <span className="text-[10px] font-bold uppercase text-slate-400">F{frame.frame_number}</span>
        <span className="text-sm font-bold text-slate-900">{symbols}</span>
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        {frame.shots.map((shot, i) => {
          const intended = formatLine(shot.intended);
          const actual = formatLine(shot.actual);
          const name = ballName(shot.ball_id);
          return (
            <div key={i} className="flex items-start gap-2">
              <MiniPins standing={shot.pins_standing} />
              <div className="min-w-0 flex-1 text-xs">
                <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-slate-600">
                  {name && <span className="font-medium text-slate-800">{name}</span>}
                  {intended && <span>line {intended}</span>}
                  {actual && <span className="text-slate-400">→ {actual}</span>}
                </div>
                {shot.notes && <p className="mt-0.5 break-words text-slate-500">{shot.notes}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </li>
  );
}
