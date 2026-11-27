import { t } from "@lingui/core/macro";
import { Camera, ChevronRight, FileVideo } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PushScreen } from "../components/PushScreen";
import { Button } from "../components/ui/Button";
import { FramePicture, type Crop } from "../components/FramePicture";
import { ReadingFrameSheet } from "../components/ReadingFrameSheet";
import { Spinner } from "../components/ui/Spinner";
import { formatNumber } from "../lib/format";
import { handNote, type HandFound } from "../lib/shotTrack/handFind";
import { videoFrameNumber, type Numbering, type ReadingShot, type ShotKey } from "../lib/shotTrack/readingFrame";
import { blobSource, readVideoTrack, shownTimes } from "../lib/shotTrack/mp4";
import { apply } from "../lib/shotTrack/homography";
import { BACK_ROW_FT, laneU, LEFT_U, RIGHT_U } from "../lib/shotTrack/laneModel";
import type { FrameLane } from "../lib/shotTrack/laneTrack";
import { laneVerdict, type LaneEvidence, type LaneVerdict } from "../lib/shotTrack/laneVerdict";
import { foundNote, laneCheckNote, Notes, timesNote } from "../lib/shotTrack/notes";
import { Stalled, Watchdog, within } from "../lib/shotTrack/stall";
import { glimpseIndices } from "../lib/shotTrack/lookFrame";
import { MARK_LINES, pathInPicture, type MarkLine } from "../lib/shotTrack/marking";
import { FIRST_LANE_EVERY, gridFrames, LANE_EVERY, readStep } from "../lib/shotTrack/framePick";
import { laneBands, readFrom, ShotSearch, type Band, type CoarseFrame, type ShotFound } from "../lib/shotTrack/shotStart";
import type { GrayFrame, Mat3, Metric, Point, TrackError, TrackFailure, TrackResult } from "../lib/shotTrack/types";
import { frameLanes } from "../lib/shotTrack/laneFind";
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
import { readVideoFrames, scanVideo, type ReadPlan, type VideoFrames } from "../shotTracer/videoFrames";
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
  | { kind: "done"; result: TrackResult | TrackError; H: Mat3 | null; verdict: LaneVerdict | null; timing?: Timing; details?: string; pictures?: Glimpses; shots?: ReadingShot[]; numbering?: Numbering };

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

/**
 * The longest the look or a read may go without a frame or any progress,
 * milliseconds, before the screen gives up on it as stalled. Each wait inside
 * is bounded on its own, more tightly and with its own reason (`stall.ts`);
 * this is the net under them all, longer than the worst run of those back to
 * back (opening the codec, a stalled decode, then starting playback).
 */
