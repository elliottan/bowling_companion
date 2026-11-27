/**
 * The shot tracer's regression check: the app's own read (`app-read.ts`) on a
 * set of real videos, each reading held to the margin in `regress/expected.json`.
 *
 *   npx tsx scripts/shot-tracker/regress.ts                 # every video in the manifest
 *   npx tsx scripts/shot-tracker/regress.ts --only IMG_2986 # the videos whose name contains this
 *   npx tsx scripts/shot-tracker/regress.ts --update        # rewrite expected.json from the current reads (an intended change)
 *   npx tsx scripts/shot-tracker/regress.ts --verbose       # every reading, not just the ones that are not plain passes
 *   npx tsx scripts/shot-tracker/regress.ts --gray phone    # an HDR video decoded as a phone's decoder gives it (`app-read.ts`)
 *
 * Videos come from the repo (`fixtures/clips/`) or from the release asset
 * unzipped into `SHOT_CLIPS_DIR` (default `scripts/shot-tracker/out/shot-clips`),
 * each release video checked against its sha256 in the manifest. A release
 * video that is absent is skipped with a warning, or fails when
 * `SHOT_CLIPS_REQUIRED=1`. Exit 1 on any failure. Four videos at a time, each
 * in its own process (`--child`), as many as the cores allow up to four.
 *
 * Per reading the manifest holds a value, whether it is `measured` or
 * `estimated` (app-read prints a trailing `e`), and a tolerance (the
 * `tolerance` block, or a `tol` on the reading), or `null`: must not be read.
 * A `known` beside a reading is an owner-corrected value: the reading is still
 * held to our current value, and the report prints the gap without failing.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hdrSource, type GrayMode } from "./app-read";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const MANIFEST = join(HERE, "regress", "expected.json");
const REPO_CLIPS = join(HERE, "fixtures", "clips");
const CHILD_MARK = "@@regress@@";

const READINGS = ["laydown", "arrows", "breakpoint", "breakpointFeet", "pins", "launchSpeed", "entrySpeed"] as const;
type Reading = (typeof READINGS)[number];
type State = "measured" | "estimated";
const UNIT: Record<Reading, string> = { laydown: "bd", arrows: "bd", breakpoint: "bd", breakpointFeet: "ft", pins: "bd", launchSpeed: "mph", entrySpeed: "mph" };

interface Expect {
  value: number;
  state: State;
  /** Overrides the manifest's tolerance for this reading. */
  tol?: number;
  /** An owner-corrected value: reported against ours, never failing. */
  known?: { value: number; note: string };
}
interface Entry {
  file: string;
  from: "repo" | "release";
  hand?: "left" | "right";
  sha256?: string;
  bytes?: number;
  readings: Record<Reading, Expect | null>;
}
interface Manifest {
  release: { tag: string; asset: string };
  tolerance: Record<Reading, number>;
  videos: Entry[];
}
interface Got {
  value: number;
  state: State;
}
interface Result {
  hand: string | null;
  readings: Record<Reading, Got | null>;
  /** Why nothing was read, when nothing was. */
  note: string | null;
  seconds: number;
}

/** app-read's value text ("12.1324", "6.4981e") as a number and its state. */
function parseValue(v: unknown): Got | null {
  if (typeof v !== "string") return null;
  return { value: Number(v.replace(/e$/, "")), state: v.endsWith("e") ? "estimated" : "measured" };
}

/** Child: read one video in this process and print the result as one marked line. */
async function child(path: string, gray: GrayMode): Promise<void> {
  const t0 = Date.now();
  const { appRead, traceRead } = await import("./app-read");
  const { tracedReading } = await import("./bench-readings");
  const r = await appRead(path, gray);
  let note: string | null = null;
  let reading: Record<string, unknown> | null = null;
  let hand: string | null = null;
  if (!r) note = "no shot read";
  else {
    // `--hand auto`: the hand read from the video, as the app does.
    const out = traceRead(r.frames, "right", true);
    if (!out) note = "no lane found";
    else {
      reading = tracedReading(out);
      if (out.result.ok) hand = out.result.hand;
      else note = `trace failed: ${String(reading.failure)}`;
    }
  }
  const readings = Object.fromEntries(READINGS.map((k) => [k, parseValue(reading?.[k])])) as Record<Reading, Got | null>;
  const result: Result = { hand, readings, note, seconds: (Date.now() - t0) / 1000 };
  process.stdout.write(`\n${CHILD_MARK}${JSON.stringify(result)}\n`);
}

function readInChild(path: string, gray: GrayMode): Promise<Result> {
  return new Promise((done, fail) => {
    const p = spawn(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url), "--child", path, "--gray", gray], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d: Buffer) => (out += d.toString()));
    p.stderr.on("data", (d: Buffer) => (err += d.toString()));
    p.on("error", fail);
    p.on("close", (code) => {
      const line = out.split("\n").find((l) => l.startsWith(CHILD_MARK));
      if (code === 0 && line) done(JSON.parse(line.slice(CHILD_MARK.length)) as Result);
      else fail(new Error(`read exited ${code}: ${(err || out).trim().split("\n").slice(-4).join(" | ")}`));
    });
  });
}

