import { Pencil, Send, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  beginEdit,
  completeEdit,
  createInitialFrameControllerState,
  hydrateFrameController,
  submitShot,
  updateShotMeta
} from "../lib/frameController";
import { calculateGameScore, knockedDownCount } from "../lib/scoring";
import { laneForFrame } from "../lib/lanes";
import { getBalls } from "../services/ballRepository";
import type { Ball, Frame, Game, LineSpec, PinNumber, ShotMetadata } from "../types/bowling";
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
    <div>
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <div className="flex gap-1">
        {(["stance", "target", "breakpoint"] as const).map((field, i) => (
          <input
            key={field}
            type="number"
            inputMode="numeric"
            min={1}
            max={39}
            value={value?.[field] ?? ""}
            onChange={(e) => update(field, e.target.value)}
            placeholder={["S", "T", "B"][i]}
            className="h-9 w-full min-w-0 rounded-md border border-slate-300 px-1 text-center text-xs focus:border-felt-700 focus:outline-none"
            title={["Stance board", "Target board (arrows)", "Breakpoint board"][i]}
          />
        ))}
      </div>
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
  notes: string;
  onNotesChange: (notes: string) => void;
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
  onActualLineChange,
  notes,
  onNotesChange
}: ShotDetailBarProps) {
  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-slate-200 bg-white p-2.5">
      {/* Ball — always shown */}
      <div>
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Ball</span>
        {balls.length > 0 ? (
          <select
            value={selectedBallId ?? ""}
            onChange={(e) => onBallChange(e.target.value ? Number(e.target.value) : undefined)}
            className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-xs font-medium text-slate-700 focus:border-felt-700 focus:outline-none"
          >
            <option value="">No ball</option>
            {balls.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}{b.is_spare_ball ? " (spare)" : ""}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-[11px] text-slate-400">Add a ball in Settings → Arsenal.</p>
        )}
      </div>

      <LineInput label="Intended" value={intendedLine} onChange={onIntendedLineChange} />

      <button
        type="button"
        onClick={onToggleActual}
        className={`h-8 rounded-md border px-2 text-xs font-medium transition-colors ${
          showActual
            ? "border-felt-700 bg-felt-700 text-white"
            : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
        }`}
      >
        {showActual ? "Hide actual" : "+ Actual line"}
      </button>

      {showActual && <LineInput label="Actual" value={actualLine} onChange={onActualLineChange} />}

      <div>
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Notes</span>
        <textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          rows={2}
          placeholder="This shot…"
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:border-felt-700 focus:outline-none"
        />
      </div>
    </div>
  );
}

interface ShotDetailModalProps {
  frame: Frame;
  shotIndex: number;
  balls: Ball[];
  lane?: string;
  onEdit: () => void;
  onClose: () => void;
}

function lineText(line: LineSpec | undefined): string {
  return line ? `S${line.stance} · T${line.target} · B${line.breakpoint}` : "—";
}

function ShotDetailModal({ frame, shotIndex, balls, lane, onEdit, onClose }: ShotDetailModalProps) {
  const shot = frame.shots[shotIndex];
  if (!shot) return null;
  const ballName = balls.find((b) => b.id === shot.ball_id)?.name ?? "—";

  return (
    <div
      className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 p-3 sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-lg border border-slate-200 bg-white p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-base font-semibold text-slate-950">
          Frame {frame.frame_number} · Shot {shotIndex + 1}
          {lane ? <span className="font-normal text-slate-500"> · Lane {lane}</span> : null}
        </h2>

        <div className="grid grid-cols-[auto_1fr] items-start gap-3">
          <PinGrid standingPins={shot.pins_standing} onChange={() => {}} readOnly size="sm" />
          <dl className="space-y-1.5 text-sm">
            <Row label="Ball" value={ballName} />
            <Row label="Intended" value={lineText(shot.intended)} />
            <Row label="Actual" value={lineText(shot.actual)} />
            <Row label="Notes" value={shot.notes?.trim() || "—"} />
          </dl>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-felt-700 bg-felt-700 px-4 text-sm font-semibold text-white hover:bg-felt-600"
          >
            <Pencil size={14} aria-hidden="true" />
            Edit frame
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-16 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-slate-700">{value}</dd>
    </div>
  );
}

export type ScorerMode = "standalone" | "session";

interface ActiveGameScorerProps {
  gameKey?: number | string;
  initialFrames?: Frame[];
  mode?: ScorerMode;
  game?: Pick<Game, "lanes" | "start_lane" | "lane_number">;
  onFrameComplete?: (frame: Frame) => Promise<void> | void;
  onGameComplete?: (frames: Frame[]) => Promise<void> | void;
}

