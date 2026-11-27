# Shot tracer harness

Development harness for the shot tracer (`docs/SHOT-TRACKER-PLAN.md`, section
10.3). Never shipped. It runs the same `src/lib/shotTrack/pipeline.ts` the app
will run, on the six sample clips in `fixtures/clips/`.

## Commands

```
npx tsx scripts/shot-tracker/run.ts             # every clip; about 3 minutes
npx tsx scripts/shot-tracker/run.ts shot-01     # one clip
npx tsx scripts/shot-tracker/auto.ts            # no marks: the lane found, then traced, against the hand calibration; about 10 minutes
npx tsx scripts/shot-tracker/auto.ts --no-trace --png shot-03   # the finder alone; out/shot-03/auto-lane.png
npx tsx scripts/shot-tracker/swing.ts --mode lanes  # how the readings move with the calibration frame (modes one, marks, lanes); about 30 minutes
npx tsx scripts/shot-tracker/synthetic-grid.ts  # the full-size synthetic grid (add --all for 32 cases)
npx tsx scripts/shot-tracker/look.ts <clip> <frame> <x0> <y0> <w> <h> <scale> <out.png> [--cal] [--median]
npx tsx scripts/shot-tracker/diff.ts <clip> <first> <last> <step> <x0> <y0> <w> <h> <scale> <out.png>
npx tsx scripts/shot-tracker/foul.ts <clip> <out.png> <frame> [<frame> ...]
npx tsx scripts/shot-tracker/foul-look.ts <clip> <outDir> [<frame> ...]   # the foul line's region, found, hand and every candidate
npx tsx scripts/shot-tracker/review-app.ts <outDir> <video>[:left] ... [--frames dumpDir] [--check]   # the review pictures and every reading from the app's own read, with the circle check
```

`foul.ts` is the release aid: the near end of each frame named, with the foul
line drawn and a tick every board on it (numbered every 5), for reading where
the ball is as it reaches the line.

`diff.ts` is the detection aid: for each frame of a run, the same crop three
times (the frame steadied onto the empty lane, the empty lane, and the change
the detector counts, white where it is over the threshold), with the frame's
candidates boxed (green: kept as the ball). It shows why a ball that the eye
can see is not found.

`look.ts` is the marking aid: an enlarged, locally contrast-stretched crop of
one frame with a pixel grid in source pixels. `--median` shows the median of
every fourth frame carried into that frame instead (the bowler, the ball and
passing reflections go). `--cal` fits the clip's calibration, prints every
mark's residual, and draws the marks, the projected arrows (magenta) and pin
spots (red), board lines every 5 and the foul line and pin row over the crop.

`run.ts` writes to `scripts/shot-tracker/out/<clip>/` (gitignored):
`review.html` (self-contained, for the owner; phone-sized), `cal-lane.png`,
`cal-near.png`, `cal-pins.png` (the calibration on its frame, contrast
stretched), `sightings.png`, `lane.png`, `result.json` (with every mark's
residual) and `out/summary.md` (the table below).

## Calibration, round four: the lane's own markings

`calibrations/<clip>.json` lists marks, each placed on something visible on
the calibration frame or on the frame it names (carried by registration):

