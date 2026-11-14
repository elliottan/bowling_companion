import { t } from "@lingui/core/macro";
import { Camera, FileVideo } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { PushScreen } from "../components/PushScreen";
import { Button } from "../components/ui/Button";
import { Spinner } from "../components/ui/Spinner";
import { GROUP_HEADING } from "../components/ui/typography";
import { formatNumber } from "../lib/format";
import { apply } from "../lib/shotTrack/homography";
import { defaultMarkLines, MARK_LINES, pathInPicture, toCalMarks, type MarkLine, type MarkLines } from "../lib/shotTrack/marking";
import type { Mat3, Metric, Point, TrackError, TrackFailure, TrackResult } from "../lib/shotTrack/types";
import type { FindMessage, FindRequest, TraceMessage, TraceRequest } from "../shotTracer/protocol";
import { readVideoFrames, type VideoFrames } from "../shotTracer/videoFrames";
import type { Handedness } from "../types/bowling";

/**
 * The shot tracer, in Labs (Settings, behind seven taps on the version line):
 * a video recorded or chosen, the four lane lines dragged onto one frame, then
 * the tracer (`lib/shotTrack`) run in a worker and its readings shown on the
 * frame. For the owner to try on real shots before it is part of a session.
 */

type Step =
  | { kind: "pick"; unreadable?: boolean }
  | { kind: "reading"; fraction: number }
  | { kind: "finding" }
  | { kind: "mark"; notFound?: boolean }
  | { kind: "tracing"; fraction: number }
  | { kind: "done"; result: TrackResult | TrackError; H: Mat3 | null };

/** How many frames the lane search looks at, spread over the clip. */
const FIND_FRAMES = 24;

/** Each line's colour on the picture and in its key. */
const LINE_TONE: Record<MarkLine, { stroke: string; fill: string }> = {
  left: { stroke: "stroke-accent", fill: "fill-accent" },
  right: { stroke: "stroke-accent", fill: "fill-accent" },
  foul: { stroke: "stroke-danger-600", fill: "fill-danger-600" },
  pinrow: { stroke: "stroke-warning-700", fill: "fill-warning-700" }
};

