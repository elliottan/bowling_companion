# Shot tracer handoff: the lane with no lines

For the next agent. The goal the owner set (2026-11-14): **the tracer runs with
no input from the bowler.** The lane's edges, the foul line and the pin row are
found in the video; dragging lines is the fallback when that fails, and a
development aid, not the product. Read this, then
`scripts/shot-tracker/README.md` ("The lane with no lines" and "In the app"),
then `docs/SHOT-TRACKER-PLAN.md` sections 6 and 7 for the geometry. `CLAUDE.md`
holds the house rules; the ones that bite here are at the end.

## Stopped mid-round (2026-11-16): what is saved and what is not

Two jobs were running on the branch `claude/bold-hypatia-m1z17k` (on top of
0.112.0) when the owner stopped them. Nothing here is released, no PR is open,
and the version is not bumped (next is 0.113.0). The tree type-checks, lints
and passes the 223 `src/lib/shotTrack` tests; the full `npm run verify` was
not run.

**The owner's rulings this round. They are the spec.**

- The app must work with no hand-drawn lines. Hand lines are a review and
  calibration reference only.
- Do not hardcode 4 seconds. The clip kept is from the moment the ball is on
  the foul line until it leaves the pin deck, and everything outside is
  cropped.
- Laydown is read on the frame the ball is right on the foul line. Review
  pictures must start from that frame, and every reading must show the frame
  it was read on.
- A hidden foul-line end gets a best guess (the other end, the gutter's line,
  the thin foul line itself, other frames). On shot-02 the right end is
  visible, barely.
- shot-01 pins is 18.5 to 19; the frame used (241) is a little late, the ball
  is already among the pins. When unsure, show the frame chosen and the few
  before it and the owner picks.
- shot-05: the left foul-line corner sits a little down and left of the real
  one. shot-02's whole-lane view is off.
- shot-06 pins 18.0 is acceptable.
- Two speeds: launch (first 10 to 15 ft) and at the pins. The owner is not
  checking speed for now.
- The owner did not know what the review page's "Hand" column was. It is the
  same tracer run on lane lines marked by hand on one frame. Label it so, or
  drop it.

**Job 1, the foul line from one gutter end (half done, committed).**
`laneFind.ts` has `oneGutterFoulLine(ends, pairs, slope, tol)`, used when
`gutterFoulLine` finds only one end. Not done: tests for `gutterEnds` and
`oneGutterFoulLine` (coverage floors will bite), and no check yet that it moves
shot-02 (was 0.6 ft up the lane) without moving the other clips more than
0.1 ft. Check with `scripts/shot-tracker/foul-look.ts`. shot-01 pins and the
shot-05 corner were not started.

**Job 2, the shot window, speeds and the reader (half done).**

- Committed: `speeds.ts` and `speeds.test.ts` (launch and entry speed). Not
  wired into `auto.ts`, the result screen or the translations.
- Not committed as code: the reader rewrite is saved as
  `scripts/shot-tracker/wip/shot-window.patch` (applies cleanly to this
  commit with `git apply`). It touches `marking.ts` (`READ_SECONDS`,
  `readWindow`), `shotStart.ts`, `videoFrames.ts` and adds `shotWindow.ts`.
  It does **not** type-check: `marking.test.ts` expects the old exports and
  `ShotTracerView.tsx` line 154 passes 4 arguments where 3 are now taken.
  Treat it as a draft to read, not as code to trust.
- Not started: the reader's repeatability. On IMG_1996 laydown read 18.7 on
  one browser run and 27.3 on another, because play-and-copy dropped frames
  (237 frames over 4.6 s). The idea: find gaps from the media timestamps,
  re-read them by seeking, and give each frame its own media time.

**A finding to carry.** On five of the six clips the ball is never on the foul
line in the video: it crosses in the bowler's hand, about a ball radius above
the lane ("the ball's bottom never reached the foul line's row"; only shot-06
reaches it). So "the frame the ball is on the foul line" is the frame the ball
comes lowest, with the board read straight below its center. The owner has not
been asked to confirm this reading of their rule; put it on the review page.

**The review page** (https://claude.ai/artifact/6ioRbhBs4oUo34nS6v67N6, the
only thing the owner reads) still shows the 0.112.0 questions.
`scripts/shot-tracker/review-auto.ts` and `review-frames.ts` now write a
picture of the frame behind every automatic reading, and for pins the reading
frame plus the four before it (`frames.json`, key `auto`). The page has not
been rebuilt to show them. The page's build files lived in a session scratch
folder and may be gone; rebuild from those scripts.

