# Shot tracer handoff: the lane with no lines

For the next agent. The goal the owner set (2026-11-14): **the tracer runs with
no input from the bowler.** The lane's edges, the foul line and the pin row are
found in the video; dragging lines is the fallback when that fails, and a
development aid, not the product. Read this, then
`scripts/shot-tracker/README.md` ("The lane with no lines" and "In the app"),
then `docs/SHOT-TRACKER-PLAN.md` sections 6 and 7 for the geometry. `CLAUDE.md`
holds the house rules; the ones that bite here are at the end.

## Where it stands (0.109.0, 2026-11-14)

- **The lane is found automatically** (`src/lib/shotTrack/laneFind.ts`,
  `findLane`). On all six sample clips it finds the bowler's own lane, both
  edges, the foul line and the back pin row, on a frame it chooses, in 3 to 9
  seconds in Node (21 for the 120 fps clip, which gives it twice the frames).
- **The app uses it** (`src/views/ShotTracerView.tsx`, Settings, Labs, behind
  seven taps on the version line). A new video is read, the lane is looked for
  in a worker (`src/shotTracer/find.worker.ts`), and when it is found the
  trace starts at once: no marking screen. When it is not found the marking
  screen opens as before, saying so. "Move the lines and trace again" on the
  result opens the marking screen with the found lines on their frame, which
  is how a wrong lane is corrected.
- **It is not yet as good as the hand calibrations.** The readings of the
  automatic trace against the hand-calibrated one are in the table below: one
  clip agrees within half a board everywhere, three within about a board, one
  is two boards off, one has no hand trace to compare with.
- **The tracer, not the finder, is now the larger error.** The same good lines
  put on different frames of shot-01 move its laydown by up to 6 boards (see
  "The next work").

### The measure (`npx tsx scripts/shot-tracker/auto.ts`)

Automatic, with the hand-calibrated trace in brackets; boards, feet, mph; `e`
is the tracer's own "estimated".

| clip | frame | laydown | arrows | breakpoint | pins | speed |
|---|---|---|---|---|---|---|
| shot-01 | 140 | 23.0 (24.2) | 16.6 (17.3) | 7.3 at 43 (7.2 at 44) | 19.0 (19.7) | 14.9 (15.1) |
| shot-02 | 140 | 20.6 (18.3) | 15.7 (13.5) | none (8.6 at 44) | 16.1e (16.0e) | 16.1e (15.3e) |
| shot-03 | 250 | 13.7 (14.2) | 10.5 (10.5) | none (none) | none (none) | 15.6e (16.5) |
| shot-04 | 180 | 23.7 (none) | 31.9 (none) | none | none | 12.0e (none) |
| shot-05 | 440 | 18.2 (18.9) | 13.2 (13.7) | none (8.8 at 51) | none (none) | 17.9 (18.0) |
| shot-06 | 50 | 17.6 (17.7) | 14.7 (14.8) | 12.6 at 35 (12.5 at 36) | 18.8 (19.3) | 17.6 (17.0) |

Reading it:

- shot-06: within 0.5 board everywhere, speed 0.6 mph high.
- shot-01: laydown 1.2 and arrows 0.7 low. The left edge found sits about a
  board outside the hand marks at the near end; the bowler's leg hides it
  there on the chosen frame, and the hand marks sit on the lane side of a
  faint grey strip between the lane and its strong dark line.
- shot-03: laydown 0.5 low, arrows exact.
- shot-05: laydown 0.7 and arrows 0.5 low, and the breakpoint is lost. The
  found right edge is on the dark line at the lane's edge; the hand marks
  (three points on one straight line, drawn by eye) are about 1.2 boards
  further out. Which is right is the owner's call on the review page.
- shot-02: two boards off at the near end. The camera pans hard, is rolled 3
  degrees, a scoring screen hides the near right edge and the bowler's leg
  lies along the left one. The hand run needed two calibrations for it.