export function ShotTracerView({ handedness, onBack }: { handedness: Handedness; onBack: () => void }) {
  const [step, setStep] = useState<Step>({ kind: "pick" });
  const [file, setFile] = useState<File | null>(null);
  const [video, setVideo] = useState<VideoFrames | null>(null);
  const [frame, setFrame] = useState(0);
  const [lines, setLines] = useState<MarkLines | null>(null);
  // The frame the lines were placed on, kept for the result: the frames
  // themselves go to the worker.
  const [shown, setShown] = useState<{ gray: Uint8ClampedArray; width: number; height: number } | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const findRef = useRef<Worker | null>(null);

  useEffect(
    () => () => {
      workerRef.current?.terminate();
      findRef.current?.terminate();
    },
    []
  );

  async function read(f: File, keepMarks: boolean) {
    findRef.current?.terminate();
    findRef.current = null;
    setStep({ kind: "reading", fraction: 0 });
    try {
      const v = await readVideoFrames(f, (fraction) => setStep({ kind: "reading", fraction }));
      if (v.gray.length < 10) throw new Error("too short");
      setVideo(v);
      if (keepMarks && lines) {
        // Correcting a result: the lines that were used, found or dragged, and
        // no second search, which would only find the same lane again.
        setStep({ kind: "mark" });
      } else {
        findLane(v);
      }
    } catch {
      setStep({ kind: "pick", unreadable: true });
    }
  }

  /** Looks for the lane on a few frames; on a miss, the bowler marks it. */
  function findLane(v: VideoFrames) {
    // The last frame: the pins have fallen and the lane is clear.
    const last = v.gray.length - 1;
    const markByHand = () => {
      setFrame(last);
      setLines(defaultMarkLines(v.width, v.height));
      setStep({ kind: "mark", notFound: true });
    };
    setStep({ kind: "finding" });
    const stride = Math.max(1, Math.floor(v.gray.length / FIND_FRAMES));
    const request: FindRequest = {
      width: v.width,
      height: v.height,
      // Copies: the screen still needs its frames to show and to trace.
      frames: v.gray.flatMap((g, index) => (index % stride === 0 ? [{ data: g.slice().buffer as ArrayBuffer, index }] : []))
    };
    let worker: Worker;
    try {
      worker = new Worker(new URL("../shotTracer/find.worker.ts", import.meta.url), { type: "module" });
    } catch {
      markByHand();
      return;
    }
    findRef.current = worker;
    const finish = () => {
      worker.terminate();
      if (findRef.current === worker) findRef.current = null;
    };
    worker.onmessage = (e: MessageEvent<FindMessage>) => {
      finish();
      const { frame: found, lines: foundLines } = e.data;
      if (found === null || !foundLines) {
        markByHand();
        return;
      }
      setFrame(found);
      setLines(foundLines);
      traceShot(v, foundLines, found);
    };
    worker.onerror = () => {
      finish();
      markByHand();
    };
    worker.postMessage(request, request.frames.map((f) => f.data));
  }

  function choose(f: File | undefined) {
    if (!f) return;
    setFile(f);
    void read(f, false);
  }

  function traceShot(video: VideoFrames, lines: MarkLines, frame: number) {
    const calib = video.gray[frame];
    setShown({ gray: calib.slice(), width: video.width, height: video.height });
    const request: TraceRequest = {
      width: video.width,
      height: video.height,
      frames: video.gray.map((g, i) => ({ data: g.buffer as ArrayBuffer, t: video.times[i] })),
      calibFrame: frame,
      marks: toCalMarks(lines),
      hand: handedness
    };
    // The frames move to the worker; tracing again reads the video again.
    setVideo(null);
    setStep({ kind: "tracing", fraction: 0 });
    workerRef.current?.terminate();
    const worker = new Worker(new URL("../shotTracer/trace.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    worker.onmessage = (e: MessageEvent<TraceMessage>) => {
      const m = e.data;
      if (m.kind === "progress") setStep({ kind: "tracing", fraction: m.fraction });
      else {
        setStep({ kind: "done", result: m.result, H: m.H });
        worker.terminate();
        workerRef.current = null;
      }
    };
    worker.onerror = () => {
      setStep({ kind: "done", result: { ok: false, failure: "unsupported-video", detail: "worker failed" }, H: null });
      worker.terminate();
      workerRef.current = null;
    };
    worker.postMessage(request, request.frames.map((f) => f.data));
  }

  return (
    <PushScreen history="route" mode="inline" title={t`Shot tracer`} onBack={onBack}>
      <div className="mx-auto w-full max-w-3xl space-y-5 px-3 pb-10 pt-2 sm:px-6">
        {step.kind === "pick" && <PickVideo unreadable={step.unreadable} onChoose={choose} />}
        {step.kind === "reading" && (
          <Waiting label={t`Reading the video…`} fraction={step.fraction} />
        )}
        {step.kind === "finding" && <Waiting label={t`Finding the lane…`} />}
        {step.kind === "mark" && video && lines && (
          <MarkLanes
            notFound={step.notFound}
            video={video}
            frame={frame}
            onFrame={setFrame}
            lines={lines}
            onLines={setLines}
            onTrace={() => traceShot(video, lines, frame)}
            onAnother={() => setStep({ kind: "pick" })}
          />
        )}
        {step.kind === "tracing" && <Waiting label={t`Tracing the shot…`} fraction={step.fraction} />}
        {step.kind === "done" && (
          <Result
            result={step.result}
            H={step.H}
            picture={shown}
            onRetrace={file ? () => void read(file, true) : undefined}
            onAnother={() => setStep({ kind: "pick" })}
          />
        )}
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
        {t`Film from behind the bowler with the whole lane in view, and trim the video to the shot, from just before the release until the pins fall.`}
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
  canvasRef,
  children,
  svgProps
}: {
  gray: Uint8ClampedArray;
  width: number;
  height: number;
  crop?: Crop;
  canvasRef?: React.MutableRefObject<HTMLCanvasElement | null>;
  children?: React.ReactNode;
  svgProps?: React.SVGProps<SVGSVGElement>;
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
        ref={(el) => {
          own.current = el;
          if (canvasRef) canvasRef.current = el;
        }}
        width={box.w}
        height={box.h}
        className="block h-auto w-full"
      />
      <svg viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} className="absolute inset-0 h-full w-full" {...svgProps}>
        {children}
      </svg>
    </div>
  );
}