**Order to pick up in:** finish job 1 with tests; shot-01 pins; job 2 (window,
reader, speeds on screen, 7 locales); rebuild the review page with the frames,
the Hand column explained and the new questions; then bump to 0.113.0, write
the changelog, open a draft PR. Merge only when the owner says.

## Where it stands (0.112.0, 2026-11-15)

- **0.112.0 made the app all automatic**, on the owner's word: no marking
  screen, no dragged lines, no trim step. `shotStart.ts` finds the ball's run
  up the lane in a coarse first look (`scanVideo`, `search.worker.ts`), the
  read starts 0.6 s before it, and a portrait original is cropped to the
  lane's band before scaling (the sample clips are crops; a phone's original
  arrived at 58% of their scale and the lane was not found). Read the dated
  README sections "The foul line, and shot-04" and the app agent's notes
  there before changing either. Where the bullets below mention the trim
  step or "Move the lines and trace again", those are gone.
- **The foul line goes through both gutter ends** (`gutterEnds`,
  `gutterFoulLine` in `laneFind.ts`). It used to take the edge of a band of
  boards 1 to 1.7 ft up the lane on four of six clips, and the hand marks
  had copied the same band on three. shot-02's is still 0.63 ft up (the
  console hides the right gutter).
- **shot-04 traces its near end** (`nearFollow.ts`): laydown 6.4, touchdown
  5.8 at 3.7 ft, arrows estimated. The ball is behind the bowler past 13 ft.