const LOAD_STALL_MS = 90_000;
/** The longest the frame table for the result's frame numbers may take to read, milliseconds. */
const FRAME_TIMES_MS = 10_000;

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
  // Each frame's time in the file, to say a frame's number in the video (null when the file's table can't be read).
  const frameTimes = useRef<Promise<number[] | null>>(Promise.resolve(null));

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
    // A look that stops giving frames ends on the error screen; anything it gives after is dropped.
    const dog = new Watchdog(LOAD_STALL_MS, "the look at the video");
    let over = false;
    try {
      const video = await dog
        .guard(
          scanVideo(
            f,
            (frame) => {
              if (over) return;
              dog.poke(`frame at ${frame.t.toFixed(2)} s`);
              seen.push(frame);
              client.push(frame);
            },
            (fraction) => {
              if (over) return;
              dog.poke();
              if (attempt.current === mine) setStep({ kind: "searching", fraction });
            },
            notes.current
          )
        )
        .finally(() => (over = true));
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
    frameTimes.current = readVideoTrack(blobSource(f)).then((track) => shownTimes(track.samples), () => null);
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

  /**
   * `readVideoFrames`, ended on the error screen when it goes `LOAD_STALL_MS`
   * without progress; what it reports after is dropped.
   */
  function watchedRead(f: File, plan: ReadPlan, onRead: (fraction: number) => void): Promise<VideoFrames> {
    const dog = new Watchdog(LOAD_STALL_MS, `the read from ${plan.from.toFixed(2)} to ${plan.to.toFixed(2)} s`);
    let over = false;
    return dog
      .guard(
        readVideoFrames(
          f,
          (fraction) => {
            if (over) return;
            dog.poke(`${Math.round(fraction * 100)}%`);
            onRead(fraction);
          },
          plan,
          notes.current
        )
      )
      .finally(() => (over = true));
  }

  /** Back to the start, saying the video couldn't be read and what the reader said. */
  function unreadable(e: unknown, mine: number) {
    const why = e instanceof Error ? e.message : String(e);
    if (e instanceof Stalled && attempt.current === mine) notes.current.add("stalled", why);
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
        (plan, onRead) => watchedRead(f, plan, onRead),
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
        // No lane in any part read in this band: the next, read again.
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
    const finish = async (next: Step & { kind: "done" }) => {
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
      // The frame numbers are a nicety: a table that never reads leaves them out rather than the result.
      const times = await within(frameTimes.current, FRAME_TIMES_MS, "the frame table").catch(() => null);
      if (attempt.current !== mine) return;
      setStep({ ...next, timing: took, details: details(), pictures: pictures(), shots: next.shots, numbering: { times, step: video.src } });
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
      void finish({ kind: "done", result: { ok: false, failure: "unsupported-video", detail: `worker failed: ${why}` }, H: null, verdict: null });
      return;
    }
    const lanesUsed = out.debug.lanes;
    const evidence = {
      kept: lanesUsed?.kept.length,
      dropped: lanesUsed?.dropped.length,
      elsewhere: lanesUsed?.elsewhere.length,
      pinCheck: out.debug.calibration?.pinError ?? null,
      pinsSeen: out.debug.calibration?.pins.length
    };
    const all = { ...found.evidence, ...evidence };
    const verdict = laneVerdict(all);
    notes.current.set("lane check", laneCheckNote(verdict, all));
    // The calibration frame's mapping as traced: the found lanes' blend there.
    void finish({ kind: "done", result: out.result, H: out.debug.H0 ?? null, verdict, shots: out.shots });
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
            shots={step.shots}
            numbering={step.numbering}
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
  shots,
  numbering,
  timing,
  details,
  pictures,
  onAnother
}: {
  result: TrackResult | TrackError;
  H: Mat3 | null;
  verdict: LaneVerdict | null;
  picture: { gray: Uint8ClampedArray; width: number; height: number } | null;
  /** The frame behind each reading (`readingShots`). */
  shots?: ReadingShot[];
  numbering?: Numbering;
  timing?: Timing;
  details?: string;
  pictures?: Glimpses;
  onAnother: () => void;
}) {
  if (!result.ok) return <Failure text={failureText(result.failure)} details={details} pictures={pictures} onAnother={onAnother} />;
  // The hand comes from the video, never from the bowler (the owner,
  // 2026-11-20): the result says which, with no switch.
  const hand = result.hand;
  const m = result.metrics;
  const path = H ? pathInPicture(H, result.path, result.from, result.drawTo ?? result.to) : [];
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
      {result.handFound && (
        <p data-testid="tracer-hand" className="text-subhead text-ink-secondary">
          {handLine(hand, result.handFound)}
        </p>
      )}
      <Readings m={m} shots={shots} numbering={numbering} />
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
 * Which hand the boards are counted from, in one line: the video's, or the
 * app's setting when the video showed no cue at all.
 */
function handLine(hand: Handedness, found: HandFound): string {
  if (found.by === "video") return hand === "left" ? t`Left-handed (from the video)` : t`Right-handed (from the video)`;
  return hand === "left"
    ? t`Hand not clear in the video: counted as left-handed, the app's setting`
    : t`Hand not clear in the video: counted as right-handed, the app's setting`;
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

/** A reading as the row and the sheet over it say it: a board, and where it is read, or a speed. */
function readingValue(metric: Metric, feet?: Metric, speed?: boolean): string | null {
  if (metric.value === null) return null;
  return speed
    ? t`${{ speed: formatNumber(metric.value, 1) }} mph`
    : feet?.value != null
      ? t`Board ${{ board: formatNumber(metric.value, 1) }} at ${{ feet: formatNumber(Math.round(feet.value)) }} ft`
      : t`Board ${{ board: formatNumber(metric.value, 1) }}`;
}

/** What a row of readings is made of: the name, the reading, and where it is read. */
interface ReadingRow {
  key: ShotKey;
  label: string;
  metric: Metric;
  feet?: Metric;
  speed?: boolean;
}

/**
 * The readings, each row opening the frame it was taken on where there is one:
 * a sheet over the result with the ball, the point the board is read at and
 * its line drawn on a crop of the frame.
 */
function Readings({ m, shots, numbering }: { m: TrackResult["metrics"]; shots?: ReadingShot[]; numbering?: Numbering }) {
  const [open, setOpen] = useState<ShotKey | null>(null);
  const rows: ReadingRow[] = [
    { key: "laydown", label: t`Laydown`, metric: m.laydown },
    {
      key: "touchdown",
      label: t({ message: "Touchdown", comment: "Bowling: where the ball first touches the lane after it leaves the hand, as a board and a distance past the foul line" }),
      metric: m.touchdown,
      feet: m.touchdownFeet
    },
    { key: "arrows", label: t({ message: "Arrows", comment: "A bowling term: the aiming arrows 15 feet down the lane; here the board the ball crosses there" }), metric: m.arrows },
    {
      key: "breakpoint",
      label: t({ message: "Breakpoint", comment: "Bowling term: the point where the ball turns from skid to hook" }),
      metric: m.breakpoint,
      feet: m.breakpointFeet
    },
    { key: "pins", label: t({ message: "At the pins", comment: "The board the ball is on where it meets the pins" }), metric: m.pins },
    {
      key: "launchSpeed",
      label: t({ message: "Launch speed", comment: "Bowling: the ball's speed over the first 15 feet past the foul line, in miles an hour" }),
      metric: m.launchSpeed,
      speed: true
    },
    {
      key: "entrySpeed",
      label: t({ message: "Entry speed", comment: "Bowling: the ball's speed over the last feet before it meets the pins, in miles an hour" }),
      metric: m.entrySpeed,
      speed: true
    }
  ];
  const shown = rows.find((r) => r.key === open);
  const shot = shots?.find((s) => s.reading === open);
  return (
    <>
      <dl className="overflow-hidden rounded-[26px] bg-surface">
        {rows.map((r) => (
          <Reading key={r.key} label={r.label} metric={r.metric} feet={r.feet} speed={r.speed} onOpen={shots?.some((s) => s.reading === r.key) ? () => setOpen(r.key) : undefined} />
        ))}
      </dl>
      {shown && shot && <ReadingFrameSheet title={shown.label} value={readingValue(shown.metric, shown.feet, shown.speed)} shot={shot} numberOf={(part) => (numbering ? videoFrameNumber(part.t, numbering) : null) ?? part.frame} onClose={() => setOpen(null)} />}
    </>
  );
}

/** One row. With `onOpen` the whole row is the button that opens its frame (the stretched button's `::after` covers the row). */
function Reading({ label, metric, feet, speed, onOpen }: Omit<ReadingRow, "key"> & { onOpen?: () => void }) {
  const value = readingValue(metric, feet, speed);
  const text = (
    <>
      <span className="block text-body text-ink">{label}</span>
      <span className="block text-footnote text-ink-secondary">{stateText(metric)}</span>
    </>
  );
  return (
    <div className="relative flex min-h-[52px] items-center gap-3 px-4 py-2.5 [&+&]:border-t [&+&]:border-edge [&:has(button:active)]:bg-surface-muted">
      <dt className="min-w-0 flex-1">
        {onOpen ? (
          <button type="button" onClick={onOpen} aria-label={t`${label}, show the frame`} className="block w-full text-left after:absolute after:inset-0 after:content-['']">
            {text}
          </button>
        ) : (
          text
        )}
      </dt>
      <dd className="shrink-0 text-body font-semibold tabular-nums text-ink">{value}</dd>
      {onOpen ? <ChevronRight size={17} strokeWidth={2.25} aria-hidden="true" className="shrink-0 text-ink-tertiary" /> : <span aria-hidden="true" className="w-[17px] shrink-0" />}
    </div>
  );
}
