# Shot tracer sample clips

Six real shots from the owner, cut down so they fit in the repository. They are
what `docs/SHOT-TRACKER-PLAN.md` measures the tracer against.

Each is the original with: the first 35% of its length removed (the walk to the
line), the picture cropped to the band between 30% and 72% of its height (the
lane from the approach to the masking units, at the original pixel scale, so
nothing is resized), the sound removed, and the video re-encoded as H.264 so
Chromium can read it in CI. Timestamps are kept as recorded, so the frame rate
is variable.

| File | Original | Size here | Frames a second | Notes |
|---|---|---|---|---|
| `clips/shot-01.mp4` | IMG_7213, 1080 x 1920 HEVC | 1080 x 806 | 60 | Right-handed. Dark blue ball. Ball return in the foreground |
| `clips/shot-02.mp4` | IMG_9366, 1080 x 1920 HEVC | 1080 x 806 | 60 | Right-handed. A scoring console covers the lower right |
| `clips/shot-03.mp4` | IMG_0047, 1080 x 1920 HEVC | 1080 x 806 | 60 | Right-handed. The camera drifts during the shot |
| `clips/shot-04.mp4` | IMG_1450, 1080 x 1920 HEVC | 1080 x 806 | 60 | Right-handed. A ball is rolling on the next lane to the left. The bowler stands closest to the ball's path here |
| `clips/shot-05.mp4` | IMG_1996, 1080 x 1920 HEVC | 1080 x 806 | 120 | Right-handed. Slow motion capture with true timestamps. Red ball |
| `clips/shot-06.mp4` | Sent through a messaging app, 720 x 1280 H.264 | 720 x 536 | 30 | Left-handed. Recompressed before it reached us, so the roughest of the six |

They have been encoded twice, so a trace of the original from a phone will be a
little better than a trace of these. Do not re-encode them again.

The people in them agreed to their use here. Do not use them outside this
repository's tests.

## Originals

`originals/IMG_1996.mov` is shot-05 exactly as the phone recorded it (HEVC,
1080 x 1920 stored rotated, 10-bit HLG, 120 frames a second, 7.1 s, 25 MB),
kept on the owner's word (2026-11-15) because it is the only untrimmed,
uncropped phone video there is to test on. The app receives videos like this
one, not like the clips above. Chromium in CI and in the cloud container cannot
play it; re-encode a copy to VP9 to run it through the app there. The same
terms of use apply.
