import { t } from "@lingui/core/macro";
import { Camera, FileVideo } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { HandednessPicker } from "../components/HandednessPicker";
import { PushScreen } from "../components/PushScreen";
import { Button } from "../components/ui/Button";
import { Spinner } from "../components/ui/Spinner";
import { formatNumber } from "../lib/format";
import { handNote, type HandFound } from "../lib/shotTrack/handFind";
import { apply } from "../lib/shotTrack/homography";
import { BACK_ROW_FT, laneU, LEFT_U, RIGHT_U } from "../lib/shotTrack/laneModel";
import type { FrameLane } from "../lib/shotTrack/laneTrack";
import { laneVerdict, type LaneEvidence, type LaneVerdict } from "../lib/shotTrack/laneVerdict";
import { foundNote, Notes, timesNote } from "../lib/shotTrack/notes";
import { glimpseIndices } from "../lib/shotTrack/lookFrame";
import { MARK_LINES, pathInPicture, type MarkLine } from "../lib/shotTrack/marking";
import { FIRST_LANE_EVERY, gridFrames, LANE_EVERY, readStep } from "../lib/shotTrack/framePick";
import { laneBands, readFrom, ShotSearch, type Band, type CoarseFrame, type ShotFound } from "../lib/shotTrack/shotStart";
import type { GrayFrame, Mat3, Metric, Point, TrackError, TrackFailure, TrackResult } from "../lib/shotTrack/types";
import { frameLanes } from "../lib/shotTrack/laneFind";
import { handedMetrics } from "../lib/shotTrack/pathFit";
import type { TraceOutput } from "../lib/shotTrack/pipeline";
import { poolSize } from "../lib/shotTrack/workers";
import { isIOSApp } from "../lib/platform";
import { findInPool, Pool, traceInPool, WorkerCrash } from "../shotTracer/pool";
import { InlineWorker } from "../shotTracer/inlineWorker";
import type { FindMessage } from "../shotTracer/protocol";
import { SearchClient } from "../shotTracer/searchClient";
import { breakFlags, startBroken } from "../shotTracer/workerFault";
// Imported as addresses, never as `new URL("x.worker.ts", import.meta.url)`
// handed to `new Worker` elsewhere: Vite builds a worker only when the two are
// written together, and otherwise inlines the TypeScript source as a data URL
// that no browser can run (0.112.0 to 0.113.0: the search never ran).
import poolWorkerUrl from "../shotTracer/pool.worker.ts?worker&url";
import searchWorkerUrl from "../shotTracer/search.worker.ts?worker&url";
import { readShot } from "../shotTracer/readShot";
import { readVideoFrames, scanVideo, type VideoFrames } from "../shotTracer/videoFrames";
import type { Handedness } from "../types/bowling";

/**
 * The shot tracer, in Labs (Settings, behind seven taps on the version line):
 * a video recorded or chosen, with nothing more asked of the bowler. A first
 * look over the whole video finds the shot (the ball's run up the lane,
 * `lib/shotTrack/shotStart.ts`) and, in a portrait video, the band of the
 * picture the lane is in; the shot alone, from the foul line until the ball
 * has left the pin deck (`shotTracer/readShot.ts`), is read at full quality,
 * the lane is found in a worker, and the tracer (`lib/shotTrack`) runs in
 * another, its readings shown on the frame. For the owner to try on real shots before it
 * is part of a session.
 */

/**
 * How long each stage took, seconds, and how the video was read: a line on
 * the result screen and in the console, for the owner's runs on a phone.
 */
interface Timing {
  via: string;
  look: number;
  read: number;
  lane: number;
  trace: number;
}

/** A frame as the tracer saw it, for the pictures under the details: gray, with the found lane drawn on it when there is one. */
interface Glimpse {
  gray: Uint8ClampedArray;
  width: number;
  height: number;
  t: number;
  H?: Mat3 | null;
}

/** The pictures under the details: the first look's frames, then a frame of the first part read. */
interface Glimpses {
  look: Glimpse[];
  band: Glimpse | null;
}

type Step =
  /** `why`: what the reader said when the video couldn't be read, for the details line. */
  | { kind: "pick"; unreadable?: boolean; why?: string; details?: string }
  | { kind: "searching"; fraction: number }
  | { kind: "reading"; fraction: number }
  | { kind: "finding" }
  | { kind: "tracing"; fraction: number }
  /** The shot or the lane was not found: nothing to trace. */
  | { kind: "failed"; missing: "shot" | "lane"; details?: string; pictures?: Glimpses }
  | { kind: "done"; result: TrackResult | TrackError; H: Mat3 | null; verdict: LaneVerdict | null; timing?: Timing; details?: string; pictures?: Glimpses };

/** The lane as the finder found it: on every frame it could, and what it knows about how sure it is. */
interface Found {
  lanes: FrameLane[];
  evidence: LaneEvidence;
}

