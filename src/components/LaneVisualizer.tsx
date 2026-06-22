import { X } from "lucide-react";
import { useRef, useState } from "react";
import type { LineSpec, PinNumber } from "../types/bowling";
import { useHandedness } from "../lib/handednessContext";
import { LaneSurface } from "./LaneSurface";
import { buildLinePath, xToBoard, yToFeet, PLANE_W, PLANE_L } from "../lib/laneGeometry";

const ANGLED_DEG = 58;    // bowler-eye tilt (rotateX degrees away from flat)
const TOPDOWN_DEG = 0;    // flat / top-down

interface LaneVisualizerProps {
  line: LineSpec | undefined;
  onClose: () => void;
  /** Optional live editing (later task). When omitted, the view is read-only. */
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

  function onPointerDown(e: React.PointerEvent) {
    // Drag anywhere on the lane tilts the camera — in both angled and top-down
    // views. Drags that start on an edit handle stopPropagation (below), so they
    // move the handle instead of tilting.
    dragY.current = e.clientY;
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (dragY.current === null) return;
    const dy = e.clientY - dragY.current;
    dragY.current = e.clientY;
    setDeg((d) => Math.max(TOPDOWN_DEG, Math.min(ANGLED_DEG, d + dy * 0.4)));
  }
  function onPointerUp() {
    dragY.current = null;
    setDragging(false);
  }

  function setField(field: "laydown" | "target" | "breakpoint" | "breakpoint_distance", raw: string) {
    const v = raw === "" ? undefined : Number(raw);
    onChange?.({ ...(line ?? {}), [field]: v });
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
        style={{ perspective: "900px" }}
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
            transformOrigin: "50% 100%",
            transition: dragging ? "none" : "transform 0.25s ease-out",
          }}
        >
          <div ref={surfaceRef} className="relative mx-auto h-full w-full max-w-[420px]">
            <LaneSurface line={line} hand={hand} leave={leave} animate />
            {onChange && isTopDown && line && (() => {
              const path = buildLinePath(line, hand);
              if (!path) return null;
              const handles: Array<{ key: "laydown" | "target" | "breakpoint"; p: { x: number; y: number } }> = [
                { key: "laydown", p: path.points.laydown },
                { key: "target", p: path.points.target },
              ];
              if (path.points.breakpoint) handles.push({ key: "breakpoint", p: path.points.breakpoint });

              function setFromPointer(key: string, clientX: number, clientY: number) {
                const el = surfaceRef.current?.querySelector("svg");
                if (!el) return;
                const r = el.getBoundingClientRect();
                const sx = ((clientX - r.left) / r.width) * PLANE_W;
                const sy = ((clientY - r.top) / r.height) * PLANE_L;
                const snap = (b: number) => Math.max(1, Math.min(39, Math.round(b * 2) / 2));
                const board = snap(xToBoard(sx, hand));
                const next: LineSpec = { ...line };
                if (key === "laydown") next.laydown = board;
                else if (key === "target") {
                  // Dragging the target swings the breakpoint with it (laydown
                  // stays put) so the shot keeps a sensible shape.
                  const delta = board - (line?.target ?? board);
                  next.target = board;
                  if (line?.breakpoint != null) next.breakpoint = snap(line.breakpoint + delta);
                } else if (key === "breakpoint") {
                  next.breakpoint = board;
                  next.breakpoint_distance = Math.max(20, Math.min(60, Math.round(yToFeet(sy))));
                }
                onChange!(next);
              }

              return (
                <svg viewBox={`0 0 ${PLANE_W} ${PLANE_L}`} className="pointer-events-none absolute inset-0 h-full w-full">
                  {handles.map((h) => (
                    <circle
                      key={h.key}
                      data-role="handle"
                      cx={h.p.x}
                      cy={h.p.y}
                      r="4"
                      className="pointer-events-auto cursor-grab touch-none"
                      fill="#fff"
                      stroke="#f59e0b"
                      strokeWidth="1.5"
                      onPointerDown={(e) => { e.stopPropagation(); (e.currentTarget as Element).setPointerCapture(e.pointerId); }}
                      onPointerMove={(e) => { if (e.buttons) { e.stopPropagation(); setFromPointer(h.key, e.clientX, e.clientY); } }}
                    />
                  ))}
                </svg>
              );
            })()}
          </div>
        </div>
      </div>

      {onChange && (
        <div className="grid grid-cols-4 gap-2 px-4 pb-2 pt-1">
          <NumberField label="Laydown" value={line?.laydown} onChange={(r) => setField("laydown", r)} />
          <NumberField label="Target" value={line?.target} onChange={(r) => setField("target", r)} />
          <NumberField label="Bkpt" value={line?.breakpoint} onChange={(r) => setField("breakpoint", r)} />
          <NumberField label="Dist ft" value={line?.breakpoint_distance} onChange={(r) => setField("breakpoint_distance", r)} step="1" />
        </div>
      )}

      <p className="px-4 py-2 text-center text-xs text-white/60">
        Drag the lane to tilt · flatten to drag the points
      </p>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step = "0.5",
}: {
  label: string;
  value: number | undefined;
  onChange: (raw: string) => void;
  step?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wide text-white/60">
      {label}
      <input
        type="number"
        inputMode="decimal"
        step={step}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-md border border-white/20 bg-white/10 px-2 text-sm font-medium text-white outline-none focus:border-amber-400"
      />
    </label>
  );
}
