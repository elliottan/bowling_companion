/**
 * The full-size synthetic grid of plan 10.1, too slow for the unit suite:
 * clip-sized frames (the sample clips' 1080 x 806 and 720 x 536 bands, with
 * the lane as small as it is in them), 30 and 60 fps, both hands, the camera
 * a step or a lane to the side, with and without the body.
 *
 *   npx tsx scripts/shot-tracker/synthetic-grid.ts          # 8 cases
 *   npx tsx scripts/shot-tracker/synthetic-grid.ts --all    # 32 cases
 *
 * Prints, per case, the error in boards at the laydown, arrows, breakpoint
 * and pins, and in mph for the speed, against the renderer's truth.
 */
import { trace } from "../../src/lib/shotTrack/pipeline";
import { roughMarks, standardShot, syntheticSource, truthBoard, truthSpeedMph } from "../../src/lib/shotTrack/syntheticSource";

const all = process.argv.includes("--all");
const sizes = [[1080, 806], [720, 536]];
const cases = [];
for (const [w, h] of sizes) for (const fps of [30, 60]) for (const hand of ["right", "left"] as const) for (const side of all ? [1.5, 5] : [1.5]) for (const body of all ? [false, true] : [true]) {
  if (!all && ((w === 720) !== (fps === 30))) continue;
  cases.push({ w, h, fps, hand, side: hand === "right" ? side : -side, body });
}
console.log("| Size | fps | Hand | Side ft | Body | Laydown | Arrows | Breakpoint | Pins | Speed mph | Seen |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
for (const c of cases) {
  // The lane spans about 7% of the width at the pins in the sample clips.
  const spec = standardShot({ width: c.w, height: c.h, fps: c.fps, hand: c.hand, side: c.side, body: c.body, fill: 0.075 });
  const src = syntheticSource(spec);
  const calib = src.count - 2;
  const r = trace({ source: src, calibFrame: calib, marks: roughMarks(spec, calib), hand: c.hand }).result;
  const head = `| ${c.w}x${c.h} | ${c.fps} | ${c.hand} | ${Math.abs(c.side)} | ${c.body ? "yes" : "no"} |`;
  if (!r.ok) {
    console.log(`${head} failed: ${r.failure} | | | | | |`);
    continue;
  }
  let bp = { b: Infinity, v: 0 };
  for (let v = 0; v <= 60; v += 0.05) if (truthBoard(spec, v) < bp.b) bp = { b: truthBoard(spec, v), v };
  const e = (x: number | null, t: number) => (x === null ? "missing" : (x - t).toFixed(2));
  const m = r.metrics;
  console.log(`${head} ${e(m.laydown.value, truthBoard(spec, 0))} | ${e(m.arrows.value, truthBoard(spec, 15))} | ${e(m.breakpoint.value, bp.b)} | ${e(m.pins.value, truthBoard(spec, 60))} | ${e(m.speed.value, truthSpeedMph(spec, r.from, r.to))} | ${r.from.toFixed(0)} to ${r.to.toFixed(0)} ft |`);
}