/** Milliseconds, for the stage times (read in the screen's handlers, never in render). */
const now = () => performance.now();
/**
 * The longest the screen waits for the shot search's answer once it has every
 * frame, or for a lane search, milliseconds. Each takes seconds (the search
 * one or two after its last frame, the lane a third of a second a frame on a
 * phone, 24 frames); past this the worker is taken to have failed.
 */
const WORKER_WAIT_MS = 60_000;

/** Each line's colour on the picture. */
const LINE_TONE: Record<MarkLine, string> = {
  left: "stroke-accent",
  right: "stroke-accent",
  foul: "stroke-danger-600",
  pinrow: "stroke-warning-700"
};

export function ShotTracerView({ handedness, onBack }: { handedness: Handedness; onBack: () => void }) {
  const [step, setStep] = useState<Step>({ kind: "pick" });
  // The frame the lane was found best on, kept for the result: the frames
  // themselves go to the worker.
  const [shown, setShown] = useState<{ gray: Uint8ClampedArray; width: number; height: number } | null>(null);
  const workers = useRef(new Set<Worker>());
  const pool = useRef<Pool | null>(null);
  // The attempt the pool was made for.
  const poolOf = useRef(0);
  // Each video chosen is a new attempt; an older one's late answers are dropped.
  const attempt = useRef(0);
  // This attempt's stage times so far, milliseconds.
  const timing = useRef({ via: "", look: 0, read: 0, lane: 0, trace: 0 });
  // What this attempt did, for the details block on its end screen.
  const notes = useRef(new Notes());
  // What this attempt saw, for the pictures under the details.
  const glimpses = useRef<Glimpses>({ look: [], band: null });

  useEffect(
    () => () => {
      for (const w of workers.current) w.terminate();
      workers.current.clear();
      pool.current?.terminate();
      pool.current = null;
    },
    []
  );

  /** A worker of the tracer's, or one broken on purpose (`?tracerBreak=`, the harness's). */
  function startWorker(url: string, which: "search" | "pool"): Worker {
    const broken = breakFlags(window.location.search)[which];
    const worker = broken ? startBroken(broken).worker : new Worker(url, { type: "module" });
    workers.current.add(worker);
    return worker;
  }

  /** Looks for the shot over the whole video, the small frames going to a worker as they are drawn. */
  async function search(f: File, mine: number): Promise<{ found: ShotFound | null; width: number; height: number; duration: number }> {
    let started: Worker | null = null;
    const client = new SearchClient(() => (started = startWorker(searchWorkerUrl, "search")), {
      url: searchWorkerUrl,
      makeSearch: () => new ShotSearch(),
      note: (text) => notes.current.add("search worker", text),
      // The search has every frame by now and answers in a second or two; a
      // worker that never answers (seen once, after four minutes) is a video
      // that couldn't be read, not a screen that waits for ever.
      answerMs: WORKER_WAIT_MS
    });
    // The look's frames, kept by reference until three are picked for the pictures (the search is sent copies).
    const seen: CoarseFrame[] = [];
    try {
      const video = await scanVideo(
        f,
        (frame) => {
          seen.push(frame);
          client.push(frame);
        },
        (fraction) => {
          if (attempt.current === mine) setStep({ kind: "searching", fraction });
        },
        notes.current
      );
      glimpses.current.look = glimpseIndices(
        seen.map((s) => s.t),
        video.duration
      ).map((i) => ({ gray: new Uint8ClampedArray(seen[i].data), width: seen[i].width, height: seen[i].height, t: seen[i].t }));
      seen.length = 0;
      const asked = performance.now();
      const answer = await client.finish();
      console.info(`Shot tracer: the search answered in ${((performance.now() - asked) / 1000).toFixed(1)} s after its last frame${answer.fallback ? `, on the main thread (the worker ${answer.fallback})` : ""}`);
      return { ...video, found: answer.found };
    } finally {
      client.stop();
      if (started) workers.current.delete(started);
    }
  }

  async function choose(f: File | undefined) {
    if (!f) return;
    const mine = ++attempt.current;
    for (const w of workers.current) w.terminate();
    workers.current.clear();
    pool.current?.terminate();
    pool.current = null;
    setStep({ kind: "searching", fraction: 0 });
    timing.current = { via: "", look: 0, read: 0, lane: 0, trace: 0 };
    notes.current = new Notes();
    glimpses.current = { look: [], band: null };
    notes.current.set("app", `Headpin ${__APP_VERSION__}, ${f.type || "?"} ${(f.size / 1e6).toFixed(1)} MB, ${navigator.userAgent}`);
    const began = now();
    let looked: Awaited<ReturnType<typeof search>>;
    let from: number | null;
    let bands: (Band | null)[];
    try {
      looked = await search(f, mine);
      from = readFrom(looked.duration, looked.found);
      bands = laneBands(looked.width, looked.height, looked.found);
    } catch (e) {
      unreadable(e, mine);
      return;
    }
    if (attempt.current === mine) timing.current.look = now() - began;
    if (attempt.current !== mine) return;
    const found = looked.found;
    console.info(
      `Shot tracer: ${found ? `ball seen from ${found.release.toFixed(2)} s, pins ${found.pinHit?.toFixed(2) ?? "not seen"}, confidence ${found.confidence.toFixed(2)}` : "no shot found"}; ` +
        `reading from ${from?.toFixed(2) ?? "nowhere"} s, rows ${bands.map((b) => (b ? `${b.top.toFixed(2)} to ${b.bottom.toFixed(2)}` : "all")).join(", then ")}`
    );
    notes.current.set(
      "search",
      `${foundNote(found)}; read from ${from?.toFixed(2) ?? "nowhere"} s; bands ${bands.map((b) => (b ? `${b.top.toFixed(2)}-${b.bottom.toFixed(2)}` : "all")).join(", ")}`
    );
    if (from === null) setStep({ kind: "failed", missing: "shot", details: details(), pictures: pictures() });
    else void readBand(f, looked, bands, mine);
  }

  /** Back to the start, saying the video couldn't be read and what the reader said. */
  function unreadable(e: unknown, mine: number) {
    const why = e instanceof Error ? e.message : String(e);
    console.info(`Shot tracer: the video couldn't be read: ${why}`);
    if (attempt.current === mine) setStep({ kind: "pick", unreadable: true, why, details: details() });
  }

  /** The details block's text so far, with the stage times; also to the console. */
  function details(): string {
    notes.current.set("times", timesNote(timing.current));
    const text = notes.current.text();
    console.info(`Shot tracer details:\n${text}`);
    return text;
  }

  /** The pictures so far, for an end screen. */
  function pictures(): Glimpses {
    return { look: [...glimpses.current.look], band: glimpses.current.band };
  }

  /** Reads the shot in the first band left, then looks for the lane there. */
  async function readBand(f: File, looked: { found: ShotFound | null; width: number; height: number; duration: number }, bands: (Band | null)[], mine: number) {
    setStep({ kind: "reading", fraction: 0 });
    let v: VideoFrames;
    const began = now();
    let counted = false;
    try {
      const read = await readShot(
        (plan, onRead) => readVideoFrames(f, onRead, plan, notes.current),
        looked.found,
        looked,
        bands[0],
        // The lane on a few of the first part's frames, for where the shot ends.
        async (first) => {
          const m = await findOn(first, FIRST_LANE_EVERY, mine);
          // The first part of the first band, as read, with the lane where it was found.
          if (!glimpses.current.band && first.gray.length) {
            const at = m.frame ?? first.gray.length >> 1;
            const H = m.frame === null ? null : (m.lanes.find((l) => l.frame === m.frame)?.H ?? null);
            glimpses.current.band = { gray: first.gray[at].slice(), width: first.width, height: first.height, t: first.times[at], H };
          }
          return m.frame === null ? null : m.lanes;
        },
        (fraction) => {
          if (attempt.current === mine) setStep({ kind: "reading", fraction });
        },
        bands.length === 1,
        notes.current
      );
      if (read === "no-shot") {
        if (attempt.current === mine) {
          timing.current.read += now() - began;
          counted = true;
          setStep({ kind: "failed", missing: "shot", details: details(), pictures: pictures() });
        }
        return;
      }
      if (read === "no-lane") {
        // No lane on the first part in this band: the next, read again.
        if (attempt.current === mine) void readBand(f, looked, bands.slice(1), mine);
        return;
      }
      v = read.frames;
      if (v.gray.length < 10) throw new Error(`only ${v.gray.length} frames read (${v.via ?? "?"})`);
    } catch (e) {
      if (attempt.current === mine) {
        timing.current.read += now() - began;
        counted = true;
      }
      unreadable(e, mine);
      return;
    } finally {
      if (attempt.current === mine && !counted) timing.current.read += now() - began;
    }
    if (attempt.current !== mine) return;
    timing.current.via = v.via ?? "";
    setStep({ kind: "finding" });
    const finding = now();
    const m = await findOn(v, LANE_EVERY, mine);
    if (attempt.current !== mine) return;
    timing.current.lane += now() - finding;
    notes.current.add("lane", m.frame !== null ? `found on ${m.lanes.length} of ${m.looked}, best frame ${m.frame}, camera ${m.evidence.camera?.toFixed(1) ?? "?"} ft` : `not found on ${v.gray.length} frames`);
    if (m.frame !== null) void traceShot(v, m.frame, { lanes: m.lanes, evidence: m.evidence }, mine);
    // Not found in this band: the next, read again, or nothing to trace.
    else if (bands.length > 1) void readBand(f, looked, bands.slice(1), mine);
    else setStep({ kind: "failed", missing: "lane", details: details(), pictures: pictures() });
  }

  /**
   * The pool of workers the lane search and the trace share (`shotTracer/pool.ts`):
   * one per attempt, made when first needed. `?tracerWorkers=N` in the
   * address sets how many (the harness's runs with 1, 2 and 4).
   */
  function poolFor(mine: number): Pool {
    if (pool.current && poolOf.current === mine) return pool.current;
    pool.current?.terminate();
    const asked = Number(new URLSearchParams(window.location.search).get("tracerWorkers") ?? NaN);
    const ios = isIOSApp() || /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const size = poolSize(navigator.hardwareConcurrency, ios, Number.isFinite(asked) ? asked : null);
    const broken = breakFlags(window.location.search).pool;
    pool.current = new Pool(size, () => (broken ? startBroken(broken).worker : new Worker(poolWorkerUrl, { type: "module" })), {
      url: poolWorkerUrl,
      onNote: (text) => notes.current.add("pool", text)
    });
    poolOf.current = mine;
    console.info(`Shot tracer: ${size} worker${size === 1 ? "" : "s"} (${navigator.hardwareConcurrency ?? "?"} cores reported)`);
    return pool.current;
  }

  /**
   * A pool of one on the screen's own thread (`InlineWorker`), for a search
   * or trace run again after a worker failed while working: the same jobs,
   * the same readings, slower.
   */
  function inlinePool(mine: number): Pool {
    pool.current?.terminate();
    pool.current = new Pool(1, () => new InlineWorker(), { url: "main thread" });
    poolOf.current = mine;
    return pool.current;
  }

  /** The read's frames as the tracer takes them. */
  const framesOf = (v: VideoFrames): GrayFrame[] => v.gray.map((data, i) => ({ width: v.width, height: v.height, data, t: v.times[i] }));

  /**
   * Looks for the lane on the frames of `v` on a grid `every` seconds apart
   * from the video's start (`gridFrames`: the same frames however much lead
   * the read has), in the pool; a null frame when it is not found or the pool
   * fails.
   */
  async function findOn(v: VideoFrames, every: number, mine: number): Promise<FindMessage & { looked: number }> {
    const all = framesOf(v);
    const idx = gridFrames(v.times, every, v.step || readStep(v.times));
    let timer: ReturnType<typeof setTimeout> | undefined;
    // A search that never answers is a lane not found, not a screen that waits for ever.
    const late = new Promise<"late">((resolve) => (timer = setTimeout(() => resolve("late"), WORKER_WAIT_MS)));
    const frames = idx.map((i) => all[i]);
    try {
      let found: Awaited<ReturnType<typeof findInPool>> | "late";
      try {
        found = await Promise.race([findInPool(poolFor(mine), frames), late]);
      } catch (e) {
        // A worker that failed while working may have lost what it kept: the whole search again, on this thread.
        if (!(e instanceof WorkerCrash) || attempt.current !== mine) throw e;
        notes.current.add("pool", `${e.message}; the lane search ran again on the main thread`);
        found = await Promise.race([findInPool(inlinePool(mine), frames), late]);
      }
      if (found === "late") {
        console.info(`Shot tracer: the lane search did not answer in ${WORKER_WAIT_MS / 1000} s`);
        // Its workers may be stuck: the next search or trace starts a new pool.
        pool.current?.terminate();
        pool.current = null;
        return { frame: null, looked: idx.length };
      }
      const best = found.best;
      if (!best) return { frame: null, looked: idx.length };
      return {
        looked: idx.length,
        frame: idx[best.index],
        lanes: frameLanes(found, (i) => idx[i]),
        evidence: { guess: best.guess, support: best.support, pinsUsed: best.pinsUsed, camera: best.camera }
      };
    } catch (e) {
      console.info(`Shot tracer: the lane search failed: ${e instanceof Error ? e.message : String(e)}`);
      return { frame: null, looked: idx.length };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Traces with the found lanes, each frame on its own, in the pool. */
  async function traceShot(video: VideoFrames, frame: number, found: Found, mine: number) {
    setShown({ gray: video.gray[frame].slice(), width: video.width, height: video.height });
    setStep({ kind: "tracing", fraction: 0 });
    const began = now();
    const finish = (next: Step & { kind: "done" }) => {
      if (attempt.current !== mine) return;
      const ms = timing.current;
      ms.trace = now() - began;
      const took = { via: ms.via, look: ms.look / 1000, read: ms.read / 1000, lane: ms.lane / 1000, trace: ms.trace / 1000 };
      console.info(
        `Shot tracer: stages took ${[took.look, took.read, took.lane, took.trace].map((x) => x.toFixed(1)).join(", ")} s (look, read, lane, trace), ` +
          `${(took.look + took.read + took.lane + took.trace).toFixed(1)} s in all; read by ${took.via}`
      );
      const r = next.result;
      notes.current.set("trace", r.ok ? `${r.sightings.length} sightings, ${r.from.toFixed(1)} to ${r.to.toFixed(1)} ft` : `${r.failure}: ${r.detail}`);
      if (r.ok && r.handFound) notes.current.set("hand", handNote(r.handFound));
      setStep({ ...next, timing: took, details: details(), pictures: pictures() });
    };
    let out: TraceOutput;
    const input = {
      calibFrame: frame,
      // The found lanes, each frame traced on its own.
      lanes: found.lanes,
      // The setting only where the video cannot tell whose hand it was (`handFind.ts`).
      hand: handedness,
      handFromVideo: true,
      onProgress: (_stage: string, fraction: number) => {
        if (attempt.current === mine) setStep({ kind: "tracing", fraction });
      }
    };
    try {
      try {
        // The frames move to the pool's last job; the screen keeps only the one it shows.
        out = await traceInPool(poolFor(mine), framesOf(video), input);
      } catch (e) {
        // A worker that failed while working: the whole trace again on this
        // thread, while the screen still has the frames (the last job moves them).
        const kept = video.gray.every((g) => g.byteLength > 0);
        if (!(e instanceof WorkerCrash) || attempt.current !== mine) throw e;
        notes.current.add("pool", `${e.message}; ${kept ? "the trace ran again on the main thread" : "the frames had gone to it, so the trace could not run again"}`);
        if (!kept) throw e;
        out = await traceInPool(inlinePool(mine), framesOf(video), input);
      }
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      console.info(`Shot tracer: the trace failed: ${why}`);
      finish({ kind: "done", result: { ok: false, failure: "unsupported-video", detail: `worker failed: ${why}` }, H: null, verdict: null });
      return;
    }
    const lanesUsed = out.debug.lanes;
    const evidence = { kept: lanesUsed?.kept.length, dropped: lanesUsed?.dropped.length, pinCheck: out.debug.calibration?.pinError ?? null };
    // The calibration frame's mapping as traced: the found lanes' blend there.
    finish({ kind: "done", result: out.result, H: out.debug.H0 ?? null, verdict: laneVerdict({ ...found.evidence, ...evidence }) });
  }

  const another = () => {
    attempt.current++;
    for (const w of workers.current) w.terminate();
    workers.current.clear();
    pool.current?.terminate();
    pool.current = null;
    setStep({ kind: "pick" });
  };

  return (
    <PushScreen history="route" mode="inline" title={t`Shot tracer`} onBack={onBack}>
      <div className="mx-auto w-full max-w-3xl space-y-5 px-3 pb-10 pt-2 sm:px-6">
        {step.kind === "pick" && <PickVideo unreadable={step.unreadable} why={step.why} details={step.details} onChoose={(f) => void choose(f)} />}
        {step.kind === "searching" && <Waiting label={t`Looking for the shot…`} fraction={step.fraction} />}
        {step.kind === "reading" && <Waiting label={t`Reading the video…`} fraction={step.fraction} />}
        {step.kind === "finding" && <Waiting label={t`Finding the lane…`} />}
        {step.kind === "tracing" && <Waiting label={t`Tracing the shot…`} fraction={step.fraction} />}
        {step.kind === "failed" && (
          <Failure
            text={step.missing === "shot" ? t`The shot couldn't be found in this video.` : t`The lane couldn't be found in this video.`}
            details={step.details}
            pictures={step.pictures}
            onAnother={another}
          />
        )}
        {step.kind === "done" && (
          <Result
            result={step.result}
            H={step.H}
            verdict={step.verdict}
            picture={shown}
            timing={step.timing}
            details={step.details}
            pictures={step.pictures}
            onAnother={another}
          />
        )}
      </div>
    </PushScreen>
  );
}

function PickVideo({ unreadable, why, details, onChoose }: { unreadable?: boolean; why?: string; details?: string; onChoose: (f: File | undefined) => void }) {
  const record = useRef<HTMLInputElement>(null);
  const pick = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-4">
      <p className="text-subhead text-ink-secondary">
        {t`Film one shot from behind the bowler, with the whole lane in view from the foul line to the pins, and hold the phone still. The video can start before the approach and run past the pins: the shot is found in it.`}
      </p>
      {unreadable && (
        <p role="alert" className="text-subhead text-danger-700">
          {t`This video couldn't be read. Try another one.`}
        </p>
      )}
      {unreadable && why && (
        // A Labs screen: the reader's own words, for the owner to pass on.
        <p className="text-footnote text-ink-secondary [overflow-wrap:anywhere]">{t`Details: ${why}`}</p>
      )}
      {unreadable && details && <Details text={details} />}
      <div className="flex flex-wrap gap-3">
        <Button variant="primary" onClick={() => record.current?.click()}>
          <Camera size={18} aria-hidden="true" />
          {t`Record a shot`}
        </Button>
        <Button onClick={() => pick.current?.click()}>
          <FileVideo size={18} aria-hidden="true" />
          {t`Choose a video`}
        </Button>
      </div>
      <input
        ref={record}
        type="file"
        accept="video/*"
        capture="environment"
        className="hidden"
        onChange={(e) => onChoose(e.target.files?.[0])}
      />
      <input ref={pick} type="file" accept="video/*" className="hidden" onChange={(e) => onChoose(e.target.files?.[0])} />
    </div>
  );
}

/** What could not be done, what to try, and another video. */
function Failure({ text, details, pictures, onAnother }: { text: string; details?: string; pictures?: Glimpses; onAnother: () => void }) {
  return (
    <div className="space-y-4">
      <p role="alert" className="text-subhead text-ink">
        {text}
      </p>
      <p className="text-subhead text-ink-secondary">
        {t`Film from behind the bowler, with the whole lane in view from the foul line to the pins, and hold the phone still.`}
      </p>
      <Button onClick={onAnother}>{t`Another video`}</Button>
      {details && <Details text={details} />}
      {pictures && <Seen pictures={pictures} />}
    </div>
  );
}

/**
 * What the tracer saw, under the details: three of the first look's frames
 * as the search got them, and a frame of the first part read with the lane
 * where it was found. Small, for the owner's screenshot from a phone.
 */
function Seen({ pictures }: { pictures: Glimpses }) {
  const all = [...pictures.look, ...(pictures.band ? [pictures.band] : [])];
  if (!all.length) return null;
  return (
    <figure data-testid="tracer-seen" className="space-y-2">
      <div className="grid grid-cols-4 items-start gap-2">
        {all.map((g, i) => {
          const seconds = formatNumber(g.t, 2);
          return (
            <div key={i} className="space-y-1">
              <FramePicture gray={g.gray} width={g.width} height={g.height}>
                {/* Drawn thicker: the picture is shown a fifth of its size. */}
                {g.H && <LaneLines H={g.H} width={g.width} stroke={g.width / 90} />}
              </FramePicture>
              <p className="text-center text-caption tabular-nums text-ink-secondary">
                {t({ message: `${seconds} s`, comment: "Seconds into the video a small picture was taken at, as in 3.07 s" })}
              </p>
            </div>
          );
        })}
      </div>
      <figcaption className="text-footnote text-ink-secondary">
        {t`What the tracer saw: the first look at a quarter, a half and three quarters of the video, then the lane on the first part read.`}
      </figcaption>
    </figure>
  );
}

/**
 * What the tracer did, line by line in technical English (`lib/shotTrack/
 * notes.ts`), small and selectable under every end screen: the owner's
 * screenshot from a phone is all there is to go on.
 */
function Details({ text }: { text: string }) {
  // The same message as the reader's own reason above it.
  const why = text;
  return (
    <p data-testid="tracer-details" className="select-text whitespace-pre-wrap text-footnote text-ink-secondary [overflow-wrap:anywhere]">
      {t`Details: ${why}`}
    </p>
  );
}

/** No fraction means no bar: the lane search reports no progress. */
function Waiting({ label, fraction }: { label: string; fraction?: number }) {
  return (
    <div className="flex flex-col items-center gap-4 py-16">
      <Spinner label={label} />
      {fraction !== undefined && (
        <div className="h-1.5 w-48 overflow-hidden rounded-full bg-surface-muted">
          <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(fraction * 100)}%` }} />
        </div>
      )}
    </div>
  );
}

/** A part of a frame, in its pixels. */
interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A gray frame (full range, `grayRange.ts`) drawn into a canvas, or the part of
 * it in `crop`, with an SVG over it in the frame's own pixels.
 */
function FramePicture({
  gray,
  width,
  height,
  crop,
  children
}: {
  gray: Uint8ClampedArray;
  width: number;
  height: number;
  crop?: Crop;
  children?: React.ReactNode;
}) {
  const own = useRef<HTMLCanvasElement | null>(null);
  const box = crop ?? { x: 0, y: 0, w: width, h: height };
  useEffect(() => {
    const c = own.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const img = ctx.createImageData(box.w, box.h);
    for (let y = 0; y < box.h; y++) {
      for (let x = 0; x < box.w; x++) {
        const g = gray[(y + box.y) * width + x + box.x];
        const k = 4 * (y * box.w + x);
        img.data[k] = img.data[k + 1] = img.data[k + 2] = g;
        img.data[k + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [gray, width, box.x, box.y, box.w, box.h]);
  return (
    <div className="relative overflow-hidden rounded-xl bg-surface-muted">
      <canvas
        ref={own}
        width={box.w}
        height={box.h}
        className="block h-auto w-full"
      />
      <svg viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} className="absolute inset-0 h-full w-full">
        {children}
      </svg>
    </div>
  );
}

/** What went wrong in a trace, said as what could not be done; `Failure` adds what to try. */
function failureText(f: TrackFailure): string {
  switch (f) {
    case "calibration-off":
    case "lane-not-found":
      return t`The lane couldn't be found in this video.`;
    case "too-shaky":
      return t`The camera moves too much to follow the lane.`;
    case "ball-not-found":
    case "too-little-seen":
      return t`The ball couldn't be followed down the lane.`;
    default:
      return t`This video couldn't be read.`;
  }
}

function Result({
  result,
  H,
  verdict,
  picture,
  timing,
  details,
  pictures,
  onAnother
}: {
  result: TrackResult | TrackError;
  H: Mat3 | null;
  verdict: LaneVerdict | null;
  picture: { gray: Uint8ClampedArray; width: number; height: number } | null;
  timing?: Timing;
  details?: string;
  pictures?: Glimpses;
  onAnother: () => void;
}) {
  // The hand the boards are counted from, when the bowler switched it here: read again off the same sightings.
  const [chosen, setChosen] = useState<Handedness | null>(null);
  if (!result.ok) return <Failure text={failureText(result.failure)} details={details} pictures={pictures} onAnother={onAnother} />;
  const readOff = result.readOff;
  const hand = chosen && readOff ? chosen : result.hand;
  const m = hand !== result.hand && readOff ? handedMetrics({ ...readOff, hand }) : result.metrics;
  const path = H ? pathInPicture(H, result.path, result.from, result.to) : [];
  // The laydown on the foul line, where the drawn path starts: the ball is
  // first seen on the lane a foot or two past it.
  const laydownAt = H && m.laydown.value !== null ? apply(H, { x: laneU(m.laydown.value, hand), y: 0 }) : null;
  const dots = H ? result.sightings.filter((s) => !s.airborne).map((s) => apply(H, { x: s.u, y: s.v })) : [];
  return (
    <div className="space-y-5">
      {picture && (
        <FramePicture gray={picture.gray} width={picture.width} height={picture.height} crop={H ? laneCrop(H, picture.width, picture.height) : undefined}>
          {H && <LaneLines H={H} width={picture.width} />}
          {laydownAt && (
            // The laydown: the board over the foul line, where the path starts.
            <circle
              cx={laydownAt.x}
              cy={laydownAt.y}
              r={Math.max(4, picture.width / 160)}
              fill="none"
              strokeWidth={Math.max(1.5, picture.width / 450)}
              className="stroke-danger-600"
            />
          )}
          {dots.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={Math.max(1.5, picture.width / 400)} className="fill-accent" />
          ))}
          {path.length > 1 && (
            <polyline
              points={(laydownAt ? [laydownAt, ...path] : path).map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              strokeWidth={Math.max(1.5, picture.width / 450)}
              strokeLinejoin="round"
              className="stroke-danger-600"
            />
          )}
        </FramePicture>
      )}
      {verdict?.level === "check" && (
        <p className="text-subhead text-ink-secondary">
          {t`The lane may be off. Check its lines on the picture.`}
        </p>
      )}
      {result.handFound && readOff && (
        <div data-testid="tracer-hand" className="space-y-2">
          <p className="text-subhead text-ink-secondary">{handLine(hand, chosen && chosen !== result.hand ? null : result.handFound)}</p>
          <HandednessPicker value={hand} onSelect={(h) => setChosen(h)} />
        </div>
      )}
      <dl className="overflow-hidden rounded-[26px] bg-surface">
        <Reading label={t`Laydown`} metric={m.laydown} />
        <Reading
          label={t({ message: "Touchdown", comment: "Bowling: where the ball first touches the lane after it leaves the hand, as a board and a distance past the foul line" })}
          metric={m.touchdown}
          feet={m.touchdownFeet}
        />
        <Reading label={t({ message: "Arrows", comment: "A bowling term: the aiming arrows 15 feet down the lane; here the board the ball crosses there" })} metric={m.arrows} />
        <Reading
          label={t({ message: "Breakpoint", comment: "Bowling term: the point where the ball turns from skid to hook" })}
          metric={m.breakpoint}
          feet={m.breakpointFeet}
        />
        <Reading label={t({ message: "At the pins", comment: "The board the ball is on where it meets the pins" })} metric={m.pins} />
        <Reading
          label={t({ message: "Launch speed", comment: "Bowling: the ball's speed over the first 15 feet past the foul line, in miles an hour" })}
          metric={m.launchSpeed}
          speed
        />
        <Reading
          label={t({ message: "Entry speed", comment: "Bowling: the ball's speed over the last feet before it meets the pins, in miles an hour" })}
          metric={m.entrySpeed}
          speed
        />
      </dl>
      {timing && <TimingLine timing={timing} />}
      <div className="flex flex-wrap gap-3">
        <Button onClick={onAnother}>{t`Another video`}</Button>
      </div>
      {details && <Details text={details} />}
      {pictures && <Seen pictures={pictures} />}
    </div>
  );
}

/**
 * Which hand the boards are counted from, and why, in one line: read from
 * the video, the app's setting where the video could not tell, or the
 * bowler's own choice here (`found` null).
 */
function handLine(hand: Handedness, found: HandFound | null): string {
  if (!found) return hand === "left" ? t`Left-handed, as you chose. The boards are counted from the left gutter.` : t`Right-handed, as you chose. The boards are counted from the right gutter.`;
  if (found.by === "video") return hand === "left" ? t`Left-handed, from the video.` : t`Right-handed, from the video.`;
  return hand === "left"
    ? t`Left-handed, from your settings: the video didn't show which hand threw it.`
    : t`Right-handed, from your settings: the video didn't show which hand threw it.`;
}

/** How the video was read and how long each stage took, small, for the owner's runs on a phone. */
function TimingLine({ timing }: { timing: Timing }) {
  const s = (x: number) => formatNumber(x, 1);
  const [reader, look, read, lane, trace] = [timing.via || "?", s(timing.look), s(timing.read), s(timing.lane), s(timing.trace)];
  return (
    <p className="text-footnote text-ink-secondary [overflow-wrap:anywhere]">
      {t({
        message: `Read by ${reader}. Looking ${look} s, reading ${read} s, lane ${lane} s, tracing ${trace} s.`,
        comment: "A diagnostics line in Labs: how the video was read (a technical name), and the seconds each stage of the shot tracer took"
      })}
    </p>
  );
}

/**
 * The lane the tracer used, drawn quietly under the path: both edges, the
 * foul line and the back pin row. A wrong lane shows at a glance. `stroke`
 * (the frame's pixels) for a picture shown small.
 */
function LaneLines({ H, width, stroke }: { H: Mat3; width: number; stroke?: number }) {
  const ends: Record<MarkLine, [Point, Point]> = {
    left: [{ x: LEFT_U, y: 0 }, { x: LEFT_U, y: BACK_ROW_FT }],
    right: [{ x: RIGHT_U, y: 0 }, { x: RIGHT_U, y: BACK_ROW_FT }],
    foul: [{ x: LEFT_U, y: 0 }, { x: RIGHT_U, y: 0 }],
    pinrow: [{ x: LEFT_U, y: BACK_ROW_FT }, { x: RIGHT_U, y: BACK_ROW_FT }]
  };
  return (
    <g data-testid="lane-lines" strokeOpacity={0.55} strokeWidth={stroke ?? Math.max(1, width / 700)} strokeLinecap="round">
      {MARK_LINES.map((k) => {
        const [a, b] = ends[k].map((p) => apply(H, p));
        return <line key={k} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={LINE_TONE[k]} />;
      })}
    </g>
  );
}

/**
 * The lane's part of the picture, with a margin, as wide as it is tall at the
 * least: the whole frame shows the path a few pixels wide.
 */
function laneCrop(H: Mat3, width: number, height: number): Crop {
  const pts = [[-3, -2], [43, -2], [-3, 62], [43, 62]].map(([u, v]) => apply(H, { x: u, y: v }));
  let x0 = Math.min(...pts.map((p) => p.x));
  let x1 = Math.max(...pts.map((p) => p.x));
  const y0 = Math.max(0, Math.min(...pts.map((p) => p.y)) - 0.04 * height);
  const y1 = Math.min(height, Math.max(...pts.map((p) => p.y)) + 0.02 * height);
  const grow = Math.max(0, (y1 - y0) * 0.75 - (x1 - x0)) / 2;
  x0 = Math.max(0, x0 - grow);
  x1 = Math.min(width, x1 + grow);
  if (!(x1 - x0 > 8 && y1 - y0 > 8)) return { x: 0, y: 0, w: width, h: height };
  return { x: Math.floor(x0), y: Math.floor(y0), w: Math.ceil(x1 - x0), h: Math.ceil(y1 - y0) };
}

function stateText(m: Metric): string {
  return m.state === "measured"
    ? t({ message: "Measured", comment: "The tracer saw the ball there" })
    : m.state === "estimated"
      ? t({ message: "Estimated", comment: "The tracer worked it out from where the ball was seen nearby" })
      : t({ message: "Not seen", comment: "The tracer did not see the ball there" });
}

function Reading({ label, metric, feet, speed }: { label: string; metric: Metric; feet?: Metric; speed?: boolean }) {
  const value =
    metric.value === null
      ? null
      : speed
        ? t`${{ speed: formatNumber(metric.value, 1) }} mph`
        : feet?.value != null
          ? t`Board ${{ board: formatNumber(metric.value, 1) }} at ${{ feet: formatNumber(Math.round(feet.value)) }} ft`
          : t`Board ${{ board: formatNumber(metric.value, 1) }}`;
  return (
    <div className="flex min-h-[52px] items-center gap-3 px-4 py-2.5 [&+&]:border-t [&+&]:border-edge">
      <dt className="min-w-0 flex-1">
        <span className="block text-body text-ink">{label}</span>
        <span className="block text-footnote text-ink-secondary">{stateText(metric)}</span>
      </dt>
      <dd className="shrink-0 text-body font-semibold tabular-nums text-ink">{value}</dd>
    </div>
  );
}
