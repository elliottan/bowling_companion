import { calculateGameScore, isStrike } from "../lib/scoring";
import { getFrameShotCells, type FrameShotCell } from "../lib/scoreDisplay";
import { isSplit } from "../lib/pins";
import type { Frame } from "../types/bowling";

interface ScorecardProps {
  frames: Frame[];
  activeFrameNumber: number;
  editingFrameNumber?: number | null;
  gameComplete?: boolean;
  highlightCell?: { frameNumber: number; shotIndex: number };
  /** Live pin count for the in-progress shot, shown in the highlighted cell
   *  before the shot is recorded (updates as the user taps the pin deck). */
  liveSymbol?: string;
  /** Frames to score with — defaults to `frames`. May include the live shot so a
   *  prior pending strike/spare resolves before the current shot is recorded.
   *  Symbols and frame-settled checks still use the recorded `frames`. */
  scoreFrames?: Frame[];
  onShotTap?: (frameNumber: number, shotIndex: number) => void;
  onLiveTap?: () => void;
}

export function Scorecard({
  frames,
  activeFrameNumber,
  editingFrameNumber = null,
  gameComplete = false,
  highlightCell,
  liveSymbol,
  scoreFrames,
  onShotTap,
  onLiveTap
}: ScorecardProps) {
  const gameScore = calculateGameScore(scoreFrames ?? frames);

  const cells = Array.from({ length: 10 }, (_, index) => {
    const frameNumber = index + 1;
    const frame = frames.find((f) => f.frame_number === frameNumber);
    const emptyCells: FrameShotCell[] =
      frameNumber === 10
        ? [{ symbol: "", shotIndex: null }, { symbol: "", shotIndex: null }, { symbol: "", shotIndex: null }]
        : [{ symbol: "", shotIndex: null }, { symbol: "", shotIndex: null }];
    const shotCells = frame ? getFrameShotCells(frame) : emptyCells;

    // Determine which shot indices had a split (fresh-rack ball leaving disconnected
    // pins with headpin down). For frame 10, shots are only fresh-rack if the
    // previous shot in the frame cleared all pins.
    const splitShotIndices = new Set<number>();
    if (frame) {
      const shots = frame.shots;
      const freshRack = (shotIdx: number) => {
        if (frame.frame_number !== 10) return shotIdx === 0;
        if (shotIdx === 0) return true;
        return shots[shotIdx - 1]?.pins_standing.length === 0;
      };
      for (let i = 0; i < shots.length; i++) {
        if (freshRack(i) && isSplit(shots[i].pins_standing)) splitShotIndices.add(i);
      }
    }

    const score = gameScore.frames.find((f) => f.frame_number === frameNumber);
    // The 10th frame shows the game's running cumulative total even before it is
    // mathematically resolvable, so an in-progress game always has a score in the
    // last cell (no provisional "+"). Frames 1–9 only show a total once the frame
    // is settled (both balls thrown, or a strike) and its rolling total resolves —
    // no provisional partial-frame score mid-frame.
    const frameSettled =
      !!frame && (frame.shots.length >= 2 || (frame.shots.length === 1 && isStrike(frame)));
    const rollingTotal =
      frameNumber === 10 && !gameComplete
        ? gameScore.total
        : frameSettled
        ? score?.rollingTotal ?? null
        : null;
    // Recorded shots are editable in the active frame too (tap back to a recorded
    // first shot while the live cursor is on the second).
    const isEditable = !!frame && (frameNumber <= activeFrameNumber || gameComplete);
    const highlightShotIndex =
      highlightCell?.frameNumber === frameNumber ? highlightCell.shotIndex : undefined;
    // Active and future frames are tappable to snap back to live entry.
    const showLiveTap = !!onLiveTap && !gameComplete && frameNumber >= activeFrameNumber;
    return {
      frameNumber,
      shotCells,
      rollingTotal,
      isEditing: editingFrameNumber === frameNumber,
      highlightShotIndex,
      onShotTap: isEditable ? onShotTap : undefined,
      onLiveTap: showLiveTap ? onLiveTap : undefined,
      splitShotIndices,
      liveSymbol: highlightCell?.frameNumber === frameNumber ? liveSymbol : undefined,
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
  splitShotIndices?: Set<number>;
  liveSymbol?: string;
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
  splitShotIndices,
  liveSymbol,
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

          // The live (in-progress) shot: an empty cell at the highlighted index
          // shows the running pin count as the user taps the deck.
          const isLiveCell =
            liveSymbol !== undefined && cell.shotIndex === null && idx === highlightShotIndex;
          const isSplitCell = cell.shotIndex !== null && splitShotIndices?.has(cell.shotIndex);
          const content = isLiveCell ? (
            liveSymbol
          ) : isSplitCell ? (
            <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-red-500 leading-none sm:h-6 sm:w-6">
              {cell.symbol}
            </span>
          ) : (
            cell.symbol
          );

          if (tappable) {
            return (
              <button
                key={idx}
                type="button"
                onClick={() => onShotTap!(frameNumber, cell.shotIndex!)}
                aria-label={`View frame ${frameNumber} shot ${cell.shotIndex! + 1}`}
                className={`${baseClass} ${highlightClass}`}
              >
                {content}
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
                {content}
              </button>
            );
          }
          return (
            <div key={idx} className={`${baseClass} ${highlightClass}`}>
              {content}
            </div>
          );
        })}
      </div>
      <div
        className={`flex h-9 items-center justify-center text-base font-bold text-felt-700 sm:h-12 sm:text-lg ${
          frameNumber === 10 ? "font-extrabold" : ""
        }`}
      >
        {rollingTotal ?? ""}
      </div>
    </div>
  );
}
