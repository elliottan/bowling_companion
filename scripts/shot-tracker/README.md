# Shot tracer harness

Development harness for the shot tracer (`docs/SHOT-TRACKER-PLAN.md`, section
10.3). Never shipped. It runs the same `src/lib/shotTrack/pipeline.ts` the app
will run, on the six sample clips in `fixtures/clips/`.

## Commands

```
npx tsx scripts/shot-tracker/run.ts             # every clip; about 1.5 minutes
npx tsx scripts/shot-tracker/run.ts shot-01     # one clip
npx tsx scripts/shot-tracker/synthetic-grid.ts  # the full-size synthetic grid (add --all for 32 cases)
npx tsx scripts/shot-tracker/calib.ts shot-01   # check a calibration's snap on its own frame
npx tsx scripts/shot-tracker/peek.ts <clip> <frame> <x0> <y0> <w> <h> <scale> <out.png>   # gridded crop for marking
```

`run.ts` writes to `scripts/shot-tracker/out/<clip>/` (gitignored):
`review.html` (self-contained, for the owner), `calibration.png`,
`sightings.png`, `lane.png`, `result.json`, and `out/summary.md` (the table
below).

## Calibrations

`calibrations/<clip>.json` holds the four marked lines, made by eye on an
enlarged frame (`peek.ts`) and refined by `edgeSnap`. A line may carry a third
number, the frame it was marked on, when the chosen frame hides it (plan 6.3):
it is snapped on that frame and carried by the picture's shift.

Choices made here, with the reason:

- **The far line is the bases of the 7 and 10 pins (62.6 ft), not the deck end.**
  From a phone at chest height behind the approach the tail plank is hidden
  behind the standing pins in every clip; what the plan's section 6.2 calls a
  strong edge (lane over a dark pit) is not visible. Marking the deck end at
  the visible lane-to-pin-deck boundary put it about 6 pixels (several feet)
  short in shot-01. `farFeet: 62.6` in a calibration says which line was
  marked. shot-02 is a spare with only two pins standing, so its deck end
  shows and is used.
- **The lane edge** is the lane-side flank of the thin dark line the gutter's
  lip makes (`edgeSnap.ts`, the lane-is-brighter rule).
- **Registration slack** is 2 pixels; shot-06 takes 4, because its masking
  units are animated screens, which makes the coarse shift less sure.

## What the clips showed that the plan did not expect

- The far end of the bowler's own lane is hidden by the bowler for most or all
  of the clip in four of six clips (shot-02 to shot-05), and the deck end is
  hidden behind the pins in all of them.
- A ball rolling on the lane does **not** meet its reflection in the picture:
  a bright gap separates them all the way down the lane (shot-01 frames 95 to
  150), and the pins show the same gap. So the touchdown cannot be found by the
  gap closing (plan 7.4 step 2). The tracer uses the plan's fallback, step 5:
  an airborne ball appears to run ahead of the rolling ball's distance against
  time.
- The calibration check's arrows are rarely found: on these lanes they are
  faint under the lane's reflections. Its numbers below are not trustworthy.

## Results (2026-11-12)

