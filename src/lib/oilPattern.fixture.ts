import type { OilPass } from "../types/bowling";

/**
 * Kegel Element Challenge Chromium 6742, transcribed from the published sheet
 * (lvsb.at/wp-content/uploads/2021/05/Chromium-6742.pdf), row for row.
 *
 * It is here because a pattern model that cannot reproduce a real sheet's own
 * printed totals is a model of nothing. This one carries every awkward case at
 * once: reverse passes that end before they start, buffer-only passes with no
 * oil that still carry the pattern out to 42 ft, and a quoted distance (42)
 * that is a good 11 ft past where the last oil goes down (30.6).
 *
 * The sheet prints, and `oilPattern.test.ts` checks: 15.41 mL forward,
 * 10.15 mL reverse, 25.56 mL total, 42 ft, and track zone ratios of
 * 6.71 / 1.76 / 1.00 out from the middle on both sides.
 */
export const CHROMIUM_6742: OilPass[] = [
  { direction: "forward", left_board: 2, right_board: 38, loads: 3, microliters: 50, start_distance: 0.0, end_distance: 5.1, speed: 18, buffer: 4, tank: "A" },
  { direction: "forward", left_board: 7, right_board: 33, loads: 2, microliters: 50, start_distance: 5.1, end_distance: 10.2, speed: 18, buffer: 4, tank: "A" },
  { direction: "forward", left_board: 9, right_board: 31, loads: 2, microliters: 45, start_distance: 10.2, end_distance: 15.3, speed: 18, buffer: 3, tank: "A" },
  { direction: "forward", left_board: 10, right_board: 30, loads: 2, microliters: 45, start_distance: 15.3, end_distance: 20.4, speed: 18, buffer: 3, tank: "A" },
  { direction: "forward", left_board: 10, right_board: 30, loads: 2, microliters: 40, start_distance: 20.4, end_distance: 25.5, speed: 18, buffer: 3, tank: "A" },
  { direction: "forward", left_board: 11, right_board: 29, loads: 2, microliters: 40, start_distance: 25.5, end_distance: 30.6, speed: 18, buffer: 3, tank: "A" },
  { direction: "forward", left_board: 2, right_board: 38, loads: 0, microliters: 40, start_distance: 30.6, end_distance: 35.0, speed: 22, buffer: 3, tank: "A" },
  { direction: "forward", left_board: 2, right_board: 38, loads: 0, microliters: 40, start_distance: 35.0, end_distance: 42.0, speed: 26, buffer: 2, tank: "A" },
  { direction: "reverse", left_board: 2, right_board: 38, loads: 0, microliters: 50, start_distance: 42.0, end_distance: 39.0, speed: 30, buffer: 3, tank: "B" },
  { direction: "reverse", left_board: 2, right_board: 38, loads: 0, microliters: 50, start_distance: 39.0, end_distance: 28.0, speed: 22, buffer: 3, tank: "B" },
  { direction: "reverse", left_board: 13, right_board: 27, loads: 3, microliters: 50, start_distance: 28.0, end_distance: 20.4, speed: 18, buffer: 3, tank: "B" },
  { direction: "reverse", left_board: 12, right_board: 28, loads: 3, microliters: 50, start_distance: 20.4, end_distance: 12.8, speed: 18, buffer: 3, tank: "B" },
  { direction: "reverse", left_board: 11, right_board: 29, loads: 3, microliters: 50, start_distance: 12.8, end_distance: 6.9, speed: 14, buffer: 3, tank: "B" },
  { direction: "reverse", left_board: 8, right_board: 32, loads: 2, microliters: 50, start_distance: 6.9, end_distance: 3.0, speed: 14, buffer: 4, tank: "B" },
  { direction: "reverse", left_board: 2, right_board: 38, loads: 0, microliters: 50, start_distance: 3.0, end_distance: 0.0, speed: 14, buffer: 4, tank: "B" },
];
