# The feature reel

A 9:16 reel that flips through what Headpin does on one league night: a ball,
a line, the lane view, scoring, the line carrying over to the next shot, a 2-1
move, a spare ball and line that are already set, the tenth and the stats.
Then it flicks through the rest, one screen to a word (sessions, oil patterns,
the ball catalog scrolling, the layout visualizer with its three sliders
swung), deals all four out in a fan for "All on Headpin", and ends on the
card. It is built from the real app in two
passes, so the footage stays honest and the editing stays smooth.

1. **`capture.mjs`** drives the app in Playwright and records takes: Chrome's
   screencast of the app at twice its size (780 x 1688 JPEGs, about 25 a
   second while something moves), plus a `take.json` of marks. A mark is a
   time and the boxes, in the app's own pixels, of whatever is worth pointing
   at; every tap is a mark with its point. The setup (a TZone spare ball, a
   line for the 10, seven frames bowled; for history, the saved nights spread
   a week apart with three or four games each and a pattern on every one)
   runs before the screencast starts.
2. **`compose.mjs`** is the edit. `BEATS` says, for each beat, which take and
   which part of it, the caption, the voice line, and where the camera,
   spotlights and rings go, named by the marks. Every frame is worked out as
   numbers and drawn by **`reel.html`**, then screenshotted and piped to
   ffmpeg, so zooms, flips and highlights are exact at 30 fps however slow a
   frame is to draw.
3. **`music.py`** makes the sound from the same cues: a 120 BPM bed, whooshes,
   ticks, pops, a riser and a hit, all from sine waves and noise so there is
   nothing to license. The voice is Kokoro (`../voice.py`). The music ducks
   under the voice and the mix lands at -15 LUFS.

## Running it

```sh
npm run dev
SHOTS_STATE=/tmp/headpin-state.json SHOTS_DIR=/tmp/shots npm run shots
REEL_STATE=/tmp/headpin-state.json REEL_OUT=/tmp/reel node scripts/ad-content/reel/capture.mjs
REEL_OUT=/tmp/reel ADS_TTS_PYTHON=~/.headpin-tts/bin/python ADS_TTS_MODELS=~/kokoro \
  node scripts/ad-content/reel/compose.mjs
```

`voice.py` says how to set up the voice; `music.py` also needs `scipy` in that
Python. `REEL_ONLY=game` captures one take, and `REEL_PREVIEW=2.5,9,20`
renders stills at those times instead of the whole reel, which is the quick
way to check a change to the edit.

## Layout rules

- The app is shown in a whole iPhone (bezel, titanium edge, status bar and
  Dynamic Island), as big as fits under a two-line caption: its top edge at
  y 468, running to the bottom of the frame.
- A zoom moves the whole device, which then runs off the sides of the frame
  rather than being cut by a window, and it never rises off the bottom.
- Captions sit at the top, below Meta's top safe margin (290 px), on a fade
  that is solid behind the words, so a zoomed app never shows through them.
- Whatever the camera is on is placed at y 960, the middle of the area that
  Reels and TikTok leave clear (their buttons cover the bottom 680 px); a shot
  can set its own height (`fy`), as the hook does to fill the frame with the
  lane.
- One effect at a time: a spotlight, a ring or a tap, not all three at once.
- Pull back before going in. A beat on the scorer opens on the whole screen, or
  the whole card down to the notes, and only then zooms to the one control it
  is about, so a viewer always knows where on the screen they are.
