import { createIcon } from "./createIcon";

export type { IconProps } from "./createIcon";

/** A bowling pin: head, neck, belly, base. One path and no neck band, because a
 *  band inside a 16px silhouette is a smudge across the neck rather than a
 *  band, and the pinch between head and belly already says "pin". */
export const PinIcon = createIcon(
  "PinIcon",
  <path d="M12 2c1.6 0 2.8 1.3 2.8 3.1 0 1.8-1.2 2.8-1.2 4.3 0 1.8 3.4 4 3.4 7.9 0 3-2.2 4.7-5 4.7s-5-1.7-5-4.7c0-3.9 3.4-6.1 3.4-7.9 0-1.5-1.2-2.5-1.2-4.3C9.2 3.3 10.4 2 12 2Z" />
);

/** A ball, gripped: two finger holes and a thumb hole below them, rather than
 *  three dots at arbitrary points, which read as a die. */
export const BowlingBallIcon = createIcon(
  "BowlingBallIcon",
  <>
    <circle cx="12" cy="12" r="10" />
    <circle cx="9" cy="9" r="1.15" fill="currentColor" stroke="none" />
    <circle cx="12.6" cy="8.3" r="1.15" fill="currentColor" stroke="none" />
    <circle cx="10.4" cy="12.4" r="1.4" fill="currentColor" stroke="none" />
  </>
);

/** A lane seen from above with oil down it: the pattern is longest in the
 *  middle and short at the edges, which is the shape of the thing. */
export const OilPatternIcon = createIcon(
  "OilPatternIcon",
  <>
    <rect x="4" y="2" width="16" height="20" rx="2" />
    <path d="M12 5.5v11" />
    <path d="M8.5 5.5v7" />
    <path d="M15.5 5.5v7" />
  </>
);

/** A leave with a line to it. The pins are solid because they are the target,
 *  and the line is the answer you wrote down. */
export const SpareLineIcon = createIcon(
  "SpareLineIcon",
  <>
    <path d="M4 20.5c1-7 5.5-11.8 12-13.3" />
    <circle cx="18.6" cy="5.4" r="1.7" fill="currentColor" stroke="none" />
    <circle cx="20.4" cy="10" r="1.7" fill="currentColor" stroke="none" />
  </>
);

/** The lane in perspective, with the arrows on it. */
export const LaneViewIcon = createIcon(
  "LaneViewIcon",
  <>
    <path d="M5 22 8.5 2h7L19 22Z" />
    <path d="m9.8 15 2.2-3 2.2 3" />
    <path d="m10.6 10.5 1.4-2 1.4 2" />
  </>
);

/** A marker planted on the lane: the plan is a thing you decide before you
 *  throw, not a direction you follow. */
export const GamePlanIcon = createIcon(
  "GamePlanIcon",
  <>
    <path d="M6 22V3" />
    <path d="M6 3h11l-2.6 4.2L17 11.5H6" />
  </>
);

/** A full rack, for the frames you left open. */
export const RackIcon = createIcon(
  "RackIcon",
  <>
    <circle cx="12" cy="5" r="1.8" fill="currentColor" stroke="none" />
    <circle cx="9.2" cy="10" r="1.8" fill="currentColor" stroke="none" />
    <circle cx="14.8" cy="10" r="1.8" fill="currentColor" stroke="none" />
    <circle cx="6.4" cy="15" r="1.8" fill="currentColor" stroke="none" />
    <circle cx="12" cy="15" r="1.8" fill="currentColor" stroke="none" />
    <circle cx="17.6" cy="15" r="1.8" fill="currentColor" stroke="none" />
  </>
);

/** The physical pair, which is how lane notes are kept. */
export const LanePairIcon = createIcon(
  "LanePairIcon",
  <>
    <rect x="2.5" y="3" width="8" height="18" rx="1.5" />
    <rect x="13.5" y="3" width="8" height="18" rx="1.5" />
  </>
);

/** The iOS share control, shown inline in a sentence that tells someone to tap
 *  it. Lucide's Share2 is the Android glyph, which is a different picture on
 *  the screen the reader is looking at. */
export const ShareIosIcon = createIcon(
  "ShareIosIcon",
  <>
    <path d="M12 3v12" />
    <path d="m8.5 6.5 3.5-3.5 3.5 3.5" />
    <path d="M7 10H5.5A1.5 1.5 0 0 0 4 11.5v8A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 18.5 10H17" />
  </>
);
