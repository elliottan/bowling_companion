# Launch ads, refreshed October 15, 2026

The second batch of ad creative, rendered from the real app: one video, the
feature reel, and the stills. The first batch (`../2026-10/`) was recorded at
0.6.1, before the Stats tab was rebuilt, and its stats video and stills show
screens the app no longer has. Use these instead.

| File | What it is |
| --- | --- |
| `headpin-reel.mp4` | 1080 x 1920, 34 s. The feature reel: one league night in a full iPhone frame (line over a PBA pattern, ball, line, lane view, scoring, the line carrying over to the next shot, a 2-1 move, the spare ball and line already set, the tenth, stats), then a quick flick through unlimited sessions, oil patterns, the ball catalog and the layout visualizer, "All on Headpin" with six screens fanned out, and "It's free. Bowl smarter". Zooms that pull back before going in, spotlights, rings and a finger on every tap. Made by `scripts/ad-content/reel/` (see its README). |
| `still-*-feed.png` | 1080 x 1350 (4:5) feed stills: line, pins, stats, retarget, patterns, spares. |
| `still-*-story.png` | 1080 x 1920 (9:16) story stills, the same six. |

The reel's voiceover is Kokoro (an open text-to-speech model, Apache 2.0, so
it can run in paid ads) in its `af_heart` voice, with two lines given their
tone by `scripts/ad-content/reel/tone.py`, mixed to -15 LUFS. A transcription
of the soundtrack came back word for word. The captions are burned in, since
most feed video plays muted.

The ad text and links for each are in the ad plan. To rebuild the reel after
the app changes, see `scripts/ad-content/reel/README.md`; the stills come from
`ADS_STATE=... npm run ads:stills` (the state is what the patterns and spares
stills are taken from).
