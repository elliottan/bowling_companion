import { Suspense, lazy } from "react";
import { X } from "lucide-react";
import type { ComponentProps } from "react";
import type { LaneVisualizer as LaneVisualizerType } from "./LaneVisualizer";

const LaneVisualizer = lazy(() =>
  import("./LaneVisualizer").then((m) => ({ default: m.LaneVisualizer }))
);

/**
 * The lane view carries the geometry solver with it and opens on a tap, from a
 * screen the app has already painted. Loading it with the app costs every cold
 * start (on alley wifi) for a screen most sessions never open, so it arrives
 * when it is asked for.
 *
 * While it arrives, the lane's own dark screen stands in with a spinner and a
 * way out. The first open used to show nothing for as long as the chunk took,
 * long enough to be tapped again.
 */
export function LaneVisualizerLazy(props: ComponentProps<typeof LaneVisualizerType>) {
  return (
    <Suspense fallback={<LaneLoading onClose={props.onClose} />}>
      <LaneVisualizer {...props} />
    </Suspense>
  );
}

/** The lane view's night sky and a close control, until the lane has loaded. */
function LaneLoading({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Loading the lane view"
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-slate-900 text-white/70"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-slate-900/70 text-white/80 active:bg-white/10"
      >
        <X size={18} aria-hidden="true" />
      </button>
      <span
        aria-hidden="true"
        className="h-8 w-8 rounded-full border-[3px] border-white/20 border-t-amber-400 motion-safe:animate-spin"
      />
      <p role="status" className="mt-3 text-sm">
        Loading
      </p>
    </div>
  );
}
