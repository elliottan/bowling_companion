# Shot tracer: the plan

A plan, not documentation. Nothing here is built. It is written so that an
agent with no memory of the conversation that produced it can build the feature
one pull request at a time. When a phase ships, its section moves to
`docs/archive/` and the decisions it made become ADRs.

**The feature in one sentence.** A bowler picks one video of one shot, filmed
from behind, and Headpin reads the ball's path off it, fills in the shot's
Actual line, shows the speed, and can replay the shot on the app's own lane
afterwards without keeping the video.

**Status of the decisions** (owner, 2026-11-11):

| Question | Answer |
|---|---|
| One clip per shot, or a phone on a tripod all night | One clip per shot |
| Still camera only | No. A hand-held clip with ordinary shake must work |
| Keep the video | No. Keep the numbers, and replay from them |
| Free or Pro | Pro |
| Blocked video | Best effort: trace what can be seen, say what was guessed |
| Accuracy | Half a board is the target wherever the ball is visible |
| Speed | Yes |
| Platform order | The web first (the owner's copy at `/score`, tried on a Vercel preview), then iOS, then Android |
| Speed unit | A setting, mph by default, km/h the other choice |
| An estimated number (a laydown the camera could not see) | Saved, flagged as estimated |
| Sample clips | Cut-down copies are committed, in `scripts/shot-tracker/fixtures/` |
| Proof of accuracy | No Specto lane. The owner reviews the overlay by eye, laydown and arrows above all |
| Seeing a stored replay without Pro | Yes. The replay is an animation drawn from the stored numbers, never the video |
| iOS minimum | Raised to 15.4 when the iOS work is done |
| Reading the leave from the video | Wanted, later, as a suggestion the bowler confirms |

**Who builds this.** An Opus agent executes the pull requests in section 12. It
may hand bounded jobs to Sonnet or Haiku subagents (section 12 says which).
The author of this plan reviews each pull request and takes the problems the
executor cannot solve. Section 12 says when to stop and ask.

---

## 1. What the sample clips say

Six clips from the owner were looked at on 2026-11-11. Cut-down copies are in
`scripts/shot-tracker/fixtures/clips/`, and that folder's README says how they
were cut.

| Clip | Size | Frame rate | Codec | Notes |
|---|---|---|---|---|
| IMG_7213 | 1080 x 1920 | 60 | HEVC | Dark blue ball. Ball return in the foreground |
| IMG_9366 | 1080 x 1920 | 60 | HEVC | Scoring console in the foreground |
| IMG_0047 | 1080 x 1920 | 60 | HEVC | Camera moves up as the shot goes |
| IMG_1450 | 1080 x 1920 | 60 | HEVC | Another ball rolling on the next lane. A screen covers the lower third |
| IMG_1996 | 1080 x 1920 | 120 | HEVC | Slow motion capture. Red ball |
| 5624116129184861288 | 720 x 1280 | 30 | H.264 | Sent through a messaging app, so recompressed |

What every clip has in common, and so what the design must assume:

1. **Portrait, hand-held, from well behind the approach.** The person filming
   stands behind the ball return, roughly 25 to 35 feet behind the foul line,
   and the camera pans, tilts and sometimes zooms a little during the shot. The
   person does not walk, so the camera turns but does not travel.
2. **The release is in view.** The camera is behind and slightly to one side,
   so the ball is seen leaving the hand beside the slide foot, and the foul
   line is visible beyond the feet. An earlier draft of this plan said the body
   hid the laydown. That was wrong: it was read off frames too far apart. The
   laydown is measurable. What does happen is that the swinging arm or the
   trailing leg crosses the ball for a few frames, and in one clip (shot-04)
   the bowler stands nearly on the ball's line. Five clips are right-handed
   and one is left-handed.
   The ball is **in the air** for the first few frames after it leaves the
   hand. Section 7.4 has what that means for the laydown.
3. **The lane is a small part of the picture.** Read by eye off one full
   resolution frame of IMG_7213: the lane is about 80 pixels wide at the pin
   deck (about 2 pixels a board), the ball is about 22 pixels across at
   mid-lane and about 18 near the pins, and a pin is about 8 pixels wide and 25
   tall. Phase 2 measures these properly for every clip.
4. **The ball is easy to see where it is visible.** It is a dark or saturated
   disc on a bright lane, with a clear mirror image under it. The mirror image
   is the main thing that can pull a naive centre estimate off.
5. **The lane edges and the end of the pin deck are strong straight lines** and
   are visible in every frame after the release, even when the bowler covers
   part of them.
6. **The pins are visible as separate white shapes** on a dark background, so
   reading a leave is plausible (phase 7).
7. **Other things move**: the bowler, a ball on the next lane, the scoring
   screen. Other balls sit still in the ball return in the foreground.

## 2. Answers to the owner's questions

### Is half a board really possible?

Yes for most of the visible path, and the reason is worth understanding because
it shapes the whole design.

- **A board number is a ratio, not a position.** At the ball's row of the
  picture, the board is how far the ball sits between the lane's left edge and
  its right edge. Each edge is a straight line fitted over hundreds of pixels,
  so it is known to a small fraction of a pixel. The ball's centre comes from a
  circle fitted to its outline, good to about a third of a pixel. Hand shake
  moves the ball and the edges together, so it cancels.
- **The pixels are there.** At 1080p from where these clips were filmed a board
  is about 5 pixels at the arrows, about 3 mid-lane and about 2 at the pins. A
  third of a pixel is therefore under a fifth of a board at the pins for one
  frame, before any averaging.
- **A fitted path beats any single frame.** The ball is seen in 60 to 150
  frames. A smooth curve fitted through all of them is several times more
  precise than one snapshot.

What limits it, honestly:

| Part of the path | Expected | Why |
|---|---|---|
| Arrows to breakpoint, when visible | Within 0.5 board | Plenty of pixels, many frames |
| At the pins | 0.5 to 1 board | 2 pixels a board, the pins and the reflection crowd the ball |
| Laydown | Within 0.5 board when the touchdown is seen | The most pixels of anywhere (about 7 a board). The care needed is finding where the ball first touches the lane, not where it leaves the hand |
| Laydown, when an arm or leg covers the touchdown | About 1 board, marked as estimated | The skid line run back to the touchdown distance |
| A 720p clip from a messaging app | About double all of the above | Half the pixels and heavy compression |

The errors that averaging does **not** remove are the ones to engineer against:
where exactly the "edge of the lane" is taken to be (the lip of the gutter casts
a shadow), the reflection dragging the ball's centre down, and a calibration
that is slightly off. Section 6 has a check for the calibration that needs no
extra equipment: the arrows sit on known boards at a known distance and so do
the pins, so the mapping can be tested at both ends of the lane on every clip.

These are targets until phase 2 measures them. Phase 2 is a go or no-go gate,
and the number that is shipped in the app's wording is the measured one.

### "You only need a few snapshots", and the physics idea

Most of this is right and is in the design:

- **Each frame is solved on its own.** The lane is found again in every frame,
  so each frame gives a ball position in boards and feet whatever the camera
  did between frames. That is what makes hand-held clips possible.
- **Physics shrinks the search.** A ball travels down-lane at 8 to 26 mph,
  never comes back, slows only a little, and curves one way. Those bounds are
  used to throw out everything that is not the ball (the bowler, the ball on
  the next lane, the scoring screen) and to predict where to look next.
- **Coarse first, fine second.** A cheap pass over small frames finds when the
  shot happens and roughly where the ball goes. The expensive sub-pixel work
  runs only inside that window.

One correction: do not thin the frames down to a few. Frames are nearly free
once the window is known, and precision comes from having many of them. And a
straight line between the laydown and the last sighting would lose the one
thing the bowler most wants, which is where the ball stopped skidding and
turned. The curve is fitted through every sighting, with the physical shape as
the constraint.

### Speed

Yes. Every frame has a timestamp and every sighting has a distance down the
lane, so speed is the slope of distance against time. Down-lane distance is the
weakest measurement at the far end (a pixel is about a foot there), so the
figure leans on a long baseline, not on neighbouring frames, and on one sharp
event: the moment the pins start to move, which is 60 feet. Expect within
about 0.5 mph for the average speed. Section 7.6 has the method and the trap
with slow motion clips.

### Replay without the video

Yes, and to be clear about the word: the replay is not the video. A traced
shot stores a short list of points (feet, board) and its speeds, about 300
bytes. The replay is an animation of a ball moving along those points on the
app's own lane drawing, at real speed or slowed down. The video is gone once
the review closes. Section 8 has the stored shape and section 9 the
screen.

---

## 3. Scope

### In the first release

- Pick one clip (library, files, or record with the system camera).
- Mark the lane on one frame (assisted: the handles snap to the real edges).
- Automatic trace, hand-held shake included.
- Review: the trace over the video frame and on the app's lane, with numbers.
- Accept writes the shot's Actual line and stores the track. The video is
  dropped.
- Speed.
- Replay from the stored track.
- Honest gaps: solid where seen, dashed where estimated, nothing where unknown.

### Later phases (planned here, not in the first release)

- Leave suggestion from the same clip.
- No-handles calibration (the lane found automatically).
- A capture screen of the app's own with framing guides and 4K.
- The iOS app, then Android.

### Not planned

- Rev rate, axis tilt and rotation. They need 240 frames a second and a marked
  ball, and they are a different feature.
- A phone on a tripod tracing every shot of a night.
- Storing or sharing the video.
- Dark "cosmic" lighting.
- A camera that travels (someone walking while filming).

---

## 4. Requirements

Numbered so pull requests and tests can cite them.

**Input**

- R1. One clip holds one shot. If it holds two, the first complete one is used
  and the review says so.
- R2. Accepted: H.264 or HEVC, 720p and up, 30 frames a second and up,
  portrait or landscape. 1080p at 60 is the reference.
- R3. The camera is behind the foul line looking down the lane, on the lane or
  up to one lane to either side. Side-on video is refused.
- R4. Camera rotation (pan, tilt, roll, zoom) of up to about 5% of the frame
  between consecutive frames is corrected. More than that marks those frames
  unusable instead of guessing.
- R5. The clip never leaves the device and is not kept after the review closes.

**Calibration**

- R6. The bowler marks the lane on one frame they choose: the two lane edges,
  the foul line and the end of the pin deck. Handles snap to the real edge.
- R7. If the foul line is hidden in every frame, the bowler can mark the arrows
  instead (section 6.3).
- R8. The app checks the calibration against the pins and the arrows and warns
  when it disagrees by more than a board.

**Output**

- R9. A path in the app's own handed board space (ADR-111) and feet from the
  foul line.
- R10. From the path: laydown, board at the arrows, breakpoint board and
  distance, board at the pins, entry angle, launch angle, speed.
- R11. Every number carries one of three states: measured, estimated, missing.
  Estimated numbers are shown as "about". Missing numbers are not invented.
- R12. The path is drawn only between the first and last sighting, plus the
  stated extrapolations in section 7.5.
- R13. Target accuracy: 0.5 board from the arrows to the breakpoint when
  measured, 1 board at the pins, on the reference clips at 1080p.

**Saving**

- R14. Nothing is saved until the bowler accepts. Before accepting they can
  edit any number, as they can today.
- R15. Accept writes the Actual line fields that are measured or estimated,
  leaves missing ones as they were, and stores the track.
- R16. A traced shot can be re-traced or have its track removed.

**Behaviour**

- R17. The whole trace runs on the device, offline, in under 15 seconds for a
  7 second 1080p60 clip on an iPhone 12.
- R18. Every failure says what to do: "the lane edges were not visible",
  "the ball was not found", "this clip is too dark".
- R19. Tracing is Pro. Typing the same line by hand stays free. Seeing a stored
  replay is free (a bowler's data is never behind Pro, ADR-154).
- R20. All text is a `t` message, numbers go through `src/lib/format.ts`
  (ADR-220), and the screens follow `docs/DESIGN-LANGUAGE.md`.

---

## 5. Architecture

### 5.1 The rule: one tracer, written in TypeScript

The tracer is pure TypeScript that takes frames (grey pixels plus a timestamp)
and returns a track. It runs in a Web Worker. Nothing in it knows about the
DOM, Capacitor or a video file.

Why not native code (Swift with AVFoundation and Vision, then Kotlin again):

- The app is one web codebase in three shells. Vision code in Swift would be
  written three times.
- Agents working on this repository have no iPhone and no Xcode. TypeScript is
  tested by `vitest` and Playwright on every push. Swift is tested only when
  the owner builds it.
- The work per frame is small: a region of roughly 700 by 450 pixels for 200
  to 400 frames. Typed arrays in a worker do that in a few seconds.

Native code is kept to the two places the web view may fall short: getting the
original file without recompression, and (later) a capture screen. Both sit
behind interfaces, the way `photoStore.ts` takes a `PhotoFiles`.

### 5.2 Modules

Follow `docs/ARCHITECTURE.md` for the import layering. `lib/` holds a 90% line
coverage floor (`vite.config.ts`), which is why the synthetic renderer in
section 10 is built first.

| File | Role |
|---|---|
| `src/lib/shotTrack/types.ts` | `GrayFrame`, `LaneCalibration`, `BallSighting`, `TrackResult`, `MetricState` |
| `src/lib/shotTrack/homography.ts` | 3 by 3 plane mapping: solve from 4 point pairs, apply, invert, horizon line |
| `src/lib/shotTrack/laneModel.ts` | The lane's real dimensions, lane coordinates to and from the handed board space |
| `src/lib/shotTrack/image.ts` | Bilinear sample, gradient, box blur, warp a region. Small and dull |
| `src/lib/shotTrack/edgeSnap.ts` | Refine a rough line to the true edge at sub-pixel precision |
| `src/lib/shotTrack/registration.ts` | Carry the calibration from the marked frame to every other frame |
| `src/lib/shotTrack/background.ts` | The lane with nothing on it: a median over time of the steadied region |
| `src/lib/shotTrack/ballDetect.ts` | Candidates in one frame, then the sub-pixel circle |
| `src/lib/shotTrack/associate.ts` | Pick the candidates that are one ball obeying physics |
| `src/lib/shotTrack/pathFit.ts` | Fit the path and the distance against time, produce the metrics and states |
| `src/lib/shotTrack/trackToLine.ts` | Track to `LineSpec` fields and to the stored track |
| `src/lib/shotTrack/calibrationCheck.ts` | The pins and arrows test of a calibration |
| `src/lib/shotTrack/pipeline.ts` | Runs the stages in order, reports progress, returns `TrackResult` or a typed failure |
| `src/lib/shotTrack/synthetic.ts` | Test support: renders frames from a known camera and a known path |
| `src/lib/shotReplay.ts` | Stored track to a position at time t, for the replay |
| `src/services/videoFrames.ts` | `FrameSource` implementations (DOM): section 11.1 |
| `src/services/shotTrackWorker.ts` | The worker wrapper |
| `src/views/ShotTraceView.tsx` | The flow: pick, calibrate, trace, review |
| `src/components/TraceCalibrator.tsx` | The frame with draggable handles |
| `src/components/TraceReview.tsx` | The trace over the frame, the lane, the numbers |
| `src/components/ShotReplay.tsx` | The replay on `LaneSurface` |
| `scripts/shot-tracker/` | The development harness (section 10.3). Never shipped |

### 5.3 The pipeline at a glance

```
video file
  -> FrameSource            frames as grey pixels + timestamps
  -> coarse pass            when is the shot, roughly where is the lane moving
  -> calibration            bowler marks one frame, edges snap
  -> registration           the calibration, moved to every frame
  -> background             the empty lane
  -> ball candidates        per frame
  -> association            the one physical ball
  -> sub-pixel circle       per sighting
  -> path fit               boards against feet, feet against time
  -> metrics + states       LineSpec fields, speed, track
  -> review                 bowler accepts or edits
  -> shot.actual + shot.track
```

---

## 6. Geometry

### 6.1 The lane's real dimensions

Use the constants already in `src/lib/laneGeometry.ts` and
`src/lib/pinGeometry.ts` and add only what is missing.

| Thing | Value |
|---|---|
| Lane width | 41.5 in, 39 boards, so 1.064 in a board |
| Foul line to the centre of the head pin | 60 ft |
| Foul line to the end of the pin deck (the tail plank) | 62 ft 10 3/16 in |
| Arrows | Boards 5, 10, 15, 20, 25, 30, 35, distance from `arrowFeet(board)` |
| Ball diameter | 8.5 in (8.500 to 8.595 by rule), so about 8 boards |
| Pin | 15 in tall, 4.75 in at the belly, spots in `PIN_POSITIONS` |

**Lane coordinates.** `u` runs across the lane in boards counted from the left
edge as seen from the foul line, with the left edge at 0.5 and the right edge
at 39.5, so board n is centred on u = n. `v` is feet from the foul line. The
handed board (ADR-111: board 1 is the bowler's own gutter) is `40 - u` for a
right-hander and `u` for a left-hander. Only `laneModel.ts` does this flip.

### 6.2 The mapping

A flat lane seen by a camera is a homography: a 3 by 3 matrix `H` with
`image = H * lane`. Four point pairs fix it. `homography.ts` solves the 8
unknowns by Gaussian elimination on the 8 by 8 system, with the points
normalised first (shift to the centroid, scale to mean distance root 2), or the
solve is badly conditioned at these aspect ratios.

The four points are the corners of the rectangle the bowler marks:

| Corner | u | v |
|---|---|---|
| Near left | 0.5 | 0 (foul line) |
| Near right | 39.5 | 0 |
| Far left | 0.5 | 62.85 (end of the pin deck) |
| Far right | 39.5 | 62.85 |

The corners are intersections of marked lines, not points the bowler has to
hit. The bowler adjusts four lines: left edge, right edge, foul line, deck end.
Each needs only part of itself visible.

**Why the end of the pin deck and not the head pin.** The deck end is a real
edge in the picture (bright lane against the dark pit). 60 feet is not marked
by anything.

### 6.3 When the foul line is hidden

The two edges and the deck end fix everything except how distance is spread
along the lane. One more cross-lane reference fixes that. In order of
preference:

1. The foul line in any frame of the clip. The bowler can scrub to a frame
   where the body is out of the way (the first frames or the walk back). The
   camera does not travel, so a line marked in one frame is carried to the
   others by registration.
2. The arrows. The bowler drags a marker onto the centre arrow's tip
   (board 20, `arrowFeet(20)`), and the near corners are solved from it.
3. A default. If nothing is visible, assume the camera's height and distance
   from typical values and mark every distance and the speed as estimated.
   Boards are unaffected: they depend only on the two edges.

That last point is the most important property of the whole design and should
be stated in the code: **boards come from the edges alone. Distances and speed
need the cross-lane references.** A bad foul line costs feet, never boards.

### 6.4 The ball is not on the lane, its bottom is

The homography maps points on the lane surface. The ball's centre is 4.25 in
above it. Mapping the centre directly puts the ball too far down-lane, and for
a camera off to one side, too far across.

Use the point where the ball touches the lane:

1. Fit a circle to the ball: centre `c`, radius `r` in pixels.
2. "Down" in the picture is the direction at right angles to the lane's horizon
   line, pointing away from it. The horizon is the image of the lane's line at
   infinity, which is `inverse(transpose(H))` applied to `(0, 0, 1)`.
3. Contact point is `c + r * down`.
4. Lane position is `inverse(H)` applied to the contact point.

This is exact for a camera whose roll matches the horizon and close enough
otherwise. Test it in the synthetic renderer with a camera two lanes to the
side: the recovered board must stay within 0.1.

### 6.5 The calibration check (R8)

After calibrating, project things whose lane position is known and compare
with the picture:

- **Pins.** In a frame before the ball arrives, find the bases of the standing
  pins (bright blobs on the deck) and compare with `PIN_POSITIONS`. The head
  pin is on board 20 at 60 ft. This tests the far end, where pixels are
  scarcest.
- **Arrows.** Dark marks on boards 5 to 35. This tests the near end.
- **Ball size.** The ball's fitted radius must equal the lane's width at that
  row times 8.5 / 41.5 / 2. This holds at every distance, so it is a check on
  every sighting and a filter for false ones.

When the pins disagree by more than a board the review says the lane marking
looks off and offers to go back. Later (phase 8) the same pin and arrow
positions are used to calibrate with no handles at all.

---

## 7. The tracer, stage by stage

Each stage lists its input, output, method, and the tests that pin it. Numbers
marked "start with" are tuning values to settle in phase 2.

### 7.1 Coarse pass

- **In:** every frame at a quarter of the resolution.
- **Out:** the shot window (first and last frame worth processing) and a rough
  per-frame shift of the picture.
- **Method:** frame-to-frame global shift by block matching the top third of
  the picture (the masking units and ceiling: static, textured, and never
  covered by the bowler). Then, with shift removed, motion energy inside the
  far half of the lane. The shot window starts 1.5 s before the first
  sustained motion there and ends 1.5 s after the pins move, or at the clip's
  end.
- **Before calibration exists** the lane region is unknown, so this pass uses
  the middle half of the picture. It only needs to be roughly right.
- **Tests:** synthetic clip with a known pan gives the pan back within 1 pixel
  at full resolution.

### 7.2 Calibration and edge snapping

- **In:** the frame the bowler chose and four rough lines.
- **Out:** `LaneCalibration`: the four lines at sub-pixel precision, `H`, and
  the frame's index.
- **Method (`edgeSnap.ts`):** for a rough line, walk along it in 4 pixel steps.
  At each step sample the picture along the perpendicular for 12 pixels either
  side and take the position of the strongest gradient of the expected sign,
  refined by a parabola through the three samples around the peak. Fit a line
  through those positions with a robust loss (Huber, or RANSAC then least
  squares), so the stretches covered by the bowler's legs are ignored. Report
  how many steps supported the line. Under 30% support is a failure for that
  line.
- **Which edge is "the lane edge".** The boundary between the lane surface and
  the gutter. On most lanes the gutter is darker or a different colour. The
  gradient sign is taken from the rough line's own neighbourhood so both cases
  work. Record this choice in an ADR: it is the definition of board 0.5.
- **Tests:** a synthetic edge at a known sub-pixel offset is recovered within
  0.1 pixel with 40% of the line covered.

### 7.3 Registration: carrying the calibration to every frame

- **In:** the calibration and every frame in the shot window.
- **Out:** per frame, a transform from the calibration frame to that frame,
  and a quality score.
- **Assumption:** the camera turns and zooms but does not travel, so the change
  between two frames is close to a similarity in the picture (shift, rotation,
  scale). State the assumption in the code.
- **Method:** start from the previous frame's transform plus the coarse shift.
  Re-snap the two lane edges and the deck end in the new frame (the same
  routine as 7.2, searching a narrow band). The two far corners (edges meeting
  the deck end) give the similarity exactly: two points, four unknowns. The
  edges' directions are the check. The far corners are used because they are
  never covered by the bowler after the release and they are next to where
  precision matters most.
- **Bad frames:** if either edge has under 30% support or the similarity jumps
  by more than R4 allows, mark the frame unusable. Its sighting is dropped, the
  track simply has a gap there.
- **Tests:** synthetic clips with pan, tilt, roll and zoom drifting and
  jittering. The far corners are recovered within 0.3 pixel.

### 7.4 Finding the ball

**Background.** Warp the lane region of each usable frame back into the
calibration frame's coordinates (bilinear). The per-pixel median over every
fourth frame of the window is the empty lane, reflections of the ceiling
lights included. If the bowler stands in one place for most of the window the
median will contain them. That is fine: the bowler is not the ball.

**Candidates.** Per frame: absolute difference from the background, threshold
at "start with" 4 times the frame's noise (median absolute deviation of the
difference), connected components. Keep a component when:

- its contact point maps inside the lane or within 3 boards outside it
  (a ball in the gutter is still a ball),
- its width is within 35% of the expected ball width at that row (6.5),
- its width to height ratio is between 0.6 and 1.8 (the reflection makes it
  taller, motion blur makes it taller still).

The bowler fails on size. The scoring screen fails on position. A ball on the
next lane fails on position. Balls in the return do not move, so they are in
the background.

**Association (`associate.ts`).** Candidates from all frames, now with lane
positions and times. Find the largest set that one ball could have produced:

- down-lane position strictly increases with time,
- speed between 8 and 26 mph (11.7 to 38.1 ft/s), changing by at most 25%
  over the lane,
- board changes by at most 1.5 boards a foot (a launch angle of about 8
  degrees is the widest real shot),
- curvature of one sign after smoothing.

Method: RANSAC. Pick two candidates at least 0.3 s apart, form the constant
speed line through them, count candidates within "start with" 3 ft down-lane
and 3 boards across of a quadratic through the pair and one more. Refit on the
winners, repeat until stable. Fewer than 8 sightings is the failure "the ball
was not found".

**Sub-pixel circle.** For each surviving sighting, in the original frame (not
the warped one, to avoid resampling twice):

1. From the rough centre, cast 48 rays. On each, find the strongest gradient
   between 0.6 and 1.4 times the expected radius, parabola-refined.
2. Keep only rays in the upper 200 degrees of the circle, measured against
   "down" from 6.4. The lower part is where the ball meets its reflection and
   has no clean edge.
3. Fit a circle with the radius fixed to the expected one (two unknowns), then
   once more with the radius free (three unknowns). If the free radius differs
   from the expected by more than 20%, keep the fixed fit and lower the
   sighting's weight.
4. Weight: the fraction of rays that found an edge.

**The ball in the air, and the touchdown.** A bowler sets the ball down a
foot or more past the foul line, and until then it is above the lane, where
the contact-point rule of 6.4 is wrong: a ball 6 inches up maps several feet
too far down-lane. So the first sightings need their own treatment:

1. On the lane, the ball and its mirror image touch: the gap between the
   bottom of the ball's circle and the top of the reflection's is zero. In
   the air there is a gap, and the reflection sits lower than the contact
   point would predict. Measure the reflection's top edge along "down" below
   each early sighting.
2. The touchdown frame is the first in which the gap closes to within a pixel
   and stays closed. Sightings before it are flagged airborne and are not
   used for the path or the speed.
3. For an airborne sighting the point on the lane under the ball is midway
   between the ball's centre and its reflection's centre. Use that to draw
   the loft in the review, not to fit.
4. **Laydown** is the board the ball crosses the foul line on (0 ft), in the
   air or not: the owner's definition (2026-11-12), because one distance for
   every shot is what makes shots comparable, and it is what the app's
   `laydown` field already means. It is the fitted path run back from the
   touchdown to 0 ft. The **touchdown** board and its distance are reported
   beside it.
5. If the reflection cannot be found (a dull lane surface), fall back to the
   apparent speed: an airborne ball mapped through 6.4 appears to move
   impossibly fast down-lane, then drops to its real speed at the touchdown.

- **Tests:** synthetic discs with a reflection, blur along the direction of
  travel and added noise. A lofted release whose touchdown frame and board
  are recovered within one frame and 0.3 board. Centre within 0.3 pixel. A distractor disc on the
  next lane and a large moving blob (the bowler) are rejected.

### 7.5 Fitting the path

- **In:** sightings `(t, u, v, weight)`.
- **Out:** the path, the metrics, their states.

**Across the lane.** Fit board against feet with the shape a ball makes:
straight (skid), a smooth bend (hook), straight again (roll).

```
u(v) = u0 + a*v                                  for v <= s
u(v) = u0 + a*v + k*(v - s)^2                    for s < v <= s + L
u(v) = line continuing with the slope at s + L   for v > s + L
```

Five unknowns: `u0` (laydown), `a` (launch slope), `s` (where the hook
starts), `L` (its length), `k` (its strength). Bounds: `s` in 15 to 55 ft, `L`
in 2 to 30 ft. Minimise the weighted Huber loss, with the down-lane
uncertainty of each sighting taken into account (far sightings are uncertain
in `v`, which matters where the path is steep). Five unknowns is small enough
for Nelder-Mead from three starting points. A ball with no hook fits with
`k` near zero, and that is a valid answer.

If the residual stays above 0.7 board RMS, the shape is wrong for this shot (a
ball that hit the gutter, a deflection). Fall back to a smoothing spline and
mark the breakpoint as estimated.

This is the measured path. It is **not** the app's drawing model
(`buildLinePath`, `solveLine`). The stored Actual line is what the bowler
sees drawn afterwards, so `trackToLine.ts` converts and the review shows the
line as the app will draw it, next to the measured points.

**Metrics and their states (R11, R12).**

| Metric | Definition | Measured when | Estimated when |
|---|---|---|---|
| Board at the arrows | `u(15)` | A sighting within 3 ft of 15 ft | First sighting at or before 30 ft and 6 sightings in the skid |
| Laydown | The board over the foul line, `u(0)` (7.4) | The touchdown frame was found | The touchdown was covered: the skid line run back, when the first clear sighting is at or before 30 ft |
| Breakpoint | The point of the path furthest toward the bowler's own gutter | Sightings on both sides of it within 5 ft | The fit puts it inside the visible range but one side is thin |
| Board at the pins | `u(60)` | Last sighting at or beyond 57 ft | Last sighting at or beyond 52 ft |
| Entry angle | Slope over the last 6 ft, as degrees | Same as board at the pins | Same |
| Launch angle | The slope `a`, as degrees | Skid seen for 10 ft or more | Otherwise |

Everything else is missing. The path is never drawn more than 5 ft beyond the
last sighting.

### 7.6 Speed

- **Distance against time:** fit `v(t) = v0 + w*t + 0.5*d*t^2` with `d` at or
  below zero (a ball only slows). Robust fit over all sightings.
- **The pin anchor:** find the first frame in which the pin deck region
  changes sharply (foreground energy inside the projected rack). That instant
  is 60 ft, known to one frame. Add it as a heavily weighted point. It is the
  best measurement of time at the far end by a wide margin.
- **The touchdown anchor:** the frame the ball first touches the lane
  (7.4), at the distance the homography gives it. A second sharp event at the
  near end, where distance is well measured.
- **Reported:** average speed over the visible range as the headline, and
  speed at the pins when the fit supports it. Launch speed only when a
  sighting exists before 20 ft.
- **State:** measured when the foul line or arrows fixed the distance scale
  (6.3 cases 1 and 2) and the pin anchor was found. Estimated otherwise.
- **Sanity:** outside 8 to 26 mph, show nothing and say the speed could not be
  read.

**The slow motion trap.** An iPhone slow motion clip can reach the app in two
forms. The original has true timestamps at 120 or 240 frames a second and is
ideal. The exported form has the slow section baked in, so its timestamps are
stretched by 4 or 8 for part of the clip and the speed comes out wrong by that
factor. Defences: ask the picker for the original (11.2), and treat a speed
under 8 mph on a clip whose frame rate is 30 as this case and say so.

**Units.** No speed is shown anywhere in the app today. Add a setting, mph by
default with km/h as the other choice, stored the way the other display
preferences are, and a formatter in `src/lib/format.ts` that reads it. Storage
is always mph (section 8).

### 7.7 Failures

Typed, so the screen can say something useful (R18):

| Failure | Shown as |
|---|---|
| `unsupported-video` | This video cannot be read here |
| `too-short`, `too-small` | The clip needs to show the whole shot / needs to be at least 720p |
| `lane-not-found` | A lane edge could not be followed. Try marking it again |
| `too-shaky` | The camera moved too much |
| `ball-not-found` | The ball could not be picked out |
| `too-little-seen` | The ball was visible for too short a stretch to draw a line |

`too-little-seen` is fewer than 8 sightings or a visible stretch under 10 ft.

---

## 8. Data model

This changes the data model, so the pull request that does it adds an ADR to
`docs/DECISIONS.md` (the next free number, never an edit to an accepted one),
an entry in `docs/CHANGELOG.md`, and updates `docs/DATA_MODEL.md` for the
invariants. Read `src/types/bowling.ts` and `src/db/bowlingDb.ts` first.

**Proposed shape**, to be settled in that ADR. A new optional field on a shot,
beside `intended` and `actual`:

| Field | Meaning |
|---|---|
| `track.v` | Version of the tracer that produced it, an integer |
| `track.points` | Pairs of (feet, handed board), every 3 ft across the visible range, board to one decimal. At most 21 pairs |
| `track.from`, `track.to` | Feet of the first and last sighting |
| `track.speed` | Average mph over the visible range, one decimal, when known |
| `track.speed_end` | Mph at the pins, when known |
| `track.estimated` | Names of the Actual line fields that were estimated, not measured |
| `track.rms` | Fit residual in boards, one decimal |

Reasons for this shape:

- **Points, not fit parameters.** The replay must still work after the fitting
  model changes. Points do not care how they were made.
- **Small.** About 300 bytes a shot in a backup. 0.106.1 halved backup size on
  purpose, so do not store per-frame sightings.
- **Speed always in one unit** in storage. The unit shown is a display choice.
- **No video, no frames, no thumbnails.**

Invariants for the ADR:

- `track` is optional and absent on every shot that was not traced.
- The Actual line stays the source for everything that reads a line today
  (stats, seeding, the lane drawing). `track` is read only by the replay and
  the review. Nothing derives a line from `track` after accept.
- Editing the Actual line by hand after a trace keeps the track but the replay
  is of the measurement, so the review must say when they differ. Simplest
  rule to propose: editing a traced field removes its name from the measured
  set and the replay carries a "line edited since" note.
- Import and merge (ADR-038, `src/services/backupRepository.ts`,
  `src/lib/backupValidation.ts`): the validator accepts the new field, rejects
  a malformed one, and a merge treats `track` as part of the shot it sits on.
  No Dexie index is needed, so check whether a schema version bump is needed
  at all: it is not if only an unindexed optional field is added.
- `src/lib/shotSeeding.ts` must not seed a new shot's line from a `track`.

---

## 9. Screens

Read `docs/DESIGN-LANGUAGE.md` in full before any of this, and ADR-040. Reuse
`PushScreen`, the sheet patterns and `LaneSurface`. Declare how back closes
each pushed screen (ADR-272). Do not invent chrome.

### 9.1 Entry points

- On the shot detail (`src/components/ShotDetailBar.tsx`), beside the Actual
  line: "Trace from video". Locked for non-Pro in the way
  `docs/PRO-LAUNCH.md` ("How Pro shows where it is locked") describes.
- On a shot in a finished game, through the existing fix-a-shot path, so a
  clip can be attached after the night.

### 9.2 The flow

1. **Pick.** The system picker. While the file loads, one line of guidance on
   how to film (9.4).
2. **Mark the lane.** The chosen frame, zoomable, with four lines. A scrubber
   to pick a different frame. The lines start from a guess (phase 8 makes the
   guess good; before that, a centred trapezoid). Each handle snaps on
   release. A loupe follows the finger, because the far corners are a few
   pixels apart. "Foul line hidden?" switches to the arrow marker (6.3).
3. **Tracing.** A progress bar that names the stage. Cancel works.
4. **Review.**
   - The frame with the sightings as dots and the fitted path as a line.
     Scrubbing moves through the clip with the ball's marker on it.
   - The same path on `LaneSurface`: solid where measured, dashed where
     estimated.
   - The numbers, each editable, estimated ones marked "about".
   - If the shot already has a typed Actual line, show old and new and ask
     which to keep, field by field or all at once.
   - A calibration warning when 6.5 fails.
   - Accept, or back to marking, or discard.
5. **After accept.** The shot detail shows its line as today, plus a Replay
   control.

### 9.3 Replay

`ShotReplay` draws on `LaneSurface`. A ball moves along `track.points`
(interpolated with a monotone cubic, never overshooting) at the stored speed,
with a trail. Real time and a slow setting. Dashed where estimated. It starts
at `track.from`, so a shot whose first 20 ft were hidden starts 20 ft down the
lane and does not pretend otherwise. With the intended line drawn faintly
underneath, the replay doubles as "what I meant against what happened". Honour
reduced motion: show the finished path with no animation.

### 9.4 Filming guidance (copy, shown at pick and on failures)

- Stand behind the bowler, a step to the side the ball is thrown from, so the
  release and the foul line are in view.
- Hold the phone as high as is comfortable. Chest height hides the lane behind
  the bowler.
- Keep the whole lane in frame from the foul line to the pins, and keep
  filming until the pins stop.
- 60 frames a second, at least 1080p. Use the original clip, not one sent
  through a chat app.

---

## 10. Testing

### 10.1 The synthetic renderer comes first

`src/lib/shotTrack/synthetic.ts` renders grey frames of a lane from a pinhole
camera with a given position, aim, roll, zoom and per-frame jitter, with: lane
and gutter tones, a deck end, arrows, pins as bright upright shapes, a ball
disc with a reflection and blur, sensor noise, and optional occluders (a body
shaped blob over the near lane, a distractor ball on the next lane). The ball
follows a path that is known exactly.

Every stage is then tested against known truth, and the headline test is end
to end: **render a shot, trace it, and the boards at the arrows, breakpoint
and pins come back within 0.3 board, the speed within 0.3 mph**, across a
grid of camera positions, both hands, 1080p and 720p, 30 and 60 frames a
second, with and without the body occluder. This is what makes R13 a tested
claim and what holds the coverage floor.

Keep the frames small in unit tests (a 360 by 640 camera) so the suite stays
fast, and run the full-size grid in the harness (10.3).

### 10.2 What synthetic tests cannot prove

They prove the mathematics and the estimators. They do not prove that a real
gutter edge is where the code thinks it is, or that a real reflection behaves.
That is what the real clips are for.

### 10.3 The harness on real clips

`scripts/shot-tracker/run.ts` (tsx, never shipped): decodes a clip to grey
frames with `ffmpeg -f rawvideo -pix_fmt gray`, reads a calibration from a
JSON file beside the clip, runs the same `pipeline.ts` the app runs, and
writes:

- a PNG of the calibration frame with the lines, the projected arrows and the
  projected pin spots drawn on it,
- an MP4 or PNG strip of every sighting with its circle and contact point,
- the track on a top-down lane,
- a JSON of every metric and state.

For each sample clip, record in `scripts/shot-tracker/README.md`: the
calibration check results (pins and arrows, in boards), the number of
sightings, the visible range, the residual, and the owner's own reading of the
shot where they have one.

**Ground truth on real clips.** There is no instrument to compare with, so use
three independent checks:

1. The calibration check of 6.5: the mapping is tested against the arrows and
   the pins on every clip. This is real ground truth for the geometry.
2. Hand labels: for each clip, a person (or an agent viewing enlarged crops)
   marks the ball's outline in about 15 frames. The tracer's centre must agree
   within half a pixel. Store these as small JSON files.
3. The owner's eye on the overlay strip. A wrong trace is obvious when drawn
   over the frames.

There is no Specto lane to compare with, so the owner's eye is the final
check, and the harness must make that check easy. It writes one HTML page per
clip (`review.html`, self-contained, images inlined) with:

- the frame at the touchdown, enlarged, with the board lines of the lane drawn
  over it every 5 boards and numbered, and the traced laydown marked, so the
  owner can read the board off the picture and compare,
- the same at the arrows, where the real arrows on boards 5 to 35 should sit
  exactly under the drawn lines,
- the same at the breakpoint and at the pins,
- the numbers the tracer reports beside each.

The reviewer publishes these pages for the owner to look at. The owner's
verdict on the laydown and the arrows, per clip, is recorded in the harness
README and is part of the gate.

### 10.4 App-level tests

- Unit tests for `trackToLine`, `shotReplay`, the repository write, backup
  validation and merge.
- One Playwright flow in `e2e/` with a tiny synthetic H.264 clip (rendered by
  the synthetic renderer and encoded once, a few hundred kB, committed): pick,
  mark, trace, accept, see the line on the shot, replay. Chromium decodes
  H.264, so this runs in CI.
- `npm run verify` before every push, as its own command (`CLAUDE.md`).

---

## 11. Platforms

### 11.1 Getting frames out of a video

`FrameSource` is an interface: given a file or URL, yield
`{ gray, width, height, t }` in order, with a way to ask for a region and a
scale so the full frame is not copied when only the lane is needed.

| Implementation | How | Where |
|---|---|---|
| A. Played video | A hidden `<video muted playsinline>`, `requestVideoFrameCallback`, each presented frame drawn to a canvas and read back. `metadata.mediaTime` is the timestamp. Play at 0.5x so no frame is skipped | Everywhere. No dependency. Start here |
| B. WebCodecs | Demux the MP4 in JavaScript, feed `VideoDecoder`, get every frame with its exact timestamp, faster than real time | An upgrade if A drops frames. Needs a demuxer dependency, lazy-loaded |
| C. Native | `AVAssetReader` on iOS, `MediaExtractor` and `MediaCodec` on Android, frames handed to the page as files or shared buffers | Last resort |

Notes for A:

- Read `mediaTime`, never count frames: phones record at a variable rate (the
  samples average 56 to 59 frames a second, not 60).
- Rotation metadata is applied by the video element. Confirm the canvas gets
  upright frames on iOS.
- HDR clips are tone-mapped when drawn to a canvas. That is fine for this.
- Detect dropped frames by comparing `presentedFrames` with the count
  delivered. Report it in diagnostics.
- Reading pixels back from a canvas is the slow step. Draw only the lane
  region, at full scale, into a small canvas.

### 11.2 iOS (second, after the web)

Read ADR-155, `src/lib/platform.ts`, `scripts/native/assemble.ts` and
`capacitor.config.ts` first. The deployment target is iOS 15.0 today and is
raised to 15.4 in the iOS pull request (owner's decision), which is the first
version with `requestVideoFrameCallback`.

| Concern | Plan | Must be checked on a real iPhone by the owner |
|---|---|---|
| Picking a clip | `<input type="file" accept="video/*">`, which offers the library, the camera and Files | Whether the web view recompresses or downsizes a library video before handing it over. If it does, build the native picker below |
| Recording | The same input's camera option, for a start | What resolution and frame rate that camera uses |
| Slow motion clips | Ask for the original | Which form arrives (7.6) |
| Decoding | Implementation A | That frames are not dropped at 0.5x |
| Memory | A 1080p clip is small as a file. Never hold decoded frames: process and drop | Watch the web view's memory on a 4K clip |
| Speed of the trace | Worker, lane region only | R17 on an iPhone 12 |

**The native picker, if needed** (`ios/App/App/HeadpinVideoPlugin.swift`,
following the shape of `HeadpinAlertPlugin.swift`): `PHPickerViewController`
filtered to videos with `preferredAssetRepresentationMode = .current`, which
returns the original without transcoding and needs no photo library
permission. Copy the file to the temporary directory, return a path the page
loads through `Capacitor.convertFileSrc`, delete it when the review closes.
Register it wherever the other Headpin plugins are registered, and mirror the
page-side wrapper pattern of `src/lib/nativePlugin.ts`.

**Permissions and review.** The system camera through a file input needs
`NSCameraUsageDescription` in `Info.plist` (and a microphone string if audio
is recorded; prefer not recording audio). Add the strings to every `.lproj`.
Check whether `PrivacyInfo.xcprivacy` and the legal page need a line: the
honest statement is that the video is processed on the phone and never stored
or sent. Update `docs/APP-STORE-LISTING.md` when the feature ships, and the
Pro table in `docs/PRO-LAUNCH.md`.

Agents cannot run any of this. Each pull request that touches `ios/` lists
what the owner must build and look at, the way ADR-227 does.

### 11.3 Android (third)

The same TypeScript. The Android System WebView is Chromium, so A and B both
work. Differences to plan for:

- HEVC decoding in the web view depends on the device. A clip filmed on the
  same phone will decode. A clip sent from an iPhone may not: fail with
  `unsupported-video` and say why.
- The file input opens the system photo picker, which returns originals.
- Camera through the file input needs no manifest permission when it hands off
  to the camera app.
- Phones vary far more in speed. Measure R17 on a mid-range device.
- A native picker or decoder, if ever needed, is Kotlin with `MediaExtractor`
  and `MediaCodec` behind the same interface.

### 11.4 Web (first)

The whole feature is possible on the web with nothing native: a file input
gives the clip, a video element and a canvas give the frames, a worker runs
the tracer, and IndexedDB already holds the shot. Nothing is uploaded. This is
where the feature is built and tried first.

- **Trying it needs no deploy.** A pull request's Vercel preview address,
  at the path `/score`, is the full app with the feature open.
- **On the phone in Safari** the file input offers the library and the camera.
  Whether Safari hands over the original or a recompressed copy is the first
  thing to check with a real clip, because it decides how good a trace from
  the phone's browser can be. A desktop browser reading a clip sent by
  AirDrop or a cable always gets the original.

- `/score` (the owner's copy) gets the whole feature. `/app` shows it as a Pro
  preview that points at the App Store (ADR-154). Replays of shots traced
  elsewhere and restored from a backup play everywhere.
- Safari and Chrome decode HEVC on most hardware. Firefox does not: fail with
  `unsupported-video`.
- The worker and the lazy chunk must be in the PWA precache so the feature
  works offline. Keep the tracer out of the main bundle.
- A content security policy is on the roadmap. A worker loaded from the app's
  own origin is compatible with one.

---

## 12. The work, in pull requests

Each is one PR, green on `npm run verify`, with a version bump and a
`CHANGELOG.md` section (`CLAUDE.md`, House rules). Do them in order. Stop at
the gate after PR 2.

**The sample clips** are in `scripts/shot-tracker/fixtures/clips/`. Read that
folder's README first.

**How the work is divided.**

- **The executor (Opus)** does each pull request below, in order, one at a
  time, and writes the hard parts itself: `homography.ts`, `registration.ts`,
  `ballDetect.ts` (the circle fit and the touchdown), `associate.ts`,
  `pathFit.ts`, and anything that touches the data model.
- **Subagents (Sonnet)** are suited to jobs with a tight written contract and
  a test that says when they are done: `image.ts`, `laneModel.ts`, the
  synthetic renderer once its camera model is written, the harness's drawing
  and HTML output, React components from a finished design, the backup
  validator, unit tests for a function whose behaviour is already fixed.
- **Subagents (Haiku)** are suited to mechanical jobs: wiring strings through
  `t`, running the `translate-strings` skill, changelog and doc link upkeep,
  looking over harness output images and reporting what they show.
- Give a subagent the file's contract from section 5.2, the relevant part of
  sections 6 and 7, and the tests it must pass. Do not hand a subagent a
  tuning problem on real clips: that needs the whole picture.
- **The reviewer** (the author of this plan) reviews every pull request before
  it merges and takes over a problem the executor has spent two serious
  attempts on without progress. Leave it as a failing or skipped-with-reason
  harness case, never a weakened test, and write down what was tried, what the
  overlay shows and the smallest clip and frame range that shows it.

**Stop and ask the owner or the reviewer when:** the gate after PR 2 is not
met; a requirement in section 4 cannot be met as written; a change to scoring,
the data model or import and merge is needed beyond what section 8 describes;
or real clips contradict an assumption stated in sections 6 and 7 (the camera
does not travel, the lane edge is the gutter boundary, the ball has a
reflection).

**Looking at pictures is part of the work.** Every stage that touches pixels
is checked by drawing its result over the frames and looking at it, not only
by its unit tests. An agent can read the images the harness writes.

### PR 1. Geometry and the synthetic renderer

- `types.ts`, `homography.ts`, `laneModel.ts`, `image.ts`, `synthetic.ts`.
- Tests: homography round trips, the handed board flip for both hands, the
  contact point correction with an off-lane camera, the renderer puts a ball
  where the camera model says.
- No UI, nothing a bowler sees. Changelog: "No change to the app."
- Done when: tests pass and coverage holds.

### PR 2. The tracer, proven on synthetic and real clips. THE GATE

- `edgeSnap.ts`, `registration.ts`, `background.ts`, `ballDetect.ts`,
  `associate.ts`, `pathFit.ts`, `calibrationCheck.ts`, `pipeline.ts`.
- `scripts/shot-tracker/` with the harness and a README of results.
- Done when: the end to end synthetic test of 10.1 passes, the README holds
  the table of 10.3 for every sample clip, and a `review.html` exists for
  each clip for the owner to look at.
- **Gate.** Report to the owner, per clip: visible range, calibration check in
  boards, residual, the overlay strip. Go on only if at least four of the six
  clips trace with the pins check inside 1 board and a residual under 0.5
  board, and the owner agrees with the laydown and the arrows on the review
  pages. If not, the report says which stage fails and why, and the owner
  decides. Do not build screens on a tracer that has not passed.

### PR 3. The stored track and the replay

- The type, the ADR, `DATA_MODEL.md`, backup validation, merge, the repository
  write, `trackToLine.ts`, `shotReplay.ts`, `ShotReplay.tsx`.
- The replay appears on a shot that has a track. No way to make one yet except
  a dev fixture, so this ships dark.
- Done when: a backup with tracks round trips, and a merge keeps them.

### PR 4. The flow, on the web

- `videoFrames.ts` (implementation A), `shotTrackWorker.ts`,
  `ShotTraceView.tsx`, `TraceCalibrator.tsx`, `TraceReview.tsx`, the entry
  points, Pro gating, every string through `t`, translations by the
  `translate-strings` skill, the speed unit setting and its formatter.
- The Playwright flow of 10.4.
- No deploy is needed to try it: every pull request gets a Vercel preview
  address, and the path `/score` on that address has every feature open
  (ADR-154). The PR body gives the owner that link and a short list of what to
  try: a clip on a desktop browser, and the same clip on the phone in Safari.
- Done when: the flow works in Chromium and Safari on a desktop with every
  sample clip, on `/score`, and the owner has traced a clip of their own on
  the preview.

### PR 5. Hardening from real use on the web

- Whatever the owner's first real clips on the preview show. Expected:
  threshold tuning, the lane edge definition on a second centre's lanes,
  better failure copy.
- Diagnostics (`src/lib/diagnostics.ts`): a traced shot can export its
  calibration and sightings as JSON, with no pixels, so a bad trace can be
  reported and reproduced.

### PR 6. iOS

- The deployment target raised to 15.4, the `Info.plist` strings, the items
  in 11.2, the native picker only if the owner's device check says the file
  input recompresses.
- A checklist for the owner in the PR body: pick from library, record, a slow
  motion clip, a 4K clip, time the trace, check memory.
- Done when: the owner has run the checklist on a phone.

### PR 7. Leave suggestion

- From the same clip: the pin deck before the ball arrives and after the pins
  settle but before the sweep comes down.
- For each of the ten spots, project a pin-shaped box from `PIN_POSITIONS`
  through `H` (a pin stands 15 in up from its spot, along the "up" direction
  of 6.4) and measure how much bright pin is in it.
- Pins that stand in line behind one another from this camera (the 2 and 8,
  the 3 and 9, the 1 and 5, and others depending on where the camera stands)
  share most of a box. Compute which pairs overlap from the geometry, and when
  the front pin of a pair stands, the back one is "unknown", not "down".
- The result prefills `PinGrid` and the bowler confirms. It never scores a
  shot on its own. This touches score entry, so read ADR-001 and ADR-006, and
  it needs its own ADR.
- Needs the clip to run about 2 seconds past the pins. Otherwise no suggestion.
- A pocket hit suggestion (ADR-046) can come from the board at the pins in the
  same PR.

### PR 8. Calibration with no handles

- Find the lane automatically: long lines converging on one vanishing point,
  the pair either side of where the ball travelled, the deck end as the
  strongest cross-lane edge between them, then the pins and arrows of 6.5 as
  the fine fit.
- The handles stay as the fallback and as the way to correct it.

### PR 9. Android

- Section 11.3, a device checklist for the owner, the Play listing.

### PR 10. A capture screen of the app's own (optional)

- Native camera with a lane-shaped framing guide, 4K at 60, the 2x lens when
  there is one, exposure locked, no audio. 4K roughly halves every pixel-bound
  error in section 2. Only worth building if real use shows imported clips are
  the limit.

---

## 13. Concerns and open questions for the owner

**Decided by the owner (2026-11-11)**

1. An estimated number is saved, flagged as estimated in the track. Stats that
   depend on a laydown should ignore estimated ones.
2. Cut-down sample clips are committed.
3. There is no Specto lane. The owner reviews the overlay pages by eye
   (10.3), and their verdict is part of the gate.
4. Speed is a setting, mph by default.
5. A stored replay plays without Pro. It is an animation from the numbers.
6. The iOS minimum goes to 15.4.
7. The web comes first, tried on a Vercel preview at `/score`.

**Still to agree on**

1. **Half a board is a target until PR 2 measures it.** If the measured number
   is worse somewhere (the pins are the likely place), the app's wording
   follows the measurement.
2. **Clips sent through chat apps are much worse** (shot-06 is 720p at 30).
   The plan accepts them and says the result is rougher.
3. **The slide foot is in view too.** The Actual line has a `slide` field
   (ADR-032), and the shoe at the foul line is visible in every sample. Reading
   it is a separate, harder problem (a shoe is not a circle) and is not in
   this plan. Worth a later look.
4. **Which hand.** The tracer measures boards from the left edge and the app
   counts from the bowler's own gutter, so it needs the hand. It takes the
   profile's, which is wrong when tracing a friend's clip. The review should
   show the hand and let it be flipped.
5. **Phone browser against desktop.** If Safari on the phone recompresses a
   picked clip, traces made in the phone's browser will be rougher than the
   same clip on a desktop until the iOS app's native picker exists.

**Risks, with what the plan does about each**

| Risk | Answer in the plan |
|---|---|
| The browser or web view recompresses picked videos | Checked with a real clip in PR 4 (Safari) and PR 6 (the app), native picker as the fallback in the app |
| The ball is in the air at the release | The touchdown is found from the ball meeting its reflection (7.4) |
| An arm or leg covers the ball for a few frames | Those frames lose their sighting. The fit bridges them, and the laydown falls back to estimated |
| Slow motion clips give a wrong speed | Ask for the original, sanity range, say so when detected |
| A ball the colour of the lane | Detection is by change from the empty lane, not by colour. Still the hardest case: test with a light ball before the gate |
| Glare and reflections on a freshly oiled lane | The background median absorbs static reflections. The upper-arc circle fit ignores the ball's own |
| Someone walks through the shot | Those frames lose their sighting. The path bridges the gap or stops |
| The camera travels | Out of scope, detected as registration failure, reported as too shaky |
| Synthetic tests pass and real lanes differ | The gate is on real clips, and PR 5 exists for the second centre |
| Native code no agent can run | Kept to a picker and permission strings, each with an owner checklist |
| The lane edge is defined differently on wood, synthetic, or with capped gutters | The definition is one ADR and one function. PR 5 revisits it with more centres |
| Bundle size and offline | The tracer is a lazy chunk and a worker, precached |
| App Review asks about camera and photo use | On-device only, nothing stored or sent, stated in the strings and the listing |
| Scope: this is about ten pull requests | Phased so the first five are the feature on the web, the sixth is the iOS app, and the rest are optional |

---

## 14. Glossary for whoever picks this up

- **Board.** One of the 39 strips across the lane. Headpin counts from the
  bowler's own gutter (ADR-111).
- **Laydown.** The board the ball lands on at the foul line.
- **Arrows.** The seven targets about 15 ft down the lane.
- **Breakpoint.** The furthest the ball gets toward the gutter before it
  hooks back.
- **Entry angle.** The angle the ball comes into the pins at.
- **Actual line and Intended line.** What the ball did and what the bowler
  meant, both `LineSpec` on a shot (`src/types/bowling.ts`).
- **Homography.** The 3 by 3 matrix that maps a flat surface to its picture.
- **Sighting.** One frame's measurement of the ball.
- **Track.** The stored result of a trace.