- **The owner's readings from the frames (2026-11-15)**: shot-02 laydown
  21.9 and arrows 15.8 are right; shot-01 at the pins is 18.5 to 19 (auto
  reads 17.2, the hand trace 16.2); shot-06 at the pins is 18.4 (auto now
  18.0; the hand trace's 19.3 is read after impact).
- **Known weak points of 0.112.0**: the shot's start was right on the one
  real original (IMG_1996, kept only in the session's scratchpad) and on two
  of four padded stand-ins; the laydown on IMG_1996 read 18.7 on one browser
  run and 27.3 on another (the reader dropped frames); nothing was run on an
  iPhone (rotation, 10-bit HLG).

## Where it stood before that (0.111.0)

- **The lane is found on many frames, and each frame uses its own.**
  `findLanes` (`laneFind.ts`) calibrates every frame it is given; `laneTrack.ts`
  carries each found lane a few frames and blends them, so the tracer
  (`trace({ lanes })` in `pipeline.ts`) no longer carries one calibration
  through the clip. How much laydown moved with the choice of calibration
  frame fell from 1 to 29 boards to under half a board
  (`scripts/shot-tracker/swing.ts`).
- **The app uses it** (`src/views/ShotTracerView.tsx`, Settings, Labs, behind
  seven taps on the version line). A video is read by playing it
  (`src/shotTracer/videoFrames.ts`; seeking a frame at a time took minutes on
  a phone), a video over five seconds first asks where the shot starts, the
  lanes are found in a worker and the trace starts at once. The result draws
  the lane it used, and says "The lane may be off" when `laneVerdict.ts`
  doubts it. "Move the lines and trace again" is the way to correct it; lines
  dragged by hand are traced as marks, as before.
- **Laydown and touchdown are two readings** (the owner, more than once): the
  laydown is the board the ball crosses the foul line on (0 ft), in the hand
  or in the air; the touchdown is where it first touches the lane. The result
  screen shows both, with a ring on the foul line at the laydown. Any picture
  or page of a trace must show the laydown at the foul line, not at the first
  sighting.
- **A hidden foul line is guessed** (`guessFoul`) from the camera distance
  other frames of the clip measured, or a typical 22 ft, and marked as a
  guess (`LaneFound.guess`). No sample clip needs it on its best frame.
- **Not yet tried on a real phone.** The reader's fast path (`VideoFrame`
  copies during playback) is checked in the container's Chromium on VP9 only.

### The measure (`npx tsx scripts/shot-tracker/auto.ts`)

Automatic, with the hand-calibrated trace in brackets; boards, feet, mph; `e`
is the tracer's own "estimated". The left edge of shot-01 and the right edge
of shot-05 were re-marked on the owner's ruling (the finder was right).

| clip | laydown | arrows | breakpoint | pins | speed |
|---|---|---|---|---|---|
| shot-01 | 23.8 (23.3) | 16.9 (16.7) | 7.7 at 43 (7.5 at 43) | 16.7 (20.5) | 15.3 (15.3) |
| shot-02 | 21.9 (18.3) | 15.8 (13.7) | none (8.7 at 45) | 16.1e (16.1e) | 15.9e (15.3e) |
| shot-03 | 14.1 (14.2) | 10.5 (10.5) | none (none) | none (none) | 18.3 (16.5) |
| shot-04 | not traced (`too-little-seen`); the hand trace fails too | | | | |
| shot-05 | 18.7 (18.5) | 13.1 (13.1) | 8.9 at 49 (8.9 at 49) | none (none) | 18.1 (18.1) |
| shot-06 | 17.8 (17.7) | 14.7 (14.8) | 12.6 at 35 (12.5 at 36) | 18.4 (19.3) | 17.5 (17.0) |

Reading it:

- Laydown and arrows are within half a board on shot-01, 03, 05 and 06.
- shot-02's hand column is its single calibration; `run.ts`, with the second
  calibration for the near end, reads 21.0 and 15.7, so the automatic near
  end is within a board of that. No breakpoint is found.
- shot-01's board at the pins (16.7 against 20.5, by eye 19.4):
  `followForward` loses the ball six frames before the rack moves.
- shot-03's speed (18.3 against 16.5): the rack's first movement is found 14
  frames early.
- shot-04 is not traced; the bowler covers the far end throughout.

The hand calibrations (`scripts/shot-tracker/calibrations/*.json`) are still
the answer key, good to about 0.3 to 0.5 board: do not tune below that.

### What the app sees is not what the harness sees

- **Grey range.** The harness (`clip.ts`, ffmpeg `-pix_fmt gray`) feeds
  full-range grey (0 to 255); the app feeds video range (16 to 235). Measured
  on 2026-11-15: at full size, video range is worse on three clips; at the
  app's size (962 by 718, the first 240 frames) full range is worse. Neither
  wins, so nothing was changed.
- **Size and length.** The app scales to 960 by 720 and keeps 240 frames, two
  seconds of a 120 fps clip. Read that way, shot-03 keeps 1 found lane of 20
  and reads 13.3 and 9.4 (flagged "check"), and shot-05 reads 18.8 and 13.7.
- **Repeatability in the browser.** Three runs of shot-01 read laydown 18.8,
  23.8 and 23.8. The odd one had the reader slow playback to 0.28; which
  frames are caught seems to move the laydown by boards. Unexplained.

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

1. **Try it on a real phone** (iOS Safari, Android Chrome): read time, whether
   the fast reader path runs, whether the lane and readings are right. The
   reader prints one `console.info` line a read.
2. **Make the harness read what the app reads** (app size, 240 frames, video
   range) or the app what the harness reads, then find why one browser run of
   shot-01 read 18.8. Tuning on frames the app never sees is how this drifted.
3. **The far end.** Pins and breakpoint still move with the calibration frame
   (the empty lane and the search region are built in that frame's pixels),
   and `followForward` loses the ball over the rack (shot-01 pins, shot-03
   speed). Build the empty lane per stretch of the clip, or re-register
   around the ball's run after a first pass.
4. **The shot's start on real untrimmed videos** (`shotStart.ts`): its
   thresholds rest on one video; a backswing or the slide can win. Then
   shot-02: a breakpoint on the hard pan, and its foul line.
5. **The verdict's thresholds** (`laneVerdict.ts`) rest on six clips: the 25%
   kept-share line sits right at shot-03, and "no pins and a faint edge"
   flags shot-02 alone. Revisit with more clips.
6. **120 fps clips**: the 240-frame cap is two seconds; `laneTrack`'s reach is
   in frames, not seconds.

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
- **Grey levels.** The app reads the video's own grey (16 to 235; `toGray` in
  `lib/shotTrack/marking.ts`); the harness reads full range. See above.
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
| `npx tsx scripts/shot-tracker/swing.ts` | How far each reading moves with the calibration frame. |
| `npx tsx scripts/shot-tracker/review-auto.ts` | Pictures of the automatic trace (lane, near end, pin deck) and a `manifest.json` of its readings, for a review page. |
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
