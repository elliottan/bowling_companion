import { t } from "@lingui/core/macro";
import { Camera, FileVideo } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PushScreen } from "../components/PushScreen";
import { Button } from "../components/ui/Button";
import { Spinner } from "../components/ui/Spinner";
import { formatNumber } from "../lib/format";
import { apply } from "../lib/shotTrack/homography";
import { BACK_ROW_FT, laneU, LEFT_U, RIGHT_U } from "../lib/shotTrack/laneModel";
import type { FrameLane } from "../lib/shotTrack/laneTrack";
import { laneVerdict, type LaneEvidence, type LaneVerdict } from "../lib/shotTrack/laneVerdict";
import { MARK_LINES, pathInPicture, type MarkLine } from "../lib/shotTrack/marking";
import { laneBands, readFrom, type Band, type ShotFound } from "../lib/shotTrack/shotStart";
import type { Mat3, Metric, Point, TrackError, TrackFailure, TrackResult } from "../lib/shotTrack/types";
import type { FindMessage, FindRequest, SearchMessage, SearchRequest, TraceMessage, TraceRequest } from "../shotTracer/protocol";
import { readVideoFrames, scanVideo, type VideoFrames } from "../shotTracer/videoFrames";
import type { Handedness } from "../types/bowling";

/**
 * The shot tracer, in Labs (Settings, behind seven taps on the version line):
 * a video recorded or chosen, with nothing more asked of the bowler. A first
 * look over the whole video finds the shot (the ball's run up the lane,
 * `lib/shotTrack/shotStart.ts`) and, in a portrait video, the band of the
 * picture the lane is in; those few seconds are read at full quality, the lane
 * is found in a worker, and the tracer (`lib/shotTrack`) runs in another, its
 * readings shown on the frame. For the owner to try on real shots before it
 * is part of a session.
 */

type Step =
  | { kind: "pick"; unreadable?: boolean }
  | { kind: "searching"; fraction: number }
  | { kind: "reading"; fraction: number }
  | { kind: "finding" }
  | { kind: "tracing"; fraction: number }
  /** The shot or the lane was not found: nothing to trace. */
  | { kind: "failed"; missing: "shot" | "lane" }
  | { kind: "done"; result: TrackResult | TrackError; H: Mat3 | null; verdict: LaneVerdict | null };

/** The lane as the finder found it: on every frame it could, and what it knows about how sure it is. */
interface Found {
  lanes: FrameLane[];
  evidence: LaneEvidence;
}

/**
 * How many frames the lane search looks at, spread over the clip. A full read
 * (240 frames) is then every 10th frame, as the harness measured the
 * per-frame lanes on (scripts/shot-tracker/README.md, "The lane on every
 * frame"): the tracer blends found lanes over about 15 frames, so that is the
 * two nearest each side, and a frame costs the finder a third of a second.
 */
