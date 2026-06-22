import { X } from "lucide-react";
import { useRef, useState } from "react";
import type { LineSpec, PinNumber } from "../types/bowling";
import { useHandedness } from "../lib/handednessContext";
import { LaneSurface } from "./LaneSurface";
import {
  buildLinePath, xToBoard, yToFeet, PLANE_W, PLANE_L,
  ARROWS_FEET, DEFAULT_BREAKPOINT_FEET, DEFAULT_HOOK_START_FEET
} from "../lib/laneGeometry";

const ANGLED_DEG = 52;    // bowler-eye tilt (rotateX degrees away from flat)
const TOPDOWN_DEG = 0;    // flat / top-down

type LineField = "laydown" | "target" | "breakpoint" | "breakpoint_distance" | "hook_start_distance" | "final_board";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const snapBoard = (b: number) => clamp(Math.round(b * 2) / 2, 1, 39);

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
  const [deg, setDeg] = useState(ANGLED_DEG);
  const [dragging, setDragging] = useState(false);
  const dragY = useRef<number | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const isTopDown = deg <= 2;

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
    setDeg((d) => clamp(d + dy * 0.4, TOPDOWN_DEG, ANGLED_DEG));
  }
  function onPointerUp() {
    dragY.current = null;
    setDragging(false);
  }

  function setField(field: LineField, raw: string) {
    const v = raw === "" ? undefined : Number(raw);
    onChange?.({ ...(line ?? {}), [field]: v });
  }

  // Map a screen point (top-down, flat) → board / distance and write the change.
  function dragPoint(key: string, clientX: number, clientY: number) {
    const el = surfaceRef.current?.querySelector("svg");
    if (!el || !onChange) return;
    const r = el.getBoundingClientRect();
    const sx = ((clientX - r.left) / r.width) * PLANE_W;
    const sy = ((clientY - r.top) / r.height) * PLANE_L;
    const board = snapBoard(xToBoard(sx, hand));
    const dist = Math.round(yToFeet(sy));
    const bpDist = line?.breakpoint_distance ?? DEFAULT_BREAKPOINT_FEET;
    const hsDist = line?.hook_start_distance ?? DEFAULT_HOOK_START_FEET;
    const next: LineSpec = { ...(line ?? {}) };
    switch (key) {
      case "laydown": next.laydown = board; break;
      case "target": next.target = board; break;
      case "hookStart": next.hook_start_distance = clamp(dist, ARROWS_FEET + 1, bpDist - 1); break;
      case "breakpoint":
        next.breakpoint = board;
        next.breakpoint_distance = clamp(dist, hsDist + 1, 59);
        break;
      case "final": next.final_board = board; break;
    }
    onChange(next);
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
    if (path.points.hookStart) handles.push({ key: "hookStart", p: path.points.hookStart });
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
          onClick={() => setDeg((d) => (d <= 2 ? ANGLED_DEG : TOPDOWN_DEG))}
          className="rounded-md border border-white/30 px-3 py-1.5 text-xs font-semibold hover:bg-white/10"
        >
          {isTopDown ? "Angle" : "Top-down"}
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
            transform: `rotateX(${deg}deg)`,
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

        {/* Distance inputs pinned to the side (right for a righty, left for a lefty). */}
        {onChange && (
          <div
            className={`absolute top-1/2 z-10 flex -translate-y-1/2 flex-col gap-3 ${hand === "left" ? "left-3" : "right-3"}`}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <SideField label="Hook ft" value={line?.hook_start_distance ?? DEFAULT_HOOK_START_FEET} onChange={(r) => setField("hook_start_distance", r)} />
            <SideField label="Bkpt ft" value={line?.breakpoint_distance ?? DEFAULT_BREAKPOINT_FEET} onChange={(r) => setField("breakpoint_distance", r)} />
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
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | undefined;
  onChange: (raw: string) => void;
}) {
  return (
    <label className="flex w-16 flex-col gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-white/70">
      {label}
      <input
        type="number"
        inputMode="numeric"
        step="1"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-md border border-white/20 bg-white/10 px-1 text-center text-sm font-medium text-white outline-none focus:border-amber-400"
      />
    </label>
  );
}
