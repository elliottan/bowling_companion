import { t } from "@lingui/core/macro";
import { createPortal } from "react-dom";
import { formatFixed, formatNumber } from "../lib/format";
import type { FramePart, ReadingShot } from "../lib/shotTrack/readingFrame";
import { FramePicture } from "./FramePicture";
import { FormSheet } from "./ui/FormSheet";

/**
 * What the tracer drew on a video frame, in the frame's own colors: bright
 * yellow for the ball and the point it reads, white for the line. They sit on
 * a photograph, whose brightness is not the app's to choose, so the tokens
 * that flip between light and dark would put a dark ring on a dark frame
 * (the review pictures in `scripts/shot-tracker` draw the same yellow).
 */
const RING = "#ffe600";
const LINE = "#ffffff";

/** The frame a reading was taken on: the ball, the point where it is read and the line it is read along. */
function Picture({ part, caption }: { part: FramePart; caption: string }) {
  const r = part.disc?.r ?? 8;
  // The cross's arms, in the crop's pixels: a part of the ball's size, never too small to see.
  const arm = Math.min(8, Math.max(2.5, 0.35 * r));
  return (
    <figure>
      <FramePicture gray={part.gray} width={part.width} height={part.height} label={caption}>
        {part.line && (
          <line
            data-testid="reading-line"
            x1={part.line[0].x}
            y1={part.line[0].y}
            x2={part.line[1].x}
            y2={part.line[1].y}
            stroke={LINE}
            strokeOpacity={0.75}
            strokeWidth={1.5}
            strokeDasharray="5 4"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {part.disc && <circle data-testid="reading-ball" cx={part.disc.cx} cy={part.disc.cy} r={part.disc.r} fill="none" stroke={RING} strokeWidth={2} vectorEffect="non-scaling-stroke" />}
        {part.cross && (
          <path
            data-testid="reading-cross"
            d={`M${part.cross.x - arm} ${part.cross.y - arm}L${part.cross.x + arm} ${part.cross.y + arm}M${part.cross.x - arm} ${part.cross.y + arm}L${part.cross.x + arm} ${part.cross.y - arm}`}
            fill="none"
            stroke={RING}
            strokeWidth={2}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </FramePicture>
      <figcaption className="mt-2 text-footnote text-ink-secondary">{caption}</figcaption>
    </figure>
  );
}

/** One frame's caption: where it is in the video, and for a speed which end of the stretch and how far down the lane. */
function captionOf(part: FramePart, number: number, which: "board" | "first" | "last"): string {
  const n = formatNumber(number);
  const time = formatFixed(part.t, 2);
  if (which === "board") {
    return t({
      message: `Video frame ${n} at ${time} s`,
      comment: "Caption of a picture from the shot tracer: which picture of the video it is, counted from 0 as the video's frames are listed, and the seconds into the video. Not a bowling frame"
    });
  }
  const feet = formatFixed(part.feet ?? 0, 1);
  return which === "first"
    ? t({
        message: `First frame: video frame ${n} at ${time} s, ${feet} ft down the lane`,
        comment: "Caption of the first picture of the stretch a speed was measured over; the video frame is not a bowling frame"
      })
    : t({
        message: `Last frame: video frame ${n} at ${time} s, ${feet} ft down the lane`,
        comment: "Caption of the last picture of the stretch a speed was measured over; the video frame is not a bowling frame"
      });
}

/**
 * The frame, or the first and last frame of the stretch, a reading of the shot
 * tracer was taken on, cut round the ball, in a sheet: the tracer's circle on
 * the ball, a cross where the reading is taken and the line it is read along
 * (DESIGN-LANGUAGE §1a: a task over the screen, answered by tap outside, a
 * swipe down, the back button or Escape).
 */
export function ReadingFrameSheet({ title, value, shot, numberOf, onClose }: { title: string; value: string | null; shot: ReadingShot; numberOf: (part: FramePart) => number; onClose: () => void }) {
  const speed = shot.reading === "launchSpeed" || shot.reading === "entrySpeed";
  // Out to the body: opened from a screen pushed into a tab, the sheet would
  // sit under the tab bar, which draws over everything inside the tab.
  return createPortal(
    <FormSheet title={title} subtitle={value ?? undefined} onClose={onClose}>
      <div data-testid="reading-frames" className="space-y-5">
        {shot.parts.map((part, i) => (
          <Picture key={part.frame} part={part} caption={captionOf(part, numberOf(part), !speed || shot.parts.length === 1 ? "board" : i === 0 ? "first" : "last")} />
        ))}
        <p className="text-footnote text-ink-secondary">
          {speed
            ? t`The ring is the ball, and the line is the row where its distance is read.`
            : t`The ring is the ball, the cross is where the board is read, and the line is that board.`}
        </p>
        {shot.estimated && (
          <p data-testid="reading-estimated" className="text-footnote text-ink-secondary">
            {speed
              ? t`Estimated: the ball was seen over only part of this stretch.`
              : t`Estimated: the ball wasn't seen at this spot, so the cross is where the fitted path crosses it, on the nearest frame where the ball was seen.`}
          </p>
        )}
      </div>
    </FormSheet>,
    document.body
  );
}
