import { Pencil, Plus, Send, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  beginEditFromShot,
  completeEdit,
  createInitialFrameControllerState,
  hydrateFrameController,
  submitShot,
  updateShotMeta
} from "../lib/frameController";
import { calculateGameScore } from "../lib/scoring";
import { laneForFrame, previousSameLaneFrame } from "../lib/lanes";
import { getBalls } from "../services/ballRepository";
import type { Ball, Frame, Game, LineSpec, PinNumber, ShotMetadata } from "../types/bowling";
import { PinGrid } from "./PinGrid";
import { Scorecard } from "./Scorecard";

interface LineInputProps {
  label: string;
  value: LineSpec | undefined;
  onChange: (value: LineSpec | undefined) => void;
  readOnly?: boolean;
}

const LINE_FIELDS = ["stance", "target", "breakpoint"] as const;

// Keep only digits and a single dot, capped at one decimal place. A trailing
// dot is preserved so "15." can be typed on the way to "15.5".
function sanitizeLine(raw: string): string {
  let s = raw.replace(/[^\d.]/g, "");
  const dot = s.indexOf(".");
  if (dot === -1) return s;
  const intPart = s.slice(0, dot);
  const dec = s.slice(dot + 1).replace(/\./g, "").slice(0, 1);
  return `${intPart}.${dec}`;
}

function parseOneDp(s: string): number | undefined {
  if (!/\d/.test(s)) return undefined;
  const n = parseFloat(s);
  return Number.isNaN(n) ? undefined : Math.round(n * 10) / 10;
}

