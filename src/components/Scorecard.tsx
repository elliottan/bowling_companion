import { calculateGameScore } from "../lib/scoring";
import { getFrameShotCells, type FrameShotCell } from "../lib/scoreDisplay";
import type { Frame } from "../types/bowling";

interface ScorecardProps {
  frames: Frame[];
  activeFrameNumber: number;
  editingFrameNumber?: number | null;
  gameComplete?: boolean;
  highlightCell?: { frameNumber: number; shotIndex: number };
  onShotTap?: (frameNumber: number, shotIndex: number) => void;
  onLiveTap?: () => void;
}

export function Scorecard({
  frames,
  activeFrameNumber,
  editingFrameNumber = null,
  gameComplete = false,
  highlightCell,
  onShotTap,
  onLiveTap
}: ScorecardProps) {
  const gameScore = calculateGameScore(frames);

  const cells = Array.from({ length: 10 }, (_, index) => {
    const frameNumber = index + 1;
    const frame = frames.find((f) => f.frame_number === frameNumber);
    const emptyCells: FrameShotCell[] =
      frameNumber === 10
        ? [{ symbol: "", shotIndex: null }, { symbol: "", shotIndex: null }, { symbol: "", shotIndex: null }]
        : [{ symbol: "", shotIndex: null }, { symbol: "", shotIndex: null }];
    const shotCells = frame ? getFrameShotCells(frame) : emptyCells;
    const score = gameScore.frames.find((f) => f.frame_number === frameNumber);
    const isEditable = !!frame && (frameNumber < activeFrameNumber || gameComplete);
    const highlightShotIndex =
      highlightCell?.frameNumber === frameNumber ? highlightCell.shotIndex : undefined;
    // Active and future frames are tappable to snap back to live entry.
    const showLiveTap = !!onLiveTap && !gameComplete && frameNumber >= activeFrameNumber;
    return {
      frameNumber,
      shotCells,
      rollingTotal: score?.rollingTotal ?? null,
      isEditing: editingFrameNumber === frameNumber,
      highlightShotIndex,
      onShotTap: isEditable ? onShotTap : undefined,
      onLiveTap: showLiveTap ? onLiveTap : undefined
    };
  });

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      {/* Mobile: 5×2 grid of compact frame chips. Fits 390px without overflow. */}
      <div className="grid grid-cols-5 gap-px bg-slate-200 sm:hidden">
        {cells.map((cell) => (
          <FrameCell key={cell.frameNumber} {...cell} compact />
        ))}
      </div>

      {/* sm+: traditional 10-cell horizontal row */}
      <div className="hidden sm:grid sm:grid-cols-[repeat(9,minmax(0,1fr))_minmax(0,1.25fr)]">
        {cells.map((cell) => (
          <FrameCell key={cell.frameNumber} {...cell} />
        ))}
      </div>
    </div>
  );
}

interface FrameCellProps {
  frameNumber: number;
  shotCells: FrameShotCell[];
  rollingTotal: number | null;
  isEditing?: boolean;
  compact?: boolean;
  highlightShotIndex?: number;
  onShotTap?: (frameNumber: number, shotIndex: number) => void;
  onLiveTap?: () => void;
}

function FrameCell({
  frameNumber,
  shotCells,
  rollingTotal,
  isEditing = false,
  compact,
  highlightShotIndex,
  onShotTap,
  onLiveTap
}: FrameCellProps) {
  const bg = isEditing ? "bg-lane-100 ring-2 ring-inset ring-felt-700" : "bg-white";
  const border = compact ? "" : "border-r border-slate-200 last:border-r-0";

  return (
    <div className={`${border} ${bg}`}>
      <div className="border-b border-slate-200 px-1 py-1 text-center text-[10px] font-bold uppercase text-slate-500 sm:text-xs">
        {frameNumber}
      </div>
      {/*
       * Highlight by the shot the cell represents when a recorded shot matches
       * (so a strike's X box — shot 0 rendered in the 2nd cell — highlights, not
       * the empty first cell). Fall back to display index for the live/empty cell.
       */}
      <div className={`grid h-9 ${frameNumber === 10 ? "grid-cols-3" : "grid-cols-2"} sm:h-11`}>
        {shotCells.map((cell, idx) => {
          const tappable = onShotTap && cell.shotIndex !== null;
          const liveTappable = !tappable && !!onLiveTap;
          const matchesByShot = shotCells.some((c) => c.shotIndex === highlightShotIndex);
          const isHighlighted =
            highlightShotIndex === undefined
              ? false
              : matchesByShot
              ? cell.shotIndex === highlightShotIndex
              : idx === highlightShotIndex;
          const highlightClass = isHighlighted
            ? "bg-felt-700 text-white"
            : "";
          const baseClass =
            "flex h-full items-center justify-center border-l border-slate-200 text-sm font-bold text-slate-900 first:border-l-0 sm:text-base";

          if (tappable) {
            return (
              <button
                key={idx}
                type="button"
                onClick={() => onShotTap!(frameNumber, cell.shotIndex!)}
                aria-label={`View frame ${frameNumber} shot ${cell.shotIndex! + 1}`}
                className={`${baseClass} ${highlightClass}`}
              >
                {cell.symbol}
              </button>
            );
          }
          if (liveTappable) {
            return (
              <button
                key={idx}
                type="button"
                onClick={onLiveTap}
                aria-label={`Go to live entry frame ${frameNumber}`}
                className={`${baseClass} ${highlightClass}`}
              >
                {cell.symbol}
              </button>
            );
          }
          return (
            <div key={idx} className={`${baseClass} ${highlightClass}`}>
              {cell.symbol}
            </div>
          );
        })}
      </div>
      <div
        className={`flex h-9 items-center justify-center text-base font-bold sm:h-12 sm:text-lg ${
          frameNumber === 10 && rollingTotal != null
            ? "bg-felt-700 font-extrabold text-white"
            : "text-felt-700"
        }`}
      >
        {rollingTotal ?? ""}
      </div>
    </div>
  );
}
