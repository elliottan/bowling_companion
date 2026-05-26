import { calculateGameScore } from "../lib/scoring";
import { getFrameShotSymbols } from "../lib/scoreDisplay";
import type { Frame } from "../types/bowling";

interface ScorecardProps {
  frames: Frame[];
  activeFrameNumber: number;
}

export function Scorecard({ frames, activeFrameNumber }: ScorecardProps) {
  const gameScore = calculateGameScore(frames);

  return (
    <div className="w-full max-w-full overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="grid min-w-[620px] grid-cols-[repeat(9,minmax(52px,1fr))_minmax(78px,1.2fr)] sm:min-w-[760px] sm:grid-cols-[repeat(9,minmax(64px,1fr))_minmax(96px,1.25fr)]">
        {Array.from({ length: 10 }, (_, index) => {
          const frameNumber = index + 1;
          const frame = frames.find((item) => item.frame_number === frameNumber);
          const symbols = frame ? getFrameShotSymbols(frame) : frameNumber === 10 ? ["", "", ""] : ["", ""];
          const frameScore = gameScore.frames.find(
            (item) => item.frame_number === frameNumber
          );
          const isActive = activeFrameNumber === frameNumber;

          return (
            <div
              key={frameNumber}
              className={`border-r border-slate-200 last:border-r-0 ${
                isActive ? "bg-lane-50" : "bg-white"
              }`}
            >
              <div className="border-b border-slate-200 px-2 py-2 text-center text-xs font-bold uppercase text-slate-500">
                {frameNumber}
              </div>
              <div
                className={`grid h-10 sm:h-12 ${
                  frameNumber === 10 ? "grid-cols-3" : "grid-cols-2"
                }`}
              >
                {symbols.map((symbol, symbolIndex) => (
                  <div
                    key={`${frameNumber}-${symbolIndex}`}
                    className="flex items-center justify-center border-b border-l border-slate-200 text-base font-bold text-slate-900 first:border-l-0 sm:text-lg"
                  >
                    {symbol}
                  </div>
                ))}
              </div>
              <div className="flex h-11 items-center justify-center px-2 text-lg font-bold text-felt-700 sm:h-14 sm:text-xl">
                {frameScore?.rollingTotal ?? ""}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
