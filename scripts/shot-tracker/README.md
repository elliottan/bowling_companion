# Shot tracer harness

Development harness for the shot tracer (`docs/SHOT-TRACKER-PLAN.md`, section
10.3). Never shipped. It runs the same `src/lib/shotTrack/pipeline.ts` the app
will run, on the six sample clips in `fixtures/clips/`.

## Commands

```
npx tsx scripts/shot-tracker/run.ts             # every clip; about 3 minutes
npx tsx scripts/shot-tracker/run.ts shot-01     # one clip
npx tsx scripts/shot-tracker/synthetic-grid.ts  # the full-size synthetic grid (add --all for 32 cases)
npx tsx scripts/shot-tracker/look.ts <clip> <frame> <x0> <y0> <w> <h> <scale> <out.png> [--cal] [--median]
npx tsx scripts/shot-tracker/diff.ts <clip> <first> <last> <step> <x0> <y0> <w> <h> <scale> <out.png>
npx tsx scripts/shot-tracker/foul.ts <clip> <out.png> <frame> [<frame> ...]
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