function lineName(line: MarkLine): string {
  switch (line) {
    case "left":
      return t`Left edge of the lane`;
    case "right":
      return t`Right edge of the lane`;
    case "foul":
      return t({ message: "Foul line", comment: "A bowling term: the line at the start of the lane a bowler must not cross" });
    case "pinrow":
      return t({ message: "Back row of pins", comment: "The row of pin spots furthest from the bowler: the 7, 8, 9 and 10 pins" });
  }
}

function MarkLanes({
  notFound,
  video,
  frame,
  onFrame,
  lines,
  onLines,
  onTrace,
  onAnother
}: {
  notFound?: boolean;
  video: VideoFrames;
  frame: number;
  onFrame: (i: number) => void;
  lines: MarkLines;
  onLines: (l: MarkLines) => void;
  onTrace: () => void;
  onAnother: () => void;
}) {
  const { width, height } = video;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const loupeRef = useRef<HTMLCanvasElement | null>(null);
  const [drag, setDrag] = useState<{ line: MarkLine; end: 0 | 1 } | null>(null);
  const handle = Math.max(width, height) / 70;
  const reach = handle * 3;

  const toFrame = (e: ReactPointerEvent<SVGSVGElement>): Point => {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(width - 1, Math.max(0, ((e.clientX - r.left) / r.width) * width)),
      y: Math.min(height - 1, Math.max(0, ((e.clientY - r.top) / r.height) * height))
    };
  };

  // The loupe: the picture round the end being dragged, three times larger, so
  // the end can be placed on a line the finger is covering.
  const at = drag ? lines[drag.line][drag.end] : null;
  useEffect(() => {
    const c = loupeRef.current;
    const src = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !src || !ctx || !at) return;
    const span = c.width / 4;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(src, at.x - span / 2, at.y - span / 2, span, span, 0, 0, c.width, c.height);
    // A light crosshair under a dark one, so it shows on the lane and the pit.
    for (const [style, w] of [[getComputedStyle(c).backgroundColor, 3], [getComputedStyle(c).color, 1]] as const) {
      ctx.strokeStyle = style;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(c.width / 2, 0);
      ctx.lineTo(c.width / 2, c.height);
      ctx.moveTo(0, c.height / 2);
      ctx.lineTo(c.width, c.height / 2);
      ctx.stroke();
    }
  }, [at]);

  return (
    <div className="space-y-4">
      {notFound && (
        <p className="text-subhead text-ink-secondary">{t`The lane couldn't be found on its own. Drag the lines onto it.`}</p>
      )}
      <p className="text-subhead text-ink-secondary">
        {t`Drag the ends of each line onto the lane, on a frame where you can see it clearly. The lane's own edges, not the gutters.`}
      </p>
      <div className="relative">
        <FramePicture
          gray={video.gray[frame]}
          width={width}
          height={height}
          canvasRef={canvasRef}
          svgProps={{
            style: { touchAction: "none" },
            // The end nearest the finger, within reach: the far ends sit a few
            // pixels apart, too close for a target each.
            onPointerDown: (e) => {
              const p = toFrame(e);
              let best: { line: MarkLine; end: 0 | 1; d: number } | null = null;
              for (const k of MARK_LINES) for (const end of [0, 1] as const) {
                const q = lines[k][end];
                const d = Math.hypot(q.x - p.x, q.y - p.y);
                if (d <= reach && (!best || d < best.d)) best = { line: k, end, d };
              }
              if (!best) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              setDrag({ line: best.line, end: best.end });
            },
            onPointerMove: (e) => {
              if (!drag) return;
              const p = toFrame(e);
              const next = { ...lines, [drag.line]: [...lines[drag.line]] as [Point, Point] };
              next[drag.line][drag.end] = p;
              onLines(next);
            },
            onPointerUp: () => setDrag(null),
            onPointerCancel: () => setDrag(null)
          }}
        >
          {MARK_LINES.map((k) => (
            <line
              key={k}
              x1={lines[k][0].x}
              y1={lines[k][0].y}
              x2={lines[k][1].x}
              y2={lines[k][1].y}
              strokeWidth={handle / 3}
              className={LINE_TONE[k].stroke}
            />
          ))}
          {MARK_LINES.flatMap((k) =>
            ([0, 1] as const).map((end) => (
              <g key={`${k}${end}`}>
                <circle cx={lines[k][end].x} cy={lines[k][end].y} r={handle} fillOpacity={0.35} className={LINE_TONE[k].fill} />
              </g>
            ))
          )}
        </FramePicture>
        {at && (
          <canvas
            ref={loupeRef}
            width={128}
            height={128}
            aria-hidden="true"
            className={`pointer-events-none absolute top-2 h-32 w-32 rounded-full border-2 border-surface bg-surface text-accent shadow-sm ${
              at.x < width / 2 ? "right-2" : "left-2"
            }`}
          />
        )}
      </div>
      <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {MARK_LINES.map((k) => (
          <li key={k} className="flex items-center gap-2 text-footnote text-ink-secondary">
            <svg width="14" height="14" aria-hidden="true">
              <circle cx="7" cy="7" r="6" className={LINE_TONE[k].fill} />
            </svg>
            {lineName(k)}
          </li>
        ))}
      </ul>
      <label className="block space-y-1">
        <span className={GROUP_HEADING}>
          {t({ message: `Frame ${{ frameNumber: formatNumber(frame + 1) }} of ${{ count: formatNumber(video.gray.length) }}`, comment: "A picture of the video, not a bowling frame" })}
        </span>
        <input
          type="range"
          min={0}
          max={video.gray.length - 1}
          step={1}
          value={frame}
          onChange={(e) => onFrame(Number(e.target.value))}
          className="block w-full accent-accent"
        />
      </label>
      <div className="flex flex-wrap gap-3">
        <Button variant="primary" onClick={onTrace}>
          {t`Trace the shot`}
        </Button>
        <Button onClick={onAnother}>{t`Another video`}</Button>
      </div>
    </div>
  );
}

