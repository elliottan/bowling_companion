# Launch ads, refreshed October 15, 2026

The second batch of ad creative, rendered from the real app at version 0.36.1.
The first batch (`../2026-10/`) was recorded at 0.6.1, before the Stats tab
was rebuilt, and its stats video and stills show screens the app no longer
has. Use these instead.

| File | What it is |
| --- | --- |
| `01-line.mp4` | 1080 x 1920, 14 s. The lane view: a board changed, a 2-1 move tried. |
| `02-pins.mp4` | 1080 x 1920, 16 s. A fresh game: 9 spare, strike, 7 spare. |
| `03-stats.mp4` | 1080 x 1920, 10 s. Stats, down to each ball's pocket, carry and strike. |
| `04-patterns.mp4` | 1080 x 1920, 16 s. New. The PBA Shark 48 found by search, its oil graph, then a line drawn over that oil. For tournament and sport-pattern bowlers. |
| `05-spares.mp4` | 1080 x 1920, 14 s. New. The leave you miss most, a stance and target saved for it, the line drawn on the lane. |
| `still-*-feed.png` | 1080 x 1350 (4:5) feed stills: line, pins, stats, retarget, patterns, spares. |
| `still-*-story.png` | 1080 x 1920 (9:16) story stills, the same six. |

The ad text and links for each are in the ad plan. To rebuild after the app
changes, see the header of `scripts/ad-content/record.mjs`, then run
`npm run ads:record` and `ADS_STATE=... npm run ads:stills` (the state is what
the patterns and spares stills are taken from). `ADS_ONLY=04-patterns` records
one video.