const FIND_FRAMES = 24;

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
  // Each video chosen is a new attempt; an older one's late answers are dropped.
  const attempt = useRef(0);

  useEffect(
    () => () => {
      for (const w of workers.current) w.terminate();
      workers.current.clear();
    },
    []
  );

  function startWorker(url: URL): Worker {
    const worker = new Worker(url, { type: "module" });
    workers.current.add(worker);
    return worker;
  }

  function stopWorker(worker: Worker) {
    worker.terminate();
    workers.current.delete(worker);
  }

  /** Looks for the shot over the whole video, the small frames going to a worker as they are drawn. */
  async function search(f: File, mine: number): Promise<{ found: ShotFound | null; width: number; height: number; duration: number }> {
    const worker = startWorker(new URL("../shotTracer/search.worker.ts", import.meta.url));
    try {
      const answer = new Promise<ShotFound | null>((resolve) => {
        worker.onmessage = (e: MessageEvent<SearchMessage>) => resolve(e.data.found);
        worker.onerror = () => resolve(null);
      });
      const video = await scanVideo(
        f,
        (frame) => {
          const data = frame.data.buffer as ArrayBuffer;
          worker.postMessage({ kind: "frame", width: frame.width, height: frame.height, data, t: frame.t } satisfies SearchRequest, [data]);
        },
        (fraction) => {
          if (attempt.current === mine) setStep({ kind: "searching", fraction });
        }
      );
      worker.postMessage({ kind: "done" } satisfies SearchRequest);
      return { ...video, found: await answer };
    } finally {
      stopWorker(worker);
    }
  }

  async function choose(f: File | undefined) {
    if (!f) return;
    const mine = ++attempt.current;
    for (const w of workers.current) w.terminate();
    workers.current.clear();
    setStep({ kind: "searching", fraction: 0 });
    let found: ShotFound | null;
    let from: number | null;
    let bands: (Band | null)[];
    try {
      const looked = await search(f, mine);
      found = looked.found;
      from = readFrom(looked.duration, found);
      bands = laneBands(looked.width, looked.height, found);
    } catch {
      if (attempt.current === mine) setStep({ kind: "pick", unreadable: true });
      return;
    }
    if (attempt.current !== mine) return;
    console.info(
      `Shot tracer: ${found ? `ball seen from ${found.release.toFixed(2)} s, pins ${found.pinHit?.toFixed(2) ?? "not seen"}, confidence ${found.confidence.toFixed(2)}` : "no shot found"}; ` +
        `reading from ${from?.toFixed(2) ?? "nowhere"} s, rows ${bands.map((b) => (b ? `${b.top.toFixed(2)} to ${b.bottom.toFixed(2)}` : "all")).join(", then ")}`
    );
    if (from === null) setStep({ kind: "failed", missing: "shot" });
    else void readBand(f, from, bands, mine);
  }

  /** Reads the shot's few seconds in the first band left, then looks for the lane there. */
  async function readBand(f: File, from: number, bands: (Band | null)[], mine: number) {
    setStep({ kind: "reading", fraction: 0 });
    let v: VideoFrames;
    try {
      v = await readVideoFrames(
        f,
        (fraction) => {
          if (attempt.current === mine) setStep({ kind: "reading", fraction });
        },
        from,
        bands[0]
      );
      if (v.gray.length < 10) throw new Error("too short");
    } catch {
      if (attempt.current === mine) setStep({ kind: "pick", unreadable: true });
      return;
    }
    if (attempt.current !== mine) return;
    // Not found in this band: the next, read again, or nothing to trace.
    findLane(v, mine, () => {
      if (attempt.current !== mine) return;
      if (bands.length > 1) void readBand(f, from, bands.slice(1), mine);
      else setStep({ kind: "failed", missing: "lane" });
    });
  }

  /** Looks for the lane on a few frames, then traces with it; `lost` when it is not found. */
  function findLane(v: VideoFrames, mine: number, lost: () => void) {
    setStep({ kind: "finding" });
    const stride = Math.max(1, Math.floor(v.gray.length / FIND_FRAMES));
    const request: FindRequest = {
      width: v.width,
      height: v.height,
      // Copies: the frames are still needed to trace.
      frames: v.gray.flatMap((g, index) => (index % stride === 0 ? [{ data: g.slice().buffer as ArrayBuffer, index }] : []))
    };
    let worker: Worker;
    try {
      worker = startWorker(new URL("../shotTracer/find.worker.ts", import.meta.url));
    } catch {
      lost();
      return;
    }
    worker.onmessage = (e: MessageEvent<FindMessage>) => {
      stopWorker(worker);
      const m = e.data;
      if (m.frame === null) lost();
      else if (attempt.current === mine) traceShot(v, m.frame, { lanes: m.lanes, evidence: m.evidence }, mine);
    };
    worker.onerror = () => {
      stopWorker(worker);
      lost();
    };
    worker.postMessage(request, request.frames.map((f) => f.data));
  }

  /** Traces with the found lanes, each frame on its own. */
  function traceShot(video: VideoFrames, frame: number, found: Found, mine: number) {
    setShown({ gray: video.gray[frame].slice(), width: video.width, height: video.height });
    const request: TraceRequest = {
      width: video.width,
      height: video.height,
      frames: video.gray.map((g, i) => ({ data: g.buffer as ArrayBuffer, t: video.times[i] })),
      calibFrame: frame,
      lanes: found.lanes,
      hand: handedness
    };
    setStep({ kind: "tracing", fraction: 0 });
    const worker = startWorker(new URL("../shotTracer/trace.worker.ts", import.meta.url));
    const finish = (next: Step) => {
      stopWorker(worker);
      if (attempt.current === mine) setStep(next);
    };
    worker.onmessage = (e: MessageEvent<TraceMessage>) => {
      const m = e.data;
      if (m.kind === "progress") {
        if (attempt.current === mine) setStep({ kind: "tracing", fraction: m.fraction });
      } else finish({ kind: "done", result: m.result, H: m.H, verdict: laneVerdict({ ...found.evidence, ...m.evidence }) });
    };
    worker.onerror = () =>
      finish({ kind: "done", result: { ok: false, failure: "unsupported-video", detail: "worker failed" }, H: null, verdict: null });
    // The frames move to the worker; the screen keeps only the one it shows.
    worker.postMessage(request, request.frames.map((f) => f.data));
  }

  const another = () => {
    attempt.current++;
    for (const w of workers.current) w.terminate();
    workers.current.clear();
    setStep({ kind: "pick" });
  };

  return (
    <PushScreen history="route" mode="inline" title={t`Shot tracer`} onBack={onBack}>
      <div className="mx-auto w-full max-w-3xl space-y-5 px-3 pb-10 pt-2 sm:px-6">
        {step.kind === "pick" && <PickVideo unreadable={step.unreadable} onChoose={(f) => void choose(f)} />}
        {step.kind === "searching" && <Waiting label={t`Looking for the shot…`} fraction={step.fraction} />}
        {step.kind === "reading" && <Waiting label={t`Reading the video…`} fraction={step.fraction} />}
        {step.kind === "finding" && <Waiting label={t`Finding the lane…`} />}
        {step.kind === "tracing" && <Waiting label={t`Tracing the shot…`} fraction={step.fraction} />}
        {step.kind === "failed" && (
          <Failure text={step.missing === "shot" ? t`The shot couldn't be found in this video.` : t`The lane couldn't be found in this video.`} onAnother={another} />
        )}
        {step.kind === "done" && <Result result={step.result} H={step.H} verdict={step.verdict} picture={shown} onAnother={another} />}
      </div>
    </PushScreen>
  );
}

