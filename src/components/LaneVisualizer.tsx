import { X } from "lucide-react";
import { useRef, useState } from "react";
import type { LineSpec, PinNumber } from "../types/bowling";
import { useHandedness } from "../lib/handednessContext";
import { LaneSurface } from "./LaneSurface";
import {
  buildLinePath, solveLine, xToBoard, yToFeet, PLANE_W, PLANE_L,
  POCKET_BOARD, DEFAULT_BREAKPOINT_FEET, type Peg,
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

interface LaneVisualizerProps {
  line: LineSpec | undefined;
  onClose: () => void;
  /** Optional live editing. When omitted, the view is read-only. */
  onChange?: (line: LineSpec | undefined) => void;
  /** Standing leave to light (spare surface). */
  leave?: PinNumber[];
  title?: string;
}

export function LaneVisualizer({ line, onClose, onChange, leave, title = "Line" }: LaneVisualizerProps) {
  const hand = useHandedness();
  const [deg, setDeg] = useState(BOWLER_DEG);
  const [dragging, setDragging] = useState(false);
  const dragY = useRef<number | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  // Move history, most-recent first — the held peg is bumped to the front so the
  // solver yields the least-recently-adjusted capable peg on a conflict.
  const recency = useRef<Peg[]>([]);
  const isTopDown = deg <= 2;

  /** Apply an edit to `peg`, run the constraint solver, and emit. */
  function applyEdit(peg: Peg, patch: Partial<LineSpec>) {
    if (!onChange) return;
    recency.current = [peg, ...recency.current.filter((p) => p !== peg)];
    onChange(solveLine({ ...(line ?? {}), ...patch }, peg, recency.current, hand));
  }

  // Drag on empty background → tilt the camera.
  function onPointerDown(e: React.PointerEvent) {
    dragY.current = e.clientY;
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (dragY.current === null) return;
    const dy = e.clientY - dragY.current;
    dragY.current = e.clientY;
    setDeg((d) => clamp(d + dy * 0.4, TOPDOWN_DEG, BOWLER_DEG));
  }
  function onPointerUp() {
    dragY.current = null;
    setDragging(false);
  }

  // Map a screen point (top-down, flat) → board / distance and write the change.
  function dragPoint(key: string, clientX: number, clientY: number) {
    const el = surfaceRef.current?.querySelector("svg");
    if (!el) return;
    const r = el.getBoundingClientRect();
    const sx = ((clientX - r.left) / r.width) * PLANE_W;
    const sy = ((clientY - r.top) / r.height) * PLANE_L;
    const board = snapBoard(xToBoard(sx, hand));
    const dist = Math.round(yToFeet(sy));
    const peg = HANDLE_PEG[key];
    switch (peg) {
      case "laydown": applyEdit(peg, { laydown: board }); break;
      case "target": applyEdit(peg, { target: board }); break;
      case "breakpoint": applyEdit(peg, { breakpoint: board, breakpoint_distance: dist }); break;
      case "final": applyEdit(peg, { final_board: board }); break;
    }
  }

  function grabHandle(e: React.PointerEvent) {
    e.stopPropagation();
    // Snap flat instantly so the linear screen→lane mapping is valid mid-drag.
    setDragging(true);
    setDeg(TOPDOWN_DEG);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }

  const path = onChange && line ? buildLinePath(line, hand) : null;
  const handles: Array<{ key: string; p: { x: number; y: number } }> = [];
  if (path) {
    handles.push({ key: "laydown", p: path.points.laydown });
    handles.push({ key: "target", p: path.points.target });
    if (path.points.breakpoint) handles.push({ key: "breakpoint", p: path.points.breakpoint });
    handles.push({ key: "final", p: path.points.final });
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col bg-slate-900"
      role="dialog"
      aria-modal="true"
      aria-label={`${title} visualizer`}
    >
      <div className="flex items-center gap-3 px-4 py-3 text-white">
        <h2 className="flex-1 truncate text-base font-bold">{title}</h2>
        <button
          type="button"
          onClick={() => setDeg((d) => (d <= 2 ? BOWLER_DEG : TOPDOWN_DEG))}
          className="rounded-md border border-white/30 px-3 py-1.5 text-xs font-semibold hover:bg-white/10"
        >
          {isTopDown ? "Bowler view" : "Top-down"}
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-white/80 hover:bg-white/10"
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>

      <div
        className="relative flex-1 touch-none overflow-hidden"
        style={{ perspective: "1100px" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
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
          <div ref={surfaceRef} className="relative mx-auto h-full w-full max-w-[360px]">
            <LaneSurface line={line} hand={hand} leave={leave} animate />
            {handles.length > 0 && (
              <svg viewBox={`0 0 ${PLANE_W} ${PLANE_L}`} className="pointer-events-none absolute inset-0 h-full w-full">
                {handles.map((h) => (
                  <g key={h.key}>
                    {/* visible grab ring */}
                    <circle cx={h.p.x} cy={h.p.y} r="6" fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="1" />
                    {/* large invisible hit target (covers dot + nearby label) */}
                    <circle
                      data-role="handle"
                      data-key={h.key}
                      cx={h.p.x}
                      cy={h.p.y}
                      r="12"
                      fill="transparent"
                      className="pointer-events-auto cursor-grab touch-none"
                      onPointerDown={grabHandle}
                      onPointerMove={(e) => { if (e.buttons) { e.stopPropagation(); dragPoint(h.key, e.clientX, e.clientY); } }}
                    />
                  </g>
                ))}
              </svg>
            )}
          </div>
        </div>

        {/* Numeric inputs: a side column in top-down, a bottom bar in bowler
            view (so the lane stays centred and fully visible). */}
        {onChange && (
          <div
            className={
              isTopDown
                ? `absolute top-1/2 z-10 flex -translate-y-1/2 flex-col gap-2 ${hand === "left" ? "left-2" : "right-2"}`
                : "absolute inset-x-0 bottom-0 z-10 flex justify-center gap-1.5 px-2 pb-1"
            }
            onPointerDown={(e) => e.stopPropagation()}
          >
            <SideField label="Laydown" value={line?.laydown ?? line?.stance} min={1} max={39}
              onCommit={(v) => applyEdit("laydown", { laydown: v })} />
            <SideField label="Target" value={line?.target} min={1} max={39}
              onCommit={(v) => applyEdit("target", { target: v })} />
            <SideField label="Bkpt" value={line?.breakpoint} min={1} max={39}
              onCommit={(v) => applyEdit("breakpoint", { breakpoint: v })} />
            <SideField label="Bkpt ft" value={line?.breakpoint_distance ?? DEFAULT_BREAKPOINT_FEET} min={16} max={59}
              onCommit={(v) => applyEdit("breakpoint", { breakpoint_distance: v })} />
            <SideField label="Final" value={line?.final_board ?? POCKET_BOARD} min={1} max={39}
              onCommit={(v) => applyEdit("final", { final_board: v })} />
          </div>
        )}
      </div>

      <p className="px-4 py-2 text-center text-xs text-white/60">
        Drag a point to move it · drag the lane to tilt
      </p>
    </div>
  );
}

function SideField({
  label, value, min, max, onCommit,
}: {
  label: string;
  value: number | undefined;
  min: number;
  max: number;
  onCommit: (v: number) => void;
}) {
  return (
    <label className="flex w-[4.25rem] flex-col gap-0.5 text-center text-[10px] font-semibold uppercase tracking-wide text-white/70">
      {label}
      <input
        type="number"
        inputMode="numeric"
        step="0.5"
        min={min}
        max={max}
        value={value ?? ""}
        onChange={(e) => {
          if (e.target.value === "") return;
          onCommit(clamp(Number(e.target.value), min, max));
        }}
        className="h-8 w-full rounded-md border border-white/20 bg-white/10 px-1 text-center text-sm font-medium text-white outline-none focus:border-amber-400"
      />
    </label>
  );
}
