import { RotateCcw, Send, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import {
  createInitialFrameControllerState,
  resetCurrentShotPins,
  submitShot
} from "../lib/frameController";
import { calculateGameScore, knockedDownCount } from "../lib/scoring";
import type { PinNumber } from "../types/bowling";
import { PinGrid } from "./PinGrid";
import { Scorecard } from "./Scorecard";

export function ActiveGameScorer() {
  const [gameState, setGameState] = useState(createInitialFrameControllerState);
  const gameScore = useMemo(() => calculateGameScore(gameState.frames), [gameState.frames]);
  const pinsDown = knockedDownCount(gameState.standingPins);

  function updateStandingPins(pins: PinNumber[]) {
    setGameState((current) => ({
      ...current,
      standingPins: pins
    }));
  }

  function recordShot() {
    setGameState((current) => submitShot(current, current.standingPins).state);
  }

  function resetShot() {
    setGameState((current) => resetCurrentShotPins(current));
  }

  function newGame() {
    setGameState(createInitialFrameControllerState());
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-felt-700">
            Phase 2 score entry
          </p>
          <h1 className="text-3xl font-bold text-slate-950 sm:text-4xl">
            Tap the pins left standing
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
            Record each shot from the standing pin pattern. Strikes, spares,
            10th-frame bonus shots, and rolling totals update automatically.
          </p>
        </div>
        <button
          type="button"
          onClick={newGame}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
        >
          <RotateCcw aria-hidden="true" size={18} />
          New game
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(300px,380px)_1fr]">
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-500">Current shot</p>
                <p className="text-2xl font-bold text-slate-950">
                  Frame {gameState.currentFrameNumber}, Shot {gameState.currentShot}
                </p>
              </div>
              <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-felt-700 text-xl font-bold text-white">
                {pinsDown}
              </div>
            </div>
          </div>

          <PinGrid
            standingPins={gameState.standingPins}
            availablePins={gameState.availablePins}
            onChange={updateStandingPins}
          />

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={resetShot}
              disabled={gameState.isComplete}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RotateCcw aria-hidden="true" size={18} />
              Reset shot
            </button>
            <button
              type="button"
              onClick={recordShot}
              disabled={gameState.isComplete}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-felt-700 px-4 text-sm font-semibold text-white shadow-sm hover:bg-felt-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send aria-hidden="true" size={18} />
              Record
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <Scorecard
            frames={gameState.frames}
            activeFrameNumber={gameState.currentFrameNumber}
          />

          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
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
                ? "Game complete. Start a new game to score another line."
                : "Incomplete strike and spare bonuses stay blank on the scorecard until the needed future shots are recorded."}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
