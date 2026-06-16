import { Plus, Send, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createInitialFrameControllerState,
  editFrameShotMeta,
  editFrameShotPins,
  hydrateFrameController,
  submitShot,
  updateShotMeta
} from "../lib/frameController";
import { calculateGameScore } from "../lib/scoring";
import { laneForFrame, previousSameLaneFrame } from "../lib/lanes";
import { getBalls, getSpareLineByPins } from "../services/ballRepository";
import type { Ball, Frame, Game, LineSpec, PinNumber, ShotMetadata } from "../types/bowling";
import { PinGrid } from "./PinGrid";
import { Scorecard } from "./Scorecard";

interface LineInputProps {
  label: string;
  value: LineSpec | undefined;
  onChange: (value: LineSpec | undefined) => void;
  /** Show the line-move preset chips (used for the intended line). */
  showPresets?: boolean;
}

const LINE_FIELDS = ["stance", "target", "breakpoint"] as const;
const FIELD_LABEL: Record<(typeof LINE_FIELDS)[number], string> = {
  stance: "Stance",
  target: "Target",
  breakpoint: "Breakpoint"
};
// "X-Y" board move: X boards at the stance (feet), Y at the target (arrows).
const MOVE_PRESETS = [
  { label: "1-1", stance: 1, target: 1 },
  { label: "1.5-1", stance: 1.5, target: 1 },
  { label: "2-1", stance: 2, target: 1 }
];

const clampBoard = (n: number) => Math.max(1, Math.min(39, Math.round(n * 10) / 10));

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

