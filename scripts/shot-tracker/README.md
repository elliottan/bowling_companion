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

## Results, round two (2026-11-12)

Registration now matches textured patches of the whole picture against the
calibration frame (a similarity by RANSAC), the contact point is the midpoint
of the ball's centre and its mirror image's, the touchdown comes from that
image (speed rule as fallback), and the speed is anchored on the touchdown and
the first frame the rack moves. Boards are handed. (m) measured, (e)
estimated. Pins check: found minus expected, boards.

| Clip | Visible | Sightings | Pins check | RMS | Laydown | Arrows | Breakpoint | Pins | Speed |
|---|---|---|---|---|---|---|---|---|---|
| shot-01 (right) | -4.3 to 49.3 ft | 112 | 7: 1.27, 10: -0.60, 1: 0.20 | 0.19 | 21.0 (m) | 16.1 (m) | missing | missing | 15.3 mph (m) |
| shot-02 (right) | -0.2 to 52.9 ft | 101 | not found | 0.16 | 17.8 (m) | 14.2 (m) | missing | about 9.0 (e) | 20.1 mph (m) |
| shot-03 (right) | not calibrated | | | | | | | | |
| shot-04 (right) | not calibrated | | | | | | | | |
| shot-05 (right) | 1.4 to 52.9 ft | 240 | 10: -0.53 | 0.39 | 16.8 (m) | 12.8 (m) | 8.6 (m) at 40.6 ft | about 10.7 (e) | 17.8 mph (m) |
| shot-06 (left) | -4.3 to 63.1 ft | 57 | not found | 0.28 | 18.3 (m) | 16.7 (m) | about 14.6 (e) at 40.5 ft | 16.3 (m) | 24.0 mph (m) |

### Radius diagnostic (reviewer's A3)

Fitted radius over the radius the lane's width predicts, by distance (count),
and the mean offset of the mirror-image contact from the radius contact.

| Clip | 0-20 ft | 20-40 ft | 40-60 ft | Mirror image found | Offset, feet | Offset, boards |
|---|---|---|---|---|---|---|
| shot-01 | 0.944 (45) | 0.944 (46) | 0.965 (19) | 104 of 114 | 0.17 | -0.08 |
| shot-02 | 0.952 (39) | 0.946 (38) | 0.954 (23) | 94 of 103 | 0.11 | 0.35 |
| shot-05 | 0.991 (94) | 0.989 (84) | 0.959 (63) | 32 of 244 | 0.20 | -0.11 |
| shot-06 | 1.002 (20) | 1.038 (14) | 1.023 (19) | 43 of 57 | -0.20 | 0.04 |

The dark disc runs small on a glossy ball (its underside mirrors the lane), so
a ratio a little under 1 is expected from that alone. shot-01 and shot-02 read
5% low at every distance; shot-05 and shot-06 read about 1.00 near and
within 4% far. The edge definition was not tuned on this.

### Verdicts against the gate (pins inside 1 board, RMS under 0.5, owner agrees)

**Not met.** No clip passes the pins check and traces to the pins:

- **shot-01:** pin 7 reads 1.27 board. It regressed in round two: it traced to
  58.9 ft before and now stops at 49.3 ft. After frame 204 the ball's
  candidates near the pins are missing and a static blob at 48 ft repeats.
  Not resolved.
- **shot-02 and shot-05:** now traced from the foul line to 53 ft (they were
  from 37.6 ft, and to 37.3 ft). No usable pins check.
- **shot-06:** traced to 63 ft, but 24 mph is not believable for this bowler.
  Its pin anchor is suspect.
- **shot-03 and shot-04** were not calibrated in round two (the reviewer's
  B/C, far line through other lanes' pin bases, is not done).

Open: hand labels (plan 10.3, check 2) and the R17 timing.

## Synthetic grid at clip size

Same cases, before and after round two (errors in boards; mph):

| Case | Before: laydown / arrows / bp / pins / speed | After |
|---|---|---|
| 1080x806, 60, right | -0.06 / -0.05 / -0.06 / 0.09 / 2.04 | -0.06 / -0.07 / -0.03 / -0.10 / 0.01 |
| 1080x806, 60, left | -0.50 / -0.49 / -0.60 / missing / 2.27 | 0.04 / 0.01 / -0.00 / -0.07 / 0.01 |
| 720x536, 30, right | 1.15 / 1.43 / 1.01 / missing / 4.00 | 0.16 / 0.11 / 0.06 / 0.02 / 0.03 |
| 720x536, 30, left | -0.17 / -0.20 / -0.66 / -0.53 / 1.49 | 0.13 / 0.10 / 0.03 / -0.02 / 0.05 |

The synthetic ceiling and wall textures now ramp over a few pixels instead
of stepping. The renderer samples each pixel once, so a hard edge jumped
whole pixels as the camera turned, which no real lens does.
