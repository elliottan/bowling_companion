/**
 * How much the readings move with the choice of calibration frame.
 *
 *   npx tsx scripts/shot-tracker/swing.ts [shot-0N ...] [--mode one|marks|lanes] [--max 6] [--tries 10] [--step 10]
 *
 * The finder (`laneAttempts`) calibrates the lane on its best frames; the
 * clip is then traced once per attempt, each time with that attempt's frame as
 * the calibration frame, and the spread of each reading over those traces is
 * the swing. The hand-calibrated trace (`out/<clip>/hand-trace.json`, written
 * by `auto.ts`) is set beside it. Modes:
 *
 * - `one`: the attempt's own marks only, on its frame (the tracer as it was).
 * - `marks`: every attempt's marks, each with its frame, carried to the
 *   calibration frame and fitted once (`calMarks` with `frame` set).
 * - `lanes`: every attempt's lane mapping handed to the tracer as a lane of
 *   its own frame (`TraceInput.lanes`), the calibration frame only the
 *   reference the pictures are registered to.
 *
 * Writes `out/swing-<mode>.md` (one clip: `out/<clip>/swing-<mode>.md`; `--out <file>` to name it).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { laneAttempts, type Attempt } from "../../src/lib/shotTrack/laneFind";
import { trace } from "../../src/lib/shotTrack/pipeline";
import type { Metric, TrackResult } from "../../src/lib/shotTrack/types";
import { loadTruth } from "./truth";

const args = process.argv.slice(2);
const opt = (k: string) => {
  const i = args.indexOf(k);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const mode = (opt("--mode") ?? "one") as "one" | "marks" | "lanes";
const max = Number(opt("--max") ?? 6);
const tries = Number(opt("--tries") ?? 10);
const step = Number(opt("--step") ?? 10);
const outFile = opt("--out");
const here = new URL(".", import.meta.url).pathname;
const names = args.length ? [...args] : ["shot-01", "shot-02", "shot-03", "shot-04", "shot-05", "shot-06"];

type Key = "laydown" | "arrows" | "breakpoint" | "breakpointFeet" | "pins" | "speed";
const KEYS: Key[] = ["laydown", "arrows", "breakpoint", "breakpointFeet", "pins", "speed"];
const val = (m: Metric | undefined) => (m && m.value !== null ? m.value : null);
const fmt = (x: number | null | undefined, d = 1) => (x === null || x === undefined || !Number.isFinite(x) ? "-" : x.toFixed(d));

/** Up to `n` attempts spread over the clip, so the calibration frames differ. */
function spread(attempts: Attempt[], n: number): Attempt[] {
  const byFrame = [...attempts].sort((a, b) => a.found.index - b.found.index);
  if (byFrame.length <= n) return byFrame;
  return Array.from({ length: n }, (_, i) => byFrame[Math.round((i * (byFrame.length - 1)) / (n - 1))]);
}

const out: string[] = [
  `Mode \`${mode}\`. Per clip: each calibration frame's readings, then the spread (max - min) and the hand trace.`,
  "",
  "| clip | calib frame | laydown | arrows | breakpoint | at ft | pins | speed | ms |",
  "|---|---|---|---|---|---|---|---|---|"
];
const summary: string[] = ["| clip | traces | laydown | arrows | breakpoint | pins | speed | laydown - hand | arrows - hand |", "|---|---|---|---|---|---|---|---|---|"];
for (const name of names) {
  const t = loadTruth(name);
  const idx = Array.from({ length: Math.ceil(t.clip.count / step) }, (_, i) => i * step);
  const t0 = Date.now();
  const { attempts } = laneAttempts(idx.map((i) => t.clip.frame(i)), tries);
  console.log(`${name}: ${attempts.length} attempts in ${Date.now() - t0} ms (frames ${attempts.map((a) => idx[a.found.index]).join(", ")})`);
  const cache = join(here, "out", name, "hand-trace.json");
  const hand = existsSync(cache) ? (JSON.parse(readFileSync(cache, "utf8")) as { metrics: TrackResult["metrics"] | null }).metrics : null;
  const marksOf = (a: Attempt) => a.found.marks.map((m) => ({ ...m, frame: idx[a.found.index] }));
  const all = attempts.flatMap(marksOf);
  const lanes = attempts.map((a) => ({ frame: idx[a.found.index], H: a.found.H, quality: a.quality }));
  const readings: Record<Key, number[]> = { laydown: [], arrows: [], breakpoint: [], breakpointFeet: [], pins: [], speed: [] };
  let n = 0;
  for (const a of spread(attempts, max)) {
    const frame = idx[a.found.index];
    const t1 = Date.now();
    const input = { source: t.clip, calibFrame: frame, hand: t.cal.hand, register: t.cal.register };
    const r =
      mode === "one" ? trace({ ...input, calMarks: a.found.marks }) :
      mode === "marks" ? trace({ ...input, calMarks: all }) :
      trace({ ...input, lanes });
    const ms = Date.now() - t1;
    if (!r.result.ok) {
      console.log(`   ${frame}: failed ${r.result.failure} ${r.result.detail} (${ms} ms)`);
      out.push(`| ${name} | ${frame} | failed: ${r.result.failure} | | | | | | ${ms} |`);
      continue;
    }
    n++;
    const m = (r.result as TrackResult).metrics;
    for (const k of KEYS) {
      const v = val(m[k]);
      if (v !== null) readings[k].push(v);
    }
    // How the laydown was read: over the foul line by following the ball back (r), or off the path (p).
    const how = r.debug.release ? `r${r.debug.release.at.toFixed(1)}` : "p";
    const row = `| ${name} | ${frame} | ${fmt(val(m.laydown))} ${how} | ${fmt(val(m.arrows))} | ${fmt(val(m.breakpoint))} | ${fmt(val(m.breakpointFeet), 0)} | ${fmt(val(m.pins))} | ${fmt(val(m.speed))} | ${ms} |`;
    console.log("   " + row);
    out.push(row);
  }
  const range = (k: Key) => (readings[k].length ? Math.max(...readings[k]) - Math.min(...readings[k]) : NaN);
  const meanOff = (k: Key) => {
    const h = val(hand?.[k]);
    return h === null || !readings[k].length ? NaN : readings[k].reduce((s, x) => s + x - h, 0) / readings[k].length;
  };
  const cell = (k: Key) => `${fmt(range(k))} (${readings[k].length})`;
  summary.push(`| ${name} | ${n} | ${cell("laydown")} | ${cell("arrows")} | ${cell("breakpoint")} | ${cell("pins")} | ${cell("speed")} | ${fmt(meanOff("laydown"))} | ${fmt(meanOff("arrows"))} |`);
  out.push(`| ${name} | hand | ${fmt(val(hand?.laydown))} | ${fmt(val(hand?.arrows))} | ${fmt(val(hand?.breakpoint))} | ${fmt(val(hand?.breakpointFeet), 0)} | ${fmt(val(hand?.pins))} | ${fmt(val(hand?.speed))} | |`);
}
const text = [...out, "", "Spread (max - min, with the number of traces that gave the reading), and the mean reading less the hand trace's:", "", ...summary].join("\n") + "\n";
const file = outFile ?? (names.length === 1 ? join(here, "out", names[0], `swing-${mode}.md`) : join(here, "out", `swing-${mode}.md`));
mkdirSync(join(file, ".."), { recursive: true });
writeFileSync(file, text);
console.log("\n" + text);
