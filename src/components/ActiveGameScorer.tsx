import { RotateCcw, Send, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  type FrameControllerState,
  createInitialFrameControllerState,
  resetCurrentShotPins,
  submitShot
} from "../lib/frameController";
import { calculateGameScore, knockedDownCount } from "../lib/scoring";
import type { Frame, PinNumber } from "../types/bowling";
import { PinGrid } from "./PinGrid";
import { Scorecard } from "./Scorecard";

interface ActiveGameScorerProps {
  gameKey?: number | string;
  initialFrames?: Frame[];
  eyebrow?: string;
  title?: string;
  description?: string;
  showNewGameButton?: boolean;
  onFrameComplete?: (frame: Frame) => Promise<void> | void;
  onGameComplete?: (frames: Frame[]) => Promise<void> | void;
}

export function ActiveGameScorer({
  gameKey = "local",
  initialFrames = [],
  eyebrow = "Score entry",
  title = "Tap the pins left standing",
  description = "Record each shot from the standing pin pattern. Strikes, spares, 10th-frame bonus shots, and rolling totals update automatically.",
  showNewGameButton = true,
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
  }, [gameKey, initialFrames]);

  function updateStandingPins(pins: PinNumber[]) {
    setGameState((current) => ({
      ...current,
      standingPins: pins
    }));
  }

  async function recordShot() {
    const result = submitShot(gameState, gameState.standingPins);
    setGameState(result.state);

    if (!result.savedFrame) {
      return;
    }

    try {
      await onFrameComplete?.(result.savedFrame);
      setStatusMessage(`Frame ${result.savedFrame.frame_number} saved.`);

      if (result.state.isComplete) {
        await onGameComplete?.(result.state.frames);
        setStatusMessage("Game complete and saved.");
      }
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : "Unable to save this frame."
      );
    }
  }

  function resetShot() {
    setGameState((current) => resetCurrentShotPins(current));
  }

  function newGame() {
    setGameState(createInitialFrameControllerState());
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-6 lg:px-8">
      <div className="mb-4 flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-felt-700 sm:text-sm">
            {eyebrow}
          </p>
          <h1 className="text-2xl font-bold leading-tight text-slate-950 sm:text-4xl">
            {title}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base sm:leading-7">
            {description}
          </p>
        </div>
        {showNewGameButton ? (
          <button
            type="button"
            onClick={newGame}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
          >
            <RotateCcw aria-hidden="true" size={18} />
            New game
          </button>
        ) : null}
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(300px,380px)_1fr] lg:gap-6">
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-500">Current shot</p>
                <p className="text-2xl font-bold leading-tight text-slate-950">
                  Frame {gameState.currentFrameNumber}, Shot {gameState.currentShot}
                </p>
              </div>
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-felt-700 text-xl font-bold text-white sm:h-14 sm:w-14">
                {pinsDown}
              </div>
            </div>
          </div>

          <PinGrid
            standingPins={gameState.standingPins}
            availablePins={gameState.availablePins}
            onChange={updateStandingPins}
          />

          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <button
              type="button"
              onClick={resetShot}
              disabled={gameState.isComplete}
              className="inline-flex h-12 min-w-0 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RotateCcw aria-hidden="true" size={18} />
              Reset shot
            </button>
            <button
              type="button"
              onClick={recordShot}
              disabled={gameState.isComplete}
              className="inline-flex h-12 min-w-0 items-center justify-center gap-2 rounded-lg bg-felt-700 px-3 text-sm font-semibold text-white shadow-sm hover:bg-felt-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send aria-hidden="true" size={18} />
              Record
            </button>
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          <Scorecard
            frames={gameState.frames}
            activeFrameNumber={gameState.currentFrameNumber}
          />

          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-lane-100 text-felt-700">
                <Sparkles aria-hidden="true" size={22} />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-500">Game total</p>
                <p className="text-3xl font-bold text-slate-950">
                  {gameScore.total}
                  {gameState.isComplete ? "" : "+"}
                </p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-600">
              {gameState.isComplete
                ? "Game complete. Add another game from this session when you are ready."
                : "Incomplete strike and spare bonuses stay blank on the scorecard until the needed future shots are recorded."}
            </p>
            {statusMessage ? (
              <p className="mt-3 text-sm font-semibold text-felt-700">{statusMessage}</p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function hydrateFrameController(frames: Frame[]): FrameControllerState {
  if (frames.length === 0) {
    return createInitialFrameControllerState();
  }

  const orderedFrames = [...frames].sort(
    (first, second) => first.frame_number - second.frame_number
  );
  const lastFrame = orderedFrames[orderedFrames.length - 1];
  const isComplete = lastFrame.frame_number === 10 && Boolean(lastFrame.shot_2_pins_standing);

  return {
    ...createInitialFrameControllerState(),
    frames: orderedFrames,
    currentFrameNumber: isComplete
      ? 10
      : Math.min(lastFrame.frame_number + 1, 10),
    currentShot: 1,
    isComplete
  };
}