function LineInput({ label, value, onChange, readOnly = false }: LineInputProps) {
  const toText = (v: LineSpec | undefined) => ({
    stance: v?.stance != null ? String(v.stance) : "",
    target: v?.target != null ? String(v.target) : "",
    breakpoint: v?.breakpoint != null ? String(v.breakpoint) : ""
  });
  const [text, setText] = useState(() => toText(value));

  // Re-sync from the prop only on external changes (carry-forward, actual
  // autofill, reset) — not when the prop merely echoes the user's own edit,
  // so in-progress entries like "15." aren't wiped.
  useEffect(() => {
    setText((prev) => {
      const next = { ...prev };
      for (const f of LINE_FIELDS) {
        if (parseOneDp(prev[f]) !== value?.[f]) {
          next[f] = value?.[f] != null ? String(value[f]) : "";
        }
      }
      return next;
    });
  }, [value?.stance, value?.target, value?.breakpoint]);

  function update(field: keyof LineSpec, raw: string) {
    const s = sanitizeLine(raw);
    setText((t) => ({ ...t, [field]: s }));

    const v = parseOneDp(s);
    if (v === undefined) {
      onChange(undefined);
      return;
    }
    const next = { stance: value?.stance ?? 20, target: value?.target ?? 20, breakpoint: value?.breakpoint ?? 10 };
    next[field] = Math.max(1, Math.min(39, v));
    onChange(next);
  }

  return (
    <div>
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <div className="flex gap-1">
        {LINE_FIELDS.map((field, i) => (
          <input
            key={field}
            type="text"
            inputMode="decimal"
            value={text[field]}
            onChange={(e) => update(field, e.target.value)}
            readOnly={readOnly}
            disabled={readOnly}
            placeholder={["S", "T", "B"][i]}
            className="h-9 w-full min-w-0 rounded-md border border-slate-300 px-1 text-center text-xs focus:border-felt-700 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
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
  readOnly?: boolean;
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
  onNotesChange,
  readOnly = false
}: ShotDetailBarProps) {
  const ballName = balls.find((b) => b.id === selectedBallId)?.name;
  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-slate-200 bg-white p-2.5">
      {/* Ball — always shown */}
      <div>
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Ball</span>
        {readOnly ? (
          <p className="text-sm text-slate-700">{ballName ?? "—"}</p>
        ) : balls.length > 0 ? (
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

      <LineInput label="Intended" value={intendedLine} onChange={onIntendedLineChange} readOnly={readOnly} />

      {!readOnly && (
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
      )}

      {showActual && <LineInput label="Actual" value={actualLine} onChange={onActualLineChange} readOnly={readOnly} />}

      <div>
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Notes</span>
        {readOnly ? (
          <p className="whitespace-pre-wrap break-words text-sm text-slate-700">{notes.trim() || "—"}</p>
        ) : (
          <textarea
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            rows={2}
            placeholder="This shot…"
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:border-felt-700 focus:outline-none"
          />
        )}
      </div>
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
  /** When provided, a "Next Game" CTA shows once the game is complete. */
  onNextGame?: () => void;
}

export function ActiveGameScorer({
  gameKey = "local",
  initialFrames = [],
  mode = "standalone",
  game,
  onFrameComplete,
  onGameComplete,
  onNextGame
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
  // Cursor for viewing a recorded past shot (null = live entry mode)
  const [selectedShot, setSelectedShot] = useState<{ frameNumber: number; shotIndex: number } | null>(null);
  // Frame we last applied carry-forward defaults to (so we only default once per frame).
  const lastDefaultedFrame = useRef<number | null>(null);
  const gameScore = useMemo(() => calculateGameScore(gameState.frames), [gameState.frames]);
  const currentLane = game ? laneForFrame(game, gameState.currentFrameNumber) : undefined;
  const isFreshRack = gameState.availablePins.length === 10;

  useEffect(() => {
    setGameState(hydrateFrameController(initialFrames));
    setStatusMessage("");
    setEditingFrame(null);
    setSelectedShot(null);
    lastDefaultedFrame.current = null;
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

  // On completion, default to reviewing the final frame's last shot (read-only).
  useEffect(() => {
    if (gameState.isComplete && selectedShot === null && editingFrame === null) {
      const tenth = gameState.frames.find((f) => f.frame_number === 10);
      if (tenth && tenth.shots.length > 0) {
        setSelectedShot({ frameNumber: 10, shotIndex: tenth.shots.length - 1 });
      }
    }
  }, [gameState.isComplete, gameState.frames, selectedShot, editingFrame]);

  // At the start of each new frame (live entry), carry the intended line from
  // the previous same-lane frame and clear the per-shot actual line + notes.
  useEffect(() => {
    if (editingFrame !== null || selectedShot !== null || gameState.isComplete) return;
    if (gameState.currentShot !== 1) return;
    const fn = gameState.currentFrameNumber;
    if (lastDefaultedFrame.current === fn) return;
    lastDefaultedFrame.current = fn;

    const prev = previousSameLaneFrame(game, fn, gameState.frames);
    setIntendedLine(prev?.shots[0]?.intended);
    setActualLine(undefined);
    setShowActual(false);
    setShotNotes("");
  }, [
    gameState.currentFrameNumber,
    gameState.currentShot,
    gameState.isComplete,
    gameState.frames,
    editingFrame,
    selectedShot,
    game
  ]);

  function updateStandingPins(pins: PinNumber[]) {
    setGameState((curr) => ({ ...curr, standingPins: pins }));
  }

  function startEditFromShot(frameNumber: number, shotIndex: number) {
    if (editingFrame !== null) return;
    liveStateRef.current = gameState;
    setEditingFrame(frameNumber);
    setGameState(beginEditFromShot(gameState, frameNumber, shotIndex));
    setStatusMessage(`Editing frame ${frameNumber}`);
  }

  function cancelEdit() {
    setGameState(liveStateRef.current);
    setEditingFrame(null);
    setStatusMessage("");
  }

  // Clears any view/edit mode, returning to live entry.
  function handleLiveTap() {
    if (editingFrame !== null) cancelEdit();
    setSelectedShot(null);
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
      setSelectedShot(null);

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

    // Per-frame field reset (intended carry-forward) is handled by the
    // new-frame effect once the controller advances.

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
    setSelectedShot(null);
    setStatusMessage("");
  }

  function openShotDetail(frameNumber: number, shotIndex: number) {
    setSelectedShot({ frameNumber, shotIndex });
  }

  function editViewedShot() {
    if (!selectedShot) return;
    const { frameNumber, shotIndex } = selectedShot;
    setSelectedShot(null);
    startEditFromShot(frameNumber, shotIndex);
  }

  const detailFrame = selectedShot
    ? gameState.frames.find((f) => f.frame_number === selectedShot.frameNumber) ?? null
    : null;

  // A tapped past shot is shown read-only while not in edit mode.
  const viewingShot =
    selectedShot && editingFrame === null ? detailFrame?.shots[selectedShot.shotIndex] ?? null : null;
  const viewing = Boolean(viewingShot);
  const viewedLane = selectedShot && game ? laneForFrame(game, selectedShot.frameNumber) : undefined;

  // The highlighted cell: cursor on selected past shot, or live entry position.
  const highlightCell = selectedShot
    ? { frameNumber: selectedShot.frameNumber, shotIndex: selectedShot.shotIndex }
    : { frameNumber: gameState.currentFrameNumber, shotIndex: gameState.currentShot - 1 };

  return (
    <section className="mx-auto w-full max-w-5xl px-3 py-4 sm:px-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {viewing && selectedShot
              ? `Viewing · Frame ${selectedShot.frameNumber} · Shot ${selectedShot.shotIndex + 1}${viewedLane ? ` · Lane ${viewedLane}` : ""}`
              : `Frame ${gameState.currentFrameNumber} · Shot ${gameState.currentShot}${currentLane ? ` · Lane ${currentLane}` : ""}`}
          </p>
          <p className="text-xl font-bold leading-tight text-slate-950">
            Total {gameScore.total}
          </p>
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
        highlightCell={highlightCell}
        onShotTap={openShotDetail}
        onLiveTap={gameState.isComplete ? undefined : handleLiveTap}
      />

      {/* Pin deck (left) + shot details (right), side-by-side on every width. */}
      <div className="mt-4 grid grid-cols-2 items-start gap-3 lg:grid-cols-[minmax(0,360px)_1fr]">
        <div className="space-y-2">
          <PinGrid
            standingPins={viewing && viewingShot ? viewingShot.pins_standing : gameState.standingPins}
            availablePins={viewing ? undefined : gameState.availablePins}
            onChange={viewing ? () => {} : updateStandingPins}
            readOnly={viewing}
            size="sm"
          />

          {viewing ? (
            <div className="space-y-2">
              <button
                type="button"
                onClick={editViewedShot}
                className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-felt-700 bg-white text-sm font-semibold text-felt-700 hover:bg-felt-50"
              >
                <Pencil aria-hidden="true" size={16} />
                Edit
              </button>
              {gameState.isComplete && onNextGame && (
                <button
                  type="button"
                  onClick={onNextGame}
                  className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-felt-700 text-sm font-bold text-white shadow-sm hover:bg-felt-500"
                >
                  <Plus aria-hidden="true" size={16} />
                  Next Game
                </button>
              )}
            </div>
          ) : !gameState.isComplete ? (
            <>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void recordShot([])}
                  className="inline-flex h-11 flex-1 items-center justify-center rounded-lg bg-felt-700 text-sm font-bold text-white shadow-sm hover:bg-felt-500"
                >
                  {isFreshRack ? "Strike" : "Spare"}
                </button>
                <button
                  type="button"
                  onClick={() => void recordShot()}
                  className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-felt-700 bg-white text-sm font-semibold text-felt-700 hover:bg-felt-50"
                >
                  <Send aria-hidden="true" size={16} />
                  Next
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
            </>
          ) : null}
        </div>

        {viewing && viewingShot ? (
          <ShotDetailBar
            balls={balls}
            selectedBallId={viewingShot.ball_id}
            onBallChange={() => {}}
            intendedLine={viewingShot.intended}
            onIntendedLineChange={() => {}}
            showActual={Boolean(viewingShot.actual)}
            onToggleActual={() => {}}
            actualLine={viewingShot.actual}
            onActualLineChange={() => {}}
            notes={viewingShot.notes ?? ""}
            onNotesChange={() => {}}
            readOnly
          />
        ) : !gameState.isComplete ? (
          <ShotDetailBar
            balls={balls}
            selectedBallId={selectedBallId}
            onBallChange={setSelectedBallId}
            intendedLine={intendedLine}
            onIntendedLineChange={setIntendedLine}
            showActual={showActual}
            onToggleActual={() => {
              setShowActual((v) => !v);
              // Seed the actual line with the intended line the first time it's
              // opened this frame, so you only adjust where the ball went.
              setActualLine((a) => a ?? (intendedLine ? { ...intendedLine } : undefined));
            }}
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
    </section>
  );
}