- shot-04: the hand trace fails without its `follow` aid, so nothing to
  compare; the automatic arrows reading (31.9 with a laydown of 23.7) is not
  believable and is the tracer following the wrong thing, since the found
  edges agree with the hand ones.

The hand calibrations (`scripts/shot-tracker/calibrations/*.json`) are still
the answer key. They are good to about 0.3 to 0.5 board, not better: do not
tune the finder to a difference smaller than that.

## How the finder works

The header of `laneFind.ts` lists the stages; each is its own exported
function with tests (`laneFind.test.ts`). In one paragraph each:

1. **Vanishing point and roll** (`lanesOnFrame`). Hough lines on the halved
   frame; the point most of the steep ones run through is where every
   lane-parallel line in the house meets. The slope of the level ones (racks,
   masking units, ceiling joints) is the camera's roll.
2. **The fan** (`buildFan`, `columnProfile`). The frame resampled so each
   column is one ray from the vanishing point, the reference line parallel to
   the horizon. Every edge, gutter and cap is then an upright stripe, and the
   median gradient down each column is a profile with a peak for each. The
   median ignores the bowler; a second profile over the far half of the lane
   rescues edges hidden near the camera; and each frame's profile is a median
   with its neighbours' (`steadyProfiles`), so a trouser leg lying along an
   edge on one frame is outvoted.
3. **Which lane** (`laneWidth`, `lanePairs`, `rankLanes`). Every lane is the
   same width in the fan. The bowler's is the pair of edges one lane width
   apart whose middle is within three quarters of a lane of the picture's
   centre at the near end; the neighbours' middles are 1.3 to 1.9 lanes away.
4. **The edges, exactly** (`snapLaneEdge`). At full resolution, the **first**
   rising edge from the lane side (`snapEdge` with `pick: "first"`), stepped
   out to the middle of the thin dark line (`toLine`), then fitted as a ray
   through the vanishing point refined from every lane line in view
   (`refineVanishingPoint`). First, not strongest: the gutter's groove and the
   cap are stronger and a board or more out. The owner caught that three
   times on hand marks.
5. **The pin row** (`pinRows`). Down a pin's column the picture is bright,
   then a narrow darker seam at its base, then its mirror image on the deck.
   The seams of every rack in the house lie on one line.
6. **The foul line** (`findFoulLines`). Two strips just inside the edges,
   clear of where the bowler slides; the rows where the brightness changes,
   paired across the lane at the camera's roll.
7. **The check that holds it together** (`laneAttempts`). Along the lane's
   middle, (pin row - vanishing point) / (foul line - vanishing point) =
   d / (d + 62.6) for a camera d feet behind the foul line. Each frame offers
   several pin row and foul line candidates; the camera distance most frames
   agree on picks among them (18 to 25 ft on the sample clips; 10 to 45 is
   allowed).
8. **The pins as marks** (`withPins`). `checkPins` finds the 7, 10 and head
   pins against the first fit; those within 1.5 boards go in as point marks
   and the fit is redone. They fix the far end across the lane, where an
   edge is a few pixels long.

## The next work, in order

1. **Stop carrying one calibration through the whole clip.** The tracer
   (`pipeline.ts`) registers every frame to the calibration frame, and on a
   hand-held phone that chain is the weak link (README, "Corrections to the
   plan", 7.3). Now that a calibration costs a third of a second a frame and
   no hands, find the lane on many frames and use each frame's own (or the
   nearest one's, carried a few frames only). Start by passing the finder's
   marks from several frames as `calMarks` with `frame` set, which the
   pipeline already accepts, and measure; then decide whether the pipeline
   should take a calibration per frame. This is where shot-01's 6 boards of
   laydown swing and shot-02's two boards are.
2. **The near left edge of shot-01 and the right edge of shot-05**: ask the
   owner which is the lane's edge on enlarged crops (`auto.ts --png` draws
   found in green over the hand truth in cyan). If the finder is right,
   re-mark the JSON; if the hand marks are, the first-edge rule needs to
   prefer the faint inner line (`LaneEdgeOptions.share`).
