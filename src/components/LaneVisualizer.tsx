import { ChevronLeft, ChevronRight, Lock, Minus, Plus, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { LineSpec, PinNumber } from "../types/bowling";
import { useHandedness } from "../lib/handednessContext";
import { useDriftModel } from "../lib/driftModelContext";
import { useOverlay } from "../lib/useOverlay";
import { deriveLaydown, deriveLaydownFromSlide, deriveSlide } from "../lib/driftModel";
import { spareAimPoint } from "../lib/spareAim";
import { LaneSurface } from "./LaneSurface";
import {
  buildLinePath, solveLine, projectBreakpoint, xToBoard, yToFeet, PLANE_W, PLANE_L,
  POCKET_BOARD, type Peg, arrowFeet, ARROWS_FEET, LANE_FEET, HOOK_START_FT, HOOK_LENGTH_FT,
} from "../lib/laneGeometry";

const BOWLER_DEG = 50;     // bowler's-eye tilt (looking down the lane)
const TOPDOWN_DEG = 0;     // flat / top-down

/** Stage transform for a tilt angle. At 0° it is the identity (the centered
 *  top-down view, inputs on the side); as it tilts toward the bowler view it
 *  scales up and lifts so the whole lane stays centred and visible above the
 *  bottom input bar. */
function stageTransform(deg: number): string {
  const t = deg / BOWLER_DEG;
  return `translate(0%, ${(-9 * t).toFixed(2)}%) scale(${(1 + 0.24 * t).toFixed(3)}) rotateX(${deg}deg)`;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const snapBoard = (b: number) => clamp(Math.round(b * 2) / 2, 1, 39);

/** Drag handle key → the peg it owns (drives the recency-priority solver). */
const HANDLE_PEG: Record<string, Peg> = {
  laydown: "laydown", target: "target", breakpoint: "breakpoint", final: "final",
};

type LockablePeg = "laydown" | "target" | "final";
const LOCKABLE: ReadonlySet<string> = new Set(["laydown", "target", "final"]);

/** Effective value of a lockable peg on a line. */
function pegValue(l: LineSpec | undefined, k: LockablePeg): number | undefined {
  if (k === "final") return l?.final_board ?? POCKET_BOARD;
  if (k === "laydown") return l?.laydown ?? l?.stance;
  return l?.target;
}

interface LaneVisualizerProps {
  line: LineSpec | undefined;
  onClose: () => void;
  /** Optional live editing. When omitted, the view is read-only. */
  onChange?: (line: LineSpec | undefined) => void;
  /** Standing leave to light (spare surface). */
  leave?: PinNumber[];
  /** Spare mode: configurable final depth; hook timing + breakpoint shared with strike (ADR-026). */
  spare?: boolean;
  /** Show a Stance stepper alongside the pegs. Only for callers where stance is
   *  the field of record and laydown is derived from it (the Spares tab, whose
   *  form is gone) — never on an Actual line, which is slide-based (ADR-032). */
  showStance?: boolean;
  title?: string;
  /** Veto hook for a locked (completed) game: return false to drop a user edit.
   *  Only user drags/taps are gated — the auto-seed effects below bypass it. */
  onEditAttempt?: () => boolean;
  /** Pegs pinned when the view opens (max 2 — one aim peg must stay free).
   *  The Actual line opens with laydown + target pinned so the final board is
   *  the first thing that moves (ADR-032). */
  defaultLocks?: readonly LockablePeg[];
  /** True while another overlay (e.g. the locked-game "Edit this completed
   *  game?" confirm, raised from onEditAttempt) is stacked on top of this
   *  visualizer — suspends its own Escape/focus-trap so only the topmost
   *  layer responds to Escape and Tab. */
  suspended?: boolean;
}

export function LaneVisualizer({ line, onClose, onChange, leave, spare = false, showStance = false, title = "Line", onEditAttempt, defaultLocks, suspended = false }: LaneVisualizerProps) {
  const hand = useHandedness();
  const driftModel = useDriftModel();
  const [deg, setDeg] = useState(BOWLER_DEG);
  const [dragging, setDragging] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [replayKey, setReplayKey] = useState(0);
  const dragY = useRef<number | null>(null);
  const tiltMoved = useRef(0);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  // Aim cascade (ADR-027): the peg that gives way when a breakpoint drag passes
  // the timing wall = the LEAST-recently-touched aim peg. Only direct edits
  // update recency (a cascade move doesn't, else pegs would alternate); the
  // choice freezes at grab for the whole gesture. Fresh line: target gives way.
  const lastAimEdit = useRef<"laydown" | "target">("laydown");
  const dragGiveWay = useRef<"target" | "laydown" | null>("target");
  const isTopDown = deg <= 2;

  // Hard peg locks (ADR-028): tap a peg to freeze it. Max 2 — one aim peg must
  // stay free or nothing is editable. Reset on close (component unmounts).
  const [locked, setLocked] = useState<ReadonlySet<LockablePeg>>(
    () => new Set((defaultLocks ?? []).slice(0, 2))
  );
  const grabbedKey = useRef<string | null>(null);
  const dragStarted = useRef(false);
  const grabXY = useRef<{ x: number; y: number } | null>(null);

  // Escape/focus-trap/focus-restore for the visualizer itself. Disabled while
  // the nested hook-options sheet is open so a single Escape press (and the
  // trap) only ever apply to the topmost layer — the sheet has its own.
  const overlayRef = useOverlay<HTMLDivElement>(onClose, !optionsOpen && !suspended);

  function toggleLock(key: string) {
    if (!LOCKABLE.has(key)) return;
    setLocked((prev) => {
      const next = new Set(prev);
      if (next.has(key as LockablePeg)) next.delete(key as LockablePeg);
      else if (next.size < 2) next.add(key as LockablePeg);
      return next;
    });
  }

  /** Apply an edit, re-clamp the line so it stays drawable, and emit. */
  function applyEdit(patch: Partial<LineSpec>) {
    if (!onChange) return;
    if (onEditAttempt && !onEditAttempt()) return;
    const solved = solveLine({ ...(line ?? {}), ...patch }, hand);
    // Hard lock (ADR-028): an edit whose solved result moves a locked peg stops
    // at the wall — the edit is dropped, nothing twitches.
    for (const k of locked) {
      const a = pegValue(line, k), b = pegValue(solved, k);
      if (a != null && b != null && Math.abs(a - b) > 1e-6) return;
    }
    onChange(solved);
  }

  // Spare mode: seed laydown = target = final = the leave's ideal aim board
  // (e.g. 3-3-3 for the 10-pin RH) at the leave's real depth. The focal line then
  // reads as the perfectly-straight reference and the ball path curves to the
  // final. Runs once while the line is still empty; user edits then take over.
  useEffect(() => {
    if (!spare || !onChange || !leave?.length) return;
    if (line?.final_board != null) return; // already seeded or configured
    const aim = spareAimPoint(leave, hand);
    if (!aim) return;
    const board = snapBoard(aim.board);
    onChange(
      solveLine(
        {
          ...(line ?? {}),
          laydown: line?.laydown ?? board,
          target: line?.target ?? board,
          final_board: board,
          final_distance: line?.final_distance ?? Math.round(aim.feet * 10) / 10,
        },
        hand
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spare, leave]);

  // Strike mode: derive a missing laydown from the line's foul-line board — a
  // planned stance through the drift model (ADR-030), or an observed slide
  // across the release offset alone (ADR-032). Runs once while laydown is unset;
  // a typed/dragged laydown then owns the value.
  useEffect(() => {
    if (spare || !onChange || !line || line.laydown != null) return;
    if (line.slide != null) {
      onChange({ ...line, laydown: deriveLaydownFromSlide(line.slide, driftModel) });
    } else if (line.stance != null) {
      onChange({ ...line, laydown: deriveLaydown(line.stance, driftModel) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spare, line?.stance, line?.slide, line?.laydown]);

  const path = onChange && line ? buildLinePath(line, hand, spare) : null;

  // Slide tick (ADR-030): purely decorative — a derived slide-foot marker at the
  // foul line, distinct from the (draggable) laydown peg. Shown on spare lines
  // too: they carry a stance now, and the tick is how the drift step reads.
  // An actual line records the slide directly (ADR-032); a planned one derives it.
  const slideBoard =
    line?.slide ?? (line?.stance != null ? deriveSlide(line.stance, driftModel) : undefined);

  // Re-run the ball animation shortly after the line settles, so an edit visibly
  // replays the shot. Debounced so mid-drag churn doesn't restart it every frame.
  const pathD = path?.d;
  useEffect(() => {
    if (!pathD) return;
    const id = setTimeout(() => setReplayKey((k) => k + 1), 350);
    return () => clearTimeout(id);
  }, [pathD]);

  // Drag on empty background → tilt the camera. A tap (no real tilt movement)
  // replays the shot instead — replaces the old replay button.
  function onPointerDown(e: React.PointerEvent) {
    dragY.current = e.clientY;
    tiltMoved.current = 0;
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (dragY.current === null) return;
    const dy = e.clientY - dragY.current;
    dragY.current = e.clientY;
    tiltMoved.current += Math.abs(dy);
    setDeg((d) => clamp(d + dy * 0.4, TOPDOWN_DEG, BOWLER_DEG));
  }
  function onPointerUp() {
    if (dragY.current !== null && tiltMoved.current < 4) setReplayKey((k) => k + 1);
    dragY.current = null;
    setDragging(false);
  }

  // Map a screen point → board / distance and write the change. Uses the SVG's own
  // screen matrix, so it accounts for letterboxing (preserveAspectRatio) and stays
  // exact — dragging always happens flat (the handle snaps top-down on grab).
  function dragPoint(key: string, e: React.PointerEvent) {
    const svg = (e.currentTarget as SVGElement).ownerSVGElement;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return;
    const spt = svg.createSVGPoint();
    spt.x = e.clientX;
    spt.y = e.clientY;
    const loc = spt.matrixTransform(ctm.inverse());
    const boardRaw = xToBoard(loc.x, hand);
    const board = snapBoard(boardRaw);
    const feet = yToFeet(loc.y);
    switch (HANDLE_PEG[key]) {
      case "laydown": lastAimEdit.current = "laydown"; applyEdit({ laydown: board }); break;
      case "target": lastAimEdit.current = "target"; applyEdit({ target: board }); break;
      case "breakpoint": {
        // Magnetic projection (ADR-026) + aim cascade (ADR-027): past the timing
        // wall the least-recently-touched aim peg gives way (frozen per gesture).
        const a = projectBreakpoint(line ?? {}, hand, boardRaw, feet, dragGiveWay.current);
        applyEdit({
          hook_start_distance: a.hook_start_distance, hook_length: a.hook_length,
          ...(a.target != null ? { target: snapBoard(a.target) } : {}),
          ...(a.laydown != null ? { laydown: snapBoard(a.laydown) } : {}),
        });
        break;
      }
      case "final":
        // Spare finals sit at a real pin depth, so the vertical drag is meaningful;
        // strike finals stay at the pins (depth locked at the default).
        if (spare) applyEdit({ final_board: board, final_distance: clamp(Math.round(feet * 10) / 10, 55, 63) });
        else applyEdit({ final_board: board });
        break;
    }
  }

  function grabHandle(key: string, e: React.PointerEvent) {
    e.stopPropagation();
    grabbedKey.current = key;
    dragStarted.current = false;
    grabXY.current = { x: e.clientX, y: e.clientY };
    dragGiveWay.current = (() => {
      // Cascade give-way skips locked pegs; both locked ⇒ timing-only drag (ADR-028).
      const pref = lastAimEdit.current === "target" ? "laydown" : "target";
      const alt = pref === "laydown" ? "target" : "laydown";
      if (!locked.has(pref)) return pref;
      if (!locked.has(alt)) return alt;
      return null;
    })();
    setDragging(true);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }

  function moveHandle(key: string, e: React.PointerEvent) {
    if (!e.buttons || grabbedKey.current !== key) return;
    e.stopPropagation();
    const g = grabXY.current;
    // 5px deadzone separates a lock-toggling tap from a drag.
    if (!dragStarted.current && g && Math.hypot(e.clientX - g.x, e.clientY - g.y) < 5) return;
    if (!dragStarted.current) {
      dragStarted.current = true;
      // Snap flat on the FIRST real drag move (not on grab, so a lock tap in
      // bowler view doesn't flip the camera). The linear screen→lane mapping
      // needs the flat CTM, so skip this event and map from the next one.
      // Stays top-down after release — line edits rarely land in one try
      // (ADR-025); the "Bowler view" toggle brings the tilt back.
      if (!isTopDown) {
        setDeg(TOPDOWN_DEG);
        return;
      }
    }
    if (LOCKABLE.has(key) && locked.has(key as LockablePeg)) return; // locked pegs don't drag
    dragPoint(key, e);
  }

  function releaseHandle(key: string) {
    if (grabbedKey.current === key && !dragStarted.current) toggleLock(key);
    grabbedKey.current = null;
    setDragging(false);
  }

  const handles: Array<{ key: string; p: { x: number; y: number } }> = [];
  if (path) {
    handles.push({ key: "laydown", p: path.points.laydown });
    handles.push({ key: "target", p: path.points.target });
    // Both modes: the derived breakpoint is draggable (ADR-026).
    if (path.points.breakpoint) handles.push({ key: "breakpoint", p: path.points.breakpoint });
    handles.push({ key: "final", p: path.points.final });
  }

  // Snap targets for the final: the pocket (strike) or the leave's ideal aim (spare).
  const spareAim = spare && leave?.length ? spareAimPoint(leave, hand) : undefined;
  const finalOffPocket = (line?.final_board ?? POCKET_BOARD) !== POCKET_BOARD;
  const finalOffAim =
    spareAim != null &&
    (line?.final_board !== snapBoard(spareAim.board) ||
      (line?.final_distance ?? LANE_FEET) !== Math.round(spareAim.feet * 10) / 10);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[70] flex flex-col bg-slate-900"
      role="dialog"
      aria-modal="true"
      aria-label={`${title} visualizer`}
    >
      <div
        className="relative flex-1 touch-none overflow-hidden"
        style={{ perspective: "1100px" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* Floating controls — the header is gone so the lane gets full height. */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute right-3 top-3 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-slate-900/70 text-white/80 backdrop-blur hover:bg-white/10"
        >
          <X size={18} aria-hidden="true" />
        </button>
        <div
          className="absolute left-3 top-3 z-20 flex flex-col items-start gap-2"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => setDeg((d) => (d <= 2 ? BOWLER_DEG : TOPDOWN_DEG))}
            className="inline-flex h-9 items-center rounded-full border border-white/25 bg-slate-900/70 px-3 text-xs font-semibold text-white/90 backdrop-blur hover:bg-white/10"
          >
            {isTopDown ? "Bowler view" : "Top-down"}
          </button>
          {onChange && (
            <button
              type="button"
              onClick={() => setOptionsOpen(true)}
              aria-label="Hook options"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-slate-900/70 text-white/80 backdrop-blur hover:bg-white/10"
            >
              <SlidersHorizontal size={16} aria-hidden="true" />
            </button>
          )}
        </div>

        <div
          data-role="tilt-stage"
          className="absolute inset-0 mx-auto"
          style={{
            // Identity when flat; tilts + scales into a bowler's-eye view that
            // recedes to a vanishing point at the pins as the angle increases.
            transform: stageTransform(deg),
            transformOrigin: "50% 50%",
            transition: dragging ? "none" : "transform 0.25s ease-out",
          }}
        >
          <div
            ref={surfaceRef}
            className={`relative mx-auto h-full w-full max-w-[360px] transition-transform ${
              isTopDown && onChange ? (hand === "left" ? "translate-x-8" : "-translate-x-8") : ""
            }`}
          >
            <LaneSurface
              line={line}
              hand={hand}
              leave={leave}
              animate
              animateKey={replayKey}
              slideBoard={slideBoard}
              onPinTap={
                onChange
                  ? (hit) =>
                      applyEdit(
                        spare
                          ? { final_board: snapBoard(hit.board), final_distance: clamp(Math.round(hit.feet * 10) / 10, 55, 63) }
                          : { final_board: snapBoard(hit.board) }
                      )
                  : undefined
              }
            />
            {handles.length > 0 && (
              <svg viewBox={`0 0 ${PLANE_W} ${PLANE_L}`} className="pointer-events-none absolute inset-0 h-full w-full">
                {handles.map((h) => {
                  const derived = h.key === "breakpoint";
                  const isLocked = LOCKABLE.has(h.key) && locked.has(h.key as LockablePeg);
                  return (
                    <g key={h.key}>
                      {/* visible grab ring — the derived breakpoint reads as a derived point (hollow diamond) */}
                      {derived ? (
                        <rect
                          x={h.p.x - 5} y={h.p.y - 5} width="10" height="10"
                          transform={`rotate(45 ${h.p.x} ${h.p.y})`}
                          fill="none" stroke="#fff" strokeOpacity="0.7" strokeWidth="1.1"
                        />
                      ) : (
                        <circle
                          cx={h.p.x} cy={h.p.y} r="6" fill="none"
                          stroke={isLocked ? "#fbbf24" : "#fff"}
                          strokeOpacity={isLocked ? 1 : 0.6}
                          strokeWidth={isLocked ? 1.8 : 1.1}
                        />
                      )}
                      {isLocked && (
                        <text x={h.p.x + 7} y={h.p.y - 6} fontSize="6" aria-hidden="true">🔒</text>
                      )}
                      {/* large invisible hit target (covers dot + nearby label) */}
                      <circle
                        data-role="handle"
                        data-key={h.key}
                        data-locked={isLocked ? "true" : "false"}
                        cx={h.p.x}
                        cy={h.p.y}
                        r="13"
                        fill="transparent"
                        className="pointer-events-auto cursor-grab touch-none"
                        onPointerDown={(e) => grabHandle(h.key, e)}
                        onPointerMove={(e) => moveHandle(h.key, e)}
                        onPointerUp={() => releaseHandle(h.key)}
                        onPointerCancel={() => releaseHandle(h.key)}
                      />
                    </g>
                  );
                })}
              </svg>
            )}
          </div>
        </div>

        {/* Strike line: editable pegs + a derived-breakpoint readout — side column in
            top-down, bottom bar in bowler view (so the lane stays centred). */}
        {onChange && !spare && (
          <div
            className={
              isTopDown
                ? `absolute top-1/2 z-10 flex -translate-y-1/2 flex-col gap-2 ${hand === "left" ? "left-2" : "right-2"}`
                : "absolute inset-x-0 bottom-0 z-10 flex justify-center gap-1.5 px-2 pb-1"
            }
            onPointerDown={(e) => e.stopPropagation()}
          >
            <StepperField label="Laydown" value={line?.laydown ?? line?.stance} min={1} max={59} lateral
              locked={locked.has("laydown")}
              onUnlock={() => toggleLock("laydown")}
              onCommit={(v) => { lastAimEdit.current = "laydown"; applyEdit({ laydown: v }); }} />
            <StepperField label="Target" value={line?.target} min={1} max={39} lateral
              locked={locked.has("target")}
              onUnlock={() => toggleLock("target")}
              onCommit={(v) => { lastAimEdit.current = "target"; applyEdit({ target: v }); }} />
            <StepperField label="Final" value={line?.final_board ?? POCKET_BOARD} min={1} max={39} lateral
              locked={locked.has("final")}
              onUnlock={() => toggleLock("final")}
              onCommit={(v) => applyEdit({ final_board: v })} />
            {finalOffPocket && !locked.has("final") && (
              <button
                type="button"
                onClick={() => applyEdit({ final_board: POCKET_BOARD })}
                className="self-end rounded-full border border-emerald-300/40 bg-emerald-400/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-300 hover:bg-emerald-400/25"
              >
                Pocket
              </button>
            )}
          </div>
        )}

        {/* Spare line: editable pegs + final depth (no breakpoint). Same
            side-column / bottom-bar split as the strike line above. */}
        {onChange && spare && (
          <div
            className={
              isTopDown
                ? `absolute top-1/2 z-10 flex -translate-y-1/2 flex-col gap-2 ${hand === "left" ? "left-2" : "right-2"}`
                : "absolute inset-x-0 bottom-0 z-10 flex flex-wrap justify-center gap-1.5 px-2 pb-1"
            }
            onPointerDown={(e) => e.stopPropagation()}
          >
            {/* Stance has no peg on the lane — it sits behind the foul line. It
                only appears where stance is the field of record (ADR-032), and
                the caller re-derives laydown from it through the drift model. */}
            {showStance && (
              <StepperField label="Stance" value={line?.stance} min={1} max={59} lateral
                onCommit={(v) => applyEdit({ stance: v })} />
            )}
            <StepperField label="Laydown" value={line?.laydown ?? line?.stance} min={1} max={59} lateral
              locked={locked.has("laydown")}
              onUnlock={() => toggleLock("laydown")}
              onCommit={(v) => { lastAimEdit.current = "laydown"; applyEdit({ laydown: v }); }} />
            <StepperField label="Target" value={line?.target} min={1} max={39} lateral
              locked={locked.has("target")}
              onUnlock={() => toggleLock("target")}
              onCommit={(v) => { lastAimEdit.current = "target"; applyEdit({ target: v }); }} />
            <StepperField label="Final" value={line?.final_board ?? POCKET_BOARD} min={1} max={39} lateral
              locked={locked.has("final")}
              onUnlock={() => toggleLock("final")}
              onCommit={(v) => applyEdit({ final_board: v })} />
            <StepperField label="Final ft" value={line?.final_distance ?? 60} min={55} max={63} step={0.5}
              locked={locked.has("final")}
              onUnlock={() => toggleLock("final")}
              onCommit={(v) => applyEdit({ final_distance: v })} />
            {finalOffAim && spareAim && !locked.has("final") && (
              <button
                type="button"
                onClick={() =>
                  applyEdit({
                    final_board: snapBoard(spareAim.board),
                    final_distance: Math.round(spareAim.feet * 10) / 10,
                  })
                }
                className="self-end rounded-full border border-emerald-300/40 bg-emerald-400/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-300 hover:bg-emerald-400/25"
              >
                Re-aim
              </button>
            )}
          </div>
        )}
      </div>

      <p className="px-4 py-2 text-center text-xs text-white/60">
        Drag a point to move it · drag the lane to tilt
      </p>

      {optionsOpen && (
        <OptionsSheet
          line={line}
          onChange={applyEdit}
          onClose={() => setOptionsOpen(false)}
        />
      )}
    </div>
  );
}

/** Bottom sheet with the hook-shape sliders (shared by strike + spare, ADR-026). */
function OptionsSheet({
  line, onChange, onClose,
}: {
  line: LineSpec | undefined;
  onChange: (patch: Partial<LineSpec>) => void;
  onClose: () => void;
}) {
  // Live bounds mirroring the solver's clamps (laneGeometry hookGeomRaw): the
  // whole track is always draggable — no dead zones to explain.
  const fF = line?.final_distance ?? LANE_FEET;
  const tgtFt = line?.target != null ? arrowFeet(line.target) : ARROWS_FEET;
  const dS = line?.hook_start_distance ?? HOOK_START_FT;
  const startMin = Math.ceil(tgtFt + 1);
  const startMax = Math.floor(fF - 2);
  const lenMax = Math.max(4, Math.floor(fF - 0.5 - dS));
  const sheetRef = useOverlay<HTMLDivElement>(onClose);

  return (
    <div className="absolute inset-0 z-20 flex flex-col justify-end bg-black/50" onClick={onClose}>
      <div
        ref={sheetRef}
        className="rounded-t-2xl bg-slate-800 px-5 pb-6 pt-3 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-white/25" />
        <div className="mb-3 flex items-center">
          <h3 className="flex-1 text-sm font-bold">Hook shape</h3>
          <button type="button" onClick={onClose} aria-label="Done" className="rounded-md px-3 py-1 text-xs font-semibold hover:bg-white/10">
            Done
          </button>
        </div>
        <Slider
          label="Hook start" suffix="ft" min={startMin} max={startMax} step={1}
          value={clamp(dS, startMin, startMax)}
          onChange={(v) => onChange({ hook_start_distance: v })}
        />
        <Slider
          label="Hook length" suffix="ft" min={4} max={lenMax} step={1}
          value={clamp(line?.hook_length ?? HOOK_LENGTH_FT, 4, lenMax)}
          onChange={(v) => onChange({ hook_length: v })}
        />
        <p className="mt-1 text-xs text-white/50">
          Where it leaves the skid, and how long it takes to recover into the pins.
        </p>
      </div>
    </div>
  );
}

function Slider({
  label, suffix, min, max, step, value, onChange,
}: {
  label: string;
  suffix: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="mb-3 block py-1">
      <div className="mb-1 flex items-baseline justify-between text-xs font-semibold uppercase tracking-wide text-white/70">
        <span>{label}</span>
        <span className="tabular-nums text-white/90">{Math.round(value)} {suffix}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-8 w-full cursor-pointer accent-amber-400"
      />
      <div className="flex justify-between text-[11px] tabular-nums text-white/40">
        <span>{min} {suffix}</span>
        <span>{max} {suffix}</span>
      </div>
    </label>
  );
}

/** Numeric field with steppers. Typing commits on blur/Enter (a raw
 *  clamp-per-keystroke made the field untypeable), the steppers commit immediately.
 *  `lateral` board fields use screen-direction ◀/▶ (hand-mirrored, matching the
 *  score-entry adjusters); depth fields keep −/+. */
function StepperField({
  label, value, min, max, step = 0.5, lateral = false, locked = false, onUnlock, onCommit,
}: {
  label: string;
  value: number | undefined;
  min: number;
  max: number;
  step?: number;
  lateral?: boolean;
  /** Peg is pinned: the controls are inert and a lock glyph shows. */
  locked?: boolean;
  /** Tap anywhere on a locked field to release it — the number is the handle. */
  onUnlock?: () => void;
  onCommit: (v: number) => void;
}) {
  const hand = useHandedness();
  const dir = hand === "right" ? 1 : -1; // ◀ raises the board for a right-hander
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value != null ? String(value) : "");
  const commit = () => {
    if (draft !== null && draft !== "") onCommit(clamp(Number(draft), min, max));
    setDraft(null);
  };
  const nudge = (d: number) => onCommit(clamp((value ?? min) + d, min, max));
  const leftDelta = lateral ? step * dir : -step;
  return (
    <div
      className={`flex w-[4.75rem] flex-col gap-0.5 text-center text-[11px] font-semibold uppercase tracking-wide text-white/70 ${locked ? "opacity-60" : ""}`}
      // A locked field is its own unlock button: tapping the number (or either
      // arrow) releases the peg rather than doing nothing.
      onPointerDown={locked ? () => onUnlock?.() : undefined}
    >
      <span className="flex items-center justify-center gap-1">
        {locked && <Lock size={9} aria-hidden="true" />}
        {label}
      </span>
      <div
        className={`flex h-9 items-stretch overflow-hidden rounded-md border bg-white/10 ${
          locked ? "border-dashed border-white/40" : "border-white/20"
        }`}
      >
        <button
          type="button"
          aria-label={locked ? `Unlock ${label}` : lateral ? `${label} left` : `${label} down`}
          onClick={() => (locked ? onUnlock?.() : nudge(leftDelta))}
          className="flex w-5 shrink-0 items-center justify-center text-white/70 hover:bg-white/10"
        >
          {lateral ? <ChevronLeft size={11} aria-hidden="true" /> : <Minus size={11} aria-hidden="true" />}
        </button>
        <input
          type="text"
          inputMode="decimal"
          aria-label={label}
          value={shown}
          readOnly={locked}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => { if (locked) { onUnlock?.(); return; } e.target.select(); }}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") { commit(); (e.target as HTMLInputElement).blur(); } }}
          className="min-w-0 flex-1 bg-transparent text-center text-[13px] font-medium tabular-nums text-white outline-none"
        />
        <button
          type="button"
          aria-label={locked ? `Unlock ${label}` : lateral ? `${label} right` : `${label} up`}
          onClick={() => (locked ? onUnlock?.() : nudge(-leftDelta))}
          className="flex w-5 shrink-0 items-center justify-center text-white/70 hover:bg-white/10"
        >
          {lateral ? <ChevronRight size={11} aria-hidden="true" /> : <Plus size={11} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
