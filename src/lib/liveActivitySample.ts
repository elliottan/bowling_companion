import { t } from "@lingui/core/macro";
import { buildLiveActivityState, currentAppearance, type LiveActivityState } from "./liveActivity";
import type { PaletteId } from "./palette";
import type { Frame, PinNumber } from "../types/bowling";

/**
 * The sample game and the island's colors behind the Live Activity's pictures
 * in Settings (`LiveActivityPreviews`, ADR-244).
 */

/**
 * Each palette's dark accent and fill, which the island and the watch draw on
 * black whatever the app's theme (`HeadpinPalette.island`). The page only has
 * the tokens of the theme it is in, so these are written out;
 * `src/test/liveActivityProject.test.ts` holds them to `src/index.css`.
 */
export const ISLAND_ACCENTS: Record<PaletteId, { accent: string; fill: string }> = {
  felt: { accent: "94 214 193", fill: "45 138 120" },
  ocean: { accent: "147 197 253", fill: "59 130 246" },
  sunset: { accent: "253 186 116", fill: "249 115 22" },
  grape: { accent: "196 181 253", fill: "139 92 246" },
  rose: { accent: "253 164 175", fill: "244 63 94" }
};

function frame(n: number, ...balls: number[][]): Frame {
  return {
    game_id: 0,
    frame_number: n,
    shots: balls.map((standing) => ({ pins_standing: standing as PinNumber[] })),
    is_strike: balls[0].length === 0,
    is_spare: balls.length > 1 && balls[1].length === 0
  };
}

/** Game 2, the seventh frame's first ball just thrown: a strike, a spare, a
 *  double, an open frame and a spare behind it. */
const SAMPLE_FRAMES: Frame[] = [
  frame(1, []),
  frame(2, [10], []),
  frame(3, []),
  frame(4, []),
  frame(5, [7, 10], [7]),
  frame(6, [2, 4, 8], []),
  frame(7, [10])
];

/** The sample as the phone would be sent it, in the colors the app is showing. */
export function sampleLiveActivityState(): LiveActivityState {
  const state = buildLiveActivityState(
    {
      description: t({ message: "Tuesday league", comment: "A sample session's name, on a picture of the Lock Screen" }),
      alley_name: t({ message: "Sunset Lanes", comment: "A sample bowling alley's name, on a picture of the Lock Screen" })
    },
    { game_number: 2 },
    SAMPLE_FRAMES,
    currentAppearance()
  );
  // A sample with balls in it always has a state.
  return state as LiveActivityState;
}
