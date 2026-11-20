# Shot tracer handoff: the lane with no lines

For the next agent. The goal the owner set (2026-11-14): **the tracer runs with
no input from the bowler.** The lane's edges, the foul line and the pin row are
found in the video; dragging lines is the fallback when that fails, and a
development aid, not the product. Read this, then
`scripts/shot-tracker/README.md` ("The lane with no lines" and "In the app"),
then `docs/SHOT-TRACKER-PLAN.md` sections 6 and 7 for the geometry. `CLAUDE.md`
holds the house rules; the ones that bite here are at the end.

## Where it stands (0.113.0, 2026-11-16)

On draft PR 219, not merged: the owner merges by saying so. The owner reads
only the review page (https://claude.ai/artifact/6ioRbhBs4oUo34nS6v67N6); its
six questions are open.

**The owner's rulings. They are the spec.**

- The app works with no hand-drawn lines. Hand lines are a review reference.
- No fixed clip length: keep from the ball at the foul line to the pin deck.
- Laydown is the board the ball is over as it crosses the foul line, and must
  not depend on where the bowler finishes. Every reading shows its frame.
- A hidden foul-line end gets a best guess from the rest of the picture.
- The pins board is read on the last frame before the ball touches a pin. A
  right-hander's board cannot fall there.
- The ball's outline must sit on the ball on every shot; where it cannot, say
  so and mark the reading.
- Two speeds: launch and at the pins. The owner is not checking speed yet.

**Done in 0.113.0** (see the changelog): the shot window (`shotWindow.ts`,
`src/shotTracer/readShot.ts`), the repeatable reader (`marking.ts`,
`videoFrames.ts`), run choice judged in feet on the first part's lane
(`shotStart.ts`), launch and entry speed (`speeds.ts`), laydown by time
(`atFoulLineTime` in `release.ts`), the pins follower that keeps the ball's
size and matches its face, the foul line from the edge line's end
(`edgeEnds`, `foulEnds`, `loneEndFoulLine` in `laneFind.ts`), and
`scripts/shot-tracker/circles.ts`, a check of every circle against the ball's
real outline.

**The measure after it** (auto, boards): shot-01 laydown 24.3, arrows 17.4,
pins 18.8 (frame 235; owner reads 18.5 to 19); shot-02 21.3, 15.9, pins 16.7
estimated; shot-03 13.8, 10.6; shot-04 6.2, arrows 5.1 estimated; shot-05
18.5, 13.1, breakpoint 8.9 at 50 ft; shot-06 17.5, 14.8, pins 18.4. On
IMG_1996 in headless Chromium four runs gave the same window and laydown
18.6, arrows 13.4, in about 70 s (trace 31 s, reading 17 s, lane 11 s).

**Known wrong or unproven.**

- Circles: shot-04 frames 107 to 108 (leg over the ball, 7% large) and shot-02
  near the pins (no top edge against the pit, circle a quarter ball low).
  shot-06 pins frames 102 to 103 and the breakpoint frames of shot-01 and
  shot-05 were not checked closely.
- shot-02 laydown reads 21.3 down the lane's upright and 21.7 down the
  picture; the owner called 21.9 right and has been asked which to use.
- shot-03's foul line moved 0.2 ft with the edge-line change.
- A video padded with another bowler's shots (shot-01 with 14 s of lead)
  still falls back to the slowest-ball window at 30 fps and reads laydown
  20.5 against 24.3.
- The hang on "Looking for the shot" was not reproduced; a 60 s timeout now
  ends it.
- The lane finder takes about 0.35 s a frame, three times what it took at
  0.112.0. Not looked into.
- The run-judging rules rest on IMG_1996 and two padded clips.
- Nothing has run on a real phone: rotated HEVC, HLG, Safari's frame
  timestamps and memory are all untested.

### Since then, still 0.113.0 (2026-11-17)

- Reading: WebCodecs decode (`lib/shotTrack/mp4.ts` demuxer, `shotTracer/codecFrames.ts`), play/seek kept as fallback with the iOS start fixed. Frames matched to samples by timestamp, picked by `framePick.ts`. Gray is full range from every reader (`grayRange.ts`, range from `colorSpace.fullRange`, else the `colr` box or VP9 flag, else limited).
- Speed: exact shortcuts in the lane finder and registration (about 3x), then a worker pool (`trace`/`lane` jobs). Desktop Chromium on IMG_1996: look 3.5, read 4.6, lane 1.0, trace 8.1, about 17 s with 4 workers. Parallel decoding is parked as a patch (not in the repo).
- Same answer everywhere: `detMath.ts` (fdlibm port; a lint rule bans `Math` transcendentals in `lib/shotTrack`), lane-search and background frames counted from the video's start (`gridFrames`), focal length from the found lane, `FOUL_LEAD` 0.4 s, a covered frame keeps the last floor (`PlanePass`), `onePace` drops pieces at the wrong pace, `nextPart` tried the look's next runs (replaced by `seekPart` on 2026-11-18, below). `scripts/shot-tracker/app-read.ts` runs the app's own read in Node; the app in Chromium matches it to every digit shown.
- First look: pace limits are fractions of a 9:16 height (`runScale`), so landscape and cropped clips are found.
- Every end screen shows a "Details" block (read path, codec, frame format, look, runs and their verdicts, stage times).
- Open: nothing has run on an iPhone since these changes (the owner's first two tries: "couldn't be read", then "shot couldn't be found" with no details); shot-01 pins 16.4 to 18.4 and shot-03 arrows 10.0 to 10.6 still move with where the read starts; the first look's run choice is fragile; IMG_1996 lost its breakpoint; shot-02 laydown 21.2 against the owner's 21.9; shot-06 pins 19.3 against 18.4; total time 17 s against "a few seconds".

### 0.113.1 and 0.113.2 (2026-11-17)

- 0.113.1: the search worker was never built (a `new URL` passed to a helper instead of written inside `new Worker`, so Vite inlined the `.ts` source as a data URL); every iPhone run ended on "shot couldn't be found". Workers are now `?worker&url` imports, a `noInlinedSources` build plugin guards it, and every tracer worker falls back to the main thread (`searchClient.ts`, `inlineWorker.ts`, `poolServe.ts`). Test hook `?tracerBreak=`. Test against `vite preview` of a build, not the dev server.
- 0.113.2: pins frame from the pins themselves (`pinMove.ts`): owner's ground truth shot-01 233, shot-06 101 to 102, both matched. Near follow extends the detector's run past the bowler's leg (shot-04 arrows now seen to 13.6 ft); covered rims placed by `carryFace`. `scripts/shot-tracker/review-app.ts` makes review pictures from the app's own read, with a `--check` circle-vs-outline crop.
- Still 0.113.2 (2026-11-18): the first look's frames come from the luma plane on every browser (`lookFrame.ts`), with pictures of what it saw under the details. The ball is now found where the lane is known (`ballFind.ts`): in each part read, ball-sized blobs for their lane row against a median empty lane, chained, rolling up the lane from the foul line; where a part does not show it, others are read until one does (`seekPart`: hints, then the whole video every 1 s, at most 8 parts or 30 s). A look run's window is used only when the ball is seen nowhere. The hole it closes: the pushaway (the ball held at the waist, 2 s before the shot) read through the floor's mapping as a run from 7 ft behind the foul line to 5 ft past it at a ball's speed and won the window on three of eight IMG_1996 copies. Every copy now reads the crossing at 3.58 to 3.63 s, laydown 18.2 to 18.5, arrows 13.3 to 13.5; the six clips read as before (README, "The ball found where the lane is known"). Not run on an iPhone: the search there runs on the main thread, about 0.5 s a part on a desktop.
- Open: shot-02's far sightings sit about 0.3 ball radius low (no top rim against the pit) and its far-end lane mapping is 1 to 1.5 boards off, so its pins read is probably 1.5 to 2.5 boards low; pin motion is not found when the bowler covers the rack (shot-05, IMG_1996) and may be fooled by an arm (shot-03 at 226); frame numbers: shot-01 and shot-02 start at 0.016 s, so `round(t*60)` is one above the owner's numbering.

### 0.114.0 (2026-11-19)

- The hand comes from the video (`handFind.ts`): the ball beside the body at the release, the drift to the arrows, the hook's turn, the side of the head pin. Every input agrees on every cue it has (shot-06, IMG_9960 and 6447 left; the rest right). The setting is kept, and said, when the cues are weak or split. The result screen says "Left-handed, from the video." with the app's own handedness control to switch it; `handedMetrics` reads the same trace again (`TrackResult.readOff`). The harness: `app-read.ts --hand auto`; `review-app.ts` reads the hand unless told `:left`.
- IMG_9960 left-handed: laydown 11.3, touchdown 11.5 at 1 ft, arrows 10.4, breakpoint 9.1 at 37 ft, each on its frame; pins not read (the bowler's hand covers the ball from 53.7 ft). Lane and foul line right on the calibration frame.
- 6447: `laneRows` took the masking units' artwork for the far end (a phone held low); the far end is now looked for where a camera 10 to 45 ft back puts the racks. The harness read that file a frame early (an edit list); fixed. It now reads the hand, pins 17.3 and entry speed, but not the laydown: the camera pans and moves between the release and the best lane frame (read frame 73), and the release frames do not register onto it. A calibration frame near the release reads laydown 10.2 to 10.4 and arrows 9.0 to 9.2; choosing it that way is open (README, 2026-11-19).
- shot-01 f230: a weak circle is cast again from where the ball was heading (`WEAK_RIM`); it moves about half the owner's correction, and the pins read 17.36 (was 17.44). f232 and f233 sit right of the run and are the likelier cause of "a bit light"; not changed. Review crops for the owner show only the yellow circle and base cross (`check/`); the cyan outline is in `check-debug/`.
- Open: the release cue's body box rests on twelve videos; a bowler who stands still for the whole read sits in the empty lane and gives no release cue (the others then decide). Nothing of this round has run on an iPhone.

### 0.114.1 (2026-11-20)

- Circles placed by the rim that shows (`arcFit`) at the ball's own measured size (`ownScale`, 0.93 to 0.98 of the lane's on every clip) wherever the radius could not be freed: legs, hands, pins. shot-01 f230 to f233 now run on the ball's path; pins 17.36 to 17.81, frame 233 kept (`BALL_MASK` 1.42 so the touched pin's near side is watched). shot-06 pins 19.30 to 19.13. shot-02 near the pins is smaller but still a quarter radius low (too little rim; its far-end mapping is the suspect). README, "The ball among the pins".
- The hand is always the video's; the switch is gone. New `line` cue, weights changed, a hook along the drift is ignored. The setting only with no cue.
- `fitPath` never weaves: the hook shape always, `rough` above 0.7 board RMS.
- Open: 8133 does not read in Node (wrong first look, no lane); its stopping short of the pins and its far right edge are not reproduced. The far line's tilt (1856) and a camera-based far-line constraint are not built. shot-02's far-end scale is not checked against the pins' 12 in spacing. Review pictures: `scratchpad/review12/`.

## Where it stood before that (0.112.0, 2026-11-15)

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
