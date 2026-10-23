import { MOTION_METERS, clamp, motionBand, type MotionReading } from "../lib/ballLayout";

/**
 * What a layout will do, as a narrow rail of short meters beside the ball. No
 * heading: the bars name themselves, and the ball beside them says whose they
 * are. The layout lab draws it live, and the Pro page's sample draws the same
 * rail, so the two never show different pictures of one screen.
 */
export function MotionRail({ motion, className = "" }: { motion: MotionReading; className?: string }) {
  return (
    <section aria-label="What it will do" className={`space-y-3 ${className}`.trim()}>
      {MOTION_METERS.map((m) => (
        <Meter key={m.key} label={m.label} value={motion[m.key]} words={m.words} />
      ))}
    </section>
  );
}

/** One motion reading as a short bar, named above and read in a word below,
 *  in the same thirds the summary sentence uses. */
function Meter({
  label,
  value,
  words
}: {
  label: string;
  value: number;
  words: readonly [low: string, mid: string, high: string];
}) {
  const word = motionBand(value, ...words);
  return (
    <div aria-label={`${label}, ${word}`} role="group">
      <div className="text-[11px] font-semibold leading-tight text-ink-strong">{label}</div>
      {/* The slider's own track colour: the rail sits on the sunken page
          colour, where the muted fill the old bars used all but vanished. */}
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-edge-strong">
        <div
          className="h-full rounded-full bg-accent-fill transition-[width] duration-200 motion-reduce:transition-none"
          style={{ width: `${clamp(value, 0, 1) * 100}%` }}
        />
      </div>
      <div className="mt-0.5 text-[11px] leading-tight text-ink-secondary">{word}</div>
    </div>
  );
}
