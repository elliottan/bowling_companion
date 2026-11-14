# Shot tracer handoff: finding the lane

For the next agent. Two pieces of work, in order: snap the bowler's rough lane
lines onto the real edges, then find the lane with no lines at all. Read this,
then `docs/SHOT-TRACKER-PLAN.md` (sections 6 and 7, and "PR 8. Calibration
with no handles"), then `scripts/shot-tracker/README.md` from "In the app"
down to "round four". `CLAUDE.md` holds the house rules; the ones that bite
here are at the end.

## Where it stands (0.108.0, 2026-11-14)

- The tracer (`src/lib/shotTrack/`) turns a video plus a lane calibration into
  the laydown, arrows, breakpoint, board at the pins and speed. Everything
  after the calibration is automatic: following the camera, the empty lane,
  finding and following the ball, the path, the readings, and a check of the
  calibration against the pins.
- **The calibration is not automatic.** It is a homography fitted to points
  placed on the lane's markings (`calibrate.ts`, `fitCalibration`).
  - In the app (Settings, Labs, Shot tracer, behind seven taps on the version
    line; `src/views/ShotTracerView.tsx`) the bowler drags the ends of four
    lines: the left and right lane edges, the foul line and the back pin row.
    Those eight points go to the tracer as they are. Nothing snaps them.
  - In the harness (`scripts/shot-tracker/calibrations/*.json`) the marks were
    placed by an agent, one clip at a time, with help: a rough segment drawn by
    eye, refined to the edge with `snapEdge` (sub-pixel, lane-is-brighter
    rule), then checked enlarged; pin bases from the bright columns of the rack
    and the dark seam where each pin meets its reflection; the foul line from
    the darkest row. Several were then corrected by the owner on the review
    page (the edges were on the bumper or gutter cap, not the lane). The JSON
    files hold the final coordinates; the harness does not snap at run time.
- So the six harness calibrations are hand-verified and are the answer key for
  both tasks below.

## What already exists to build on

| Piece | Where | What it does today |
|---|---|---|
| `snapEdge` | `src/lib/shotTrack/edgeSnap.ts` | Moves a rough segment onto the strongest edge within `band` pixels: gradient profiles across it every `step` pixels, a robust line through the peaks (RANSAC then least squares), `support` = share of steps that agree. `sign: "rising"` asks for brighter toward `interior` (the lane). |
| `snapMarks` | same | Snaps four rough lines (left, right, foul, deck end). Used by `trace()`'s `marks` input, which only the synthetic tests use (`pipeline.test.ts`, `roughMarks`). Its far line is the deck end, not the back pin row the app uses. |
| `localEdges` | `pipeline.ts` | Re-snaps each gutter edge in a short stretch at the ball's row in every frame, as a tracking aid only (it never defines the boards). Proof the snap holds up on real frames. |
| `checkPins`, `checkArrows` | `calibrationCheck.ts` | Finds the 7, 10 and head pins (brightest column a little above each base) and the arrows, and reports each one's error in boards against the calibration. A fine-fit and a self-check for task 2. |
| `fitCalibration`, `markResiduals` | `calibrate.ts` | Least squares over any mix of point and line marks, with each mark's residual. More marks give redundancy, and a mark over a board off is refused (`calibration-off`). |
| Harness | `scripts/shot-tracker/run.ts` and friends | `npx tsx scripts/shot-tracker/run.ts [shot-0N]` traces each clip and writes `out/<clip>/review.html`, `result.json` and `out/summary.md`. `look.ts` crops and enlarges frames; `foul.ts` and `diff.ts` are aids. The six clips are in `fixtures/clips/`, committed. |

## Task 1: snap the dragged lines onto the lane

Goal: the bowler drags each line roughly into place and it lands on the real
edge, so marking is quick on a phone and right to a fraction of a board.

1. In `ShotTracerView`, when a drag ends (pointer up), snap that line on the
   frame shown: `snapEdge` with a band of about 6 to 10 pixels at the app's
   frame size (962 by 718 for the 1080p clips), `interior` at the middle of the
   four lines, `sign: "rising"` for the edges and `"auto"` for the foul line
   and the pin row. Animate the line to the snapped place, and keep the
   bowler's own line when `support` is low (say under 0.4), so a snap never
   makes things worse. Keep the snapped segment's extent where the bowler put
   the ends; only its position and angle change.
2. **The lane edge is the lane's own edge, not the bumper.** Row by row from
   the lane outward there is: the lane, a thin dark line (the lane's edge, where
   the lane's colour ends), sometimes a grey strip a few pixels wide, then the
   gutter's groove or the cap. The strongest edge is often the groove, a board
   or more out. The snap must take the **first** rising edge from the lane side
   (the edge nearest the lane surface that clears a threshold), not the
   strongest in the band. The owner caught this three times (shot-01 left and
   right, shot-02); see "The owner's third point" in the harness README.
3. Put the snapping rule in `lib/` as a pure function with tests (the coverage
   floor on `src/lib/**` is 90% of lines), for example `snapLaneLine(frame,
   line, kind, interior)` in `lib/shotTrack/marking.ts`.
4. Measure it on the harness: for each clip, start from its hand-verified
   lines moved 5 to 15 pixels off at random, snap, and report how far each
   snapped line sits from the answer, in boards at the foul line and at 50 ft.
   Done when every edge on shot-01, 02, 03 and 06 lands within 0.3 board of
   the answer (shot-04 and 05 have edges hidden by the bowler or the frame:
   report them, do not tune to them), and the readings on the review page do
   not move by more than 0.3 board.

## Task 2: find the lane with no lines

Goal: the four lines start already placed on the lane, and the bowler only
corrects them when they are wrong. The handles stay as the fallback and the
way to correct (plan, PR 8).

Suggested approach (plan, PR 8, with what the clips taught since):

1. Pick the frame: one where the lane is clearest, for example the median of
   a few frames late in the clip, after the ball has gone (the harness's
   `look.ts --median`). The bowler moves; the lane does not.
2. Line segments: edges (Sobel or Canny) then segments (a probabilistic Hough
   or LSD). Keep the long ones in the lower two thirds.
3. Vanishing point: the point most of the long segments converge on (RANSAC
   over pairs). The lane edges, gutters, caps and the neighbouring lanes all
   run to it; the boards' own grain does too, faintly.
4. Which pair is this lane: among the lines through the vanishing point, the
   two that bound the lane surface the bowler stands behind (nearest the
   picture's centre at the bottom, brighter between them than outside), with
   the width the perspective allows for 41.5 inches against the neighbouring
   lanes' pairs. Then apply task 1's first-edge-from-the-lane rule to each.
5. The foul line: the strongest cross-lane edge low in the picture between the
   two edges (the approach and the lane differ in colour and gloss). The back
   pin row: the bases of the 7 and 10 pins, or the line through the bases of
   the neighbouring racks (it runs straight across the whole house), or the
   deck end (the lane over the dark pit) if the pins have fallen.
6. Fine fit: with a first homography, `checkPins` finds the 7, 10 and head
   pins; add them as point marks (`pin N`) and refit. Their residuals say
   whether the lane found is the right one.
7. Show the found lines with the handles on them, and a plain line under the
   picture when the fit is unsure.

Measure the same way as task 1: the found lines against the hand-verified
ones, in boards at the foul line and at 50 ft, on all six clips, and the
readings against the review page. Report each clip, including the ones where
it fails; the owner wants to see where it fails, not a tuned average.

## Things that cost time before

- **The arrows do not show in any of the six clips** (reflections and
  compression). Do not depend on them.
- **The far end is a few pixels.** At 1080p a board at 60 ft is about one
  pixel; at the app's 962 by 718 less. Fit lines over their whole length, never
  from two points at the far end.
- **Grey levels.** The tracer's thresholds were set on the video's own grey
  (16 to 235, what ffmpeg gives). A browser canvas stretches it to 0 to 255,
  and with that stretch the ball was lost at 47 ft. `toGray` in
  `lib/shotTrack/marking.ts` converts back; use it for anything read in the
  app, and if you work on harness frames in Node they are already in that
  range.
- **Testing the app in a browser.** The container's Chromium cannot play
  H.264. Re-encode a clip to VP9 for a headless run (`ffmpeg -i shot-01.mp4
  -c:v libvpx-vp9 -b:v 6M -deadline realtime -cpu-used 8 -an shot-01.webm`).
  The app lives at `/app?pro`; the first run asks "Set up Headpin" (see
  `e2e/helpers.ts`, `dismissHandednessModal`). Drive the drags with
  `page.mouse`, converting frame pixels through the picture's bounding box.
  The Playwright browsers for `npm run test:e2e` are not installed in the
  container either; CI runs them.
- **Frame times.** A seek onto exactly a frame's edge lands either side of it.
  `videoFrames.ts` aims a quarter frame in and takes each frame's own time
  from `requestVideoFrameCallback`; keep that if you touch the reader.
- **Reading the owner's screenshots.** They review on the generated review
  page (scripts/shot-tracker `review.ts`) and on the in-app result picture.
  Put zoomed crops at every point you read, with the lines drawn, so they can
  check each one.

## House rules that apply

- `npm run verify` is the gate (lint, vitest with coverage floors, build,
  Playwright). Run it as its own command.
- New text is a `t` message, translated into every language in the same PR
  (the `translate-strings` skill; `npm run i18n:check` fails otherwise).
- Every merge to `main` bumps the version (`npm version x.y.z
  --no-git-tag-version`) with a `docs/CHANGELOG.md` section headed by it.
  Merging to `main` deploys, so merge only when the owner says.
- UI follows `docs/DESIGN-LANGUAGE.md` (semantic colour tokens, `Button`,
  `PushScreen`, motion through the shared hooks).
- Never write an em dash anywhere.
- Update `scripts/shot-tracker/README.md` with a dated section per round, as
  the earlier rounds did, and this file when the state above changes.