function failureText(f: TrackFailure): string {
  switch (f) {
    case "calibration-off":
      return t`The lines don't agree with each other. Check that each sits on its line, then trace again.`;
    case "lane-not-found":
      return t`The lane couldn't be worked out from the lines. Check that each sits on its line, then trace again.`;
    case "too-shaky":
      return t`The camera moves too much to follow the lane. Try a steadier video.`;
    case "ball-not-found":
    case "too-little-seen":
      return t`The ball couldn't be followed down the lane. Try a video with the whole lane in view.`;
    default:
      return t`This video couldn't be read. Try another one.`;
  }
}

function Result({
  result,
  H,
  picture,
  onRetrace,
  onAnother
}: {
  result: TrackResult | TrackError;
  H: Mat3 | null;
  picture: { gray: Uint8ClampedArray; width: number; height: number } | null;
  onRetrace?: () => void;
  onAnother: () => void;
}) {
  const actions = (
    <div className="flex flex-wrap gap-3">
      {onRetrace && (
        <Button variant="primary" onClick={onRetrace}>
          {t`Move the lines and trace again`}
        </Button>
      )}
      <Button onClick={onAnother}>{t`Another video`}</Button>
    </div>
  );
  if (!result.ok) {
    return (
      <div className="space-y-4">
        <p role="alert" className="text-subhead text-ink">
          {failureText(result.failure)}
        </p>
        {actions}
      </div>
    );
  }
  const m = result.metrics;
  const path = H ? pathInPicture(H, result.path, result.from, result.to) : [];
  const dots = H ? result.sightings.filter((s) => !s.airborne).map((s) => apply(H, { x: s.u, y: s.v })) : [];
  return (
    <div className="space-y-5">
      {picture && (
        <FramePicture gray={picture.gray} width={picture.width} height={picture.height} crop={H ? laneCrop(H, picture.width, picture.height) : undefined}>
          {dots.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={Math.max(1.5, picture.width / 400)} className="fill-accent" />
          ))}
          {path.length > 1 && (
            <polyline
              points={path.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              strokeWidth={Math.max(1.5, picture.width / 450)}
              strokeLinejoin="round"
              className="stroke-danger-600"
            />
          )}
        </FramePicture>
      )}
      <dl className="overflow-hidden rounded-[26px] bg-surface">
        <Reading label={t`Laydown`} metric={m.laydown} />
        <Reading label={t({ message: "Arrows", comment: "A bowling term: the aiming arrows 15 feet down the lane; here the board the ball crosses there" })} metric={m.arrows} />
        <Reading
          label={t({ message: "Breakpoint", comment: "Bowling term: the point where the ball turns from skid to hook" })}
          metric={m.breakpoint}
          feet={m.breakpointFeet}
        />
        <Reading label={t({ message: "At the pins", comment: "The board the ball is on where it meets the pins" })} metric={m.pins} />
        <Reading label={t`Speed`} metric={m.speed} speed />
      </dl>
      {actions}
    </div>
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