async function pool<T, R>(items: T[], size: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await work(items[i]);
      }
    })
  );
  return out;
}

const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const num = (n: number) => n.toFixed(2);
const show = (g: { value: number; state: State } | null) => (g ? `${num(g.value)}${g.state === "estimated" ? "e" : ""}` : "none");

interface Row {
  video: string;
  reading: string;
  expected: string;
  got: string;
  verdict: "ok" | "known" | "FAIL";
  why: string;
}

function compare(entry: Entry, tolerance: Manifest["tolerance"], r: Result): Row[] {
  const rows: Row[] = [];
  const row = (reading: string, expected: string, got: string, verdict: Row["verdict"], why = "") => rows.push({ video: entry.file, reading, expected, got, verdict, why });
  if (r.note && READINGS.every((k) => !r.readings[k])) row("read", "a trace", r.note, "FAIL", r.note);
  if (entry.hand) row("hand", entry.hand, r.hand ?? "none", r.hand === entry.hand ? "ok" : "FAIL", r.hand === entry.hand ? "" : "hand changed");
  for (const k of READINGS) {
    const want = entry.readings[k];
    const got = r.readings[k];
    const name = `${k} ${UNIT[k]}`;
    if (!want) {
      row(name, "none", show(got), got ? "FAIL" : "ok", got ? "must not be read" : "");
      continue;
    }
    const tol = want.tol ?? tolerance[k];
    const exp = `${show(want)} ±${tol}`;
    if (!got) {
      row(name, exp, "none", "FAIL", "no longer read");
      continue;
    }
    const gap = got.value - want.value;
    const problems: string[] = [];
    if (Math.abs(gap) > tol) problems.push(`moved ${gap > 0 ? "+" : ""}${num(gap)}`);
    if (got.state !== want.state) problems.push(`now ${got.state}`);
    if (problems.length) row(name, exp, show(got), "FAIL", problems.join(", "));
    else if (want.known) row(name, exp, show(got), "known", `owner ${num(want.known.value)}, gap ${num(got.value - want.known.value)}: ${want.known.note}`);
    else row(name, exp, show(got), "ok");
  }
  return rows;
}

function table(rows: Row[]): string {
  const cols: (keyof Row)[] = ["video", "reading", "expected", "got", "verdict"];
  const w = cols.map((c) => Math.max(c.length, ...rows.map((r) => r[c].length)));
  const line = (r: Record<string, string>) => cols.map((c, i) => r[c].padEnd(w[i])).join("  ").trimEnd() + (r.why ? `  ${r.why}` : "");
  return [line(Object.fromEntries(cols.map((c) => [c, c]))), ...rows.map((r) => line({ ...r }))].join("\n");
}