export function ActiveGameScorer({
  gameKey = "local",
  initialFrames = [],
  mode = "standalone",
  game,
  onFrameComplete,
  onGameComplete
}: ActiveGameScorerProps) {
  const [gameState, setGameState] = useState(() => hydrateFrameController(initialFrames));
  const [statusMessage, setStatusMessage] = useState("");
  const [editingFrame, setEditingFrame] = useState<number | null>(null);
  const liveStateRef = useRef(gameState);
  const [balls, setBalls] = useState<Ball[]>([]);
  const [selectedBallId, setSelectedBallId] = useState<number | undefined>(undefined);
  const [intendedLine, setIntendedLine] = useState<LineSpec | undefined>(undefined);
  const [showActual, setShowActual] = useState(false);
  const [actualLine, setActualLine] = useState<LineSpec | undefined>(undefined);
  const [shotNotes, setShotNotes] = useState("");
  const [selectedShot, setSelectedShot] = useState<{ frameNumber: number; shotIndex: number } | null>(null);
  const gameScore = useMemo(() => calculateGameScore(gameState.frames), [gameState.frames]);
  const pinsDown = knockedDownCount(gameState.standingPins);
  const currentLane = game ? laneForFrame(game, gameState.currentFrameNumber) : undefined;
  const isFreshRack = gameState.availablePins.length === 10;

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
      actual: showActual ? actualLine : undefined,
      notes: shotNotes.trim() || undefined
    };
    setGameState((curr) => updateShotMeta(curr, meta));
  }, [selectedBallId, intendedLine, showActual, actualLine, shotNotes]);

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

  async function recordShot(standingOverride?: PinNumber[]) {
    const standing = standingOverride ?? gameState.standingPins;
    const submission = submitShot(gameState, standing);

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
    setShotNotes("");

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

  function newGame() {
    setGameState(createInitialFrameControllerState());
    setEditingFrame(null);
    setStatusMessage("");
  }

  function openShotDetail(frameNumber: number, shotIndex: number) {
    setSelectedShot({ frameNumber, shotIndex });
  }

  const detailFrame = selectedShot
    ? gameState.frames.find((f) => f.frame_number === selectedShot.frameNumber) ?? null
    : null;

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
              {currentLane ? ` · Lane ${currentLane}` : ""}
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
            New
          </button>
        )}
      </div>

      <Scorecard
        frames={gameState.frames}
        activeFrameNumber={gameState.currentFrameNumber}
        editingFrameNumber={editingFrame}
        gameComplete={gameState.isComplete}
        onShotTap={openShotDetail}
      />

      {/* Pin deck (left) + shot details (right), side-by-side on every width. */}
      <div className="mt-4 grid grid-cols-2 items-start gap-3 lg:grid-cols-[minmax(0,360px)_1fr]">
        <div className="space-y-2">
          <PinGrid
            standingPins={gameState.standingPins}
            availablePins={gameState.availablePins}
            onChange={updateStandingPins}
            size="sm"
          />

          {!gameState.isComplete && (
            <>
              <button
                type="button"
                onClick={() => void recordShot([])}
                className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-felt-700 text-sm font-bold text-white shadow-sm hover:bg-felt-500"
              >
                {isFreshRack ? "Strike" : "Spare"}
              </button>
              <button
                type="button"
                onClick={() => void recordShot()}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-felt-700 bg-white text-sm font-semibold text-felt-700 hover:bg-felt-50"
              >
                <Send aria-hidden="true" size={16} />
                Next
              </button>
            </>
          )}

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
        </div>

        {!gameState.isComplete ? (
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
            notes={shotNotes}
            onNotesChange={setShotNotes}
          />
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-500">
            Game complete. Tap a shot on the scorecard to review or edit.
          </div>
        )}
      </div>

      {statusMessage && (
        <p className="mt-3 text-center text-sm font-semibold text-felt-700">{statusMessage}</p>
      )}

      {selectedShot && detailFrame && (
        <ShotDetailModal
          frame={detailFrame}
          shotIndex={selectedShot.shotIndex}
          balls={balls}
          lane={game ? laneForFrame(game, selectedShot.frameNumber) : undefined}
          onEdit={() => {
            const fn = selectedShot.frameNumber;
            setSelectedShot(null);
            startEdit(fn);
          }}
          onClose={() => setSelectedShot(null)}
        />
      )}
    </section>
  );
}
