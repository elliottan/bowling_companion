import { X } from "lucide-react";
import { useRef, useState } from "react";
import type { LineSpec, PinNumber } from "../types/bowling";
import { useHandedness } from "../lib/handednessContext";
import { LaneSurface } from "./LaneSurface";

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
  const dragY = useRef<number | null>(null);
  const isTopDown = deg <= 2;

  function onPointerDown(e: React.PointerEvent) {
    if (isTopDown && onChange) return;
    dragY.current = e.clientY;
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
            transition: dragY.current === null ? "transform 0.25s ease-out" : "none",
            ["--tilt" as string]: `${deg}deg`,
          }}
        >
          <div className="mx-auto h-full w-full max-w-[420px] [&_[data-billboard]]:[transform-box:fill-box] [&_[data-billboard]]:[transform-origin:center] [&_[data-billboard]]:[transform:rotateX(calc(var(--tilt)*-1))]">
            <LaneSurface line={line} hand={hand} leave={leave} />
          </div>
        </div>
      </div>

      <p className="px-4 py-2 text-center text-xs text-white/60">
        Drag up to flatten · drag down to tilt
      </p>
    </div>
  );
}