function LineInput({ label, value, onChange, showPresets = false }: LineInputProps) {
  const toText = (v: LineSpec | undefined) => ({
    stance: v?.stance != null ? String(v.stance) : "",
    target: v?.target != null ? String(v.target) : "",
    breakpoint: v?.breakpoint != null ? String(v.breakpoint) : ""
  });
  const [text, setText] = useState(() => toText(value));
  const [focused, setFocused] = useState<keyof LineSpec | null>(null);

  // Re-sync from the prop only on external changes (carry-forward, spare-line
  // prefill, reset) — not when the prop merely echoes the user's own edit, so
  // in-progress entries like "15." aren't wiped.
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

  // Merge field overrides into the spec + local text, then emit.
  // TODO(line-draw): future — given any two of stance/target/breakpoint (and a
  // real breakpoint distance + arrow distance), derive the third by drawing the
  // straight line, so the user can fix a breakpoint+target and read the laydown.
  function applyValues(updates: Partial<Record<keyof LineSpec, number | undefined>>) {
    const next: LineSpec = { ...value };
    for (const k of Object.keys(updates) as (keyof LineSpec)[]) {
      const v = updates[k];
      if (v == null) delete next[k];
      else next[k] = v;
    }
    setText((t) => {
      const nt = { ...t };
      for (const k of Object.keys(updates) as (keyof LineSpec)[]) {
        nt[k] = updates[k] != null ? String(updates[k]) : "";
      }
      return nt;
    });
    const hasAny = next.stance != null || next.target != null || next.breakpoint != null;
    onChange(hasAny ? next : undefined);
  }

  function update(field: keyof LineSpec, raw: string) {
    const s = sanitizeLine(raw);
    setText((t) => ({ ...t, [field]: s }));
    const v = parseOneDp(s);
    const next: LineSpec = { ...value };
    if (v === undefined) delete next[field];
    else next[field] = Math.max(1, Math.min(39, v));
    const hasAny = next.stance != null || next.target != null || next.breakpoint != null;
    onChange(hasAny ? next : undefined);
  }

  function nudge(field: keyof LineSpec, delta: number) {
    const base = parseOneDp(text[field]) ?? value?.[field] ?? 20;
    applyValues({ [field]: clampBoard(base + delta) });
  }

  function move(stanceDelta: number, targetDelta: number) {
    const s = parseOneDp(text.stance) ?? value?.stance ?? 20;
    const t = parseOneDp(text.target) ?? value?.target ?? 20;
    applyValues({ stance: clampBoard(s + stanceDelta), target: clampBoard(t + targetDelta) });
  }

  const stepBtn =
    "inline-flex h-7 items-center justify-center rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 hover:bg-slate-50";

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
            onFocus={() => setFocused(field)}
            onBlur={() => setFocused((f) => (f === field ? null : f))}
            placeholder={["S", "T", "B"][i]}
            className="h-9 w-full min-w-0 rounded-md border border-slate-300 px-1 text-center text-xs focus:border-felt-700 focus:outline-none"
            title={["Stance board", "Target board (arrows)", "Breakpoint board"][i]}
          />
        ))}
      </div>

      {/* Focus-reveal ±0.5 stepper for the focused field. Buttons keep focus
          (preventDefault) so the stepper stays open while tapping. */}
      {focused && (
        <div className="mt-1 flex items-center justify-center gap-1.5 text-[10px] text-slate-400">
          <button type="button" className={stepBtn} aria-label={`${FIELD_LABEL[focused]} minus 0.5`} onPointerDown={(e) => e.preventDefault()} onClick={() => nudge(focused, -0.5)}>
            ◀
          </button>
          <span className="whitespace-nowrap uppercase tracking-wide">{FIELD_LABEL[focused]} ±0.5</span>
          <button type="button" className={stepBtn} aria-label={`${FIELD_LABEL[focused]} plus 0.5`} onPointerDown={(e) => e.preventDefault()} onClick={() => nudge(focused, 0.5)}>
            ▶
          </button>
        </div>
      )}

      {showPresets && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {MOVE_PRESETS.map((p) => (
            <span key={p.label} className="inline-flex overflow-hidden rounded-md border border-slate-300">
              <button
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => move(-p.stance, -p.target)}
                className="bg-white px-1.5 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
                title={`Move ${p.label} toward lower boards`}
              >
                ◀
              </button>
              <span className="bg-slate-50 px-1 py-1 text-[10px] font-semibold text-slate-600">{p.label}</span>
              <button
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => move(p.stance, p.target)}
                className="bg-white px-1.5 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
                title={`Move ${p.label} toward higher boards`}
              >
                ▶
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

interface ShotDetailBarProps {
  balls: Ball[];
  ballId: number | undefined;
  onBallChange: (id: number | undefined) => void;
  intended: LineSpec | undefined;
  onIntendedChange: (line: LineSpec | undefined) => void;
  actual: LineSpec | undefined;
  onActualChange: (line: LineSpec | undefined) => void;
  notes: string;
  onNotesChange: (notes: string) => void;
  laneLabel?: string;
  onOpenArsenal?: () => void;
}

// Every field is always editable; remounting (via `key`) per selected shot
// resets local UI state (showActual, line text) to that shot's stored values.
function ShotDetailBar({
  balls,
  ballId,
  onBallChange,
  intended,
  onIntendedChange,
  actual,
  onActualChange,
  notes,
  onNotesChange,
  laneLabel,
  onOpenArsenal
}: ShotDetailBarProps) {
  const [showActual, setShowActual] = useState(Boolean(actual));

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-slate-200 bg-white p-2.5">
      {laneLabel && (
        <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Lane</span>
          <span className="text-sm font-bold text-slate-900">{laneLabel}</span>
        </div>
      )}

      <div>
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Ball</span>
        {balls.length > 0 ? (
          <div className="flex items-center gap-1.5">
            <select
              value={ballId ?? ""}
              onChange={(e) => onBallChange(e.target.value ? Number(e.target.value) : undefined)}
              className="h-9 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 text-xs font-medium text-slate-700 focus:border-felt-700 focus:outline-none"
            >
              <option value="">No ball</option>
              {balls.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}{b.is_spare_ball ? " (spare)" : ""}
                </option>
              ))}
            </select>
            {onOpenArsenal && (
              <button
                type="button"
                onClick={onOpenArsenal}
                aria-label="Manage arsenal"
                title="Manage arsenal"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-500 hover:bg-slate-50"
              >
                <SlidersHorizontal size={15} aria-hidden="true" />
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={onOpenArsenal}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-felt-700 hover:bg-slate-50"
          >
            <Plus size={14} aria-hidden="true" />
            Add a ball in Arsenal
          </button>
        )}
      </div>

      <LineInput label="Intended" value={intended} onChange={onIntendedChange} showPresets />

      <button
        type="button"
        onClick={() => {
          setShowActual((v) => !v);
          // Seed actual from intended the first time it's opened for this shot.
          if (!actual && intended) onActualChange({ ...intended });
        }}
        className={`h-8 rounded-md border px-2 text-xs font-medium transition-colors ${
          showActual
            ? "border-felt-700 bg-felt-700 text-white"
            : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
        }`}
      >
        {showActual ? "Hide actual" : "+ Actual line"}
      </button>

      {showActual && <LineInput label="Actual" value={actual} onChange={onActualChange} />}

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
  /** Jump to the Arsenal screen to manage balls. */
  onOpenArsenal?: () => void;
}

/** Pins available entering a given shot of a frame (for editing a past shot). */
function availableEnteringShot(frame: Frame, shotIndex: number): PinNumber[] | undefined {
  if (shotIndex === 0) return undefined; // fresh rack — all pins available
  const prev = frame.shots[shotIndex - 1]?.pins_standing;
  return prev && prev.length > 0 ? prev : undefined;
}

export function ActiveGameScorer({
  gameKey = "local",
  initialFrames = [],
  mode = "standalone",
  game,
  onFrameComplete,
  onGameComplete,
  onNextGame,
  onOpenArsenal
}: ActiveGameScorerProps) {
  const [gameState, setGameState] = useState(() => hydrateFrameController(initialFrames));
  const [errorMessage, setErrorMessage] = useState("");
  const [balls, setBalls] = useState<Ball[]>([]);
  // Live (next-unbowled) shot draft. Only used when no recorded shot is selected.
  const [selectedBallId, setSelectedBallId] = useState<number | undefined>(undefined);
  const [intendedLine, setIntendedLine] = useState<LineSpec | undefined>(undefined);
  const [actualLine, setActualLine] = useState<LineSpec | undefined>(undefined);
  const [shotNotes, setShotNotes] = useState("");
  // Cursor: a recorded shot being edited inline (null = live entry).
  const [selectedShot, setSelectedShot] = useState<{ frameNumber: number; shotIndex: number } | null>(null);
  // Shot we last applied carry-forward defaults to (once per live shot).
  const lastDefaultedShot = useRef<string | null>(null);

  const gameScore = useMemo(() => calculateGameScore(gameState.frames), [gameState.frames]);
  const currentLane = game ? laneForFrame(game, gameState.currentFrameNumber) : undefined;
  const isFreshRack = gameState.availablePins.length === 10;

  const recordedFrame = selectedShot
    ? gameState.frames.find((f) => f.frame_number === selectedShot.frameNumber) ?? null
    : null;
  const recordedShot = recordedFrame && selectedShot ? recordedFrame.shots[selectedShot.shotIndex] ?? null : null;
  const isEditing = Boolean(recordedShot);

  useEffect(() => {
    setGameState(hydrateFrameController(initialFrames));
    setErrorMessage("");
    setSelectedShot(null);
    lastDefaultedShot.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameKey]);

  useEffect(() => {
    getBalls().then(setBalls).catch(() => {});
  }, []);

  // Auto-pick a ball for the live shot (spare ball on 2nd+ balls).
  useEffect(() => {
    if (balls.length === 0) return;
    const isSpareShot = gameState.currentShot > 1;
    const spareBall = balls.find((b) => b.is_spare_ball);
    const strikeBall = balls.find((b) => !b.is_spare_ball) ?? balls[0];
    const auto = isSpareShot && spareBall ? spareBall : strikeBall;
    setSelectedBallId(auto?.id);
  }, [gameState.currentShot, balls]);

  // Push the live draft into the controller's currentShotMeta.
  useEffect(() => {
    const meta: ShotMetadata = {
      ball_id: selectedBallId,
      intended: intendedLine,
      actual: actualLine,
      notes: shotNotes.trim() || undefined
    };
    setGameState((curr) => updateShotMeta(curr, meta));
  }, [selectedBallId, intendedLine, actualLine, shotNotes]);

  // On completion, default to reviewing/editing the final frame's last shot.
  useEffect(() => {
    if (gameState.isComplete && selectedShot === null) {
      const tenth = gameState.frames.find((f) => f.frame_number === 10);
      if (tenth && tenth.shots.length > 0) {
        setSelectedShot({ frameNumber: 10, shotIndex: tenth.shots.length - 1 });
      }
    }
  }, [gameState.isComplete, gameState.frames, selectedShot]);

  // Per-shot defaults (live entry only): notes + actual always blank; intended is
  // carried from the previous same-lane frame on a first ball, prefilled from a
  // saved Spare Line on a true second ball, and blank on a fresh-rack bonus ball.
  useEffect(() => {
    if (selectedShot !== null || gameState.isComplete) return;
    const key = `${gameState.currentFrameNumber}-${gameState.currentShot}`;
    if (lastDefaultedShot.current === key) return;
    lastDefaultedShot.current = key;

    setShotNotes("");
    setActualLine(undefined);

    if (gameState.currentShot === 1) {
      const prev = previousSameLaneFrame(game, gameState.currentFrameNumber, gameState.frames);
      setIntendedLine(prev?.shots[0]?.intended);
    } else if (gameState.availablePins.length < 10) {
      // True second ball (spare attempt): prefill from the saved spare line.
      const leave = gameState.availablePins;
      setIntendedLine(undefined);
      getSpareLineByPins(leave)
        .then((sl) => {
          if (lastDefaultedShot.current !== key) return;
          // Spare defaults populate stance + target only; breakpoint stays
          // blank (usable for a hook spare the user configures per shot).
          const line = sl?.line
            ? {
                ...(sl.line.stance != null && { stance: sl.line.stance }),
                ...(sl.line.target != null && { target: sl.line.target })
              }
            : undefined;
          setIntendedLine(line && Object.keys(line).length ? line : undefined);
        })
        .catch(() => {});
    } else {
      setIntendedLine(undefined); // fresh-rack bonus ball
    }
  }, [
    gameState.currentFrameNumber,
    gameState.currentShot,
    gameState.availablePins,
    gameState.isComplete,
    gameState.frames,
    selectedShot,
    game
  ]);

  function updateStandingPins(pins: PinNumber[]) {
    setGameState((curr) => ({ ...curr, standingPins: pins }));
  }

  async function persistFrame(frame: Frame) {
    try {
      await onFrameComplete?.(frame);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Save failed.");
    }
  }

  // Edit a recorded shot's metadata only — no cascade, other shots untouched.
  function handleEditMeta(meta: ShotMetadata) {
    if (!selectedShot) return;
    const { frameNumber, shotIndex } = selectedShot;
    const frames = editFrameShotMeta(gameState.frames, frameNumber, shotIndex, meta);
    setGameState((s) => ({ ...s, frames }));
    const frame = frames.find((f) => f.frame_number === frameNumber);
    if (frame) void persistFrame(frame);
  }

  // Edit a recorded shot's pins — re-derive the frame, rescore, persist.
  function handleEditPins(pins: PinNumber[]) {
    if (!selectedShot) return;
    const { frameNumber } = selectedShot;
    const frames = editFrameShotPins(gameState.frames, frameNumber, selectedShot.shotIndex, pins);
    setGameState(hydrateFrameController(frames));
    const frame = frames.find((f) => f.frame_number === frameNumber);
    if (frame) void persistFrame(frame);
  }

  async function recordShot(standingOverride?: PinNumber[]) {
    const standing = standingOverride ?? gameState.standingPins;
    const submission = submitShot(gameState, standing);
    setGameState(submission.state);
    if (!submission.savedFrame) return;
    try {
      await onFrameComplete?.(submission.savedFrame);
      if (submission.state.isComplete) await onGameComplete?.(submission.state.frames);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Save failed.");
    }
  }

  function newGame() {
    setGameState(createInitialFrameControllerState());
    setSelectedShot(null);
    setErrorMessage("");
    lastDefaultedShot.current = null;
  }

  function selectShot(frameNumber: number, shotIndex: number) {
    setSelectedShot({ frameNumber, shotIndex });
  }

  function goLive() {
    setSelectedShot(null);
  }

  const viewedLane = selectedShot && game ? laneForFrame(game, selectedShot.frameNumber) : undefined;

  const highlightCell = selectedShot
    ? { frameNumber: selectedShot.frameNumber, shotIndex: selectedShot.shotIndex }
    : { frameNumber: gameState.currentFrameNumber, shotIndex: gameState.currentShot - 1 };

  const detailKey = isEditing && selectedShot
    ? `r-${selectedShot.frameNumber}-${selectedShot.shotIndex}`
    : `live-${gameState.currentFrameNumber}-${gameState.currentShot}`;

  return (
    <section className="mx-auto w-full max-w-5xl px-3 py-4 sm:px-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        {mode === "standalone" ? (
          <button
            type="button"
            onClick={newGame}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            New
          </button>
        ) : (
          <span />
        )}
        <p className="text-2xl font-extrabold leading-none text-felt-700">{gameScore.total}</p>
      </div>

      <Scorecard
        frames={gameState.frames}
        activeFrameNumber={gameState.currentFrameNumber}
        gameComplete={gameState.isComplete}
        highlightCell={highlightCell}
        onShotTap={selectShot}
        onLiveTap={gameState.isComplete ? undefined : goLive}
      />

      {/* Pin deck (left) + shot details (right), side-by-side on every width. */}
      <div className="mt-4 grid grid-cols-2 items-start gap-3 lg:grid-cols-[minmax(0,360px)_1fr]">
        <div className="space-y-2">
          <PinGrid
            standingPins={isEditing && recordedShot ? recordedShot.pins_standing : gameState.standingPins}
            availablePins={
              isEditing && recordedFrame && selectedShot
                ? availableEnteringShot(recordedFrame, selectedShot.shotIndex)
                : gameState.availablePins
            }
            onChange={isEditing ? handleEditPins : updateStandingPins}
            size="sm"
          />

          {isEditing ? (
            gameState.isComplete && onNextGame ? (
              <button
                type="button"
                onClick={onNextGame}
                className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-felt-700 text-sm font-bold text-white shadow-sm hover:bg-felt-500"
              >
                <Plus aria-hidden="true" size={16} />
                Next Game
              </button>
            ) : null
          ) : !gameState.isComplete ? (
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
          ) : null}
        </div>

        <ShotDetailBar
          key={detailKey}
          balls={balls}
          ballId={isEditing && recordedShot ? recordedShot.ball_id : selectedBallId}
          onBallChange={isEditing ? (id) => handleEditMeta({ ball_id: id }) : setSelectedBallId}
          intended={isEditing && recordedShot ? recordedShot.intended : intendedLine}
          onIntendedChange={isEditing ? (l) => handleEditMeta({ intended: l }) : setIntendedLine}
          actual={isEditing && recordedShot ? recordedShot.actual : actualLine}
          onActualChange={isEditing ? (l) => handleEditMeta({ actual: l }) : setActualLine}
          notes={isEditing && recordedShot ? recordedShot.notes ?? "" : shotNotes}
          onNotesChange={
            isEditing ? (n) => handleEditMeta({ notes: n.trim() || undefined }) : setShotNotes
          }
          laneLabel={isEditing ? viewedLane : currentLane}
          onOpenArsenal={onOpenArsenal}
        />
      </div>

      {errorMessage && (
        <p className="mt-3 text-center text-sm font-semibold text-red-600">{errorMessage}</p>
      )}
    </section>
  );
}
