/**
 * `bench.ts`'s compute in a browser, on the app's pool of workers
 * (`src/shotTracer/pool.ts`), to hold it to the one-thread run exactly and
 * to time it. The frames are the ones `bench.ts --dump dir` wrote; a dev
 * server serves them and this module (`pool-bench.cjs` drives a headless
 * browser through it):
 *
 *   npx tsx scripts/shot-tracker/bench.ts IMG_1996 --dump scripts/shot-tracker/out/dump --out base.json
 *   node scripts/shot-tracker/pool-bench.cjs IMG_1996 --workers 1,2,4
 */
import { FIRST_LANE_EVERY, LANE_EVERY } from "../../src/lib/shotTrack/framePick";
import { findLanes, frameLanes } from "../../src/lib/shotTrack/laneFind";
import { trace } from "../../src/lib/shotTrack/pipeline";
import type { GrayFrame } from "../../src/lib/shotTrack/types";
import type { Handedness } from "../../src/types/bowling";
import { findInPool, Pool, traceInPool } from "../../src/shotTracer/pool";
import { lanesReading, laneFrames, tracedReading, type Run } from "./bench-readings";

interface Dumped {
  name: string;
  hand: Handedness;
  width: number;
  height: number;
  times: number[];
  FIRST_PART_S: number;
}

/** `workers` 0 runs it all on the page's own thread (`findLanes`, `trace`), as a check of the browser against Node. */
export async function poolBench(dir: string, name: string, workers: number): Promise<Run> {
  const meta = (await (await fetch(`${dir}/${name}.json`)).json()) as Dumped;
  const raw = new Uint8Array(await (await fetch(`${dir}/${name}.gray`)).arrayBuffer());
  const px = meta.width * meta.height;
  const frames: GrayFrame[] = meta.times.map((t, i) => ({ width: meta.width, height: meta.height, data: new Uint8ClampedArray(raw.slice(i * px, (i + 1) * px)), t }));
  const one = workers === 0;
  const pool = new Pool(one ? 1 : workers, () => new Worker(new URL("../../src/shotTracer/pool.worker.ts", import.meta.url), { type: "module" }));
  try {
    const n = frames.length;
    const firstCount = frames.filter((f) => f.t <= frames[0].t + meta.FIRST_PART_S).length;
    const firstIdx = laneFrames(frames.slice(0, firstCount).map((f) => f.t), FIRST_LANE_EVERY);
    let t0 = performance.now();
    const first = one ? findLanes(firstIdx.map((i) => frames[i])) : await findInPool(pool, firstIdx.map((i) => frames[i]));
    const firstMs = performance.now() - t0;
    const idx = laneFrames(frames.map((f) => f.t), LANE_EVERY);
    t0 = performance.now();
    const all = one ? findLanes(idx.map((i) => frames[i])) : await findInPool(pool, idx.map((i) => frames[i]));
    const findMs = performance.now() - t0;
    let traced: Record<string, unknown> | null = null;
    const stages: Record<string, number> = {};
    let traceMs = 0;
    if (all.best) {
      t0 = performance.now();
      let stage = "";
      let since = t0;
      const onProgress = (next: string) => {
        const now = performance.now();
        if (stage) stages[stage] = Math.round(now - since);
        stage = next;
        since = now;
      };
      const input = { calibFrame: idx[all.best.index], lanes: frameLanes(all, (i) => idx[i]), hand: meta.hand, onProgress };
      const out = one ? trace({ ...input, source: { count: n, frame: (i) => frames[i] } }) : await traceInPool(pool, frames, input);
      traceMs = performance.now() - t0;
      traced = tracedReading(out);
    }
    return {
      name, frames: n, ms: { firstFind: Math.round(firstMs), find: Math.round(findMs), trace: Math.round(traceMs) },
      first: lanesReading(first, firstIdx), lane: lanesReading(all, idx), trace: traced, stages
    };
  } finally {
    pool.terminate();
  }
}
