import { Plus, SlidersHorizontal, X } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createInitialFrameControllerState,
  editFrameShotMeta,
  editFrameShotPins,
  hydrateFrameController,
  submitShot,
  updateShotMeta
} from "../lib/frameController";
import { calculateGameScore, isSpare } from "../lib/scoring";
import { useHandedness } from "../lib/handednessContext";
import { laneForFrame, previousSameLaneFrame } from "../lib/lanes";
import { getBalls, getSpareLineByPins } from "../services/ballRepository";
import type { Ball, Frame, Game, LineSpec, PinNumber, ShotMetadata } from "../types/bowling";
import { PinGrid } from "./PinGrid";
import { Scorecard } from "./Scorecard";
import { SpareLineFormDialog } from "./SpareLineFormDialog";

/** "10-pin" for a single, "3-10" for multi. */
function formatLeavePins(pins: PinNumber[]): string {
  return pins.length === 1 ? `${pins[0]}-pin` : pins.join("-");
}

interface LineInputProps {
  label: string;
  value: LineSpec | undefined;
  onChange: (value: LineSpec | undefined) => void;
  /** Show the line-move preset chips (used for the intended line). */
  showPresets?: boolean;
  /** Fired when any field gains focus — used by the Actual line to autofill. */
  onFieldFocus?: () => void;
}

const LINE_FIELDS = ["stance", "target", "breakpoint"] as const;
const FIELD_LABEL: Record<(typeof LINE_FIELDS)[number], string> = {
  stance: "Stance",
  target: "Target",
  breakpoint: "Breakpoint"
};
// The board fields this input edits. Derived from LINE_FIELDS so it stays a
// subset of LineSpec's keys even if other line dimensions are added elsewhere.
type BoardField = (typeof LINE_FIELDS)[number];
// "X-Y" board move: X boards at the stance (feet), Y at the target (arrows).
const MOVE_PRESETS = [
  { label: "1-1", stance: 1, target: 1 },
  { label: "1.5-1", stance: 1.5, target: 1 },
  { label: "2-1", stance: 2, target: 1 }
];

// The stance ("standing") board allows a wider range than the target/breakpoint
// arrows: a bowler can stand out to board 50, but targets cap at the 39 boards.
const maxForField = (field: BoardField) => (field === "stance" ? 50 : 39);
const clampBoard = (n: number, max = 39) => Math.max(1, Math.min(max, Math.round(n * 10) / 10));

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

