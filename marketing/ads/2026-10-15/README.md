# Launch ads, refreshed October 15, 2026

The second batch of ad creative, rendered from the real app at version 0.38.1.
The first batch (`../2026-10/`) was recorded at 0.6.1, before the Stats tab
was rebuilt, and its stats video and stills show screens the app no longer
has. Use these instead.

| File | What it is |
| --- | --- |
| `01-line.mp4` | 1080 x 1920, 14 s. The lane view: a board changed, a 2-1 move tried. |
| `05-spares.mp4` | 1080 x 1920, 18 s. New. The 7 pin, the leave this bowler has most, with Brunswick's TZone as the spare ball and a stance and target that make the 7 (stance 14, target 15: laid down on 8, it reaches board 37 at the pin), drawn on the lane. |
| `still-*-feed.png` | 1080 x 1350 (4:5) feed stills: line, pins, stats, retarget, patterns, spares. |
| `still-*-story.png` | 1080 x 1920 (9:16) story stills, the same six. |

Every video has a voiceover, spoken by Kokoro (an open text-to-speech model,
Apache 2.0, so it can run in paid ads) in its `af_heart` voice, mixed to -16
LUFS. Each line starts with its caption, and the captions wait for the voice,
so the videos are paced by it. The words are in `VOICE` in
`scripts/ad-content/record.mjs`; a transcription of every soundtrack came back
word for word. The captions are still burned in, since most feed video plays
muted.

The ad text and links for each are in the ad plan. To rebuild after the app
changes, see the header of `scripts/ad-content/record.mjs`, then run
`npm run ads:record` (with `ADS_TTS_PYTHON` and `ADS_TTS_MODELS` for the
voice; `scripts/ad-content/voice.py` says how to set them up) and
`ADS_STATE=... npm run ads:stills` (the state is what
the patterns and spares stills are taken from). `ADS_ONLY=04-patterns` records
one video.