Boards are handed (board 1 is the bowler's gutter). (m) measured, (e)
estimated. Pins check: found minus expected position of the 7, 10 and head
pins, in boards, on a frame before the ball reaches 35 ft.

| Clip | Visible | Sightings | Pins check | Arrows check | RMS | Laydown | Arrows | Breakpoint | Pins | Speed |
|---|---|---|---|---|---|---|---|---|---|---|
| shot-01 (right) | 1.2 to 58.9 ft | 133 | 7: 1.25, 10: -0.74, 1: 0.18 | 2 found, worst 1.80 | 0.34 | 22.2 (m) | 17.1 (m) | 8.1 (m) at 44.7 ft (m) | 14.9 (m) | 15.5 mph (m) |
| shot-02 (right) | 37.6 to 60.1 ft | 35 | not found | 3 found, worst 1.59 | 0.62 | missing | missing | 9.6 (m) at 48.3 ft (m) | 16.2 (m) | about 14.7 mph (e) |
| shot-03 (right) | not calibrated | | | | | | | | | |
| shot-04 (right) | not calibrated | | | | | | | | | |
| shot-05 (right) | 0.3 to 37.3 ft | 164 | 10: 0.24 | 3 found, worst 2.16 | 0.32 | 16.9 (m) | 12.1 (m) | missing | missing | about 16.2 mph (e) |
| shot-06 (left) | 15.7 to 50.5 ft | 15 | 7: 0.33 | 1 found, worst 1.02 | 0.16 | about 19.6 (e) | 16.5 (m) | about 12.5 (e) at about 38.2 ft (e) | missing | 17.5 mph (m) |

Hand labels (plan 10.3, check 2) were not made in this pass. The owner's
reading of the laydown and arrows, per clip, goes here once given.

### Verdict per clip against the gate (pins check inside 1 board, RMS under 0.5, owner agrees)

- **shot-01: not met.** The best trace: the whole lane, 133 sightings, every
  circle sits on the ball in `sightings.png`, RMS 0.34. But the 7 and 10 pins
  sit about a board inside where the edges put them (1.25 and 0.74), so the
  lane at the pins is about 5% narrower than the edges say. The head pin is
  on board 20 (0.18), so boards near the middle are hardly affected; boards
  near the edges at the pins are off by up to a board. Either the lane edge
  definition is about a board outside the true edge at the far end, or the
  pin check is biased on real pins. Not resolved.
- **shot-02: not met.** The bowler hides the near lane, and the console the
  near right, so the ball is found only from 37.6 ft. RMS 0.62. No pin check
  (two pins standing).
- **shot-03: not met, not calibrated.** The bowler hides this lane's far end in
  every frame.
- **shot-04: not met, not calibrated.** Same reason.
- **shot-05: partial.** The near half traces well (0.3 to 37.3 ft, 164
  sightings at 120 fps, RMS 0.32, 10 pin within 0.24) and gives a measured
  laydown and arrows. Beyond 37 ft the ball is lost behind the bowler; the
  breakpoint and pins are missing and the speed is estimated.
- **shot-06: partial.** 720p, 30 fps, recompressed. 15 sightings from 15.7 to
  50.5 ft, RMS 0.16, 7 pin within 0.33. Laydown and breakpoint estimated.

**The gate is not met:** no clip passes all of it, and only shot-01 traces the
whole lane. The stages that fail on real clips are the far-end calibration
(hidden by the bowler and the pins) and following the ball while the bowler
stands in front of it, not the circle fit or the path fit.

## Synthetic grid at clip size

`synthetic-grid.ts` on frames the size of the clips, the lane as small as in
them, calibrated on the last frame. Errors against the renderer's truth
(boards; mph):

| Size | fps | Hand | Side ft | Body | Laydown | Arrows | Breakpoint | Pins | Speed mph | Seen |
|---|---|---|---|---|---|---|---|---|---|---|
| 1080x806 | 60 | right | 1.5 | yes | -0.06 | -0.05 | -0.06 | 0.09 | 2.04 | 5 to 59 ft |
| 1080x806 | 60 | left | 1.5 | yes | -0.50 | -0.49 | -0.60 | missing | 2.27 | 3 to 50 ft |
| 720x536 | 30 | right | 1.5 | yes | 1.15 | 1.43 | 1.01 | missing | 4.00 | 3 to 51 ft |
| 720x536 | 30 | left | 1.5 | yes | -0.17 | -0.20 | -0.66 | -0.53 | 1.49 | 4 to 58 ft |

The unit suite's end to end test (`pipeline.test.ts`, a 360 by 640 frame with
the lane filling a quarter of the width) holds 0.3 board and 0.3 mph. At clip
size the speed is 1.5 to 4 mph off and the boards up to 1.4 off at 720p: the
distance scale drifts when the far line cannot be re-snapped and is carried by
the shift alone (about a pixel over a second, which is several feet at the
far end). This is the first thing to fix.