function LineInput({ label, value, onChange, showPresets = false, onFieldFocus }: LineInputProps) {
  const handedness = useHandedness();
  // Board numbers rise to the left for a right-hander, to the right for a
  // left-hander. dir = +1 means the LEFT arrow increases the board number.
  const dir = handedness === "right" ? 1 : -1;
  const toText = (v: LineSpec | undefined) => ({
    stance: v?.stance != null ? String(v.stance) : "",
    target: v?.target != null ? String(v.target) : "",
    breakpoint: v?.breakpoint != null ? String(v.breakpoint) : ""
  });
  const [text, setText] = useState(() => toText(value));
  const [focused, setFocused] = useState<BoardField | null>(null);

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
  function applyValues(updates: Partial<Record<BoardField, number | undefined>>) {
    const next: LineSpec = { ...value };
    for (const k of Object.keys(updates) as (BoardField)[]) {
      const v = updates[k];
      if (v == null) delete next[k];
      else next[k] = v;
    }
    setText((t) => {
      const nt = { ...t };
      for (const k of Object.keys(updates) as (BoardField)[]) {
        nt[k] = updates[k] != null ? String(updates[k]) : "";
      }
      return nt;
    });
    const hasAny = next.stance != null || next.target != null || next.breakpoint != null;
    onChange(hasAny ? next : undefined);
  }

  function update(field: BoardField, raw: string) {
    const s = sanitizeLine(raw);
    setText((t) => ({ ...t, [field]: s }));
    const v = parseOneDp(s);
    const next: LineSpec = { ...value };
    if (v === undefined) delete next[field];
    else next[field] = Math.max(1, Math.min(maxForField(field), v));
    const hasAny = next.stance != null || next.target != null || next.breakpoint != null;
    onChange(hasAny ? next : undefined);
  }

  function nudge(field: BoardField, delta: number) {
    const base = parseOneDp(text[field]) ?? value?.[field] ?? 20;
    applyValues({ [field]: clampBoard(base + delta, maxForField(field)) });
  }

  function move(stanceDelta: number, targetDelta: number) {
    const s = parseOneDp(text.stance) ?? value?.stance ?? 20;
    const t = parseOneDp(text.target) ?? value?.target ?? 20;
    applyValues({ stance: clampBoard(s + stanceDelta, maxForField("stance")), target: clampBoard(t + targetDelta, maxForField("target")) });
  }

  // Single full-width button per adjuster: label centered, arrows at the edges,
  // and the tapped half (left vs right of centre) decides the direction. One
  // border, no ugly split. preventDefault keeps the input focused (row open).
  const adjBtn =
    "relative flex h-8 w-full items-center justify-center rounded-md border border-slate-300 bg-white text-[10px] font-semibold uppercase tracking-wide text-slate-500 hover:bg-slate-50 active:bg-slate-100";
  const halfTap =
    (onLeft: () => void, onRight: () => void) => (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      const r = e.currentTarget.getBoundingClientRect();
      (e.clientX - r.left < r.width / 2 ? onLeft : onRight)();
    };

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
            onFocus={() => { onFieldFocus?.(); setFocused(field); }}
            onBlur={() => setFocused((f) => (f === field ? null : f))}
            placeholder={["S", "T", "B"][i]}
            className="h-9 w-full min-w-0 rounded-md border border-slate-300 px-1 text-center text-xs focus:border-felt-700 focus:outline-none"
            title={["Stance board", "Target board (arrows)", "Breakpoint board"][i]}
          />
        ))}
      </div>

      {/* Focus-reveal board adjusters. Each arrow pair gets its own full-width
          row with large tap targets. Actions run on pointerdown + preventDefault:
          keeps the input focused (row stays open) and fires reliably on touch,
          where a preventDefault pointerdown otherwise suppresses the click.
          Direction respects handedness — for a right-hander the LEFT arrow
          increases the board number. */}
      {focused && (
        <div className="mt-2">
          <button
            type="button"
            className={adjBtn}
            aria-label={`${FIELD_LABEL[focused]} ±0.5 — tap left to ${dir > 0 ? "increase" : "decrease"}, right to ${dir > 0 ? "decrease" : "increase"}`}
            onPointerDown={halfTap(() => nudge(focused, 0.5 * dir), () => nudge(focused, -0.5 * dir))}
          >
            <span aria-hidden="true" className="absolute left-3 text-base font-bold text-slate-700">◀</span>
            {FIELD_LABEL[focused]} ±0.5
            <span aria-hidden="true" className="absolute right-3 text-base font-bold text-slate-700">▶</span>
          </button>
        </div>
      )}

      {/* Move presets: one full-width button per preset; tapping its left/right
          half moves toward higher/lower boards. Only while stance/target focused. */}
      {showPresets && (focused === "stance" || focused === "target") && (
        <div className="mt-2 space-y-2">
          {MOVE_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className={adjBtn}
              aria-label={`Move ${p.label} — tap left for ${dir > 0 ? "higher" : "lower"} boards, right for ${dir > 0 ? "lower" : "higher"}`}
              onPointerDown={halfTap(() => move(p.stance * dir, p.target * dir), () => move(-p.stance * dir, -p.target * dir))}
            >
              <span aria-hidden="true" className="absolute left-3 text-base font-bold text-slate-700">◀</span>
              Move {p.label}
              <span aria-hidden="true" className="absolute right-3 text-base font-bold text-slate-700">▶</span>
            </button>
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
  onOpenArsenal?: () => void;
}

// Every field is always editable; remounting (via `key`) per selected shot
// resets local line text to that shot's stored values.
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
  onOpenArsenal
}: ShotDetailBarProps) {
  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-slate-200 bg-white p-2.5">
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
            Add a ball
          </button>
        )}
      </div>

      <LineInput label="Intended" value={intended} onChange={onIntendedChange} showPresets />

      {/* Actual may stay blank, but focusing any field while all three are blank
          autofills from the current Intended line (a quick "shot it as planned"). */}
      <LineInput
        label="Actual"
        value={actual}
        onChange={onActualChange}
        onFieldFocus={() => {
          if (!actual && intended) onActualChange({ ...intended });
        }}
      />

      <div>
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Notes</span>
        <textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          onBlur={() => {
            const trimmed = notes.trim();
            if (trimmed !== notes) onNotesChange(trimmed);
          }}
          rows={6}
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
  /** Recorded frames from OTHER games in the same session, oldest first. Used to
   *  reuse a per-session intended spare line for an identical leave. */
  sessionFrames?: Frame[];
  mode?: ScorerMode;
  game?: Pick<Game, "lanes" | "start_lane" | "lane_number">;
  onFrameComplete?: (frame: Frame) => Promise<void> | void;
  onGameComplete?: (frames: Frame[]) => Promise<void> | void;
  /** Open the game-level lane editor (lane pair + starting lane). */
  onEditLanes?: () => void;
  /** Jump to the Arsenal screen to manage balls. */
  onOpenArsenal?: () => void;
}