- `points`: `[name, x, y]` or `[name, x, y, frame]` for a point whose lane
  position is known: `arrow N` (handed board N, the arrow's tip, at
  `arrowFeet(N)`), `pin N` (the front of the pin's base, centred on it).
- `lines`: `[name, [[x, y], ...]]` or `[name, [[x, y], ...], frame]` for points
  on a lane line: `left` and `right` (the edges as seen from the foul line),
  `foul`, `pinrow` (the back-row pin bases, 62.6 ft: straight across the
  whole house, so other lanes' racks mark it) and `deck` (the tail plank).

The lane mapping is the weighted least squares fit to all of them
(`src/lib/shotTrack/calibrate.ts`: a linear solve, then Levenberg-Marquardt
on the marks' distances in the picture). Every mark's residual is reported in
pixels and in boards (across) or feet (along), in `result.json` and on the
review page, and a calibration with a mark more than a board off is refused
(`calibration-off`). A hidden edge is never marked: it comes out of the fit.

How the marks were found: pin bases by the bright columns of the rack on a row
through the pins' bellies (their centres) and the dark seam where each pin
meets its mirror image (its base). Check that seam against the pin itself:
the pin's head, neck and belly must repeat below it in reverse order at equal
distances, so the base is halfway between the head and the mirrored head. A
pin and its reflection together show two dark necks, and shot-06's rack was
first marked on the reflection's neck, 10 pixels low (round six). Edges by snapping a rough segment on the
visible stretch only (`snapEdge`, lane brighter) and checking it enlarged; the
foul line by the darkest row at several columns, on this lane and the next.

**The arrows do not show in any of the six clips.** The lanes mirror the
masking units and the compression flattens what is left; neither the frames
nor the median of the clip (`look.ts --median`) shows an arrow by eye. So the
board references are the pin spots at the far end and the edges at the near
end, with the foul line and pin row for distance. The snapped gutter edges now
sit 0.1 to 0.4 board from where the pins put the lane's edges (the "Gutter
edges vs fit" column), so the edge definition agrees with the pin spots.

## Registration, round four

1. **The camera's turn** (`register`): H = K' R K^-1, three angles and a zoom
   per frame from the whole picture's patches, robustly. The focal length is
   taken from the lane mapping itself where it gives one (`focalFromPlane`:
   the lane's two directions are at right angles); the picture's own small
   turns fix it poorly (the synthetic shot's fitted f was 1270 for a true
   2346).
2. **The floor's own plane** (`registerPlane`): textured patches whose lane
   position is on the floor (this lane, gutters, caps, the next lanes, the
   approach, the decks) are found in each frame, and both a turn and a full
   homography are fitted to them. The homography is taken only when it agrees
   with a third more patches than the turn and moves the lane by more than a
   quarter board at the foul line from where the turn puts it. A camera that
   does not travel keeps the turn.
3. **Steadied onto the empty lane** (round five): frames registered on the
   floor's homography are aligned once more to the empty lane by their own
   patches (`alignTo`) before differencing; that homography is good to a pixel
   or two at the far end, and over the rack that is the whole difference
   between the ball and the pins' outlines. The lane mapping is not changed.
4. The per-frame gutter re-snap at the ball's row is kept as a tracking aid:
   each edge's offset from the fitted edge has its clip median taken off (that
   is the gutter, not the registration), and what moves about it is taken off
   the ball's board.

## Corrections to the plan

- 6.2 and 7.2: four marked lines with the deck end as one is replaced by the
  least squares fit to every visible lane marking, with residuals and a
  refusal over one board. The deck end is hidden behind the pins in every
  clip; the pin row across the house is used instead.
- 6.5: the arrows are not a usable check on these lanes (not visible).
- 7.3: **the assumption that the camera does not travel is false for a
  hand-held phone** (the filmer sways), so nothing may rely on it. The camera does travel. A phone in a hand drifted sideways in shot-01
  between the touchdown (frame 77) and the calibration frame (150): the near
  floor moved 15 pixels more than the far wall (the ball return, nearer
  still, more again). No transform of the whole picture can follow that; the
  floor's own homography does. A similarity is also only the first-order part
  of a turn; the turn model is H = K' R K^-1.
- 7.3: the edges' re-snap may not define the boards: it is a tracking aid.
- 7.4: past the deck end the ball is off the lane's plane; no sighting there.
- 7.4: change is judged both against the empty lane's 3 by 3 range and
  against each pixel's own spread over time (five spreads from its median):
  over the rack the 3 by 3 range spans black to white and hid the ball.
- 6.3 and the screens: calibrate on one frame where everything marked shows.
  Marks carried from other frames bring the registration's error into the
  fit (shot-06's right edge, carried from frame 120, was 1.1 boards off).
- 7.4: the laydown is the board over the foul line (0 ft), not the board at
  the touchdown; the touchdown board and distance are reported beside it.
- 7.5: the skid's and the bend's bounds (15 to 55 ft and 2 to 30 ft) were too
  tight for real shots. shot-05 bends from the laydown on and shot-02's fit
  sat on both limits. They are 0 to 55 ft and 2 to 60 ft now.
- 7.4: near the pins a dark ball's top half is in front of the dark pit and
  does not differ from it. The change is then two pieces, a highlight and the
  lower half, and neither is the shape of a ball; a small piece straight above
  a wider one is joined to it (`joinPieces`).
- 7.5: the laydown and the arrows are read off a straight line through the
  sightings around them (`localU`: the first 10 ft, and 10 to 20 ft), not off
  the whole path. The path has one bend, and a shot that curves gently from
  the foul line and then turns hard pulls its straight start off the
  sightings.
- 7.4: in front of the rack a grey ball does not differ from the dark gaps
  between the pins, so its change is cut into strips. The candidates are also
  searched for on the change with gaps up to four pixels closed (`closeGaps`).
- 7.5: the board at the pins is a straight line through the sightings from
  54 ft on, placed by when they were seen (the fitted distance against time),
  not the whole path's board at 60 ft. A ball turns hardest in its last feet
  and the path, one bend and then straight, runs under it.
- 7.5: a handful of sightings past a long unseen stretch (more than 15 ft,
  fewer than 8 of them) are left out of the fit (`withoutIslands`), and the
  pins are then missing, not read off a path fitted across the gap.

## A camera far behind the approach, and the hand from a clear release (2026-11-24, not released)

**The owner's report** (IMG_5853, 0.117.2 on an iPhone): "Left-handed (from
the video)", "The lane may be off", laydown 12, every line off; the bowler is
right-handed. The camera stands about 23 ft behind the foul line, far back
on the approach, with a ball return to the right; the lane is a fifth of the
picture wide.

**Why the lane was wrong**: `laneRows` takes the near end where the lane's
structure falls sharply (a ratio of 1.5 over a few rows). Here the bowler's
legs, their reflection and the ball return keep half the lane's structure on
the approach, and the gutters' ends blur over six rows: the fall is 1.31 to
1.47 on 20 of 28 frames, so those frames fell back to the picture's bottom
row, 140 rows below the foul line. The lane's columns were then read over
the approach, the only quiet stretch one lane wide ran from the bowler's leg
to the ball return, and the lane width learned from those frames was wrong
for all of them. Node read a foul line on the approach and the camera 13 ft
back (laydown 33.7); the phone a lane out over the ball return.

**The fix**: a frame without a sharp fall now also offers its soft falls
(`NEAR_FALL`, 1.3) beside the lowest busy row (`NearRows.alts`), each with its
own profile (`NearSide`), and `settleNear` (run in `laneSteps` before
`steadyProfiles`) takes the one nearest the depth below the vanishing point
the three nearest sharp frames give (`MIN_SHARP_FRAMES`); with fewer sharp
frames the lowest busy row stays unless it puts the camera nearer than 10 ft
and a soft fall does not. The measure job reads the frame at the row chosen
(`atNear`). Not the sharpest soft fall on its own: on 8133 the lane's sheen
fades 70 rows short of the gutters' ends as softly as the end itself, and on
6447 a soft fall lies 40 rows onto the approach.

**The hand**: the release cue (ball beside the body) is the only cue that
holds whatever the lane mapping; drift, line, hook and pins are read in the
found lane's boards. A release of `RELEASE_CLEAR` (6) boards or more now
decides the hand against the rest (`why: "disagree"`). On the wrong lane the
right-hander's ball sat on the lane's left half.

**IMG_5853 now**: lane 7 between its gutters, foul line at the gutter ends,
pin row on the pin bases (the 6 in pin spacing within a board of the
mapping), camera 22.3 ft; right-handed (release +11.5, drift +4.7, hook,
line +10.5; pins -2.1 against), laydown 14.19 (the frame shows 14.2), touchdown
13.3 at 1.6 ft, arrows 9.54, breakpoint 6.69 at 29.3 ft, pins 22.1 estimated
(the far end is 1.4 px a board and the bowler's hand is over it), launch
17.0 mph. The same with the grey levels bent (gamma 0.6 to 1.6) and with
video-range grey: laydown 14.18 to 14.32, always right-handed.

**Every other input** (isolated from other work in the tree): 18 of 21 the
same digest; 8133 laydown 14.62 to 14.64, breakpoint 7.75 at 40.4 to 7.88 at
39.1, pins 14.05 to 14.50; shot-01 pins 17.47 to 17.57; shot-02 breakpoint
8.83 at 43.8 to 8.58 at 43.3; no hand changed. Pictures:
`scratchpad/review22/`.

## The foul line short of it after the release (2026-11-23, not released)

**The owner's report**: on IMG_0047's trace picture (a frame just after the
release) "the foul line (red) is not aligned... it is slightly before the
foul line, not on it".

**What the near end shows** (the clip's luma, read frames 0 to 251 of the
`app-read.ts --dump`): from the lane down, the yellow lane, a white band
about 8 rows deep, a grey band about 7 rows, then a thin dark step where both
gutters end and the approach begins. The finder's foul line runs through the
gutter ends on that step. On every found frame from read frame 38 on it lies
within a row of the step; the trace's lanes (`debug.geometry`) from frame 40
on lie a row above its bright side, on the dark line. On read frames 0 to 36
(3.13 to 3.75 s, the release and the laydown at 3.56 s) they lay 2 to 4 rows
below it, on the approach: the owner's "slightly before".

**Why**: one found frame, read frame 29 (3.61 s). The trailing leg lies over
the left gutter, its trouser ending where the approach begins: the gutter
strip's structure ran on 4 rows past the corner (left end 575.1 where the
step is at 571), while the left edge line's end was read at the top of the leg
(544.6), so `foulEnds` kept the gutter's end alone. Through it and the right
corner (gutter end and edge line's end agreeing at 568.9) the frame's foul
line was off the clip's tilt (-0.011 against 0.010), and `holdToTilt` weighed
the lines at the tilt through each end the frame shows for certain
(`foulAnchors`): the one through the leg put the camera 23.39 ft behind the
line, 0.13 from the clip's 23.52, nearer than any line on the step, and won.
The camera's distance cannot tell 3 rows (0.3 ft) apart. Read frame 29 is
the found lane nearest the release, so `laneTrack` carried it over the
release frames.

**The fix** (`laneFind.ts`): `foulEnds` marks an end where the gutter's end
and the edge line's end agree `corner` (the corner seen twice), and
`foulAnchors` keeps only the corners when the frame shows one; a gutter's end
that its own edge line does not confirm is left out then. Read frame 29 now
takes a line within a row of the step on the left and 2 rows below it on the
right (camera 23.74 ft); the release frames' lines lie from a row above the
step to a row below it (were 2 to 4 below), the later ones as before. Test:
`foulAnchors leaves out a gutter's end its edge line does not confirm when
the other side is a corner`.

**Measured** (Node, `app-read.ts --hand auto`, every input; laydown, touchdown
at feet, arrows, breakpoint at feet, pins, launch mph):

| input | before | after |
|---|---|---|
| IMG_0047 | 13.80, 13.19 at 1.28, 10.50, 6.59 at 36.78, 14.35, 15.96 | 13.80, 13.20 at 1.18, 10.50, 6.59 at 36.68, 14.33, 16.07 |
| img1996-sdr-avc1 | 18.55, 17.32 at 1.90, 13.39, 8.93 at 50.15 | 18.54, 17.32 at 1.90, 13.39, 8.93 at 50.15 |
| img1996-vp9-10-60 | 18.44, 13.36, 8.99 at 48.61 | 18.45, 13.36, 8.99 at 48.61 |
| shot-01 to 06, IMG_9960, IMG_2938, 1856, 6447, 8133, the other six IMG_1996 copies | | same digest |

The two IMG_1996 copies each moved one found frame's foul line (sdr-avc1 read
frame 136 by 2.4 rows, vp9-10-60 frame 105 by 1.0), both up toward the
thin dark line, which they had sat 2 to 5 rows below beside a shoe.

**Not changed: the white band.** On this house (shot-01 to 06 and IMG_0047)
the white band past the gutter ends is 1.1 to 1.7 ft deep, its far edge where
the lane's yellow starts and where the edge line has a small hook. It is the
band the finder took for the foul line before 0.112.0, which the owner then
said was not on it. The gutters, both edge lines and the capping's end all
stop at its near edge, and the ball's reflection shows in it. If the owner
means its far edge, that is a new ruling for every clip of this house, a foot
or more each.

Pictures: `scratchpad/review20/` (`IMG_0047-f20`, `-f30`, `-f40-foul-before-after.jpg`
for the traced line, `IMG_0047-lane-f29-*` for the found frame,
`img1996-*-f136` and `-f105` for the two copies).

## The ball found again past the bowler, and the far readings gated (2026-11-22, not released)

**The owner's report**: IMG_0047 (iPhone HEVC, portrait, 59.94 fps, a
right-hander on lane 9 filmed from behind) on 0.116.1 read laydown 13.5,
touchdown 13.3 at 1 ft, arrows 10.5, breakpoint 10.8 at 14 ft (measured) and
at the pins 36.7 (estimated), with the drawn path swinging across the lane
past the last dot. "Completely off": the bowler's arm and body cover the ball
from mid lane until just before the pins.

**Node does not reproduce the phone** (`app-read.ts --hand auto`, full and
decoded grey): laydown 13.80 (13.60 decoded), arrows 10.50 (10.07e), no
breakpoint, no pins: sightings 1.3 to 26 ft only, one stray at 61.8 ft (read
frame 207, after the rack moved) left out as an island. The phone's frames
evidently gave it a far group the fit swung across to; the gates below are
what keeps any such group from being shown.

**Why the ball is lost.** The bowler holds the finish in front of the rack
for most of the read, so he is in the empty lane (the median): over the pins
the empty lane is his dark shirt, and the dark ball in front of the pins
differs from nothing, while the pins he steps away from are all change. In
mid lane the ball is plain to the eye beside his arm, but its change joins
the arm's into one blob too wide for a ball.

**What changed.**

- `reacquire.ts` (new): when the ball was last seen short of
  `REACQUIRE_BELOW_FT` (50 ft), the frames after are searched in the frame
  itself, not against the empty lane: a dark disk of the ball's own size
  (`ownRadius`) with the bright lane or pins round it (`darkDisk`, the ring's
  lower side left out for the mirror image, at most `INNER_LIT` of the inside
  lit), on the stretch of lane its pace puts it on each frame (0.75 to 1 of
  its pace, 3 ft either way, at most 0.45 board a foot across), not as dark
  on five frames from before (`stillDark`: a gap between pins, a mark), each
  placed by its rim (`arcFit`), then the one chain a ball can make
  (`gapTrack`: links at most 0.5 s apart, across no faster than 40 boards a
  second, down the lane at its pace) going on at 0.5 to 1.3 of its pace
  overall (`paceHolds`). They join the sightings as `reacquired`, weight 0.5,
  and the path, motion, pins frame and readings are read with them
  (`reacquireBall` in `pipeline.ts`).
- Gates in `metrics` (`pathFit.ts`): a breakpoint only in `BREAKPOINT_FT` (24
  to 56 ft), with sightings within 15 ft on both sides (`BP_REACH_FT`;
  measured within 5 ft, as before), else none; a board at the pins only on
  the lane, an estimate only within 3 boards of the straight line through
  the last 10 ft seen run on (`pinsPlausible`), and neither the pins nor the
  breakpoint when the pins sit more than 20 boards (`MAX_HOOK_BOARDS`) in
  from the path's furthest point out. The entry angle goes with the pins.
- The follow to the pins with no rack movement starts only from a sighting
  past 45 ft (`PINS_FOLLOW_FROM_FT`); it ran from mid lane when the fitted
  motion alone said the ball was near the pins.
- The drawn path (`TrackResult.drawTo`, `drawnTo`): to the last sighting
  when the pins reading stands, else to the end of the first stretch seen
  (no gap over 15 ft), so it never swings out to sightings no reading
  trusts.

**IMG_0047 now**: 58 frames found again (read frames 97 to 114 and 132 to 148,
26.5 to 46.5 ft, beside the arm; 171 to 193, 54.5 to 61 ft, in front of the pins), every
circle on the ball. Laydown 13.80, arrows 10.50, breakpoint 6.59 at 36.8 ft
(measured: the ball is seen on both sides of it), pins 14.35 measured (the
owner's rough "17 or so"; the ball is right of the head pin, toward the 3
pin), pin frame 198 (the arm covers the rack from about 194).

**Every other input** (`sh16/runall.sh`): 17 of 20 give the same trace
digest. shot-03 (the same bowler) finds read frames 139 to 144 and 167 to
188 again: pins 13.99 measured (none before), breakpoint 6.46 at 38.3 ft
estimated (was 7.43 at 36.1 measured; the far sightings bend the path more
and the nearest sighting before it is 6 ft away). 8133 (left-handed) finds
33 to 48 ft and 56 to 59 ft again: arrows 11.44e, breakpoint 7.75 at 40.4,
pins 14.05 (none before). shot-04's first try found a pin's edge crossing
the arm at 47 to 49 ft going back down the lane; `paceHolds` drops it and it
reads as before. Pictures: `scratchpad/review19/`.

**Open**: the owner should check shot-03's and 8133's new far readings
against the frames; nothing of this has run on a phone (the search costs
about 0.5 s in Node on IMG_0047); the far lane mapping on IMG_0047 is not
checked against the rack's 12 in spacing.

## The first look's run on a zoomed-in camera, and the ball return taken for the lane (2026-11-21)

**The owner's report**: IMG_2938 on an iPhone (Safari 18.7, 0.116.0): "The
lane couldn't be found". The phone's search chose a run at 7.27 s (5
points from y 0.56), when the camera is zoomed in on the bowler walking
back; the first part, 6.87 to 8.47 s, shows no lane, and with one band to
try `readShot` read on to the end and gave up. In Node the luma plane's look
chooses 5.07 s instead (also no ball's, but its part has a lane, so the
ball search carried on to the real shot at 3.1 s). The search is not stable
on this clip: the whole picture zooms and the ball is a few pixels at 192
wide; adding 1 to every pixel keeps 5.07 s, a gamma of 0.8 picks 1.00 s,
a pixel of noise 2.47 s. `app-read.ts --found file.json` replays a look's
result (the phone's release and run, Node's others), and reproduces the
phone's "lane not found" on 6.87 to 8.47 s.

**The fix** is in `readShot`, not the search: when the first part shows no
lane, the parts the look's other runs start in, then the video stepped
through (`seekPart`), are looked at for the lane, and the first that shows
it becomes the first part; a band is given up only after that. A hint so
near the video's end that no part can leave `SEEN_ROOM` after it was read
again and again; `seekPart` now skips a part already read.

**The ball return.** With the bowler over the lane's right edge, the stretch
one lane width wide from the next lane's gutter (its far side) across the
ball return to a faint line inside this lane was the frame's pair: the left
edge on the gutter's outer side, the owner's complaint, on 13 of 16 frames
of one grid of a read from 2.87 s (the traced lane was right: `laneTrack`
drops lanes that disagree, while most agree). Inside that stretch lie the
gutter's groove and the capping, as strong as its edges; inside the lane
nothing is (under 0.3 of the stronger edge on IMG_2938 and IMG_9960, the
bowler and ball included). `rankLanes` now chooses among a frame's quiet
pairs (`interiorPeak` at most `INTERIOR_RATIO`, 0.5, of the stronger edge)
when it has any. A frame with no quiet pair keeps its best (a hard rule lost
true lanes behind the bowler on img1996 and moved its readings). Frames with
a wrong lane over nine grids of IMG_2938's reads: 57 of 148 to 32, and 22 of
80 to 10; the remaining ones have no true pair at all (the right edge hidden).

**Measured** (`app-read.ts --hand auto`, every input): IMG_2938 8.25 / 13.72
as before (the phone's look replayed: 8.25 / 13.72; with only the look's
runs at 7.87 s and before 1.1 s: 8.58 / 13.37, pins 36.5 estimated);
8133 now reads (laydown 14.62, the lane found on 5.60 to 7.20 s; it read
nothing before); img1996-vp9-10-60 laydown 18.31 to 18.44; every other
input reads the same. Pictures: `scratchpad/review18/`.

## The lane one gutter too wide on a zooming camera (2026-11-21)

**The owner's report**: on IMG_2938 "the left lane edge lines are wrong. They
are on the gutter, but it should be on the lane", circled on the first two
frames of `review16/lane-across-the-move.jpg` (read frames 0 and 24, 2.67
and 3.47 s).

**Where the edges are** (`scratchpad/review17/`, before on the left, after on
the right). Between lanes 3 and 4 stand lane 3's right gutter, the ball
return's capping with its hood at the foul line, lane 4's left gutter, then a
flat lip with two thin dark lines; the lane's edge is the outer of those two.
On read frame 0 that edge meets the foul line at x 452.5; the found left edge
ran from the capping's side of the left gutter to x 407, one gutter (9 boards)
out. The right edge was right on every frame. From read frame 33 on (zoom
about 1.2 and up) the left edge was already on the lane. Frames 0 to 28 were
wrong in the finder's own lanes, and the traced lane, blended from them,
carried the error onto every frame from the release to about 12 ft.

**Why.** `laneWidth` pooled the candidates' widths of every frame as fan
columns at the picture's bottom row. A lane's columns there are its spread
(the slope between its two edge rays) times the bottom row's depth below
the vanishing point, and a zoom moves the vanishing point up the picture
(IMG_2938: row 156 at the release, 9 on the calibration frame, -102 at 5.4
s) while the bottom row stays: the same lane was 431 columns at the start
and 520 later. The zoomed frames outnumbered the rest, the pooled width came
out 508, and on the early frames the only pair within 6% of it ran from the
gutter's far side to the right edge (491; the lane is 416). Neither the ball
return nor the shiny gutter was the cause: both are what the pair landed on.

Measured as spreads the lanes agree on every frame (0.73 to 0.77), and so
now: `laneSpread` replaces `laneWidth` (each width over its frame's
`fanDepth`, the reference line's depth below the vanishing point), and
`rankLanes` turns it back into each frame's columns. A zoom or a shift of the
picture keeps every line's slope, so a camera that holds still reads as
before to a fraction of a column.

That exposed a second, smaller fault: on the calibration frame the pair
within the new width could also take the lip's inner dark line, 24 px (2
boards) outside the edge, and the pair is scored by its weaker edge only: the
right edge was shared, so a 0.8% centering difference chose the faint line
(13) over the edge (47). Within a frame a pair is now chosen by both edges
(their geometric mean, times the centering); frames are still ranked by the
weaker edge.

**Measured** (Node, `app-read.ts --hand auto`, every input; laydown, arrows,
breakpoint at feet, pins; `e` estimated):

| input | before | after |
|---|---|---|
| IMG_2938 | 11.88, 16.01, none, 37.71e; left 0.56 | 8.25, 13.72, none, none; left 0.70 |
| IMG_9960 | 11.23, 10.41, 9.15 at 36.1, none | 12.38, 10.52, 9.31 at 33.6, 12.43e |
| 1856 | 12.09, 9.73, 8.36 at 30.6, 15.16 | 12.13, 9.75, 8.22 at 31.0, 17.35 |
| shot-01 | 24.30, 17.51, 7.45 at 43.3, 17.67 | 24.30, 17.53, 7.51 at 43.3, 17.47 |
| shot-02 | 21.23, 15.96, 8.82 at 43.5, 15.79 | 21.26, 15.96, 8.83 at 43.8, 15.67 |
| shot-03 | 13.59, 9.64, 7.43 at 36.1, none | 13.59, 9.64, 7.43 at 36.1, none |
| shot-04 | 6.24, 5.05e | 6.24, 5.05e |
| shot-05 | 18.54, 13.29, 9.04 at 48.6 | 18.53, 13.24, 9.04 at 48.6 |
| shot-06 | 17.62, 14.83, 12.76 at 34.2, 19.00 | 17.62, 14.81, 12.73 at 34.5, 18.99 |
| IMG_1996, eight copies | 18.18 to 18.54, 13.28 to 13.54 | 18.18 to 18.55, 13.27 to 13.54 |
| 6447 | pins 17.26 | the same |
| 8133 | no shot | no shot |

Pins frames: shot-01 frame 233 and shot-06 read frame 82 (video 101/102)
are kept. The IMG_1996 copies' breakpoints moved by under 0.2 board; one
copy lost its breakpoint and another gained one (two of eight had none
before and two have none now).

- IMG_2938: the near sightings were 4 boards right at the foul line and met
  the new ones by 30 ft; now the path runs evenly from board 8.7 at the foul
  line to 26.6 at 45 ft, a left-hander crossing to the right corner. The
  hand's confidence went from 0.56 to 0.70 (the release and line cues
  stronger, the drift still the other way). The pins are lost: the best lane
  frame moved from read frame 55 to 33 (zoom about 1.2 against 1.75; the
  qualities are within 0.03, the edges' support now higher), and with the
  empty lane built in frame 33's pixels the ball is lost past 45 ft. Forced
  to frame 60 it is seen to 59 ft and the pins read 37.67, measured, but the
  touchdown is lost; frame 55 breaks the laydown. No single calibration
  frame serves both ends of a camera that zooms 3 times; the empty lane per
  stretch of the clip (handoff, "The far end") is what fixes it.
- IMG_9960: the lane edges on every frame are the same to 0.3 px, but
  the coarse pick now takes the stronger left edge, the quality's edge bonus
  with it, and the best frame moved from read frame 79 to 66. On the laydown
  frame (read frame 13) the real corners at the foul line are x 415 and 676
  to 680 (pixel rows and a raw crop); the old traced lane put them at 422.0
  and 683.7, 7.5 px (1.1 boards) inside on both sides, the new at 414.6 and
  675.8. The laydown 11.23 was read off the shifted lane; 12.38 is the
  better reading. The foul line's row is unchanged; the breakpoint stays
  about 9.2 (9.31).
- 1856: the pins frame moved from read frame 92 to 98. In the raw frames the
  ball is still rolling in front of a standing rack from 92 to 98, and the
  pins first move at 99 to 100 (the bowler's hair crosses the rack's right
  side from 90 on); 17.35 is read from a sighting on 97, 15.16 was a face
  followed 0.1 s early.
- img1996-sdr-full: the best frame moved; the lane on it is the same lane.

Pictures: `scratchpad/review17/` (`IMG_2938-f<n>.jpg` for read frames 0,
24, 60, 83, 110 and 119, the lane carried through registration in green and
the frame's own found lane in cyan; `-left-edge` crops; the laydown, arrows
and lane pictures of IMG_2938, IMG_9960, 1856 and img1996-sdr-full).

## The foul line held to the pin row's direction (not released, 2026-11-21)

**The owner's report**: on IMG_9960 "the foul line red line is not on the
foul line", circled at its right end beside the bowler's feet. The phone's
result picture (a frame about 8.7 s in) drew the foul line with its right end
about 3 read pixels above the corner where the right gutter meets the
approach, the line level (slope -0.005) where the real one falls to the right
(+0.012 on that stretch). Node's read draws its result on read frame 79
(9.31 s), where the line sits on both corners to a pixel; the phone chose
another calibration frame.

**Why** (`scripts/shot-tracker` pictures in the session's `review15/`):

- The right gutter of this lane is a smooth grey channel: `gutterEnds` finds
  no end on it on any frame, so the foul line's right end only ever comes from
  the edge line's end (`edgeOnly`) or from a change of brightness in the right
  strip (0.85 to 0.96 of the lane).
- From 7.1 to 8.3 s the trailing shoe stands over that corner. On read frame
  48 the edge line's "end" was taken at the top of the shoe (20 rows high) and
  a brightness pair won with its right end on the shoe: slope -0.019, the
  right end 5 px high. Frame 43 went 0.023 the other way. Both were kept by
  `laneTrack` (they agree with their neighbors to half a board) and blended
  into the lane of every frame from the laydown on.
- Nothing held the foul line's slope: the pairs could lie 0.03 and the gutter
  line 0.04 from the reference, while the camera's roll itself moves 0.01 over
  the clip (the pin row's slope runs 0.0003 to 0.0108).

**The fix** (`laneFind.ts`): the foul line and the pin row are the same
direction on the floor, so the foul line's slope less the pin row's (its
tilt, `Ends.tilt`) barely moves within a clip whatever the camera's roll. Its
mode over the frames whose foul line runs through both gutters' ends is the
clip's tilt (`laneSteps`, at least `MIN_GUTTER_FRAMES`, `FOUL_TILT_SPREAD`),
and each frame's foul line is held to it (`holdToTilt`): a line more than
`FOUL_TILT_TOL` (0.01) off gives way to another candidate at the tilt or a
line at the pin row's slope plus the tilt through a gutter end the frame shows
for certain (`foulAnchors`), whichever puts the camera nearest where the clip
does; a line seen at one point only is turned to the tilt about that point.
Only frames whose pin row is wide enough to give its own slope are held (the
rest have no tilt to measure). IMG_9960's tilt is 0.0066; frame 48 now has
slope 0.0068 and its right end within about a pixel of the corner, frame 43
0.0070.

**Measured** (Node, `app-read.ts --hand auto`; laydown, arrows, breakpoint at
feet, pins; `e` estimated):

| input | before | after |
|---|---|---|
| shot-01, shot-04, shot-05, shot-06, 6447, 1856 | | same to the digit |
| shot-02 | 21.25, 15.96, 8.83 at 43.0, 15.82 | 21.23, 15.96, 8.82 at 43.5, 15.79 |
| shot-03 | 13.58, 9.90, none | 13.59, 9.64, 7.43 at 36.1 |
| IMG_1996 | 18.39, 13.34, 8.72 at 51.4 | 18.33, 13.34, 8.83 at 50.1 |
| rot90-120 | 18.43, 13.52, 8.75 at 51.6 | 18.41, 13.53, 8.95 at 46.1 |
| SDR / SDR full | 18.55, 13.36, 9.04 at 49.4 / 18.35, 13.36, 8.93 at 50.6 | 18.54, 13.39, 8.93 at 50.1 / 18.36, 13.36, 8.93 at 50.4 |
| IMG_9960 | 11.30, 10.45, 9.18 at 36.0, 12.83e | 11.23, 10.41, 9.15 at 36.1, none |
| 8133 | no lane | no lane |

IMG_9960's pins were an estimate from a path whose sightings reached 54.0005
ft (`pinState` needs 54); they now reach 53.84, so the pins are not read, as
the 0.114.0 notes above already expected. shot-03's arrows move
with the lone foul lines of its release frames, now turned to the clip's tilt
(0.010) instead of drawn at the pin row's slope. The breakpoints that moved by
feet moved by 0.1 to 0.2 board: the bottom of the hook is flat.

## A camera that zooms and pans while the ball rolls (2026-11-21)

The owner: "We are supposed to be able to handle mildly shaky shot. None of
the vids ive sent you are completely still." IMG_2938 (HEVC 10-bit HLG,
portrait, 60 fps, filmed from behind the ball return, a left-hander) failed
with `too-shaky`, "51 of 175 frames could be steadied".

**Why.** `RegisterPass` matched the calibration frame's patches in every
frame, a patch by its picture alone at one size, and fitted a turn and a zoom
to them. The phone zooms the whole time the ball rolls: 0.57 of the
calibration frame's (read frame 60, 4.67 s) scale at the release, 1.0 at the
calibration frame, 1.88 at 6.6 s with the pins filling the picture, about 1%
a frame at 30 a second. A patch of 26 px at 20% of zoom has its rim 2.6 px off
its middle, so outside 0.71 to 1.18 of the calibration frame's scale the
share of agreeing patches fell under the 0.15 floor (frames 0 to 23 back,
from 75 on forward), and a lost frame kept the last turn as its guess, so the
pass never found the picture again. Neither the bowler nor the ball return
was the cause: the bowler covers a third of the calibration frame, and the
robust fit dropped her patches on the frames that did register (shares 0.2
to 0.6); the ball return's hood is in the picture only before 3.5 s, the
frames already lost to the zoom. With 51 of 175 the 30% floor (52.5) failed the shot.

**What changed** (`registration.ts`, `pipeline.ts`):

- Key frames. A pass matches its key frame's patches: the calibration
  frame's at first, a frame's own once the camera has zoomed `REKEY_ZOOM`
  (5%) from the key frame or turned more than 40% of its patches out of the
  picture (`REKEY_IN_VIEW`). Each match is carried back to the calibration
  frame's pixels through the key frame's own turn, so every frame is still
  fitted as one turn and zoom from the calibration frame, and the lens, the
  share (of the key frame's patches) and everything after are as before. A
  camera that holds still never moves its key frame: every other input reads
  to the bit as before (the trace digests below).
- `GIVE_UP_S` (0.5 s): a pass that has lost every frame that long stops
  looking (`reason: "lane-left"`), and the floor's pass skips those frames.
  No input found its frames again after more than 0.1 s lost.
- `steadySpan`: the frames that could be steadied are counted against the
  stretch from the first to the last of them, not the whole read: a camera
  that turned away after the ball (to the bowler walking back) is not a shaky
  one. The trace already ends where its frames do.
- `PIN_LATE_S` (0.3 s): a pin seen to move more than that after the fitted
  motion has the ball meeting the rack is not its touch. On every input the
  first move comes 0.07 s before to 0.10 s after; on IMG_2938 the rack the
  camera had zoomed in on moved 0.63 s after (frame 112), and the pins were
  read off a follow that never reached it.

**IMG_2938 now** (Node, `app-read.ts --hand auto`): 120 of 175 frames
registered (to 6.6 s, zoom 0.57 to 1.88); the lane sits on the
lane's lines from the release to the pins
(`scratchpad/review16/lane-across-the-move/`). Left-handed from the video
(confidence 0.55: release and line left, drift and pins right). Laydown
11.94, touchdown 13.90 at 5.0 ft, arrows 16.08, launch 15.5 mph; seen from
1.2 to 54.1 ft (frame 83, 5.44 s), where a head passes in front of the
camera; pins 37.45 estimated (the ball rolls toward the 10 pin: in the
original at 5.40 s it is among the rack's right-hand pins), no pin frame. The
ball crosses to the right the whole way (u 13 at 1 ft, 21 at 34 ft, 32.5 at
54 ft); no breakpoint.

**How much of the roll is in view.** The ball rolls from the foul line at
about 3.1 s to the rack at about 5.5 s. The camera zooms from 3.1 s and pans
from about 5.2 s; the lane is in view and registered on every frame to 6.6 s,
the ball seen on 66 of the 70 frames from 1.2 ft (five in the air) to 54 ft. From 6.7 s the
camera turns to the bowler and every frame is lost.

**The first look.** It put the release at 5.07 s (the zoom at its fastest,
read as a run), not 3.08 s. It costs time, not the reading: `readShot` read
4.67 to 6.27 s, did not see the ball, looked again from the hint at 2.27 to
3.87 s and saw the crossing at 3.08 s, the right window start. But its speed
there, 14.6 ft/s, is half the ball's (23 ft/s from the trace): `ballFind`
steadies its frames by a shift only, and the camera zooms 40% over that part
with the ball below the picture's middle, so the zoom pulls it back down the
lane. The window's end then went to 8.5 s, and the read to 30 a second over
175 frames where a 23 ft/s window ends near 6.3 s and is read at 60 a second; 55 of the frames
read are the camera on the bowler. Not changed: a slow speed only makes the
window long, never short.

**Measured** (Node, `app-read.ts --hand auto`, every input; laydown, arrows,
breakpoint at feet, pins, launch mph): every input other than IMG_2938 gives
the same trace digest before and after (shot-01 to 06, the eight IMG_1996
copies, 1856, 6447, IMG_9960; 8133 reads no shot either way). shot-01 pins
17.67 on frame 233, shot-06 pins 19.00 on 102, IMG_9960 left with
breakpoint 9.18 at 36.0 ft, all unchanged.

**Timing** (`bench.ts`, Node, one thread, which now takes an
`app-read.ts --dump` as `dir/stem.json`): shot-01 trace 13.0 s (13.5
before), shot-06 3.7 (4.1), IMG_1996 10.9 (11.2), 6447 3.6 (3.8): the
same, within the machine's noise. IMG_2938 12.1 s (registration 4.8,
background 1.1, ball 3.8, circles 2.0), where before it failed after 7.5 s
of registration.

**Tried and not kept.** Moving the key frame also when fewer than 25% of its
patches agree registers all 118 frames of 6447 (it tilts 0.22 rad from the
calibration frame by the release) and reads laydown 10.25, arrows 9.17e,
breakpoint 8.49 at 25.3 ft, the readings the README's near-release
calibration frame gave (10.2 to 10.4, 9.0 to 9.2, 8.3 to 8.5 at 26), but
the far sightings change with the empty lane built from the extra frames and
the measured pins 17.26 is lost. Left for a round that builds the empty lane
per stretch of the clip.

**Open.** `ballFind`'s shift-only steadying under a zoom (above); the far
end of IMG_2938 past 54 ft (a head in front, then the zoom on the rack);
nothing of this round has run on an iPhone. Review pictures:
`scratchpad/review16/` (`IMG_2938/` from `review-app.ts`,
`lane-across-the-move/` the lane on frames 0 to 125, zoom in the label).

## The ball among the pins, and the hand always from the video (0.114.1, 2026-11-20)

**The owner's marks** (ground truth): shot-01 frames 229 (yellow right),
230 and 233 (the ball up and left of yellow, a little smaller), shot-02
213 to 216 (the ball smaller, up and left; the cyan outline nearly right on
215 and 216), shot-04 109 (the cyan outline right), shot-05 136 (yellow
right, the cyan outline took the hand).

**Why the circles were off.**

1. The size. Every covered or weak circle was drawn at the lane's predicted
   size (a disk 8.5 in wide on the lane), but the ball's rim measures 0.93 to
   0.98 of it on every clip from 15 to 40 ft (free fits with 80% of rays on
   the rim; shot-01 0.96, shot-02 0.94, shot-05 0.97, shot-06 0.96). Drawn
   larger, a circle fitted to the upper rim only sits low. A ball 4.25 in
   above the lane, projected as a sphere with the camera from the found lane,
   is within 1% of the flat disk on shot-01 and shot-06 (the other clips'
   focal lengths from the lane alone are too loose to say more), so the model
   was not the cause; the measured ratio is what is used now (`ownScale`).
   Past 45 ft the free fits run large (1.03 to 1.16 on shot-01 in front of the
   rack: a pin's edge beside the ball widens them), so only circles nearer
   than `RACK_FT` count.
2. The center. The rays' fit (`refineCircle`) is cast from the detector's
   blob; among the pins the strongest edge on a ray is often a pin's, and
   with the radius fixed the circle slid toward it (shot-01 f232 and f233 1.3
   px right of the ball's run). The face match near the pins (`followFace`)
   carries whatever offset its first circle had.

**What changed.** `arcFit` (`ballDetect.ts`): the edge pixels near where the
ball is expected, each voting for the centers one radius behind it, only
where the side of the edge that looks like the ball's own face is toward the
center (a rim against a white pin rises outward, one against the dark between
pins falls). One vote per direction round the ball, capped, the best center
pulled gently toward the prior (`ARC_PULL`). Stable to where it starts: on
shot-01 f233 two priors 1.5 px apart give the same center to 0.01 px. Used
for every circle whose radius could not be freed (`fit.fixed`: a leg, a hand,
the pins), at the ball's own size, from its face match when carried, else
where its last circles put it (`predictCenter`); and in `followFace` after
each match. A rim seen round two thirds of the ball sets its own radius
within 10%. `WEAK_RIM` is gone.

The pins' moving test masked 1.5 ball radii round the circle; with the
circle on the ball that hid the near side of the pin it touches, and shot-01's
first move was found a frame late (235); at 1.35 the synthetic shot's ball
edge counted as a move a frame early. `BALL_MASK` 1.42: shot-01 234, shot-06
103 and the synthetic shots' frames all found.

**Measured** (Node, `review-app.ts --check` on the same dumped frames; circle
against the owner's mark, in the mark's radii):

| frame | before: offset, size | after |
|---|---|---|
| shot-01 f229 (yellow right) | 0.00, 1.00 | 0.02, 0.93 |
| shot-01 f230 | 0.36 (right 0.31, low 0.19), 1.14 | 0.23 (right 0.19, low 0.14), 1.14 |
| shot-01 f233 | 0.17 (right 0.17), 1.03 | 0.11 (left 0.10), 1.00 |
| shot-02 f213 | 0.22 (right 0.12, low 0.19), 1.19 | 0.20, 1.10 |
| shot-02 f214 | 0.28 (right 0.17, low 0.22), 1.18 | 0.27, 1.09 |
| shot-02 f215 (cyan) | 0.27 (low 0.27), 1.12 | 0.28, 1.04 |
| shot-04 f109 (cyan) | 0.12, 1.05 | 0.07, 1.07 |
| shot-05 f136 (yellow right) | 0, 1 | unchanged |

shot-01's frames now run smoothly along the ball's path (x 468.7, 468.1,
466.6, 466.2 on 229, 230, 232, 233). shot-02 near the pins is only resized:
its rim shows on under 30% of the directions (a dark ball against the dark
pit, the lower rim left out for the mirror image), so the face match stands
and its center stays a quarter radius low. Its far-end lane mapping is the
likelier cause and is not changed here.

Readings that moved by more than 0.1 board: shot-01 pins 17.36 to 17.81 (frames
230, 232, 233 moved left onto the ball's run; read on 233 as before), shot-06
pins 19.30 to 19.13 (frames 98 to 101 moved onto the ball; read on 102 as
before; the owner reads 18.4), 6447 pins 17.33 to 17.22 (frame 174 moved 0.6
px up and the line through the last frames turned), IMG_1996 SDR full range
now has a breakpoint, 8.92 at 50.6 ft (a breakpoint frame's circle now on the
ball, as the other SDR copy's 8.98 at 49.9). IMG_9960's breakpoint moved 1 ft
(36.7 to 35.7) on 0.05 board.

**The hand** (`handFind.ts`). The owner: no input from the bowler. The
switch is gone from the result; the line says "Left-handed (from the video)".
The video decides whenever any cue can be read (the weighted votes' sign);
the setting stands only with none, and the line says so. A fifth cue,
`line`: the side of the lane at the arrows (a full vote 8 boards from the
middle). Weights: release 1.5, drift 1, line 1, hook 0.6, pins 0.6. A hook
that turns the same way the ball drifted (by a board or more) is not a hook
and is left out, and so is the hook of a path fitted loosely (`rough`).

How the owner's left-hander (8133, laydown 11.1, arrows 10.9 from the left)
read right: no release seen (the clip is small and she stands in the empty
lane), drift -0.2 board, and a bend to the left past the arrows read as a
right-hander's hook; the old rule took the setting or the hook. With the
line cue (-1 at weight 1) it reads left. Tested on that pattern and on a
right-hander deep inside, a left-hander outside, a straight ball, a release
hidden by the body. On the 17 inputs that read every cue agrees, as before.

**The path** (`fitPath`): always the hook shape (straight, one bend whose
curvature keeps its sign, straight). Over 0.7 board RMS it was replaced by a
smoothing spline that wove with the sightings (8133's S at the start); now it
is kept and marked `rough`, and its bend is not a measured breakpoint. No
sample input was over 0.7 (all 0.05 to 0.39).

**Not done this round.** 8133 (464 by 848, 30 fps) does not read in Node:
the first look puts the release at 3.73 s (the shot is at about 6 s) and the
lane is not found on the first part in either band (0.30-0.72, 0.56-1.00), so
why its sightings stop two thirds down the lane on the phone, and the
owner's mark of its far right edge, are not reproduced. 1856 reads in Node
(left from the video, laydown 12.09, arrows 9.73, breakpoint 8.35 at 30.6 ft,
pins 14.66); the pin line's tilt and a far-line constraint from the camera
are not built: with a lane homography the far line and the foul line already
meet at one vanishing point, so a wrong tilt means a wrong cross-lane
vanishing point, which the focal length fixes (`focalFromPlane`); the lane
alone gives 1016 to 1436 px on the sample clips, too loose to constrain it.

## The hand from the video, and a far-back phone (0.114.0, 2026-11-19)

```
npx tsx scripts/shot-tracker/app-read.ts <video> --hand auto     # the hand read from the video, as the app reads it
npx tsx scripts/shot-tracker/review-app.ts <outDir> <video> --check   # the hand from the video unless <video>:left or :right
```

**The hand** (`handFind.ts`, `handCues` and `releaseBody` in `pipeline.ts`).
The boards were counted from the gutter of the app's handedness setting, so a
left-hander filmed on a right-hander's phone (IMG_9960) read 28.5 for 11.3.
The hand changes only `metrics` (`handedBoard` and the breakpoint, the
lowest handed board); the path, the sightings and every other stage are in
lane u. Four cues, each a vote from -1 (left) to +1 (right), in lane u:

- `release`: the ball against the middle of the bowler's body on the laydown
  frame: the change against the empty lane in a box over the foul line (a
  lane width and a half up, half a lane width down and past each edge),
  leaving out the ball. Ball right of the body: right-handed. 4 boards for a
  full vote.
- `drift`: the arrows' board less the laydown's, in u: a right-hander's ball
  goes out to the right. 3 boards.
- `hook`: the fitted hook's turn by 60 ft, when the sightings run past the
  middle of the bend: a right-hander's turns left. 4 boards.
- `pins`: the board at the pins right of the head pin. 3 boards, weighed 0.6
  (a missed pocket lands on the other side).

The video decides when the weighted votes add to 0.6 or more and none votes
0.5 or more against them; otherwise the setting stands and the result says
why (`HandFound.why`). On every input every cue agreed (confidence 1.00):

| input | release | drift | hook | pins | hand |
|---|---|---|---|---|---|
| shot-01 | +2.6 | +6.8 | +18.6 | +2.6 | right |
| shot-02 | +7.2 | +5.3 | +12.4 | +4.4 | right |
| shot-03 | +13.3 | +3.7 | +6.6 | - | right |
| shot-04 | +16.4 | +1.2 | - | - | right |
| shot-05 | +10.7 | +5.2 | +13.6 | - | right |
| shot-06 | -15.1 | -2.8 | -9.9 | -0.7 | left |
| IMG_1996, 8 copies | +11.0 to +11.7 | +4.8 to +5.2 | +10.1 to +13.0 | - | right |
| IMG_9960 | -12.3 | -0.9 | -5.8 | - | left |
| 6447 (Node and Chromium) | - | - | -2.4 | -2.7 | left |

(boards, positive is right.) The release cue is the strongest and the only
one that does not depend on where the bowler aimed; drift is the weakest
(IMG_9960 plays nearly straight up board 11). The result keeps what the
readings were read off (`readOff`), and `handedMetrics` reads them again for
the other hand: the screen's switch uses it, with nothing read again.

**IMG_9960 read left-handed** (Node on the HEVC original; the review pictures
`review-app.ts ... --check`): laydown 11.3 on frame 213 (the ball still in
the air over the foul line, the circle on it), touchdown 11.5 at 1.0 ft on
214, arrows 10.4 on 231 at 14.3 ft (circle on the ball), breakpoint 9.1 at
36.7 ft (the sightings sit at u 9.2 to 9.5 from 34 to 41 ft and come back to
11.5 by 53.7 ft). Right-handed the breakpoint was "not seen": the lowest
right-handed board is at the end of the sightings. The pins are not read: the
sightings stop at 53.7 ft (54 is needed), where the bowler, walking back, has
her hand in front of the ball and the rack (frame 82 of the read, 9.41 s);
the iPhone's "estimated 27.6" (12.4 from the left) came from the follow
forward past that. The lane: both edges and the foul line sit on the lane's
own lines on the calibration frame (`lane.jpg`).

**6447176557853835635.mov** (720 by 1280, 30 fps, re-encoded by a messaging
app, filmed from far back and panning with the bowler). Why "The ball
couldn't be followed down the lane":

1. `laneRows` put the lane's far end at the busiest row of the fan, the first
   rows under the vanishing point: a phone held low has the masking units'
   artwork there, busier than the racks (at 22 against 12). The pins were
   looked for a pin's height under the vanishing point, none was found, and
   no lane was found on the first part read; the window fell back to the
   slowest ball and the ball was not found. The far end is now the busiest
   row where a camera `CAMERA_FT` (10 to 45 ft) behind the foul line puts the
   racks, (pin row - vp) / (foul - vp) = d / (d + 62.6), with a margin for
   the rough near row. No other input moves.
2. The harness read this file one frame early: it has an edit list that
   starts the video after seven samples, ffmpeg leaves them out and counts
   its times from the first shown (0.0 for the sample at 0.0233 s), and each
   frame landed on the sample before it. `decodeLuma` now moves ffmpeg's
   times onto the samples it shows. Node and Chromium then agree to the digit
   (search release 3.09 s, bands 0.30-0.72 and 0.39-0.83, read 2.67 to 4.27 s,
   48 frames, 1 not in the file: the iPhone's own lines).

Now the first part's lane is found, the ball is seen from 1 to 12 ft and the
window is right (crossing 3.12 s). The trace still sees the ball only from
46.5 to 60.8 ft: the best lane is on read frame 73 (5.1 s), the camera has
panned and moved since the release, the release frames do not register onto
it (share of patches 0.10 to 0.15, under the 0.15 floor; counting only the
patches in view does not help), and the found lanes there cannot be carried
to the anchor and are dropped. Traced from a calibration frame near the
release (read frame 14, 32 or 50) every frame registers and it reads laydown
10.2 to 10.4, arrows 9.0 to 9.2, breakpoint 8.3 to 8.5 at 26 ft. Not done:
choosing the calibration frame by the release changes every clip's
readings, and a second trace needs the frames the pool has taken. What it
reads now: the hand (left, from the hook and the pins), pins 17.3 measured,
entry speed 16.6 mph; laydown, arrows and launch speed not seen.

**A weak circle near the pins** (`WEAK_RIM`, `predictCenter`): a
fixed-radius circle with fewer than 35% of its rays on the rim and no face to
carry is cast again from where the last three or four circles put the ball,
and kept when it finds more of the rim and sits nearer that point. On
shot-01 frame 230 (the owner: the circle a quarter radius right and low) it
moves 0.74 px left and 0.52 px up, 0.12 and 0.08 of a radius, about half the
owner's correction. The pins reading moves from 17.44 to 17.36: f230 is the
first of the three sightings the line through them is read from, so moving it
left flattens the line. Frames 232 and 233 sit right of where the run puts
them (467.9 against about 466); the "a bit light" reading is more likely
theirs, and was not changed. The pins frame stays 233 (shot-06: 102).

**Review crops**: `check/` now shows only the tracer's circle and its base
cross; the measured outline in cyan is in `check-debug/`, its numbers in
`readings.json` (on shot-01 frame 229 the owner ruled the yellow circle right
and the cyan outline wrong: the outline takes a pin's edge there).

**Measured** (Node, `app-read.ts`; before: 0.113.2 with the harness's hand,
shot-06, IMG_9960 and 6447 told left; after: `--hand auto`; laydown, arrows,
breakpoint at feet, pins; `e` estimated):

| input | before | after |
|---|---|---|
| shot-01 | 24.27, 17.51, 7.47 at 43.3, 17.44 | 24.27, 17.51, 7.46 at 43.3, 17.36 |
| shot-02 | 21.24, 15.97, 8.78 at 42.5, 15.65 | same |
| shot-03 | 13.58, 9.90 | same |
| shot-04 | 6.24, 5.03e | same |
| shot-05 | 18.54, 13.29, 9.03 at 48.6 | same |
| shot-06 (left) | 17.61, 14.78, 12.62 at 34.7, 19.30 | same, left from the video |
| IMG_1996 vp9 / vp9-10 / vp9-10-60 | 18.29, 13.43 / 18.21, 13.26 / 18.27, 13.43, 8.90 at 50.1 | same |
| avc1-b / remux / rot90-120 | 18.45, 13.45 / 18.42, 13.48 / 18.43, 13.52 | same / 18.42, 13.49 / same |
| SDR / SDR full | 18.54, 13.34, 8.97 at 49.9 / 18.36, 13.36 | same |
| IMG_9960 | iPhone, right: 28.5, 29.5, none, 27.6e; Node told left: 11.30, 10.45, 9.13 at 37.0 | 11.30, 10.45, 9.14 at 36.7, left from the video |
| 6447 | ball not followed | pins 17.3, entry 16.6 mph, left from the video |

The harness's IMG_9960 had read "no shot" in Node: its ffprobe lists a blank
line for every frame's Dolby Vision side data, and the frame times were read
off the wrong lines. Both scripts now skip lines with no number.

## The ball found where the lane is known (0.113.2, 2026-11-18)

The owner's iPhone could not find the shot in IMG_1996: the first look (192
pixel frames drawn on a canvas) chose the bowler at 3.07 s, the ball's run was
not among its runs, and the read gave up. On desktop Chromium the plane look
chose the pushaway at 1.8 s on most copies, and `readShot` took the window
from it.

**The hole.** The pushaway, the ball held at the waist two seconds before the
shot, reads through the floor's mapping from 7 ft behind the foul line to 5
ft past it at 30 to 45 ft/s (an object 3 ft above the lane maps three times as
far up it). It passed every test a run of centroids can take (on the lane,
every step up it, a ball's speed, seen crossing the foul line) and won on
crossing. No threshold on where a look run starts tells them apart: the
ball at the bottom of the swing read 6.3 ft behind the line on shot-03, the
pushaway 7 ft on IMG_1996.

**What decides now** (`ballFind.ts`, `readShot.ts`, `seekPart` in
`shotWindow.ts`): in each part read, with the lane found on it, the ball is
looked for in the part's own frames: every second frame at half size, steadied
by a searched shift, a median empty lane, blobs of a ball's width for the lane
row their foot maps to (`findCandidates`: anything above the lane is too wide
for its row, which is what rejects the pushaway), chained frame to frame, and
judged: 6 or more in a row over 5 ft or more, a ball's speed, on a straight
line, never standing still, first seen within 15 ft of the foul line, the line
crossing it inside the part. The window is that line's crossing, and the deck
end at its speed (`seenWindow`, slack 1.2: it is the launch speed, not the
look's rough one). Where it is not seen, the parts it may be in are read in
turn: where a part saw it out on the lane, the crossings of look runs that
pass, the look's other runs, then the whole video stepped through every 1 s
in 1.6 s parts, nearest the look's guess first (at most 8 parts, 30 s). Only
when it is seen nowhere is a look run's window used, one whose crossing no
searched part would have shown first: a ball that crossed the foul line rolls
up the lane in the frames after. A look run must also go past the foul line
(`short-of-line`).

**Measured** (headless Chromium, `vite preview` of a production build, plane
look; before is the build before this change, the SDR copies' before in
`app-read.ts`, which agrees with the browser; window = the foul line crossing,
seconds; boards, mph):

| input | before: crossing, laydown, touchdown, arrows, launch | after |
|---|---|---|
| IMG_1996 VP9 8-bit | 3.73, 18.3, 17.2, 13.5, 16.3 | 3.61, 18.3, 17.1, 13.4, 16.3 |
| VP9 10-bit | 3.73, 18.2, 17.1, 13.3, 16.5 | 3.61, 18.2, 17.1, 13.3, 16.5 |
| VP9 10-bit 60 fps | 3.72, 18.3, 17.2, 13.4, 16.4 | 3.63, 18.3, 17.2, 13.4, 16.4 |
| avc1 rot90 120 fps | 1.59 (the pushaway), 18.6, 17.3, 13.3, 16.7 | 3.61, 18.4, 17.3, 13.5, 16.7 |
| avc1-b | 1.62 (the pushaway), 18.5, 17.5, 13.1, 16.5 | 3.61, 18.4, 17.2, 13.5, 16.5 |
| portrait remux | 3.78, 18.4, 17.3, 13.5, 16.5 | 3.61, 18.4, 17.3, 13.5, 16.5 |
| SDR limited | 3.72, 18.5, -, 13.3, 16.8 | 3.58, 18.5, 17.3, 13.3, 16.8 |
| SDR full range | 2.23 (the pushaway), 19.2, -, 13.5, 16.5 | 3.58, 18.4, 17.2, 13.4, 16.7 |
| shot-01 | 1.30, 24.3, 23.1, 17.5, pins 17.4 | 1.22, 24.3, 23.0, 17.5, pins 17.4 |
| shot-02 | 1.13, 21.2, 20.4, 16.0, pins 14.8 | 1.02, 21.2, 20.3, 16.0, pins 15.6 |
| shot-03 | 1.08, 13.5, 13.2, 10.0 | 1.02, 13.6, 13.1, 9.9 (end 4.33 s, was 4.73) |
| shot-04 | 1.33, 6.2, 6.0, 5.0e | 1.27, 6.2, 6.0, 5.0e |
| shot-05 | 1.20, 18.5, 17.2, 13.3 | 1.11, 18.5, 17.2, 13.3 |
| shot-06 | 1.17, 22.4, 22.8, 25.2, pins 20.7 | 1.13, 22.4, 22.9, 25.2, pins 20.7 |

shot-02's pins moved with its window's start (16.2 from 0.016 s on the canvas
look's wrong 0.30 s crossing, 14.8 from 0.67 s, 15.6 from 0.60 s): its far
end is known to read 1.5 to 2.5 boards low, so the read there is not settled
by any of the three.

The crossing is 0.05 to 0.1 s earlier than the look's on every clip: the
look's comes from centroids of the ball still in the hand, the new one from
the line through the ball rolling on the lane. With `FOUL_LEAD` 0.4 s the read
starts a grid slot earlier, which the readings do not move with. The old
canvas look (0.113.1's `codecFrames.ts`, built locally) on the portrait remux
gives the iPhone's search line to the digit (release 3.07 s, run from y 0.99,
bands 0.30-0.72 and 0.56-1.00) and now finds the ball in that first part:
crossing 3.58 s, 18.4, 17.3, 13.5, 16.5. `app-read.ts` gives the same windows
and readings as the browser to every digit shown.

**Cost.** A search is 0.3 to 0.9 s a part in desktop Chromium, on the main
thread; a part the look missed costs a read and a lane search more, 2 to 3 s
(IMG_1996 read 6.0 s before, 8.7 s now on the copies whose look chose the
pushaway; shot-04, whose ball is hidden behind the bowler on two parts, 24 s
to 30 s in all).

## The foul line, and shot-04 (2026-11-15)

Two questions from the owner after the review pictures of the automatic trace:
why the orange line is not on the foul line, and why shot-04 is not traced.

### Where the foul line is

The gutters begin at the foul line, so where each channel gives way to the
flat approach lies on it, and on these clips a thin dark line usually runs
across the lane there. `foul-look.ts <clip> <outDir> [<frame> ...]` draws the
found foul line (orange), the hand one (cyan) and every candidate the finder
weighed (magenta, in `*-cands.jpg`) on 4x and 10x colour crops, and prints
each candidate's row, its distance from the hand line in feet and the camera
distance it implies. Read on those crops and on columns of the frames
(darkest row of the thin line, the row where the gutter's structure stops);
feet are along the lane, positive up the lane:

| clip, frame | true foul line | found, before | hand, before | found, after |
|---|---|---|---|---|
| shot-01, 150 | gutter ends at rows 643.5 (left) and 646 (right) | +1.7 ft (the top of a darker band of boards) | +1.7 ft, the same band | +0.05 |
| shot-02, 140 and 192 | the step to the brighter approach, meeting the left gutter's end; the console hides the right | +0.63 ft | within 1 px (0.1 ft) | +0.63, unchanged |
| shot-03, 250 and 40 | gutter ends and the thin line, on the hand line | +1.67 ft | right | -0.06 |
| shot-04, 88 | the thin dark line, rows 538 to 539, meeting both gutter ends | +1.1 ft (the top of a lighter band) | +1.1 ft, the same band | 0.00 |
| shot-05, 230 | the thin line from row 505 at x 350 to 514 at x 675 | +0.13 ft | right in the middle, 4 px off at each side (drawn level, the line is not) | -0.08 |
| shot-06, 20 and 50 | gutter ends, on the hand line | right (-0.02 ft) | right | -0.02 |

The owner was right on four clips. The finder read the rows where the
brightness changes just inside the edges and, among pairs nearly as strong as
the strongest, took the one furthest up the lane (meant to skip a join in the
approach on shot-01, which was in fact the foul line). On shot-01, 03 and 04
that is the edge of a band of boards 1 to 1.7 ft up the lane, where the lane
edge's dark line also has a small hook, and the same band is on every frame,
so the camera distance (the mode over frames) agreed with it and could not
catch it. The true line was among the candidates on every frame. The hand
lines on shot-01 and shot-04 sat on the same band (the finder had been tuned
to agree with them). The owner's uncropped original of shot-05 (IMG_1996)
shows the approach in front of the line: the thin line where the gutters end
is the foul line there too, and it slopes about 0.028 in the picture where the
pin row is level (the camera is turned off the lane's axis).

What changed (`laneFind.ts`):

- `gutterEnds`: down a strip in the middle of each gutter (0.04 to 0.15 lane
  widths outside the edge; the foul light's housing stands over the outer
  part) the mean gradient across the strip is high over the channel and falls
  to almost nothing on the approach; the end is the sharpest such fall, to a
  fraction of a row.
- `gutterFoulLine`: both ends, each with structure above it of at least
  `GUTTER_DROP` (6) grey levels, on a line within 0.04 of the slope across the
  lane, become the first foul line candidate (`FoulLine.gutters`). One end
  alone is not used: a scoring console's bottom (shot-02), a shoe (shot-05,
  frame 230) or the foul light's housing ends as sharply.
- `laneAttempts`: when three or more frames show both gutter ends, they alone
  set the camera distance; each frame then takes its candidate nearest it as
  before.

Camera distance before and after: shot-01 24.3 to 21.9 ft, shot-03 25.8 to
23.5, shot-04 20.8 to 19.6; the others moved under 0.6 ft.

Still wrong: shot-02's chosen frame (140) shows only the left gutter, and its
brightness pair on the band (+0.63 ft) puts the camera within 0.5 ft of the
distance the two frames that show both gutters give (22.9 ft), closer than the
true line does (22.2): the camera distance cannot tell 0.6 ft of foul line
apart on this clip.

### Hand calibrations re-marked

- shot-01 (frame 150): foul line from rows 621 to 624 to the gutter ends and
  the faint step between them, rows 643.5 to 646.
- shot-04 (frame 88): foul line from rows 518 to 521.5 to the thin dark line,
  rows 534.3 to 539.2.
- shot-05 (frame 230): foul line from a level row 510 to the thin line as
  measured, rows 505 to 514.
- shot-02: the owner ruled (2026-11-15) that the automatic laydown and arrows
  (21.9 and 15.8) are right and the hand column's 18.3 and 13.7 wrong. The
  marks are not what was wrong: the hand column of `auto.ts` traced only the
  main calibration, made on frame 192 at the far end, and the camera pans hard
  between there and the release, so the carry back put the near end boards
  out. `auto.ts` now reads laydown, touchdown, arrows and launch angle from
  the clip's own near-end calibration (frame 66, `near`), as `run.ts` always
  did: 21.0 and 15.7. Its foul line, measured on frame 66, is within a pixel.

Owner rulings recorded as targets, not tuned to: shot-01's board at the pins
is about 18.5 to 19; shot-06's 18.4 (automatic) was right, the hand trace's
19.3 being read after the pins had started to move.

### shot-04: why nothing was traced, and what it returns now

The ball is plain to the eye from the release (frame 83) to about 13 ft
(frame 108), then goes behind the bowler, who stays in front of the lane for
the whole clip. The empty lane is the median of the clip, so it holds the
bowler; the dark ball rolling past dark trousers changes nothing there and was
never a candidate between frames 83 and 97. The detector did see it coming
down to the lane (frames 78 to 82, ball and hand against the approach); what
`associate` kept was 7 candidates of something else at 14 to 15 ft.

`nearFollow.ts`: when the stretch seen (its main group, a stray pair far up
the lane not counted) is under 10 ft, runs of candidates on the near lane that
move up it (`nearSeeds`: 3 or more in consecutive frames, at least 0.3 ft up
the lane; a shoe stays put) seed `followNear`, which follows the ball by its
darkness (`followForward`, as the laydown is followed back) and stops where its
disc shrinks under 85% of the lane's radius (going behind a leg) or it moves
back down the lane or faster than a ball. The longest such follow replaces the
candidates when it sees further. It runs on shot-04 only: every other clip
sees more than 10 ft.

`trace` then accepts a near-only stretch (`NEAR_FROM_FT` 8, `NEAR_SPAN_FT` 5):
seen from within 8 ft of the foul line over at least 5 ft. Such a trace does
not tie the rack's movement to the ball (the speed stays the fitted slope, as
estimated), and reads the arrows as estimated when it stops short of 15 ft;
breakpoint, pins and speed at the pins come back missing from `metrics` as
they would for any trace that does not reach them. shot-04 is followed from
frame 83 to 108 (3.1 to 13.1 ft) and returns laydown 6.4 (the hand
calibration's trace 6.5), touchdown 5.8 at 3.7 ft, arrows 5.1 estimated, speed
16.8 mph estimated; breakpoint and pins missing. The arrows are 2 ft past the
last sighting: an estimate. Past 13 ft the ball is behind the bowler on every
frame; nothing finds it there.

### The table (`auto.ts --fresh-hand`), before and after

Automatic, hand-calibrated trace in brackets. Before: the handoff's table
(0.111.0). After: the gutter ends, the near follow, the re-marked hand foul
lines, and shot-02's hand near end from its near calibration.

| clip | laydown | arrows | breakpoint | pins | speed |
|---|---|---|---|---|---|
| shot-01 before | 23.8 (23.3) | 16.9 (16.7) | 7.7 at 43 (7.5 at 43) | 16.7 (20.5) | 15.3 (15.3) |
| shot-01 after | 24.8 (24.2) | 17.4 (17.2) | 7.3 at 44 (7.6 at 43) | 17.2 (16.2) | 14.4 (14.6) |
| shot-02 before | 21.9 (18.3) | 15.8 (13.7) | none (8.7 at 45) | 16.1e (16.1e) | 15.9e (15.3e) |
| shot-02 after | 21.7 (21.0) | 15.9 (15.7) | none (8.7 at 45) | 16.1e (16.1e) | 15.7e (15.3e) |
| shot-03 before | 14.1 (14.2) | 10.5 (10.5) | none (none) | none (none) | 18.3 (16.5) |
| shot-03 after | 13.8 (14.2) | 10.6 (10.5) | none (none) | none (none) | 18.2 (16.5) |
| shot-04 before | not traced | | | | |
| shot-04 after | 6.4 (6.5) | 5.1e (5.1e) | none (none) | none (none) | 16.8e (17.1e) |
| shot-05 before | 18.7 (18.5) | 13.1 (13.1) | 8.9 at 49 (8.9 at 49) | none (none) | 18.1 (18.1) |
| shot-05 after | 18.6 (18.3) | 13.1 (13.0) | 9.0 at 49 (8.9 at 49) | none (none) | 18.1 (18.1) |
| shot-06 before | 17.8 (17.7) | 14.7 (14.8) | 12.6 at 35 (12.5 at 36) | 18.4 (19.3) | 17.5 (17.0) |
| shot-06 after | 17.8 (17.7) | 14.7 (14.8) | 12.6 at 35 (12.5 at 36) | 18.0 (19.3) | 17.5 (17.0) |

Reading it:

- Laydown and arrows: within 0.7 board of the hand trace everywhere. shot-01
  moved a board with the foul line 1.7 ft nearer the camera (the laydown is
  read where the ball is over the line): 24.8, where the owner read 24 or 25.
- Speed: shot-01 0.9 mph slower (the distances shrank with the camera 2.4 ft
  nearer); the rest within 0.2.
- shot-01's pins: 17.2 automatic, 16.2 hand, against the owner's 18.5 to 19.
  Both still lose the ball over the rack (`followForward`); the hand trace
  moved from 20.5 with its new foul line. The far-end work's target.
- shot-06's pins: 18.0 against the owner's 18.4, 0.4 lower than before.
- shot-03's speed is still 1.7 mph off the hand trace (the rack's movement
  found early).

## The lane on every frame (2026-11-14, second round)

The handoff's first item: stop carrying one calibration through the whole
clip. The finder now calibrates every frame it is given (`findLanes`), each
frame of the clip takes its lane from the found frames near it
(`src/lib/shotTrack/laneTrack.ts`), and `trace()` takes those lanes
(`TraceInput.lanes`) instead of marks. `auto.ts` traces that way now.

### First, the two edges the owner ruled on

shot-01's left edge and shot-05's right edge are re-marked on the finder's
rule (the thin dark line where the lane's colour ends), measured row by row
as the line's darkest point: shot-01 on rows 455 to 525 and 595 to 615 of
frame 150 (the leg hides it between; the old marks were 5.4 pixels inside it
all along), shot-05 on rows 300 to 500 of frame 230 (the old three points
were on the black line 8 pixels further out at row 500). Fits: shot-01 worst
mark 0.40 board, shot-05 0.14. The finder's lines now agree with the hand
ones within 0.1 board on shot-01 (was 1.6 at the foul line).

That moved shot-01's hand-traced laydown from 24.2 to 20.6, three and a half
boards for a board at the foul line on frame 150. It is not the boards: it is
the registration. The laydown is read 74 frames from the calibration frame,
and the calibration also sets the focal length and the floor patches the
registration uses, so a small change to it moved the whole chain. That is the
same weakness as the swing below, in the answer key.

### The measure: `swing.ts`

The clip traced once per finder attempt, each time with that attempt's frame
as the calibration frame, six frames spread over the clip; the spread (max -
min) of each reading over those traces. Mode `one` is the tracer as it was
(the attempt's own marks, carried through the clip); `marks` passes every
attempt's marks with their frames (`calMarks`, the cheapest idea); `lanes` is
the new path. Spread in boards (mph for speed), with the number of traces
that gave the reading:

| clip | laydown | arrows | breakpoint | pins | speed |
|---|---|---|---|---|---|
| shot-01, one | 6.5 (6) | 0.6 (6) | 0.4 (6) | 8.8 (6) | 2.9 (6) |
| shot-01, lanes | 0.1 (6) | 0.1 (6) | 1.3 (6) | 4.3 (5) | 1.0 (6) |
| shot-02, one | 3.3 (6) | 1.9 (6) | 0.0 (2) | 0.2 (3) | 0.5 (6) |
| shot-02, lanes | 0.1 (6) | 0.1 (6) | (1) | 0.3 (2) | 0.2 (6) |
| shot-03, one | 29.0 (6) | 27.9 (6) | (0) | (1) | 5.8 (6) |
| shot-03, lanes | 0.3 (6) | 0.5 (6) | 0.7 (2) | (0) | 2.9 (6) |
| shot-04, one | (1) | (1) | (0) | (0) | (1) |
| shot-04, lanes | (0) | (0) | (0) | (0) | (0) |
| shot-05, one | 1.1 (6) | 0.3 (6) | 0.2 (6) | 1.8 (2) | 0.3 (6) |
| shot-05, lanes | 0.0 (6) | 0.0 (6) | 0.3 (5) | 0.6 (2) | 0.3 (6) |
| shot-06, one | 20.1 (6) | 20.0 (6) | 19.0 (6) | 21.8 (6) | 0.5 (6) |
| shot-06, lanes | 0.1 (6) | 0.1 (6) | 0.2 (6) | 0.5 (6) | 0.3 (6) |

The `one` rows of shot-03 and shot-06 include attempts on the next lane
(frames 40 and 180 of shot-03, 70 of shot-06): `findLane` would not choose
them, but the swing shows what a calibration frame can do. Without them
shot-03's `one` spread is 0.0 and 0.6, shot-06's 0.6, 0.4, 0.4 and 2.1. The
`one` runs are on the registration before the fix below; the `lanes` runs
after it.

`marks` was refused on every trace of shot-01, shot-02 and shot-06
(`calibration-off`, a mark 1.9 to 20 boards from the fit): the attempts
include frames that took the next lane, and marks carried a hundred frames
by the registration disagree by more than a board anyway. Fitting one lane
from many frames still carries it through the clip. Dropped.

### What it took

1. **Each frame's lane from the found frames near it** (`laneTrack`). Every
   found lane is carried to the frame by the registration and the carried
   lanes are blended, weighted by the finder's quality and by a Gaussian in
   frames (`reach`, 15 frames; with lanes every 10 frames that is about the
   two nearest), as the picture positions they give a grid of lane points,
   refitted as one homography. A frame is carried 5 to 10 frames, not 100.
2. **Which lane is the bowler's is the best frame's to say.** On shot-03 the
   finder takes the next lane on frames 0 to 200 of 280 and the bowler's on
   the rest; on shot-01 it takes the next lane on 210 to 230. A first
   version kept the local majority and traced shot-03's next lane (laydown
   41). Now the found lane with the most weight (the finder's quality) is
   the anchor, and a lane more than 12 boards from it, carried to its frame,
   or that cannot be carried there, is dropped (`SAME_LANE_BOARDS`).
3. **A wrong lane among right ones.** Then each lane is checked against its
   8 nearest (carried, within 1 board at every corner and 1.5 ft along): it
   is kept when it agrees with at least two and with more than half as many
   as the best-agreeing lane near it. A median of the disagreements failed
   where wrong and right were half and half (shot-01, frames 200 to 270).
   Dropped on the six clips: shot-01 10 of 24, shot-02 8 of 15, shot-03 21
   of 28 (the next lane), shot-04 4 of 14, shot-05 5 of 38, shot-06 4 of 13.
4. **A registration fault the found lanes exposed.** On shot-01, carried
   from frame 120, frames 240 to 270 sat 4 boards off the lanes found on
   them. `registerPlane` chains each frame's guess from the frame before; at
   frame 210 a third of the floor's patches were lost for one frame, the
   frame took the camera's turn, and the next guesses came from the turn,
   which on this travelling camera puts the near floor 20 pixels out,
   beyond the patch search: the floor was never found again. Now, after
   such a frame, the last measured floor (moved by the picture's motion
   since) is tried too and the guess that finds more patches is used. Frames
   240 to 270 then agree with their found lanes within 0.6 to 0.9 board. The
   synthetic tilt test (`planeTrack.test.ts`) needed both guesses: keeping
   only the last floor broke it.

### The hidden foul line

The owner's steer: when the foul line is hidden or below the picture, guess
it. `guessFoul` places it from the pin row by the camera's distance (the
relation `laneAttempts` already checks), measured on the clip's frames that
show it, or `TYPICAL_CAMERA_FT` (22 ft) when none does. The lane found that
way says so (`LaneFound.guess`: `camera-from-frames` or `typical-camera`),
counts 0.5 less in the finder's quality (never chosen over a frame that saw
everything) and a quarter as much in `laneTrack`. `findLane` returns such a
lane now instead of null. On the six clips only shot-02 has frames that hide
it (0, 30 and 80, the bowler over it); all three guessed lanes were among
those `laneTrack` dropped, so no reading below uses a guess. It is tested on
synthetic frames (the foul line below the picture, and rubbed out on one
frame of three).

### The table (`auto.ts`), before and after

Automatic, hand-calibrated trace in brackets. Before: the job's start (the
re-marked edges, the old tracer and registration, for both traces). After:
`findLanes` and `lanes` for the automatic trace, and the registration fix
for both.

| clip | before | after |
|---|---|---|
| shot-01 laydown / arrows | 23.0 (20.6) / 16.6 (16.7) | 23.8 (23.3) / 16.9 (16.7) |
| shot-01 breakpoint / pins / speed | 7.3 at 43 (7.2 at 45) / 19.0 (19.6) / 14.9 (15.1) | 7.7 at 43 (7.5 at 43) / 16.7 (20.5) / 15.3 (15.3) |
| shot-02 laydown / arrows | 20.6 (18.3) / 15.7 (13.5) | 21.9 (18.3) / 15.8 (13.7) |
| shot-02 breakpoint / pins / speed | none (8.6 at 44) / 16.1e (16.1e) / 16.1e (15.3e) | none (8.7 at 45) / 16.1e (16.1e) / 15.9e (15.3e) |
| shot-03 laydown / arrows | 13.7 (14.2) / 10.5 (10.5) | 14.1 (14.2) / 10.5 (10.5) |
| shot-03 speed | 15.6e (16.5) | 18.3 (16.5) |
| shot-04 | 23.7, arrows 31.9, 12.0e mph (no hand trace) | not traced (`too-little-seen`; nor is the hand) |
| shot-05 laydown / arrows | 18.2 (18.5) / 13.2 (13.1) | 18.7 (18.5) / 13.1 (13.1) |
| shot-05 breakpoint / speed | none (8.9 at 49) / 17.9 (18.1) | 8.9 at 49 (8.9 at 49) / 18.1 (18.1) |
| shot-06 laydown / arrows | 17.6 (17.7) / 14.7 (14.8) | 17.8 (17.7) / 14.7 (14.8) |
| shot-06 breakpoint / pins / speed | 12.6 at 35 (12.5 at 36) / 18.8 (19.3) / 17.6 (17.0) | 12.6 at 35 (12.5 at 36) / 18.4 (19.3) / 17.5 (17.0) |

The hand column of `auto.ts` is the single calibration of the JSON. For
shot-02, `run.ts` traces the near end with the second calibration on frame
66 (`near`), which reads laydown 21.0 and arrows 15.7: the automatic 21.9
and 15.8 are within a board of it on any calibration frame; the old
automatic trace was 0.4 and 0.0 off it on the frame it chose, but its swing
was 3.3 and 1.9.

Reading it:

- Laydown and arrows: within 0.5 board of the hand trace on shot-01, 03, 05
  and 06 (0.9 on shot-02 against the two-calibration hand trace), and the
  same on any calibration frame.
- shot-05's breakpoint is found now (8.9 at 49 ft, the hand's exactly).
- Worse: shot-01's pins (16.7 against 20.5) and shot-03's speed (18.3
  against 16.5, and shown as measured). Neither is the lane. shot-01's
  board at the pins is read by following the ball by its darkness to the
  rack (`followForward`); on this trace it lost the ball after two frames,
  six before the rack moves, and the path's own board was used. With other
  calibration frames it reads 16.0 to 20.2: the pins reading depends on
  where the ball was last detected, which still depends on the calibration
  frame (the empty lane and the region searched are built in its pixels).
  shot-03's ball is seen to 27 ft only and the rack's first movement is
  found at frame 200 (the hand trace: 214), so the anchored speed differs;
  its swing over calibration frames is 2.9 mph. Sampling the rack through
  the registration rather than the per-frame lanes was tried and changed
  nothing.
- shot-04 is no longer traced: the old reading was not believable (arrows
  31.9) and the hand trace fails the same way without `follow`.

### The hand-calibrated path

`run.ts` with the registration fix against the same calibrations without
it: shot-03 to shot-06 unchanged; shot-02's breakpoint 8.6 at 44.5 to 8.7 at
44.7; shot-01 laydown 20.6 to 23.3, touchdown 20.9 to 22.5, breakpoint 7.2
at 44.5 to 7.5 at 42.5, pins 19.6 to 20.5, speed 15.1 to 15.3. The owner read
shot-01's laydown as 24 or 25 and the pins as a really high pocket (by eye
19.4), so the laydown moved toward the owner and the pins 0.9 away. The
evidence for the fix is the found lanes: carried by the old registration,
frames 240 to 270 sat 4 boards off the lane found on them, by the new 0.6 to
0.9.

### Cost (Node, this container, idle)

| clip | frames given | findLane | findLanes | trace, one calibration | trace, lanes |
|---|---|---|---|---|---|
| shot-01 | 28 of 279 | 10.2 s | 12.7 s | 52.1 s | 52.3 s |
| shot-06 | 13 of 126 | 3.1 s | 3.8 s | 9.1 s | 9.3 s |

`findLanes` calibrates every frame given where `findLane` calibrates its 10
best, a quarter more time; the blending in the trace costs nothing measurable.
In the app the finder is given 24 frames.

### Next

- The far end still moves with the calibration frame (shot-01's pins 16.0
  to 20.2, breakpoint 7.3 to 8.6): the empty lane and the search region are
  built in the calibration frame's pixels. The next step is to build them
  per stretch of the clip, or to choose the registration frame near the
  middle of the ball's run once a first pass has found it.
- `followForward` losing the ball over the rack on shot-01.
- `reach` is in frames; at 120 fps (shot-05) it is a quarter of the time.
  It made no difference on shot-05, but time would be the better unit.

## The lane with no lines (0.109.0, 2026-11-14)

The owner's goal: no input from the bowler. `src/lib/shotTrack/laneFind.ts`
finds the lane (`findLane`: the frame it chose and the marks on it);
`auto.ts` runs it on every clip, traces with it, and sets the readings beside
the hand-calibrated trace's (`truth.ts` loads the hand calibration; where the
finder chose another frame the truth is carried there by `register` and then
`registerPlane`, as the tracer carries a calibration). How it works is in
`docs/SHOT-TRACKER-HANDOFF.md` and the module's header.

Automatic, hand in brackets (boards, feet, mph; `e` is estimated):

| clip | frame | laydown | arrows | breakpoint | pins | speed |
|---|---|---|---|---|---|---|
| shot-01 | 140 | 23.0 (24.2) | 16.6 (17.3) | 7.3 at 43 (7.2 at 44) | 19.0 (19.7) | 14.9 (15.1) |
| shot-02 | 140 | 20.6 (18.3) | 15.7 (13.5) | none (8.6 at 44) | 16.1e (16.0e) | 16.1e (15.3e) |
| shot-03 | 250 | 13.7 (14.2) | 10.5 (10.5) | none (none) | none (none) | 15.6e (16.5) |
| shot-04 | 180 | 23.7 (none) | 31.9 (none) | none | none | 12.0e (none) |
| shot-05 | 440 | 18.2 (18.9) | 13.2 (13.7) | none (8.8 at 51) | none (none) | 17.9 (18.0) |
| shot-06 | 50 | 17.6 (17.7) | 14.7 (14.8) | 12.6 at 35 (12.5 at 36) | 18.8 (19.3) | 17.6 (17.0) |

The found lines against the hand ones on the finder's frame (boards at the
foul line and at 50 ft; feet for the foul line and the pin row; the pins
check is the 7, 10 and head pins against the found mapping):

| clip | left 0 / 50 ft | right 0 / 50 ft | foul | pin row | pins check |
|---|---|---|---|---|---|
| shot-01 | -1.62 / -0.93 | 0.01 / 0.17 | 0.24 | 0.45 | 7: 0.15, 10: -0.09, 1: -0.07 |
| shot-02 | 0.21 / 0.71 | -0.70 / -0.67 | 0.63 | -0.58 | none found |
| shot-03 | 0.21 / 1.51 | -1.07 / -0.46 | -0.06 | 0.14 | none found |
| shot-04 | -0.25 / 1.76 | 0.09 / 0.57 | -0.10 | -1.04 | none found |
| shot-05 | 1.19 / -0.27 | -1.39 / -0.60 | 0.04 | 0.77 | 10: 1.54 |
| shot-06 | -0.23 / -0.12 | 0.34 / -0.53 | -0.02 | -1.19 | 7: 0.10, 10: -0.15, 1: -0.07 |

These line errors include the carry of the truth to another frame, up to 200
frames away (shot-03), so the readings above are the better judge.

What the clips taught:

- **The tracer swings more than the finder.** shot-01 traced with each of the
  finder's attempts, whose lines agree with the hand truth to about half a
  board at the near end, gave laydowns of 18.2, 19.1, 21.1, 23.0, 23.1, 23.2,
  23.5, 23.7 and 24.3. The calibration frame decides the registration chain,
  the region searched and the empty lane. One calibration carried through a
  hand-held clip is the limit now; the handoff's first item.
- **The first edge, on its dark line.** The hand marks sit on the middle of
  the thin dark line where the lane's colour ends; a gradient's peak is the
  line's lane-side flank, 0.15 to 0.2 board in. `toLine` steps out to the
  line's middle: shot-01's right edge and both of shot-04's then agree with
  the marks within 0.12 board where the edge shows.
- **The camera's distance ties the two ends together.** The foul line and the
  pin row each have look-alikes (a join in the approach 1.75 ft back on
  shot-01, the edge of a reflection 2 ft up the lane on half of shot-06's
  frames, a row of reflections under the racks on shot-04). The pair that
  puts the camera where most frames put it is the right one.
- **The pins hold the far end across the lane**, as marks in the fit and as
  the score that chooses the frame: shot-01's pins reading was 16.0 on a late
  frame fitted from the edges alone, and is 19.0 against the hand 19.7.
- **shot-04's automatic arrows reading (31.9) is wrong** and is not the
  lane's doing: the found edges agree with the hand ones, and the hand trace
  itself fails on this clip without `follow`.

## The app on the per-frame lanes (0.110.0, 2026-11-15)

- The app's find worker calls `findLanes` and its trace worker
  `trace({ lanes })`; lines dragged by hand are still traced as marks.
- The reader (`src/shotTracer/videoFrames.ts`) plays the video and copies each
  frame as it is shown (`VideoFrame.copyTo`), starting at rate 0.5 and only
  slowing; the seek loop is the fallback. shot-01 as VP9 in the container's
  Chromium: 41 to 46 s before, 8 to 11 s after, 240 frames both ways, 98% on
  the exact frame ffmpeg gives for the time.
- Grey range, measured: ffmpeg's `-pix_fmt gray` is gray = 1.1647 Y - 18.68
  against the raw luma plane, so the harness is full range and the app video
  range. Both ways on the six clips: at full size video range is worse on
  three (shot-03 laydown 13.3 for 14.1, shot-05 loses its breakpoint, shot-04
  traces to 33.6 and 32.3); at the app's size (962 by 718, 240 frames) full
  range is worse (shot-03 7.2 and 3.8, shot-05 27.4). Left as it was.
- The verdict (`laneVerdict.ts`): what separates good from bad on the six
  clips is the share of found lanes kept (shot-03 at app size: 1 of 20;
  others 33% to 93%) and the tracer's pins check over a board. Edge support
  (0.37 to 0.72 on good and bad alike) and camera distance (19.4 to 25.8 ft
  everywhere) do not.
- In the browser, three runs of shot-01 read laydown 18.8, 23.8, 23.8. The
  first had playback slowed to 0.28. Not explained.
- `review-auto.ts` writes the pictures and readings of the automatic trace
  for a review page.

## The app's read in Node (2026-11-17, not released)

```
npx tsx scripts/shot-tracker/app-read.ts <video> [--hand left] [--gray decoded|full|phone] [--from 0] [--look dir] [--json out.json] [--dump dir]
```

`--gray phone` (2026-11-27) decodes an HDR video (HLG or PQ, by ffprobe's
transfer) as an iPhone hands it to the app: Safari's WebCodecs gives an 8-bit
NV12 frame in full range tagged BT.709 and sRGB, and its luma is the HLG
signal as coded, rounded from 10-bit video range to 8-bit full range
(`PHONE_DECODE`, ffmpeg's `zscale=rin=limited:r=full`). On 6602 that gives the
phone's first-look gray means exactly (158/138/142 at frames 0, 47 and 93),
where `--gray full` (the 10-bit plane cut to 8 bits, then expanded) is half a
level darker (158/138/141) and every tone map tried is further off. Any
other video reads as `--gray full` does. `PHONE_VF` tries another ffmpeg chain.

`app-read.ts` is the app's whole read with ffmpeg as the decoder: the file's
sample table by `mp4.ts`, the first look's and each read's frames chosen by
`framePick.ts` (the same code `codecFrames.ts` runs), each luma plane
cropped, scaled and turned by `planeGray`, then `readShot` itself, the lane on
the frames the view's `findOn` chooses, and the trace. On shot-01 its frames
hash the same as `codecRead`'s in Chromium. `--from 0` reads the same frames
from the video's start, `--gray decoded` keeps the luma as recorded (the app
before this round). The first look's frames from a canvas cannot be had in
Node; `--look dir` takes them as a page that runs `codecScan` saved them
(`<stem>.look` and `.look.json`).

Why the app read other numbers than the harness (the browser's numbers, each
reproduced in Node first):

- **The engine's own maths.** Node 22 and Chromium 153 differ in the last bit
  of `Math.exp`, `sin`, `atan2` and the rest. On shot-01's frames, bit for
  bit the same, Node read the pins 16.4 and Chromium 17.4. `detMath.ts` is
  fdlibm, Node 22's own bits; a lint rule keeps `Math`'s out of
  `lib/shotTrack`. The browser now gives the harness's digest.
- **shot-06's 22.5 and 25.4**: the browser run was set up right-handed and
  shot-06 is a left-hander's: 40 less 17.5 and 14.6.
- **shot-01's 20.0 against 24.3**: read from 0.2 s before the foul line, the
  calibration frame (the best found lane) fell 1.6 s on, and the floor's
  registration fell back to the camera's turn on the release frames the
  bowler hides: the turn was 23 pixels, 4 boards, out at the foul line. Such
  a frame now keeps the floor last measured (`PlanePass`).
- **shot-04's arrows 21.9 estimated**: in video range, and from the browser's
  window, the ball's sightings stopped at 9.7 ft and something standing at
  12.5 to 16 ft half a second later was taken for the ball. `onePace` keeps
  a piece of the ball's run only at the ball's pace; the near lane's own
  follow then reads it to 12.9 ft, as from the clip's start.
- **Readings that moved with the read's start**: the lane search took every
  nth frame of the read, and the empty lane every fourth, both counted from
  the read's first frame, and the register passes fitted the focal length to
  the frames they had. Both grids are now counted from the video's start
  (`gridFrames`), and the focal length comes from the calibration frame's
  found lane. At 0.2 s of lead the crossing frame's lane came from lanes
  after it only (shot-05 18.9, IMG_1996 18.7 against 18.6 and 18.4 from any
  earlier start); the read now starts 0.4 s before the first look's crossing,
  the extra 0.2 s read over the frame budget.
- **Gray range**: ffmpeg's gray is full range (1.1647 Y - 18.68); the app kept
  video range. The reader now brings every luma plane to full range by the
  range the decoder or the file reports (`grayRange.ts`), a canvas's luma is
  taken as it is, and the first look's change threshold is the same contrast
  (14 for 12). On the app's window, before the fixes above, video against
  full range moved shot-01's laydown 19.9 to 20.4 and shot-04's arrows 21.9
  estimated to 9.3.
- **shot-03**: the first look chose a run at 3.54 s (the canvas's full range
  gray moved it from 0.40 s); the lane found there showed no run to be the
  ball's, and the read missed it. The part around the look's next run is now
  read and judged too (`nextPart`), and finds the ball's at 1.08 s.

Each clip read from the app's window, from 0.13 and 0.27 s earlier, and from
its start (`sweep`: laydown, arrows, breakpoint at feet, pins):

| clip | app's window | from the start |
|---|---|---|
| shot-01 | 24.31, 17.51, 7.59 at 42.8, 16.82 | 24.30, 17.49, 7.34 at 43.6, 18.35 |
| shot-02 | 21.19, 15.95, 8.74 at 41.5, 16.76e (the window starts at the clip's) | same |
| shot-03 | 13.52, 10.04 | 13.60, 10.55 |
| shot-04 | 6.23, 4.86e | 6.15, 5.14e |
| shot-05 | 18.55, 13.29, 9.08 at 48.4 | 18.55, 13.28, 9.07 at 48.4 |
| shot-06 | 17.62, 14.79, 12.62 at 34.75, 19.27 | 17.59, 14.83, 12.68 at 34.75, 19.48 |
| IMG_1996 (its VP9 copy) | 18.43, 13.48 | 18.43, 13.48 (from 1 s earlier) |

Still moving with the start: shot-01's pins (16.4 to 18.4 over four
starts: a sighting among the falling pins is kept on some, and the pins are
then seen to move later), shot-03's arrows (10.0 to 10.6: the far sightings
found depend on the empty lane's median, and the edges' clip median moves
every sighting with them), shot-04's estimated arrows (4.8 to 5.1).

## Speed (2026-11-16, not released)

```
npx tsx scripts/shot-tracker/bench.ts [shot-0N | IMG_1996 ...] [--out run.json] [--compare base.json]
```

`bench.ts` runs the app's compute on what the app reads (frames scaled to
960 by 720 at most, 60 a second; IMG_1996 cropped to the clips' band over
the window the app chose, 3.467 to 7.083 s): the lane on 8 frames of the
first two seconds, the lane on 24 frames spread over the read, then the
trace, each stage timed, every reading kept to 4 places. `--compare` lists
every reading that moved. Run one clip a process to time it as the app's
fresh worker does.

The lane finder and the tracer were made about three times faster with
every reading the same (Node, this container, one clip a process):

| input | frames | lane, 8 + 24 frames | trace | of which registration | ball | total |
|---|---|---|---|---|---|---|
| shot-01 | 279 | 13.1 to 2.5 s | 41.5 to 14.9 s | 23.1 to 8.1 s | 7.0 to 5.0 s | 54.6 to 17.4 s |
| shot-02 | 242 | 10.1 to 2.3 s | 31.7 to 11.2 s | 20.6 to 6.9 s | 6.0 to 3.0 s | 41.8 to 13.4 s |
| shot-03 | 284 | 11.0 to 2.4 s | 30.3 to 10.4 s | 23.0 to 7.0 s | 6.0 to 2.5 s | 41.4 to 12.8 s |
| shot-04 | 203 | 14.4 to 2.7 s | 27.9 to 10.4 s | 18.3 to 5.4 s | 7.5 to 3.5 s | 42.3 to 13.1 s |
| shot-05 | 277 | 15.6 to 2.9 s | 38.2 to 13.5 s | 23.2 to 7.3 s | 9.9 to 4.1 s | 53.8 to 16.4 s |
| shot-06 | 126 | 8.4 to 1.6 s | 8.7 to 3.7 s | 5.4 to 2.2 s | 2.8 to 1.1 s | 17.2 to 5.3 s |
| IMG_1996 | 218 | 14.9 to 2.8 s | 32.0 to 11.1 s | 19.5 to 5.6 s | 7.4 to 3.9 s | 46.9 to 13.9 s |

The finder's third of a second a frame was not a regression: 0.112.0 takes
the same on the same frames (0.41 against 0.40 s a frame at the clips' full
size). It went on medians: thousands a frame by sorting, three profiles a
frame where two are read. It is now about 70 ms a frame.

What is left is the patch matching that carries the lane from frame to
frame (`register`, `registerPlane`, `alignTo`: about 150,000 patches a clip,
each searched over 169 shifts) and the per-pixel work on every frame's lane
(warp, change map, blobs). Both are now cut as far as an exact search
allows: a shift is skipped when its block sums show it cannot win, and a
sum is given up once it passes the best. Anything that changes the
registration at all moves the readings: half the patches put IMG_1996's
breakpoint at 52 ft against 45, and 12 frames for the lane search instead
of 24 put shot-01's laydown at 19.4 against 24.3.

## The shot window and the reader (2026-11-16, not released)

The owner's ruling: no fixed four seconds; read from the ball on the foul line
until it leaves the pin deck, and nothing else. `src/shotTracer/readShot.ts`
does it in two parts (the decisions are in `src/lib/shotTrack/shotWindow.ts`):

1. The first part, from 0.4 s before the first look's run to 1.6 s after, at
   60 a second, in the clips' band first (30% to 72% of a portrait picture's
   height), then the run's. The lane is looked for on 8 of its frames; not
   there, the next band is tried without reading more.
2. Every run of the first look of three points or more (`ShotFound.others`,
   up to 16; when none passed the picture's tests the look is only a guess,
   `guessed`) is put through that lane into feet (`ballRun`). A run is a
   candidate when all of it is on the lane (20 ft behind the foul line to the
   pins, and within the lane's boards: a ball on the next lane is outside),
   it only goes up the lane, it is first seen in the first 12 ft, and its line
   is at a ball's speed (12 to 51 ft/s; the ball in the hand reads fast). Of
   the candidates, a run seen crossing the foul line wins, then the line most
   of all the runs' points lie on, then the one over more feet: the ball is
   seen in pieces, and they vote together. The bowler's approach (10 ft and
   more behind the line, slow) is never a candidate.
3. The window: from 0.2 s before the crossing (interpolated between the
   run's points either side of the line) to the deck end at that speed, no
   faster than 26 ft/s since the first look reads fast, times 1.4, plus 0.25
   s. Both edges sit on the first look's 1/15 s grid: the tracer's readings
   move with its first frame. A window outside the first part (the look chose
   a run long before or after the ball's) is read on its own.
4. No candidate: a guessed look is "the shot couldn't be found"; otherwise
   the end is the pins seen hit (when believable) or the time a 10 mph ball
   takes, and the console line says why.
5. The rest is read to the end. The whole window is kept at the highest rate
   that fits 240 frames of 960 by 720 (60, 30, 20, 15): a slow shot is read at
   a lower rate, never cut.

The reader keeps every `m`th frame of the video counted from its start
(`FrameSlots`), each at its own media time; a frame the browser passed over is
found from the gap in the times and read again by playing that stretch more
slowly. On IMG_1996 (VP9 copy, headless Chromium) three reads with the main
thread kept busy passed over 44 to 75 frames each and came out with the same
204 frames, pixel for pixel, as a clean read.

The first look still picks the bowler's approach, or something else, on many
looks (IMG_1996: runs at 1.81, 3.07, 4.67 and 5.01 s besides the ball's at
3.53 s); judged on the lane the window came out the same all the same. Four
app runs of IMG_1996 in a row: window 3.467 to 7.083 s, laydown 18.6, arrows
13.4, breakpoint 8.9 at 50 ft every time. A slower first look (every frame
shown on a 60 Hz screen) was tried and dropped: it took 16 s rather than 4 and
bought nothing once the runs were judged on the lane.

The padded shot-01 (`p01-lead14`, 14 s of another bowler's shots looped
before shot-01) still falls back to the slowest ball: none of the first look's
runs is shot-01's ball on the lane (they are the looped bowler's, and on the
found lane they read tens to hundreds of feet in a fifteenth of a second). A
sharper second look on the first part was tried and found nothing either.
Padded shot-06 is windowed by speed.

The search worker never answered once, after the look's last frame, for over
four minutes (cause not found). The screen now gives up after 60 s ("This
video couldn't be read"), and a lane search after 60 s (the lane not found).

## In the app (0.108.0, 2026-11-14)

The tracer runs in the app, in Settings, Labs (`src/views/ShotTracerView.tsx`,
the worker and the video reader in `src/shotTracer/`). The bowler drags four
lines (both edges, the foul line, the back pin row) onto one frame; those are
the calibration, eight equations and so no redundancy, unlike the harness
files. Two things the harness did not need, both found by tracing shot-01
through the app in a headless Chromium (re-encoded to VP9, which that build
decodes):

- **Seeking.** A seek to exactly a frame's start lands either side of it: read
  at 30 from a 60 fps clip, the steps ran 1, 2, 3 source frames and the speed
  read 18.6 mph. Each seek now aims a quarter of a 60 fps frame in, and takes
  the frame's own time from `requestVideoFrameCallback`.
- **Grey.** The canvas stretches the video to 0 to 255; ffmpeg's grey, which
  the tracer's thresholds were set on, is the video's own 16 to 235. Stretched,
  the ball was lost at 47 ft; in video range it is followed to 58.

Read at 60 fps and 962 by 718, with the harness's lane lines placed by drag,
shot-01 reads laydown 24.3, arrows 17.3, breakpoint 6.5 at 44 ft (estimated),
pins 20.0 and 15.1 mph, against the harness's 24.2, 17.3, 7.2, 19.7 and 15.1.
At 30 fps the pins read 14.8: the follower needs the frames.

From 0.109.0 the lines are not dragged first: the lane is looked for on 24
frames in a worker (`src/shotTracer/find.worker.ts`), and when it is found the
trace starts at once. The marking screen is the fallback, and the way to
correct a found lane ("Move the lines and trace again"). Not yet run in a
browser on a real clip.

## Results, round eight (2026-11-13)

After the owner's review of round seven.

| Clip | Visible | Sightings | Laydown (0 ft) | Touchdown | Arrows | Breakpoint | Pins | Speed |
|---|---|---|---|---|---|---|---|---|
| shot-01 (right) | 0.4 to 58.4 ft | 117 | 22.8 (m) | 22.4 at 0.4 ft | 16.8 (m) | 7.5 (m) at 43.1 ft | 18.6 (m) | 15.4 mph (m) |
| shot-02 (right) | 1.7 to 54.4 ft | 114 | 17.8 (m) | 16.5 at 1.7 ft | 13.5 (m) | 8.6 (m) at 44.5 ft | about 14.5 (e) | about 15.3 mph (e) |
| shot-03 (right) | 1.1 to 26.9 ft | 48 | 13.9 (m) | 13.7 at 1.1 ft | 10.5 (m) | missing | missing | 16.5 mph (m) |
| shot-04 (right) | not calibrated | | | | | | | |
| shot-05 (right) | 1.4 to 52.8 ft | 214 | 18.6 (m) | 18.2 at 1.4 ft | 13.7 (m) | 8.8 (m) at 50.2 ft | about 9.2 (e) | 17.8 mph (m) |
| shot-06 (left) | 0.8 to 61.0 ft | 63 | 17.5 (m) | 17.0 at 0.8 ft | 14.8 (m) | 12.5 (m) at 36.0 ft | 19.5 (m) | 17.0 mph (m) |

**The owner's reading of shot-01's pins: about 18, definitely not 15.** The
tracer read 15.6 and now reads 18.6. The owner was right, and the frames show
it: the ball is at board 14 at frame 227, 15.1 at 229, 16.0 at 231, 16.7 at
233 and 17.5 at 235 (read against the pin columns; the rack first moves at
236), a board in two frames. Two causes. The ball was not found after frame
227: in front of the rack the gaps between the pins cut its change into
strips, which fail the shape tests (`diff.ts shot-01 226 237 1 500 395 70 45
4 out.png`). And the path, straight after its one bend, was run on from 57 ft
under a ball still turning. With the gaps closed it is seen at 229 (15.8),
233 (17.6) and 234 (16.8), and the board at the pins is a line through the
sightings from 54 ft on, placed by time. 18.6 may be half a board high: the
line is run on to 60 ft and the ball meets the head pin a little before.

**shot-06's pins moved with it**, 17.0 to 19.5 (its last sightings: 17.4 at
57 ft, 19.2 at 61 ft). No owner's reading yet.

**The laydown is shown where it is read.** The owner again: the laydown is
where the ball crosses the foul line, not where it lands. The number already
was that (a line through the first 10 ft of sightings, run back to 0 ft), but
the review page showed the touchdown frame under the heading "Laydown and
touchdown". It now has a "Laydown (foul line)" picture: the frame in which
the ball is over the foul line (timed from the first 8 ft of sightings), the
foul line with the boards ticked and numbered on it, and the tracer's laydown
as a cross on the line with a plumb line up from it. On all five clips the
ball's centre sits on that line, in the hand (shot-03, shot-05), in the air
(shot-02) or on the lane (shot-01, shot-06). The touchdown has its own
picture.

**shot-01's laydown is still 22.8 against the owner's "roughly 22".** On
frame 77 the lane's edges sit on the gutter lips and the foul line on the
gutter ends (checked enlarged), and the ball's centre is over 22.75 on the
ticks. Not resolved: the owner to read it off the new picture.

**The owner's second reading of shot-01's laydown: 24 to 25, definitely not
22.** Two things came out of it. First, shot-01's left edge was never marked
(the bowler's leg covers it near the foul line on frame 150). It shows as a
thin dark line between the leg and the lane on rows 470 to 530 and is marked
there now. The fit agrees with it within 0.15 board (worst mark 0.43, 18
equations to spare), and the laydown moved from 22.8 to 23.3 (pins 18.6 to
18.9). Second, `foul.ts shot-01 out.png 66 69 72 74 76 77` shows the release
with a tick every board on the foul line. The ball is over about 25 at frame
72 and 24 at 74, in the hand, then 23.3 at 76 and 22.7 at 77. At 72 and 74 it
is behind the foul line, low over the approach: its bottom is below the foul
line in the picture, it is 8% larger than at 77 (nearer the camera), it first
meets its mirror image at 77, and at 15 mph it covers about 1.8 ft in those
five frames. So the ball reaches the foul line over about 23 and is over 24
to 25 about a foot and a half before it. Asked the owner which frame they
read.

**The owner's third point: the right edge was on the bumper.** On the review
page the green right edge ran along the dark groove of the gutter structure,
not the lane's own edge. Row by row on frame 150 the right side is: the lane,
a thin dark line (the lane's edge, where the lane's colour ends), a grey
strip about 4 pixels wide, then the dark groove. The old right mark had two
points; the far one sat on the thin line and the near one on the groove, so
near the foul line the edge was 4.5 pixels (nearly a board) too far out. It
is re-marked on the thin line at seven rows from 504 to 616. Every mark now
agrees within 0.30 board (was 0.43) and the pins check improved (7: -0.08,
10: -0.14, 1: -0.21). The laydown moved from 23.3 to 22.7, away from the
owner's 24 to 25: a narrower lane shrinks the boards on the ball's side.
The left edge, marked on the line nearest the lane, has no second line
between it and the lane surface. Pins 18.2, breakpoint 7.2 at 43 ft.

**The board at the pins is read where the ball meets them.** The owner read
shot-06's pins as about 18, a high pocket, like shot-01. The 60 ft reading
used frame 105, at 61 ft, already among the pins, and read past the point of
contact. Now (`boardAtPins`) board and distance are each a straight line
against time through the sightings from 54 ft on, and the board is read
where the distance line reaches the first pin contact (or when the rack is
first seen to move, if sooner); sightings past either are left out. shot-01
reads 17.9 (owner: about 18). shot-06 reads 19.2: its last clear sightings
are 18.2 at 58 ft and still turning a board a foot. By eye on frames 99 to
103 (pin spots drawn) the ball's centre is 2 boards inside the head pin at
frame 99 and about one at 101 and 103, so 18.5 to 19 at contact. This clip
is 720 pixels wide and recompressed, and cannot settle it to better than a
board. Not tuned further.

**The laydown is the ball right above the foul line, in the picture.** The
owner (2026-11-13, third time): shot-01's laydown is the board under the ball
in the frame where it sits immediately above the foul line, about 24 or 25,
not where the ball reaches the line on the ground. `release.ts` follows the
ball back from its first sighting by its darkness against the lane round its
lower half (the hand covers its top), and reads the board on the foul line
straight below its centre in the frame where its bottom reaches the foul
line's row. On shot-02, shot-03 and shot-05 the bottom never reaches the row
(14 to 21 pixels short: the ball is carried over the line), and it is read
where it comes lowest, beside the slide foot. Laydowns: shot-01 23.9 (owner
24 or 25), shot-02 18.4, shot-03 13.7, shot-05 18.7 (owner 18 to 19),
shot-06 18.5 (owner about 18). Where the ball cannot be followed the line
through the first sightings, run back to 0 ft, is kept. The review page's
laydown picture is that frame, with the followed ball circled. The pins
picture is zoomed out to the next lanes and the last 20 ft (owner, shot-02).

**Which frame: the first the ball sits on the line.** The owner again: shot-01's
picture (frame 76, 23.9) was a few frames too late. Its bottom stays on the
foul line's row from frame 72 to 77 as it goes out, and the owner reads the
first of them. The laydown is now read where the ball comes lowest beside the
line: shot-01 frame 72, 24.9; shot-06 frame 32, 21.9 (was 18.5 at frame 34,
where its bottom leaves the row; the owner had read about 18 and called 17.5
quite good, so this is for them to check). Each panel of the review picture
now has its own ball's plumb line. Moving shot-01's foul line to the bottom
of the light strip below it (y 635) was tried and dropped: it shifted the
near end's board scale and read 21.8.

**The ball's circle follows its outline.** The owner: the green circle in the
laydown picture did not border the ball. The darkness match keeps the radius
it is given, and the ball in the hand is nearer the camera (shot-01: 23.6
pixels on the lane, 26.6 at frame 72), so it matched off-centre. Each disc is
now fitted to the ball's outline (`fitOutline`: the dark-to-light step along
rays over its lower half and sides, a circle through them with the radius
free). shot-01 reads 25.1.

**shot-02 has two calibrations.** The owner: in its touchdown picture the
lane edges did not follow the lane, and the ball sits on the 20th board's
dot. The camera pans hard through this shot; the calibration on frame 192
(after the shot, where the scoring console also hides the near right edge)
carried back to the release missed the lane by a board or more. A second
calibration on frame 66, the touchdown, marks both edges near the foul line
(the thin line inside the bumper groove, on both sides), the foul line and
the pin row from lanes 9 and 11 (worst mark 0.11 board). Calibrated on
frame 66 alone the far frames do not register (the ball is lost at 36 ft),
so the near readings come from it and the far ones from frame 192
(`near` in the calibration file). Laydown 22.1 (was 18.3), touchdown 20.4
(16.5), arrows 15.7 (13.5); breakpoint 8.6 at 44.5 ft and pins as before.
The same split would be needed in the app for a camera that pans this far.

**shot-04: the laydown and the arrows at least.** The owner asked. Calibrated
on frame 88, as the ball lands: both edges on the thin line inside the bumper
groove, the foul line where the lane ends, the pin row on lanes 3 and 8
(edges and foul line within 0.05 board; lane 8's pins 1.3 ft off along the
lane, which moves nothing near the foul line). The tracer still finds the
ball in only 7 frames: the camera pans and the bowler stands over the
ball's path, so the empty lane holds the bowler and the ball merges with
what changed round it. `follow.ts` follows the ball by its own darkness from
frame 88 (`follow` in the calibration file) until it goes behind the bowler
at 11.7 ft, through each frame's lane mapping (the grid follows both gutters
on frames 75 to 104). Laydown 6.4 (the ball followed back into the hand,
frame 75), touchdown 5.8 at 4.0 ft, arrows about 5.0 (a straight line run
on from 11.7 ft, estimated). Nothing further is read.

**shot-05: the touchdown and the pins.** The owner: at frame 139 the ball is
still in the air, and "about 9.2" at the pins is too sure when the ball is not
seen there. Frames 139 and 140 had no mirror image found and were taken as on
the lane, though 141 and 142 were judged in the air; a sighting before one in
the air is now in the air too. Touchdown 18.0 at 1.8 ft (was 18.2 at 1.4).
The board at the pins is left unread when the ball was last seen short of
54 ft (shot-05: 52.8 ft); it was estimated from 52 ft. No other clip's
readings moved.

**The laydown: the last frame the ball sits on the foul line.** The owner
chose it (2026-11-13): the ball's bottom sits on the foul line's row in the
picture for a few frames as it goes out, and the board under it changes as
it moves across. It is read where the bottom is last on the row (followed
back from the lane, where it first comes down onto it), or where the ball
comes lowest when it never reaches it. shot-06 17.7 (owner about 18),
shot-01 24.2 (owner 24 or 25), shot-02 21.0, shot-04 6.2; shot-03 and
shot-05 unchanged.

**shot-01's left edge was on the bumper too.** The owner marked the lane about
a board further in. Inside the old mark there is no second dark line, only a
pale strip without the lane's yellow tint; the lane's colour starts 5.5 to 7
pixels in on rows 470 to 482, where the lane is clear of reflections. The
edge is moved 5.5 pixels in, parallel to the old one (worst mark 0.42 board,
pins check 7: -0.32, 10: -0.05, 1: -0.36). With the lane narrower the boards
on its left side read higher: touchdown 23.3 (was 22.4), arrows 17.3 (16.6;
the owner read 16), breakpoint 7.2, pins 17.4 (owner about 18).

**The board at the pins: the ball just before it meets them.** The owner:
shot-01 is a really high pocket, more than 17.4. Its last sighting was at
frame 232, seven frames before the rack is seen to move (239; by eye a pin
leans at 236). The ball is now followed on by its darkness to the frame
before the rack moves (`followForward`) and read by its centre across the
picture on the head pin's contact row: in front of the rack its circle slides
onto its mirror image, so only its column is trusted. A straight line through
the last four frames' boards is read halfway between the last frame before
the rack moves and the first that does. Used only when the ball was lost more
than two frames before that; otherwise the sightings reach it. shot-01 reads
19.7 (by eye against the pin columns: centre at x 521, head pin at 520,
about 19.4). No other clip's board at the pins moved. The pins picture is
that last frame.

**The board at the pins when the rack is hidden.** The owner: shot-02 is
not 14; in the last frame before the bowler's hand covers the ball it is on
a path to touch the head pin, so at least in the pocket. The rack is never
seen to move there (the arm swings across it as the ball arrives), so the
follower above never ran, and the 14.3 was the fitted path run on from 54 ft.
Now, with no rack movement found, the ball is followed on from its last
sighting until it is lost; if the fitted motion has it at 57 ft or more by
then, the mean of its last three frames' boards (by column, as above) is the
board at the pins, shown as estimated because the last feet of turn are not
seen. shot-02 reads 16.0 (frames 214 to 219 read 15.0 to 16.4; the head pin
is on 20, and a ball centre within about 6.3 boards of it touches it). The
gate is the fitted distance as well as the sighting's own: shot-02's last
sighting reads 49.8 ft where the fit has 53.8. No other clip moved.

**Still failing:** as round seven, and: the laydown is not measured on the
crossing frame itself (the ball in the hand or the air is not a sighting),
it is the rolling ball's line run back, checked by eye; shot-05's pins are
an estimate (four sightings past 54 ft by time, over less than 2 ft).

## Results, round seven (2026-11-13, superseded)

Five of six clips calibrate, each from one frame; four give a breakpoint.

| Clip | Frame | Marks (spare) | Worst mark | Visible | Sightings | Pins check | Laydown (0 ft) | Touchdown | Arrows | Breakpoint | Pins | Speed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| shot-01 (right) | 150 | 13 (12) | 0.45 | 0.4 to 57.1 ft | 111 | 7: -0.06, 10: -0.34, 1: -0.33 | 22.8 (m) | 22.4 at 0.4 ft | 16.8 (m) | 7.6 (m) at 42.9 ft | 15.6 (m) | 15.4 mph (m) |
| shot-02 (right) | 192 | 17 (9) | 0.22 | 1.7 to 54.4 ft | 116 | not found | 17.8 (m) | 16.5 at 1.7 ft | 13.5 (m) | 8.6 (m) at 44.5 ft | about 14.4 (e) | about 15.3 mph (e) |
| shot-03 (right) | 40 | 17 (12) | 0.46 | 1.1 to 26.9 ft | 48 | not found | 13.9 (m) | 13.7 at 1.1 ft | 10.5 (m) | missing | missing | 16.5 mph (m) |
| shot-04 (right) | 202 | not calibrated | 1.5 to 2.2 | | | | | | | | | |
| shot-05 (right) | 230 (left edge from 520) | 12 (8) | 0.29 | 1.4 to 52.8 ft | 216 | 10: -0.35 | 18.6 (m) | 18.2 at 1.4 ft | 13.7 (m) | 8.9 (m) at 49.4 ft | about 9.1 (e) | 17.8 mph (m) |
| shot-06 (left) | 20 | 16 (15) | 0.30 | 0.8 to 61.0 ft | 61 | 7: 0.26, 1: 0.08 | 17.5 (m) | 17.1 at 0.8 ft | 14.7 (m) | 12.6 (m) at 35.5 ft | 17.0 (m) | 17.1 mph (m) |

**shot-02 was mis-calibrated, and that was its 21 mph.** Its far line was
drawn level across the deck (y 401.5), and its foul line was marked on frame
140 and carried to the calibration frame, where it landed 25 pixels from the
gutter ends. In this picture the house's cross-lane lines slope about 3
degrees: the 7 pins' bases on lanes 8, 9 and 11 and lane 11's 10 pin lie on
one line that drops 27 pixels over 483, and the gutter ends on this lane and
the next lie on a line of the same slope. Marked on frame 192 alone (pin row
across four racks, foul line at the gutter ends, the left edge both beyond
the bowler and beside their feet), the fit has 9 equations to spare instead
of 2 and its worst mark is 0.22 board. The speed reads about 15.3 mph (it
read 21.2, which the reviewer did not believe), the touchdown 1.7 ft (0.4).

**shot-02 is followed to 54.4 ft and has a breakpoint** (8.6 at 44.5 ft). It
stopped at 48 ft because from there the ball's top half is in front of the
pit: a dark ball on a dark ground, no change. What changed was a highlight 7
by 4 pixels and the lower half 16 by 11, apart, and neither passed for a
ball (`diff.ts shot-02 184 214 3 500 360 110 60 3 out.png` shows it). They
are joined now. From frame 199 the highlight goes too and the lower half
alone is still refused; the ball is plain to the eye until frame 214, turning
left by about 5 boards over its last 10 ft, so the board at the pins
(about 14.4) is an estimate from 54 ft and likely low: by eye it is nearer
17. Its distances past 48 ft are rough (54.4, then 49.0 and 49.8): one pixel
is close to a foot there.

**The laydown and the arrows are read locally.** With shot-02's late turn
in the fit, the one-bend path put its straight start 0.7 board off the
sightings at the foul line (16.9 for sightings that run 17.4 at 1 ft and
16.0 at 5 ft). Both are now a straight line through the sightings around
them. Against the owner's readings: shot-01 22.8 (owner roughly 22; it read
22.6), shot-05 18.6 (owner 18 to 19; 18.8), shot-06 17.5 (owner about 18;
17.2), and shot-06's arrows 14.7 (owner 14.5 or 15; 14.9). The lean noted
in round six is smaller on shot-05 and shot-06 and 0.2 larger on shot-01.

**Got worse or moved:** shot-02's path RMS is 0.48 (0.22): the late turn is
in the fit now and one bend follows it poorly. shot-05 lost 4 sightings and
its breakpoint moved from 9.0 at 48.2 ft to 8.9 at 49.4 ft, its board at the
pins from about 9.6 to about 9.1; shot-01 gained 4 sightings and its pins
read 15.6 (15.5). Both from joining pieces; not looked into further.

**Still failing:** shot-04 (cannot be calibrated); shot-03 is not seen past
26.9 ft (the ball is behind the bowler); shot-02's pins are not found by the
pins check (a spare, two pins) and its speed is an estimate (no pin frame);
a half-hidden ball with no highlight is not found; no clip's arrows show;
the synthetic dark-lane and two-lanes-to-the-side cases are not attempted.

## Results, round six (2026-11-12, superseded)

Five of six clips calibrate, each from one frame; three give a breakpoint.

| Clip | Frame | Marks (spare) | Worst mark | Visible | Sightings | Pins check | Laydown (0 ft) | Touchdown | Arrows | Breakpoint | Pins | Speed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| shot-01 (right) | 150 | 13 (12) | 0.45 | 0.4 to 57.1 ft | 107 | 7: -0.06, 10: -0.34, 1: -0.33 | 22.6 (m) | 22.4 at 0.4 ft | 16.8 (m) | 7.6 (m) at 42.9 ft | 15.5 (m) | 15.4 mph (m) |
| shot-02 (right) | 192 (foul line from 140) | 10 (2) | 0.01 | 0.4 to 51.4 ft | 106 | not found | 17.7 (m) | 17.6 at 0.4 ft | 13.9 (m) | missing | missing | 21.2 mph (m) |
| shot-03 (right) | 40 | 17 (12) | 0.46 | 1.1 to 26.9 ft | 48 | not found | 13.9 (m) | 13.7 at 1.1 ft | 10.5 (m) | missing | missing | 16.5 mph (m) |
| shot-04 (right) | 202 | not calibrated | 1.5 to 2.2 | | | | | | | | | |
| shot-05 (right) | 230 (left edge from 520) | 12 (8) | 0.29 | 1.4 to 52.8 ft | 220 | 10: -0.28 | 18.8 (m) | 18.2 at 1.4 ft | 13.7 (m) | 9.0 (m) at 48.2 ft | about 9.6 (e) | 17.8 mph (m) |
| shot-06 (left) | 20 | 16 (15) | 0.30 | 0.8 to 61.0 ft | 61 | 7: 0.26, 1: 0.08 | 17.2 (m) | 17.1 at 0.8 ft | 14.9 (m) | 12.6 (m) at 35.5 ft | 17.0 (m) | 17.1 mph (m) |

**The laydown is the board over the foul line** (0 ft), in the air or not:
the owner's definition (2026-11-12), so every shot is read at one distance.
It is the fitted path run back from the touchdown to 0 ft. Where the ball
lands (the touchdown board and distance) is reported beside it. Until this
round "laydown" was the touchdown board.

**The owner's own reading of shot-05** (from the original video): laydown
18, 18.5 or 19, arrows 13 or 13.5. The tracer reads 18.8 and 13.7.

**The owner's own reading of shot-01:** laydown roughly 22, arrows 16. The
tracer reads 22.6 and 16.8. (The owner's earlier 25 was read off a frame
with the ball still in the hand.)

**The owner's own reading of shot-06:** laydown about 18, arrows 14.5 or 15.
The tracer reads 17.2 and 14.9.

**Open: the laydown may sit to the left of the owner's.** In the lane's own
terms (not the bowler's boards) the tracer's laydown is left of the owner's
reading on all three clips read so far: 0.6 board on shot-01, 0.3 on shot-05
(against the middle of 18 to 19), 0.8 on shot-06 (a left-hander, so a lower
board is further left). The readings are good to about half a board and the
arrows do not show the same lean, so this is not established. Not looked
into.

**shot-06: calibrated, and the cause was the pin marks, not the lens.** The
seven pin marks sat on the reflected pins' necks, 10 pixels below the bases:
down each pin's column the brightness runs head (y 171), neck (174), belly
(180), base (185 to 186.5), mirrored belly (191), mirrored neck (197 to 198),
mirrored head (200), and the marks were at 196 to 198. That put the rack
where the lane is 18% wider, which is the whole "rack reads 18% narrow". With
the marks on the bases (each column's dark seam, checked against the midpoint
of head and mirrored head) every mark on frame 20 agrees within 0.30 board
with nothing left out, and the clip traces to the pins. The other four
calibrations' pin marks were checked the same way and sit on the bases.

**shot-05's breakpoint is back** (9.0 at 48.2 ft; round four read 9.2 at
43 ft). The sightings were not the trouble: binned every 4 ft they read 17.9,
16.4, 15.2, 14.0, 12.9, 11.9, 11.1, 10.4, 10.1, 9.8, 8.8, 8.9, 10.1, 11.0, a
steady bend from the laydown with a turn near 44 ft. The fit had run into
both of its limits (skid 15 ft, bend 30 ft) and flattened the turn away. The
fitted turn is later than the sightings' own lowest point, by about 4 ft.

**shot-03 no longer reports a pin board.** The four far sightings after the
1.8 second gap are left out of the fit, so it is seen to 26.9 ft, its speed
is measured (16.5 mph) and the pins are missing.

**shot-02's breakpoint is missing honestly:** its board is still falling at
the last sighting (9.2 at 48 to 51 ft).

**Still failing:** shot-04 (cannot be calibrated, as in round five); shot-02
and shot-03 are not seen to the pins; no clip's arrows show, so no arrows
check; the synthetic dark-lane and two-lanes-to-the-side cases (round five's
item 4) are not attempted.

## Results, round five (2026-11-12, superseded)

Each calibration is now made on one frame, from marks visible on it.

| Clip | Frame | Marks (spare) | Worst mark | Visible | Sightings | Pins check | Laydown | Arrows | Breakpoint | Pins | Speed |
|---|---|---|---|---|---|---|---|---|---|---|---|
| shot-01 (right) | 150 | 13 (12) | 0.45 | 0.4 to 57.1 ft | 107 | 7: -0.06, 10: -0.34, 1: -0.33 | 22.4 (m) | 16.8 (m) | 7.6 (m) at 42.9 ft | 15.4 (m) | 15.4 mph (m) |
| shot-02 (right) | 192 (foul line from 140) | 10 (2) | 0.01 | 0.4 to 51.4 ft | 106 | not found | 17.5 (m) | 13.9 (m) | missing | missing | 21.2 mph (m) |
| shot-03 (right) | 40 | 17 (12) | 0.46 | 1.1 to 57.3 ft | 48 | 7: -0.49 | 13.6 (m) | 10.5 (m) | missing | -18.9 (m), wrong | about 12.7 mph (e) |
| shot-04 (right) | 202 | not calibrated | 1.5 to 2.2 | | | | | | | | |
| shot-05 (right) | 230 (left edge from 520) | 12 (8) | 0.29 | 1.4 to 52.8 ft | 220 | 10: -0.35 | 17.9 (m) | 13.8 (m) | missing | about 9.1 (e) | 17.8 mph (m) |
| shot-06 (left) | 20 | 16 (15) | 3.54 | refused | | | | | | | |

Radius ratio 0-20, 20-40, 40-60 ft: shot-01 0.928, 0.939, 0.972; shot-02
0.940, 0.933, 0.952; shot-03 0.934, 0.992; shot-05 0.940, 0.952, 1.002.

**shot-01's tail (round four's job 2): fixed.** It traces to 57.1 ft again
(round four: 52.7), so the board at the pins is measured, 15.4. Two causes,
both needed: the floor-plane registration put the rack about 2 pixels off
the empty lane (measured by matching the rack band, frames 180 to 240), and
over the rack the empty lane's 3 by 3 range spans black to white and hid the
ball's interior. Now those frames are steadied onto the empty lane once more
(`alignTo`, floor-registered frames only), and a pixel also counts as changed
five spreads from its own median over time. With three spreads it reached
60.5 ft but the right-handed synthetic shot stopped at 56.6 ft; aligning
every frame lost the synthetic pins by 0.4 to 0.55 board.

**shot-06: refused, and the cause is not the carried edge alone.** Marked on
one frame (20, before the delivery, where the full rack, the left edge, the
far 60% of the right edge and the foul line all show), the right edge still
sits 3.5 boards (4 pixels) outside where the seven pin bases and the left
edge put it at the far end. Without the right edge the fit agrees with
itself (worst 0.32 board), but the drawn right edge then runs well inside
the visible gutter near the camera (checked enlarged, `cal-lane.png`), so the
grid is not trustworthy either way. The rack's 7 to 10 span measures 38.6
pixels where the edges, 39 boards apart, predict about 47: the rack reads
18% narrow against the edges, on one frame. shot-01 reads 3% (pins 57 px,
edges 66). Not explained: lens distortion at the picture's left edge, or the
messaging app's recompression scaling, are candidates. Not traced.

**shot-03: calibrated on frame 40.** On the approach the bowler covers the
middle of the lane but neither edge near the camera; the rack's right three
columns (3, 6, 10) show, and the next lanes' racks give the pin row. It
traces 1.1 to 26.9 ft before the ball goes behind the bowler, then picks up
four sightings at 55.7 to 57.3 ft in the right gutter (board -1), which a
constant 11 to 12 mph fits; they may be the ball. The hook model through the
1.8 second gap puts the pins at board -18.9: the path fit is not to be
trusted across such a gap, and that number is wrong.

**shot-04: cannot be calibrated** from any frame (see its review page and
`out/shot-04/frame.png`, frame 202, the best): film from a better spot.

**Got worse:** shot-05's breakpoint went from 9.2 at 43 ft to missing: its
hook fit came out nearly straight with the new sightings. Aligning every
frame (not only floor-registered ones) keeps it at 9.2, but fails the
synthetic pins test. Not resolved.

**Not attempted:** the synthetic floor texture and the dark-lane and
two-lanes-to-the-side cases (item 4).

## Results, round four (2026-11-12, superseded)

Each calibration's marks, the equations it has to spare, and its worst mark
across the lane; (m) measured, (e) estimated; boards handed. Pins check:
found minus expected, boards. Gutter edges vs fit: where the snapped gutter
edges sit against the fitted lane edges near the ball (median, boards).

| Clip | Marks (spare) | Worst mark | Visible | Sightings | Pins check | RMS | Gutter edges vs fit, L / R | Speed: anchors / slope | Laydown | Arrows | Breakpoint | Pins | Speed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| shot-01 (right) | 13 (12) | 0.45 | 0.4 to 52.7 ft | 117 | 7: -0.07, 10: -0.35, 1: -0.32 | 0.26 | 0.12 / 0.09 | 16.1 / 16.1 | 22.4 (m) | 16.9 (m) | 7.9 (m) at 43.6 ft | about 12.4 (e) | 16.1 mph (m) |
| shot-02 (right) | 10 (2) | 0.01 | 0.4 to 51.4 ft | 104 | not found | 0.22 | 0.07 / 0.37 | 21.2 / 20.3 | 17.5 (m) | 13.9 (m) | missing | missing | 21.2 mph (m) |
| shot-03 (right) | not calibrated | | | | | | | | | | | | |
| shot-04 (right) | not calibrated | | | | | | | | | | | | |
| shot-05 (right) | 12 (8) | 0.29 | 1.4 to 52.9 ft | 220 | 10: -0.28 | 0.30 | -0.13 / 0.10 | 17.8 / 17.8 | 17.9 (m) | 13.8 (m) | 9.2 (m) at 44.7 ft | about 9.4 (e) | 17.8 mph (m) |
| shot-06 (left) | 18 (17) | 1.10 | refused: calibration-off | | | | | | | | | | |

Radius ratio (fitted over expected) by 0-20, 20-40, 40-60 ft: shot-01 0.928, 0.943,
0.966; shot-02 0.940, 0.933, 0.947; shot-05 0.940, 0.952, 1.002 (round three:
shot-01 0.940, 0.946, 0.979; shot-05 0.992, 0.991, 0.962).

**shot-01's laydown.** It reads 22.4 (the reviewer's working truth from
frame 77 is 22.5; round three read 21.4). The cause was registration, not the
lane's edges: the camera travelled sideways between frame 77 and the
calibration frame, and the whole-picture transform (round three's similarity,
and the new turn alike) put the lane 13 to 16 pixels (two boards) to the left
at the foul line in frame 77. The round-three edge re-snap could not catch it:
its 1.5 pixel slack rejected the true edges as too far from the prediction, so
the frame kept the prediction. The floor-plane registration fixes it.

**The "5% wide" lane is not the edges.** Calibrated from the pin spots, the
snapped gutter edges sit within 0.2 board of the fitted edges on shot-01, and
the pins check reads 7: -0.07, 10: -0.35 (it read 1.31 and -0.60). The radius
ratio still reads about 0.93 to 0.97: that is the glossy ball (its dark disc
is cut off where its underside mirrors the lane), not the lane's width.

**Still failing:**

- shot-01 stops at 52.7 ft (job 2, cause found, not fixed). In frames 218 to
  226 the ball is plainly in front of the pins' mirror images, but no
  candidate is found: the difference from the empty lane is taken outside
  the background's 3 by 3 minimum and maximum, and over the rack's
  alternating bright pins and dark gaps that range spans nearly black to
  white, so the ball's mid-grey interior falls inside it and only its rim
  differs; the rim fails the size and fill tests. b0655d8 found these frames
  (the same envelope, a slightly different registration put the rim on the
  right side of the tests). Not fixed: a narrower tolerance there needs the
  rack registered to well under a pixel, which a camera that travels makes
  hard. Its board at the pins is therefore an estimate from 52.7 ft.
- shot-06 is refused (`calibration-off`, 1.10 boards): the right edge is
  hidden on the calibration frame and marked where it shows on frame 120;
  carried to frame 50 it disagrees with the seven pin spots and the left edge
  by up to 1.1 boards. Earlier rounds traced it with that edge guessed; the
  refusal is the residual check doing its job. It needs a frame nearer the
  calibration frame where the right edge shows, or a calibration frame where
  it does.
- shot-03 and shot-04 are not calibrated (job 1, two attempts on shot-03):
  the bowler's sliding leg lies along shot-03's left edge near the camera and
  the snap took it; no visible left edge was found to mark. shot-04 was not
  attempted this round.
- shot-02 has only lines (no pin is identifiable on a spare): 2 equations to
  spare, so its residuals check little.
- Synthetic: the dark lane (light gutters, light ball) traces with the
  laydown 0.33 to 0.40 board off and the pins 0.3 to 0.5 off even with exact
  marks, so ball finding, not calibration, misses the 0.3 limit there; two
  lanes to the side the ball is first seen at 11.6 ft and the laydown is
  estimated 0.8 off. Both calibrate within a tenth of a board (unit test);
  one lane to the side traces within 0.3 from marks only. The floor-plane
  registration could not be tested on the synthetic floor (too little
  texture: its fits wandered by 5 to 50 pixels), only on shot-01.

## Results, round three (2026-11-12, superseded)

Since round two: each sighting's board comes from the two edges re-snapped
in its own frame over a short stretch around the ball's row (the whole-picture
registration only predicts them; a covered stretch keeps the prediction and
halves the sighting's weight); nothing behind the foul line is a sighting and
the laydown is the board at the touchdown; a candidate that stays put for
0.04 to 0.15 s is background; the pin frame cannot fire before the last
sighting beyond 50 ft; and the speed is read two ways and is measured only
when they agree within 1.5 mph (otherwise the slope, estimated).

| Clip | Visible | Sightings | Pins check (boards) | RMS | Edge re-snap, median / worst | Speed: anchors / slope | Laydown | Arrows | Breakpoint | Pins | Speed |
|---|---|---|---|---|---|---|---|---|---|---|---|
| shot-01 (right) | 0.1 to 50.1 ft | 103 | 7: 1.31, 10: -0.60, 1: 0.23 | 0.23 | 0.68 / 3.00 px | 14.4 / 15.7 | 21.4 (m) | 16.7 (m) | 8.0 (m) at 45.8 ft | missing | 14.4 mph (m) |
| shot-02 (right) | -0.2 to 52.9 ft | 101 | not found | 0.22 | 0.91 / 4.06 px | 20.0 / 19.3 | 17.8 (m) | 14.6 (m) | missing | about 8.9 (e) | 20.0 mph (m) |
| shot-03 (right) | not calibrated | | | | | | | | | | |
| shot-04 (right) | not calibrated | | | | | | | | | | |
| shot-05 (right) | 1.1 to 53.9 ft | 215 | 10: -0.48 | 0.34 | 0.07 / 2.99 px | 18.0 / 17.7 | 16.6 (m) | 12.8 (m) | 8.5 (m) at 42.6 ft | about 9.5 (e) | 18.0 mph (m) |
| shot-06 (left) | 0.9 to 63.2 ft | 53 | not found | 0.26 | 0.45 / 2.78 px | 19.8 / 20.9 | 18.4 (m) | 16.4 (m) | 14.3 (m) at 38.6 ft | 16.0 (m) | 19.8 mph (m) |

Radius ratio (fitted over expected) by 0-20, 20-40, 40-60 ft: shot-01 0.940,
0.946, 0.979; shot-02 0.956, 0.932, 0.954; shot-05 0.992, 0.991, 0.962;
shot-06 1.004, 1.063, 1.028.

**Open issue, the lane edge (not tuned):** on shot-01 and shot-02 the radius
ratio reads about 0.94 to 0.95 at every distance, and on shot-01 the 7 and 10
pins read 1.31 and 0.60 boards inside the edges. Both say the snapped lane is
about 5% too wide there, worth about 0.6 board at board 8 (the breakpoint).
shot-05 and shot-06 read about 1.00.

**Still failing:** shot-01 stops at 50 ft (it traced to 58.9 ft in round
one; cause not found). shot-02's 20 mph is believed by both readings but not
by the reviewer. shot-03 and shot-04 are not calibrated. The touchdown and
arrows panels were regenerated larger but were not inspected by eye in this
round. The laydown and arrows on shot-01 moved 22.2 / 17.1 (round one) to
21.0 / 16.1 (round two) to 21.4 / 16.7 (now); the re-snapped edges sit 0.68
px (median) from the registration's prediction, about a tenth of a board at
the arrows, so the round-to-round moves are not explained by registration
alone. Not resolved.

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

## Regression check (`regress.ts`)

CI reads a set of real videos with the app's own read and fails a PR when a
reading leaves its margin (the `shot-tracer` job in `.github/workflows/ci.yml`,
in parallel with the others, and only when tracer code changed).
`regress/expected.json` holds, per video, the hand and each reading (laydown,
arrows, breakpoint and its feet, pins, launch speed, entry speed): its value,
`measured` or `estimated`, and a tolerance (0.5 board, 1.5 ft for the
breakpoint's feet, 0.5 mph), or `null` for "must not be read". A `known` on a
reading is an owner-corrected value: it is printed against ours and never fails.

```
SHOT_CLIPS_DIR=<dir with the release videos> npx tsx scripts/shot-tracker/regress.ts   # about 3 minutes with 4 workers
npx tsx scripts/shot-tracker/regress.ts --only shot-06    # the videos whose name contains this
npx tsx scripts/shot-tracker/regress.ts --update          # an intended change: rewrite expected.json, print the diff
npx tsx scripts/shot-tracker/regress.ts --gray phone      # the HDR videos as a phone decodes them (app-read's --gray phone), held to the same margins
```

The six repo clips need nothing else. The rest are the release asset
`shot-clips-v1.zip` (tag `shot-clips-v1`, published 2026-11-24, 92,368,962 bytes), unzipped into `SHOT_CLIPS_DIR`; each
is checked against its sha256 in the manifest. Without a clip the run skips it
with a warning, or fails when `SHOT_CLIPS_REQUIRED=1` (CI sets it when the
release exists). After an intended change, run `--update`, read the diff, and
commit `expected.json` with the change.

To add a clip: put it in a new zip with every video of the old one (top level,
`zip -0`), upload it as release `shot-clips-v2` with the asset
`shot-clips-v2.zip`, add the clip to `expected.json` (`"from": "release"`, its
`sha256` and `bytes`; `--update` fills the readings) and set `release.tag` and
`release.asset` there and `SHOT_RELEASE` in the workflow to the new tag.