3. **Say how sure it is.** `LaneFound` carries each edge's support, the pins
   used and the camera distance. Turn those into one "trust it or show the
   lines" decision, and show the found lines over the frame on the result
   screen, so a wrong lane is seen at a glance. Today a wrong lane is only
   caught by the tracer's own `calibration-off`.
4. **When the foul line is off the bottom of the picture** `findLane` returns
   null. The plan's 6.3 covers the geometry (the arrows, or a default camera
   distance now that step 7 measures it).
5. **Speed on a phone.** Not measured in a browser yet. The finder looks at 24
   frames; the cost is the fan (three frame-widths of columns a frame).

## Things that cost time

- **Measuring the finder on a frame the hand truth is not on.** The truth is
  carried to the finder's frame by registration, and that carry was wrong by 2
  to 3 boards on shot-01 until `auto.ts` used the floor's own homography
  (`registerPlane`) as the tracer does. Trust the traced readings over the
  line errors.
- **The median of the whole clip is not a clean lane.** On a hand-held clip it
  smears, and on shot-04 the bowler never leaves. Single frames, many of them.
- **A rolled camera.** The picture's bottom row is not a line of one distance;
  neighbouring lanes then look narrower or wider than the bowler's, and the
  lane width learned from them misses the bowler's own (shot-02).
- **Caps outnumber lanes.** A cap's quiet top is a third of a lane wide and
  turns up as often; the width vote is weighted by width.
- **A pin's column is white from head to base.** Symmetry about the base does
  not find it; the seam does.
- **The arrows do not show in any of the six clips**, and `checkArrows` is two
  boards out even against the hand truth. Do not depend on them.
- **The far end is a few pixels.** A foot at the pins is under a pixel.
- **Grey levels.** Everything reads the video's own grey (16 to 235); `toGray`
  in `lib/shotTrack/marking.ts` converts a canvas back.
- **Testing the app in a browser.** The container's Chromium cannot play
  H.264; re-encode a clip to VP9 (`ffmpeg -i shot-01.mp4 -c:v libvpx-vp9 -b:v
  6M -deadline realtime -cpu-used 8 -an shot-01.webm`). The app lives at
  `/app?pro`; the first run asks "Set up Headpin" (`e2e/helpers.ts`).
- **The synthetic renderer** draws one rack. With `pinMirror` it has the seam
  the pin row is read from, but a rack alone is few bases: render 960 by 720
  with the lane a tenth of the width at the pins or the pin row is not found.

## The harness

| Command | What it does |
|---|---|
| `npx tsx scripts/shot-tracker/auto.ts` | Finds the lane on every clip, traces with it and with the hand calibration, prints both and writes `out/auto.md`. About 10 minutes; the hand traces are cached in `out/<clip>/hand-trace.json`. |
| `... auto.ts --no-trace --png shot-03` | The finder alone, a minute for all six; `out/<clip>/auto-lane.png` shows found (green, yellow) over hand (cyan). |
| `npx tsx scripts/shot-tracker/run.ts` | The hand-calibrated traces and their review pages, as before. |

## House rules that apply

- `npm run verify` is the gate (lint, vitest with coverage floors, build,
  Playwright). Run it as its own command. `src/lib/**` needs 90% of lines.
- New text is a `t` message, translated into every language in the same PR
  (the `translate-strings` skill; `npm run i18n:check` fails otherwise).
- Every merge to `main` bumps the version (`npm version x.y.z
  --no-git-tag-version`) with a `docs/CHANGELOG.md` section headed by it.
  Merging to `main` deploys, so merge only when the owner says.
- UI follows `docs/DESIGN-LANGUAGE.md`.
- Never write an em dash anywhere.
- Update `scripts/shot-tracker/README.md` with a dated section per round, and
  this file when the state above changes.
