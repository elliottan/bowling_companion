import { RotateCcw, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  createInitialFrameControllerState,
  hydrateFrameController,
  resetCurrentShotPins,
  submitShot
} from "../lib/frameController";
import { calculateGameScore, knockedDownCount } from "../lib/scoring";
import type { Frame, PinNumber } from "../types/bowling";
import { PinGrid } from "./PinGrid";
import { Scorecard } from "./Scorecard";

export type ScorerMode = "standalone" | "session";

interface ActiveGameScorerProps {
  gameKey?: number | string;
  initialFrames?: Frame[];
  mode?: ScorerMode;
  onFrameComplete?: (frame: Frame) => Promise<void> | void;
  onGameComplete?: (frames: Frame[]) => Promise<void> | void;
}

export function ActiveGameScorer({
  gameKey = "local",
  initialFrames = [],
  mode = "standalone",
  onFrameComplete,
  onGameComplete
}: ActiveGameScorerProps) {
  const [gameState, setGameState] = useState(() =>
    hydrateFrameController(initialFrames)
  );
  const [statusMessage, setStatusMessage] = useState("");
  const gameScore = useMemo(() => calculateGameScore(gameState.frames), [gameState.frames]);
  const pinsDown = knockedDownCount(gameState.standingPins);

  useEffect(() => {
    setGameState(hydrateFrameController(initialFrames));
    setStatusMessage("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameKey]);

  function updateStandingPins(pins: PinNumber[]) {
    setGameState((curr) => ({ ...curr, standingPins: pins }));
  }

  async function recordShot() {
    const result = submitShot(gameState, gameState.standingPins);
    setGameState(result.state);

    if (!result.savedFrame) return;

    try {
      await onFrameComplete?.(result.savedFrame);
      setStatusMessage(`Frame ${result.savedFrame.frame_number} saved.`);

      if (result.state.isComplete) {
        await onGameComplete?.(result.state.frames);
        setStatusMessage("Game complete.");
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Save failed.");
    }
  }

  function resetShot() {
    setGameState((curr) => resetCurrentShotPins(curr));
  }

  function newGame() {
    setGameState(createInitialFrameControllerState());
    setStatusMessage("");
  }

  return (
    <section className="mx-auto w-full max-w-5xl px-3 py-4 sm:px-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-felt-700 text-lg font-bold text-white">
            {pinsDown}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Frame {gameState.currentFrameNumber} · Shot {gameState.currentShot}
            </p>
            <p className="text-xl font-bold leading-tight text-slate-950">
              Total {gameScore.total}
              {gameState.isComplete ? "" : "+"}
            </p>
          </div>
        </div>
        {mode === "standalone" && (
          <button
            type="button"
            onClick={newGame}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RotateCcw size={14} aria-hidden="true" />
            New
          </button>
        )}
      </div>

      <Scorecard
        frames={gameState.frames}
        activeFrameNumber={gameState.currentFrameNumber}
      />

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(280px,360px)_1fr] lg:items-start">
        <div className="space-y-3">
          <PinGrid
            standingPins={gameState.standingPins}
            availablePins={gameState.availablePins}
            onChange={updateStandingPins}
          />

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={resetShot}
              disabled={gameState.isComplete}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RotateCcw aria-hidden="true" size={16} />
              Reset
            </button>
            <button
              type="button"
              onClick={recordShot}
              disabled={gameState.isComplete}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-felt-700 text-sm font-semibold text-white shadow-sm hover:bg-felt-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send aria-hidden="true" size={16} />
              Record
            </button>
          </div>

          {statusMessage && (
            <p className="text-center text-sm font-semibold text-felt-700">
              {statusMessage}
            </p>
          )}
        </div>

        <div className="hidden lg:block">
          {/* Reserved for desktop side panels in future (per-shot notes, stats). */}
        </div>
      </div>
    </section>
  );
}
