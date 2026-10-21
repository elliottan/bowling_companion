# The feature reel

A 9:16 reel built from the real app. First, one league night: a line over a
PBA pattern, a ball, a line, the lane view, scoring, the line carrying over to
the next shot, a 2-1 move, a spare ball and line that are already set, and the
tenth. Then the rest of the app, one screen to a line under a teal "Free" pill
(unlimited games, average and trends, the whole arsenal, a line for every
spare, hundreds of balls, oil patterns), dealt out in a fan for "All free. No
limits. No account.", and the card: "Free on the App Store".

The reel is about the features and that the app is free, by the owner's call:
it does not mention Headpin Pro, a purchase or a subscription. So it shows only
what the free app has (ADR-154), and a bowler who installs from it finds every
screen in it open. Nothing Pro is on screen, even dimmed: the average beat cuts
in and out with its light on the free numbers and everything else dark, since
the first-ball card under them is Pro.

It is built in two passes, so the footage stays honest and the editing stays
smooth.

1. **`capture.mjs`** drives the app in Playwright and records takes: Chrome's
   screencast of the app at twice its size (780 x 1688 JPEGs, about 25 a
   second while something moves), plus a `take.json` of marks. A mark is a
   time and the boxes, in the app's own pixels, of whatever is worth pointing
   at; every tap is a mark with its point. The setup (a TZone spare ball, a
   line for the 10, seven frames bowled; for the arsenal, four more balls
   from the catalog, so the bag reads as a league bowler's; for history, the saved nights spread
   a week apart with three or four games each and a pattern on every one)
   runs before the screencast starts. The weeks of history come from
   `../history.mjs`, which the App Store screenshots use too. Tonight's session
   is on one lane, not a pair, since a strike ball carries from the last frame
   on its own lane (ADR-151) and the carry beat wants the frame just bowled.
2. **`compose.mjs`** is the edit. `BEATS` says, for each beat, which take and
   which part of it, the caption, the voice line, and where the camera,
   spotlights and rings go, named by the marks. Every frame is worked out as
   numbers and drawn by **`reel.html`**, then screenshotted and piped to
   ffmpeg, so zooms, flips and highlights are exact at 30 fps however slow a
   frame is to draw.
3. **`music.py`** makes the sound from the same cues: a 120 BPM bed, whooshes,
   ticks, pops, a riser and a hit, all from sine waves and noise so there is
   nothing to license. The voice is Kokoro (`../voice.py`), and
   **`tone.py`** gives a line the tone Kokoro will not: it reads "Still
   guessing your line?" flat, like a statement, so the last word is lifted
   into a question, and "Pin ten... again?" is drawn out and swung up to
   sound fed up. It reshapes the clip's pitch and timing with Praat and
   leaves the voice itself alone. The music ducks under the voice and the
   mix lands at -15 LUFS.

## Running it

```sh
npm run dev
SHOTS_STATE=/tmp/headpin-state.json SHOTS_DIR=/tmp/shots npm run shots
REEL_STATE=/tmp/headpin-state.json REEL_OUT=/tmp/reel node scripts/ad-content/reel/capture.mjs
REEL_OUT=/tmp/reel ADS_TTS_PYTHON=~/.headpin-tts/bin/python ADS_TTS_MODELS=~/kokoro \
  node scripts/ad-content/reel/compose.mjs
```

Where the installed Chromium is not the build Playwright pins, point
`SHOTS_CHROMIUM` at it (on the cloud containers,
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`). A full render is about
1,300 frames and takes most of half an hour.

`voice.py` says how to set up the voice; `music.py` also needs `scipy` and
`tone.py` `praat-parselmouth` in that Python. `REEL_ONLY=game` captures one take, and `REEL_PREVIEW=2.5,9,20`
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
- A run of beats under one pill (`kicker: "free"`) keeps the pill
  still across its cuts, so the run reads as one list; the caption sits under
  it, and a two-line caption there gets a taller solid band.
- The app's floating tab bar covers the bottom of the screen, so a tap scrolls
  its target to the middle first (`reveal`), or it lands on a tab.
- Pull back before going in. A beat on the scorer opens on the whole screen, or
  the whole card down to the notes, and only then zooms to the one control it
  is about, so a viewer always knows where on the screen they are.