function updated(entry: Entry, r: Result, tolerance: Manifest["tolerance"]): { entry: Entry; diff: string[] } {
  const diff: string[] = [];
  const readings = {} as Record<Reading, Expect | null>;
  for (const k of READINGS) {
    const was = entry.readings[k];
    const got = r.readings[k];
    if (!got) readings[k] = null;
    else readings[k] = { value: Number(got.value.toFixed(4)), state: got.state, ...(was?.tol !== undefined && was.tol !== tolerance[k] ? { tol: was.tol } : {}), ...(was?.known ? { known: was.known } : {}) };
    if (show(was) !== show(readings[k]) && !(was && readings[k] && was.value === readings[k]!.value && was.state === readings[k]!.state)) diff.push(`${entry.file} ${k}: ${show(was)} -> ${show(readings[k])}`);
  }
  const hand = r.hand === "left" || r.hand === "right" ? r.hand : entry.hand;
  if (hand !== entry.hand) diff.push(`${entry.file} hand: ${entry.hand ?? "none"} -> ${hand ?? "none"}`);
  return { entry: { ...entry, ...(hand ? { hand } : {}), readings }, diff };
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (k: string) => args.includes(k);
  const opt = (k: string) => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const gray = (opt("--gray") ?? "full") as GrayMode;
  if (!["decoded", "full", "phone"].includes(gray)) throw new Error(`--gray ${gray}: decoded, full or phone`);
  // The manifest holds the app's own decode: another is only compared with it.
  if (gray !== "full" && flag("--update")) throw new Error(`--update reads with --gray full only (got --gray ${gray})`);
  const childPath = opt("--child");
  if (childPath) return child(childPath, gray);

  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as Manifest;
  const only = opt("--only");
  const required = process.env.SHOT_CLIPS_REQUIRED === "1";
  const clipsDir = resolve(ROOT, process.env.SHOT_CLIPS_DIR ?? "scripts/shot-tracker/out/shot-clips");
  const warnings: string[] = [];
  const failures: string[] = [];
  const todo: { entry: Entry; path: string }[] = [];

  for (const entry of manifest.videos) {
    if (only && !entry.file.includes(only)) continue;
    const path = join(entry.from === "repo" ? REPO_CLIPS : clipsDir, entry.file);
    if (!existsSync(path)) {
      const msg = `${entry.file}: not found at ${path}${entry.from === "release" ? ` (release ${manifest.release.tag}, SHOT_CLIPS_DIR)` : ""}`;
      if (entry.from === "release" && !required) warnings.push(`skipped, ${msg}`);
      else failures.push(msg);
      continue;
    }
    if (entry.sha256 && sha256(path) !== entry.sha256) {
      failures.push(`${entry.file}: sha256 differs from the manifest, so this is not the clip the margins were set on`);
      continue;
    }
    // A phone decodes any other video as the app's own read does: only the HDR ones read otherwise.
    if (gray === "phone" && !(await hdrSource(path))) continue;
    todo.push({ entry, path });
  }
  if (only && !manifest.videos.some((e) => e.file.includes(only))) failures.push(`--only ${only}: no such video in the manifest`);

  const workers = Math.max(1, Math.min(4, cpus().length));
  const t0 = Date.now();
  const results = await pool(todo, workers, async ({ entry, path }) => {
    try {
      const r = await readInChild(path, gray);
      console.log(`read ${entry.file} (${r.seconds.toFixed(1)} s)`);
      return r;
    } catch (e) {
      failures.push(`${entry.file}: ${(e as Error).message}`);
      return null;
    }
  });
  const wall = (Date.now() - t0) / 1000;

  if (flag("--update")) {
    const diff: string[] = [];
    const next = manifest.videos.map((entry) => {
      const i = todo.findIndex((t) => t.entry === entry);
      const r = i >= 0 ? results[i] : null;
      if (!r) return entry;
      const u = updated(entry, r, manifest.tolerance);
      diff.push(...u.diff);
      return u.entry;
    });
    writeFileSync(MANIFEST, JSON.stringify({ ...manifest, videos: next }, null, 2) + "\n");
    console.log(diff.length ? `\nexpected.json changed:\n${diff.join("\n")}` : "\nexpected.json unchanged");
    for (const f of failures) console.log(`not updated: ${f}`);
    return;
  }

  const rows: Row[] = [];
  const perVideo: { file: string; seconds: number; fails: number; known: number; total: number }[] = [];
  todo.forEach(({ entry }, i) => {
    const r = results[i];
    if (!r) return;
    const rs = compare(entry, manifest.tolerance, r);
    rows.push(...rs);
    perVideo.push({ file: entry.file, seconds: r.seconds, fails: rs.filter((x) => x.verdict === "FAIL").length, known: rs.filter((x) => x.verdict === "known").length, total: rs.length });
  });
  for (const r of rows) if (r.verdict === "FAIL") failures.push(`${r.video} ${r.reading}: ${r.why} (expected ${r.expected}, got ${r.got})`);

  const shown = flag("--verbose") ? rows : rows.filter((r) => r.verdict !== "ok");
  console.log(`\n${shown.length ? table(shown) : "every reading is within its margin"}`);
  console.log("");
  for (const v of perVideo) console.log(`${v.fails ? "FAIL" : "ok  "}  ${v.file.padEnd(28)} ${v.total - v.fails}/${v.total} within margin${v.known ? `, ${v.known} with a known gap` : ""}  (${v.seconds.toFixed(1)} s)`);
  for (const w of warnings) console.log(`WARNING ${w}`);
  const verdictLine = `${failures.length ? "FAILED" : "passed"}: ${perVideo.length} videos read, ${rows.filter((r) => r.verdict === "FAIL").length} readings outside their margin, ${failures.length} problems, ${warnings.length} skipped; ${wall.toFixed(0)} s with ${workers} workers`;
  console.log(`\n${verdictLine}`);
  for (const f of failures) console.log(`  - ${f}`);

  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) {
    const md = [`### Shot tracer regression: ${verdictLine}`, "", "| Video | Reading | Expected | Got | Verdict |", "|---|---|---|---|---|"];
    for (const r of rows.filter((x) => flag("--verbose") || x.verdict !== "ok")) md.push(`| ${r.video} | ${r.reading} | ${r.expected} | ${r.got} | ${r.verdict}${r.why ? `: ${r.why}` : ""} |`);
    md.push("", "| Video | Within margin | Seconds |", "|---|---|---|");
    for (const v of perVideo) md.push(`| ${v.file} | ${v.total - v.fails}/${v.total} | ${v.seconds.toFixed(1)} |`);
    for (const w of warnings) md.push("", `> Warning: ${w}`);
    for (const f of failures.filter((x) => !x.includes("(expected"))) md.push("", `> Problem: ${f}`);
    appendFileSync(summary, md.join("\n") + "\n");
  }
  if (failures.length) process.exitCode = 1;
}

await main();
