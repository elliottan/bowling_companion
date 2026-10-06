# Launch ads, October 2026

The first batch of ad creative, rendered from the real app at version 0.6.1.
Kept here so the files that ran can be found later; they are not served by the
site (only `public/` is).

| File | What it is |
| --- | --- |
| `01-line.mp4` | 1080 x 1920, 13 s. The lane view: a board changed, a 2-1 move tried. |
| `02-pins.mp4` | 1080 x 1920, 14 s. A fresh game: 9 spare, strike, 9 spare. |
| `03-stats.mp4` | 1080 x 1920, 10 s. Stats, down to ball performance. |
| `still-*-feed.png` | 1080 x 1350 (4:5) feed stills: line, pins, stats, retarget. |
| `still-*-story.png` | 1080 x 1920 (9:16) story stills, the same four. |

The ad text and links for each are in the ad plan. To rebuild after the app
changes, see the header of `scripts/ad-content/record.mjs` and run
`npm run ads:record` and `npm run ads:stills`.