function PickVideo({ unreadable, onChoose }: { unreadable?: boolean; onChoose: (f: File | undefined) => void }) {
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
function Failure({ text, onAnother }: { text: string; onAnother: () => void }) {
  return (
    <div className="space-y-4">
      <p role="alert" className="text-subhead text-ink">
        {text}
      </p>
      <p className="text-subhead text-ink-secondary">
        {t`Film from behind the bowler, with the whole lane in view from the foul line to the pins, and hold the phone still.`}
      </p>
      <Button onClick={onAnother}>{t`Another video`}</Button>
    </div>
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
 * A grey frame (video range, see `toGray`) drawn into a canvas, or the part of
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
        const g = (gray[(y + box.y) * width + x + box.x] - 16) * (255 / 219);
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
  onAnother
}: {
  result: TrackResult | TrackError;
  H: Mat3 | null;
  verdict: LaneVerdict | null;
  picture: { gray: Uint8ClampedArray; width: number; height: number } | null;
  onAnother: () => void;
}) {
  if (!result.ok) return <Failure text={failureText(result.failure)} onAnother={onAnother} />;
  const m = result.metrics;
  const path = H ? pathInPicture(H, result.path, result.from, result.to) : [];
  // The laydown on the foul line, where the drawn path starts: the ball is
  // first seen on the lane a foot or two past it.
  const laydownAt = H && m.laydown.value !== null ? apply(H, { x: laneU(m.laydown.value, result.hand), y: 0 }) : null;
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
        <Reading label={t`Speed`} metric={m.speed} speed />
      </dl>
      <div className="flex flex-wrap gap-3">
        <Button onClick={onAnother}>{t`Another video`}</Button>
      </div>
    </div>
  );
}

/**
 * The lane the tracer used, drawn quietly under the path: both edges, the
 * foul line and the back pin row. A wrong lane shows at a glance.
 */
function LaneLines({ H, width }: { H: Mat3; width: number }) {
  const ends: Record<MarkLine, [Point, Point]> = {
    left: [{ x: LEFT_U, y: 0 }, { x: LEFT_U, y: BACK_ROW_FT }],
    right: [{ x: RIGHT_U, y: 0 }, { x: RIGHT_U, y: BACK_ROW_FT }],
    foul: [{ x: LEFT_U, y: 0 }, { x: RIGHT_U, y: 0 }],
    pinrow: [{ x: LEFT_U, y: BACK_ROW_FT }, { x: RIGHT_U, y: BACK_ROW_FT }]
  };
  return (
    <g data-testid="lane-lines" strokeOpacity={0.55} strokeWidth={Math.max(1, width / 700)} strokeLinecap="round">
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
