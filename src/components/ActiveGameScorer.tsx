import { RotateCcw, Send, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  beginEdit,
  completeEdit,
  createInitialFrameControllerState,
  hydrateFrameController,
  resetCurrentShotPins,
  submitShot,
  updateShotMeta
} from "../lib/frameController";
import { calculateGameScore, knockedDownCount } from "../lib/scoring";
import { getBalls } from "../services/ballRepository";
import type { Ball, Frame, LineSpec, PinNumber, ShotMetadata } from "../types/bowling";
import { PinGrid } from "./PinGrid";
import { Scorecard } from "./Scorecard";

interface LineInputProps {
  label: string;
  value: LineSpec | undefined;
  onChange: (value: LineSpec | undefined) => void;
}

function LineInput({ label, value, onChange }: LineInputProps) {
  function update(field: keyof LineSpec, raw: string) {
    const n = parseInt(raw, 10);
    const v = isNaN(n) ? undefined : Math.max(1, Math.min(39, n));
    const next = { stance: value?.stance ?? 20, target: value?.target ?? 20, breakpoint: value?.breakpoint ?? 10 };
    if (v === undefined) {
      onChange(undefined);
      return;
    }
    next[field] = v;
    onChange(next);
  }

  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      {(["stance", "target", "breakpoint"] as const).map((field, i) => (
        <input
          key={field}
          type="number"
          min={1}
          max={39}
          value={value?.[field] ?? ""}
          onChange={(e) => update(field, e.target.value)}
          placeholder={["S", "T", "B"][i]}
          className="h-8 w-12 rounded-md border border-slate-300 px-1 text-center text-xs focus:border-felt-700 focus:outline-none"
          title={["Stance board", "Target board (arrows)", "Breakpoint board"][i]}
        />
      ))}
    </div>
  );
}

interface ShotDetailBarProps {
  balls: Ball[];
  selectedBallId: number | undefined;
  onBallChange: (id: number | undefined) => void;
  intendedLine: LineSpec | undefined;
  onIntendedLineChange: (line: LineSpec | undefined) => void;
  showActual: boolean;
  onToggleActual: () => void;
  actualLine: LineSpec | undefined;
  onActualLineChange: (line: LineSpec | undefined) => void;
}

function ShotDetailBar({
  balls,
  selectedBallId,
  onBallChange,
  intendedLine,
  onIntendedLineChange,
  showActual,
  onToggleActual,
  actualLine,
  onActualLineChange
}: ShotDetailBarProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2.5">
      {/* Row 1: Ball + Intended Line */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Ball selector */}
        {balls.length > 0 && (
          <select
            value={selectedBallId ?? ""}
            onChange={(e) => onBallChange(e.target.value ? Number(e.target.value) : undefined)}
            className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs font-medium text-slate-700 focus:border-felt-700 focus:outline-none"
          >
            <option value="">No ball</option>
            {balls.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}{b.is_spare_ball ? " (spare)" : ""}
              </option>
            ))}
          </select>
        )}

        {/* Intended line: 3 board steppers */}
        <LineInput
          label="Intended"
          value={intendedLine}
          onChange={onIntendedLineChange}
        />

        {/* Toggle actual */}
        <button
          type="button"
          onClick={onToggleActual}
          className={`h-8 rounded-md border px-2 text-xs font-medium transition-colors ${
            showActual
              ? "border-felt-700 bg-felt-700 text-white"
              : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          {showActual ? "Hide actual" : "+ Actual"}
        </button>
      </div>

      {/* Row 2: Actual Line (if expanded) */}
      {showActual && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <LineInput
            label="Actual"
            value={actualLine}
            onChange={onActualLineChange}
          />
        </div>
      )}
    </div>
  );
}

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
  const [balls, setBalls] = useState<Ball[]>([]);
  const [selectedBallId, setSelectedBallId] = useState<number | undefined>(undefined);
  const [intendedLine, setIntendedLine] = useState<LineSpec | undefined>(undefined);
  const [showActual, setShowActual] = useState(false);
  const [actualLine, setActualLine] = useState<LineSpec | undefined>(undefined);
  const gameScore = useMemo(() => calculateGameScore(gameState.frames), [gameState.frames]);
  const pinsDown = knockedDownCount(gameState.standingPins);

  useEffect(() => {
    setGameState(hydrateFrameController(initialFrames));
    setStatusMessage("");
    setEditingFrame(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameKey]);

  useEffect(() => {
    getBalls().then(setBalls).catch(() => {});
  }, []);

  useEffect(() => {
    if (balls.length === 0) return;
    const isSpareShot = gameState.currentShot > 1;
    const spareBall = balls.find((b) => b.is_spare_ball);
    const strikeBall = balls.find((b) => !b.is_spare_ball) ?? balls[0];
    const auto = isSpareShot && spareBall ? spareBall : strikeBall;
    setSelectedBallId(auto?.id);
  }, [gameState.currentShot, balls]);

  useEffect(() => {
    const meta: ShotMetadata = {
      ball_id: selectedBallId,
      intended: intendedLine,
      actual: showActual ? actualLine : undefined
    };
    setGameState((curr) => updateShotMeta(curr, meta));
  }, [selectedBallId, intendedLine, showActual, actualLine]);

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

    setShowActual(false);
    setActualLine(undefined);

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
        gameComplete={gameState.isComplete}
        onEditFrame={startEdit}
      />

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(280px,360px)_1fr] lg:items-start">
        <div className="space-y-3">
          <PinGrid
            standingPins={gameState.standingPins}
            availablePins={gameState.availablePins}
            onChange={updateStandingPins}
          />

          {!gameState.isComplete && (
            <ShotDetailBar
              balls={balls}
              selectedBallId={selectedBallId}
              onBallChange={setSelectedBallId}
              intendedLine={intendedLine}
              onIntendedLineChange={setIntendedLine}
              showActual={showActual}
              onToggleActual={() => setShowActual((v) => !v)}
              actualLine={actualLine}
              onActualLineChange={setActualLine}
            />
          )}

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
