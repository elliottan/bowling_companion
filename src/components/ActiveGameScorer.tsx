import { RotateCcw, Send, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  beginEdit,
  completeEdit,
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
  const [editingFrame, setEditingFrame] = useState<number | null>(null);
  const liveStateRef = useRef(gameState);
  const gameScore = useMemo(() => calculateGameScore(gameState.frames), [gameState.frames]);
  const pinsDown = knockedDownCount(gameState.standingPins);

  useEffect(() => {
    setGameState(hydrateFrameController(initialFrames));
    setStatusMessage("");
    setEditingFrame(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameKey]);

  function updateStandingPins(pins: PinNumber[]) {
    setGameState((curr) => ({ ...curr, standingPins: pins }));
  }

  function startEdit(frameNumber: number) {
    if (editingFrame !== null) return;
    liveStateRef.current = gameState;
    setEditingFrame(frameNumber);
    setGameState(beginEdit(gameState, frameNumber));
    setStatusMessage(`Editing frame ${frameNumber}`);
  }

  function cancelEdit() {
    setGameState(liveStateRef.current);
    setEditingFrame(null);
    setStatusMessage("");
  }

  async function recordShot() {
    const submission = submitShot(gameState, gameState.standingPins);

    if (editingFrame !== null) {
      const frameDone =
        submission.savedFrame !== null ||
        submission.state.currentFrameNumber !== editingFrame;

      if (!frameDone) {
        setGameState(submission.state);
        return;
      }

      const merged = completeEdit(submission, liveStateRef.current);
      setGameState(merged.state);
      setEditingFrame(null);

      try {
        const editedFrame =
          merged.state.frames.find((f) => f.frame_number === editingFrame) ?? null;
        if (editedFrame) await onFrameComplete?.(editedFrame);
        setStatusMessage(`Frame ${editingFrame} updated.`);
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : "Save failed.");
      }
      return;
    }

    setGameState(submission.state);

    if (!submission.savedFrame) return;

    try {
      await onFrameComplete?.(submission.savedFrame);
      setStatusMessage(`Frame ${submission.savedFrame.frame_number} saved.`);

      if (submission.state.isComplete) {
        await onGameComplete?.(submission.state.frames);
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
    setEditingFrame(null);
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
        editingFrameNumber={editingFrame}
        onEditFrame={startEdit}
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

          {editingFrame !== null && (
            <button
              type="button"
              onClick={cancelEdit}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <X aria-hidden="true" size={16} />
              Cancel edit
            </button>
          )}

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
