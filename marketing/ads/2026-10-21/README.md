# Launch ads for the iPhone app, October 21, 2026

The third batch of ad creative, rendered from the real app at 0.49: one video,
the feature reel, and the stills. It replaces `../2026-10-15/`, which said
everything was free ("It's free", "Nothing to download. It opens in your
browser."). Since ADR-154 Headpin is free to download with one Pro unlock in the
iPhone app, so these send a bowler to the App Store and say what is free and
what is Pro. They are for the launch: run them once the listing is live.

| File | What it is |
| --- | --- |
| `headpin-reel.mp4` | 1080 x 1920, 44 s. The feature reel in three acts. One league night in a full iPhone frame (the line over a PBA pattern, ball, line, lane view, scoring, the line carrying over, a 2-1 move, the spare ball and line already set, the tenth). Then what is free, under a teal "Free" pill: unlimited games, average and trends, the whole arsenal, hundreds of balls, oil patterns, and "All free. No limits. No account." Then Headpin Pro under a gold pill: pocket and carry, the leaves that cost you, which ball strikes more, a layout tried before drilling, and "One purchase. No subscription." It ends on "Free on the App Store". Made by `scripts/ad-content/reel/` (see its README). |
| `still-*-feed.png` | 1080 x 1350 (4:5) feed stills: line, pins, stats, retarget, patterns, spares. |
| `still-*-story.png` | 1080 x 1920 (9:16) story stills, the same six. |

The stills keep the 2026-10-15 pictures and headlines; the pill now reads "Free
on the App Store", the stats still says pocket and carry are Pro, and the
retarget still says "It's free to download. No account. Pro is one purchase."
instead of "It's free to try".

The reel's voiceover is Kokoro (Apache 2.0, so it can run in paid ads) in its
`af_heart` voice, with two lines given their tone by
`scripts/ad-content/reel/tone.py`, mixed to -15 LUFS. The captions are burned
in, since most feed video plays muted. Headpin is "Head pin" in the voice
script so the p is not swallowed.

What the reel says, beat by beat, is the `VOICE` list in
`scripts/ad-content/reel/compose.mjs`. Every claim is the free and Pro split in
`docs/PRO-LAUNCH.md`: "No limits" is games, sessions and the arsenal, which
have no cap, and each Pro beat shows the Pro card it names.

The App Store has no Android listing yet (ADR-154), so target these at iPhone
users; an Android bowler who taps through has nowhere to go but the web app.

To rebuild after the app changes, see `scripts/ad-content/reel/README.md`; the
stills come from `ADS_STATE=... npm run ads:stills`.
