import { calculateGameScore } from "../lib/scoring";
import { getFrameShotSymbols } from "../lib/scoreDisplay";
import type { Frame } from "../types/bowling";

interface ScorecardProps {
  frames: Frame[];
  activeFrameNumber: number;
  editingFrameNumber?: number | null;
  gameComplete?: boolean;
  onEditFrame?: (frameNumber: number) => void;
}

export function Scorecard({
  frames,
  activeFrameNumber,
  editingFrameNumber = null,
  gameComplete = false,
  onEditFrame
}: ScorecardProps) {
  const gameScore = calculateGameScore(frames);

  const cells = Array.from({ length: 10 }, (_, index) => {
    const frameNumber = index + 1;
    const frame = frames.find((f) => f.frame_number === frameNumber);
    const symbols = frame
      ? getFrameShotSymbols(frame)
      : frameNumber === 10
      ? ["", "", ""]
      : ["", ""];
    const score = gameScore.frames.find((f) => f.frame_number === frameNumber);
    // Editable = a recorded frame that is not the one currently being bowled.
    // The active frame stays in-progress (edit it via the pin grid); future
    // frames have no data yet. Once the game is complete the last frame is
    // recorded and editable too.
    const isEditable =
      !!frame && (frameNumber < activeFrameNumber || gameComplete);
    return {
      frameNumber,
      symbols,
      rollingTotal: score?.rollingTotal ?? null,
      isActive: activeFrameNumber === frameNumber,
      isEditing: editingFrameNumber === frameNumber,
      onEdit: isEditable ? onEditFrame : undefined
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
  symbols: string[];
  rollingTotal: number | null;
  isActive: boolean;
  isEditing?: boolean;
  compact?: boolean;
  onEdit?: (frameNumber: number) => void;
}

function FrameCell({
  frameNumber,
  symbols,
  rollingTotal,
  isActive,
  isEditing = false,
  compact,
  onEdit
}: FrameCellProps) {
  const bg = isEditing ? "bg-lane-100 ring-2 ring-inset ring-felt-700" : isActive ? "bg-lane-50" : "bg-white";
  const border = compact ? "" : "border-r border-slate-200 last:border-r-0";

  const content = (
    <>
      <div className="border-b border-slate-200 px-1 py-1 text-center text-[10px] font-bold uppercase text-slate-500 sm:text-xs">
        {frameNumber}
      </div>
      <div
        className={`grid h-9 ${
          frameNumber === 10 ? "grid-cols-3" : "grid-cols-2"
        } sm:h-11`}
      >
        {symbols.map((symbol, idx) => (
          <div
            key={idx}
            className="flex items-center justify-center border-l border-slate-200 text-sm font-bold text-slate-900 first:border-l-0 sm:text-base"
          >
            {symbol}
          </div>
        ))}
      </div>
      <div className="flex h-9 items-center justify-center text-base font-bold text-felt-700 sm:h-12 sm:text-lg">
        {rollingTotal ?? ""}
      </div>
    </>
  );

  if (onEdit) {
    return (
      <button
        type="button"
        onClick={() => onEdit(frameNumber)}
        aria-label={`Edit frame ${frameNumber}`}
        className={`block w-full text-left ${border} ${bg}`}
      >
        {content}
      </button>
    );
  }

  return <div className={`${border} ${bg}`}>{content}</div>;
}
