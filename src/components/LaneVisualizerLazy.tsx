import { Suspense, lazy } from "react";
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
 * No fallback UI: the chunk is small and local, and a spinner for one frame
 * reads worse than the overlay simply appearing.
 */
export function LaneVisualizerLazy(props: ComponentProps<typeof LaneVisualizerType>) {
  return (
    <Suspense fallback={null}>
      <LaneVisualizer {...props} />
    </Suspense>
  );
}