const pinsKey = (p: PinNumber[]) => [...p].sort((a, b) => a - b).join(",");
const lineHasValue = (l: LineSpec | undefined) =>
  !!l && (l.stance != null || l.target != null || l.breakpoint != null);

/**
 * The intended line of the most recent earlier spare attempt this session that
 * faced the same leave. Scans non-10th frames (keyed by the leave standing pins);
 * returns the last match's intended line, or undefined.
 */
function sessionSpareIntended(frames: Frame[], leave: PinNumber[]): LineSpec | undefined {
  const key = pinsKey(leave);
  let found: LineSpec | undefined;
  for (const f of frames) {
    if (f.frame_number === 10) continue;
    const first = f.shots[0];
    const second = f.shots[1];
    if (!first || !second) continue;
    if (pinsKey(first.pins_standing) !== key) continue;
    if (lineHasValue(second.intended)) found = second.intended;
  }
  return found;
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
  sessionFrames = [],
  mode = "standalone",
  game,
  onFrameComplete,
  onGameComplete,
  onEditLanes,
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
  // A just-converted spare whose leave has no saved Spare Line — offered as a
  // dismissible banner so the line can be captured in the moment.
  const [pendingSpareLeave, setPendingSpareLeave] = useState<{ pins: PinNumber[]; notes?: string } | null>(null);
  const [showSpareLineDialog, setShowSpareLineDialog] = useState(false);

  const gameScore = useMemo(() => calculateGameScore(gameState.frames), [gameState.frames]);
  const lanesList = game?.lanes ?? (game?.lane_number ? [game.lane_number] : []);
  const currentLane = game ? laneForFrame(game, gameState.currentFrameNumber) : undefined;
  const isFreshRack = gameState.availablePins.length === 10;

  const recordedFrame = selectedShot
    ? gameState.frames.find((f) => f.frame_number === selectedShot.frameNumber) ?? null
    : null;
  const recordedShot = recordedFrame && selectedShot ? recordedFrame.shots[selectedShot.shotIndex] ?? null : null;
  const isEditing = Boolean(recordedShot);

  // Label for the primary button: "Strike" on a fresh rack (first ball or a
  // 10th-frame bonus ball), "Spare" when shooting at a leave. While editing,
  // derive from the pins available entering the selected shot.
  const editStrikeOrSpareLabel = (() => {
    if (isEditing && recordedFrame && selectedShot) {
      const avail = availableEnteringShot(recordedFrame, selectedShot.shotIndex);
      return (avail?.length ?? 10) === 10 ? "Strike" : "Spare";
    }
    return isFreshRack ? "Strike" : "Spare";
  })();

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

  // Auto-pick a ball for the live shot. The spare ball is used only on a true
  // spare attempt (a partial leave); a fresh rack — including a 10th-frame bonus
  // ball after a strike/spare — is a first ball and uses the normal ball.
  useEffect(() => {
    if (balls.length === 0) return;
    const isSpareShot = gameState.currentShot > 1 && gameState.availablePins.length < 10;
    const spareBall = balls.find((b) => b.is_spare_ball);
    const strikeBall = balls.find((b) => !b.is_spare_ball) ?? balls[0];
    const auto = isSpareShot && spareBall ? spareBall : strikeBall;
    setSelectedBallId(auto?.id);
  }, [gameState.currentShot, gameState.availablePins, balls]);

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
      // First ball: carry intended line, selected ball, and notes from the
      // previous same-lane frame. Actual is never carried (kept blank).
      const prev = previousSameLaneFrame(game, gameState.currentFrameNumber, gameState.frames);
      const prevShot = prev?.shots[0];
      setIntendedLine(prevShot?.intended);
      if (prevShot) {
        setShotNotes(prevShot.notes ?? "");
        if (prevShot.ball_id != null) setSelectedBallId(prevShot.ball_id);
      }
    } else if (gameState.availablePins.length < 10) {
      // True second ball (spare attempt). Prefer the intended line from an
      // identical leave already shot this session (per-session conditions),
      // else fall back to the saved global Spare Line.
      const leave = gameState.availablePins;
      const sessionLine = sessionSpareIntended([...sessionFrames, ...gameState.frames], leave);
      if (sessionLine) {
        setIntendedLine({ ...sessionLine });
        return;
      }
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
      // Fresh-rack bonus ball (10th frame after a strike/spare): treat as a
      // first ball — carry the intended line forward from the shot just thrown.
      const frame = gameState.frames.find((f) => f.frame_number === gameState.currentFrameNumber);
      const prevShot = frame?.shots[frame.shots.length - 1];
      setIntendedLine(prevShot?.intended);
    }
  }, [
    gameState.currentFrameNumber,
    gameState.currentShot,
    gameState.availablePins,
    gameState.isComplete,
    gameState.frames,
    selectedShot,
    sessionFrames,
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

  // After a live spare conversion, offer to capture its line when the leave has
  // no saved Spare Line (or only a bare row with no targeting data).
  async function offerSpareLine(frame: Frame) {
    if (!isSpare(frame)) return;
    const leave = frame.shots[0]?.pins_standing;
    if (!leave || leave.length === 0) return;
    try {
      const existing = await getSpareLineByPins(leave);
      if (existing?.line) return;
      setPendingSpareLeave({
        pins: [...leave].sort((a, b) => a - b) as PinNumber[],
        notes: existing?.notes
      });
    } catch {
      // best-effort; skip the offer on lookup failure
    }
  }

  async function recordShot(standingOverride?: PinNumber[]) {
    const standing = standingOverride ?? gameState.standingPins;
    const submission = submitShot(gameState, standing);
    setGameState(submission.state);
    if (!submission.savedFrame) return;
    void offerSpareLine(submission.savedFrame);
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

  // Provisional symbol for the in-progress (live) shot, shown in the scorecard
  // and updated as the user taps the pin deck. A fresh rack counts knocked-down
  // pins (X on a clean sweep); a partial leave counts cleared pins (/ on a spare).
  const liveSymbol = (() => {
    if (isEditing || gameState.isComplete) return undefined;
    const avail = gameState.availablePins;
    const standing = gameState.standingPins;
    const fresh = avail.length === 10;
    // Stay blank until the user taps the deck for this shot. The default (no tap)
    // is all pins standing-up on a fresh rack and all pins up on a partial leave.
    const interacted = fresh ? standing.length > 0 : standing.length < avail.length;
    if (!interacted) return undefined;
    const knocked = fresh ? 10 - standing.length : avail.length - standing.length;
    if (fresh) return knocked === 0 ? "-" : String(knocked);
    return knocked === avail.length ? "/" : knocked === 0 ? "-" : String(knocked);
  })();

  // Once the live shot has a value, fold it into the scoring frames so a prior
  // pending strike/spare resolves and shows its total — even though the current
  // frame itself stays blank until it is settled.
  const scoreFrames = (() => {
    if (liveSymbol === undefined) return gameState.frames;
    const fn = gameState.currentFrameNumber;
    const shotIdx = gameState.currentShot - 1;
    const existing = gameState.frames.find((f) => f.frame_number === fn);
    const baseShots = existing ? existing.shots.slice(0, shotIdx) : [];
    const provisional: Frame = {
      game_id: existing?.game_id ?? 0,
      frame_number: fn,
      shots: [...baseShots, { pins_standing: gameState.standingPins }],
      is_strike: false,
      is_spare: false
    };
    return [...gameState.frames.filter((f) => f.frame_number !== fn), provisional].sort(
      (a, b) => a.frame_number - b.frame_number
    );
  })();

  const detailKey = isEditing && selectedShot
    ? `r-${selectedShot.frameNumber}-${selectedShot.shotIndex}`
    : `live-${gameState.currentFrameNumber}-${gameState.currentShot}`;

  return (
    <section className="mx-auto w-full max-w-5xl px-3 py-4 sm:px-6">
      {mode === "standalone" && (
        <div className="mb-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={newGame}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            New
          </button>
          <p className="text-2xl font-extrabold leading-none text-felt-700">{gameScore.total}</p>
        </div>
      )}

      <Scorecard
        frames={gameState.frames}
        activeFrameNumber={gameState.currentFrameNumber}
        gameComplete={gameState.isComplete}
        highlightCell={highlightCell}
        liveSymbol={liveSymbol}
        scoreFrames={scoreFrames}
        onShotTap={selectShot}
        onLiveTap={gameState.isComplete ? undefined : goLive}
      />

      {/* Pin deck (left) + shot details (right), side-by-side on every width. */}
      <div className="mt-4 grid grid-cols-2 items-start gap-3 lg:grid-cols-[minmax(0,360px)_1fr]">
        <div className="space-y-2">
          {(onEditLanes || lanesList.length > 0) && (
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Lane</span>
              {onEditLanes ? (
                <button type="button" onClick={onEditLanes} aria-label="Edit game lanes" className="inline-flex items-center gap-1">
                  {lanesList.length > 0 ? (
                    lanesList.map((l) => (
                      <span
                        key={l}
                        className={`inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-md px-1.5 text-xs font-bold ${
                          l === (isEditing ? viewedLane : currentLane) ? "bg-felt-700 text-white" : "bg-slate-100 text-slate-400"
                        }`}
                      >
                        {l}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs font-semibold text-felt-700">+ Set lanes</span>
                  )}
                </button>
              ) : (
                <span className="text-sm font-bold text-slate-900">{lanesList.join(" / ")}</span>
              )}
            </div>
          )}

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

          {/* Strike/Spare + Next stay visible and functional in both live and
              editing states (every frame is editable). While editing a recorded
              shot, Strike/Spare applies that mark and Next leaves it untouched —
              both then jump the cursor back to the latest incomplete frame. */}
          {!gameState.isComplete ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  if (isEditing) {
                    handleEditPins([]);
                    goLive();
                  } else {
                    void recordShot([]);
                  }
                }}
                className="inline-flex h-11 flex-1 items-center justify-center rounded-lg bg-felt-700 text-sm font-bold text-white shadow-sm hover:bg-felt-500"
              >
                {editStrikeOrSpareLabel}
              </button>
              <button
                type="button"
                onClick={() => (isEditing ? goLive() : void recordShot())}
                className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-felt-700 bg-white text-sm font-semibold text-felt-700 hover:bg-felt-50"
              >
                Next
              </button>
            </div>
          ) : null}

          {pendingSpareLeave && (
            <div className="flex items-center gap-2 rounded-lg border border-felt-700 bg-felt-50 px-3 py-2">
              <button
                type="button"
                onClick={() => setShowSpareLineDialog(true)}
                className="min-w-0 flex-1 text-left text-sm font-semibold text-felt-700"
              >
                + Save spare line for {formatLeavePins(pendingSpareLeave.pins)}
              </button>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => setPendingSpareLeave(null)}
                className="shrink-0 text-slate-400 hover:text-slate-600"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          )}
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
            // Store raw while typing (keeps internal/trailing spaces); the
            // textarea's onBlur trims on save. Trimming per-keystroke here made
            // it impossible to type a space in a recorded shot's notes.
            isEditing ? (n) => handleEditMeta({ notes: n }) : setShotNotes
          }
          onOpenArsenal={onOpenArsenal}
        />
      </div>

      {errorMessage && (
        <p className="mt-3 text-center text-sm font-semibold text-red-600">{errorMessage}</p>
      )}

      {showSpareLineDialog && pendingSpareLeave && (
        <SpareLineFormDialog
          key={pendingSpareLeave.pins.join("-")}
          initialPins={pendingSpareLeave.pins}
          lockPins
          initialNotes={pendingSpareLeave.notes}
          onSaved={() => {
            setShowSpareLineDialog(false);
            setPendingSpareLeave(null);
          }}
          onCancel={() => setShowSpareLineDialog(false)}
        />
      )}
    </section>
  );
}
