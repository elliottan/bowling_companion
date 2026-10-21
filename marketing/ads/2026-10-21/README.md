# Launch ads for the iPhone app, October 21, 2026

The third batch of ad creative, rendered from the real app at 0.51: one video,
the feature reel, and the stills. It replaces `../2026-10-15/`, which sent a
bowler to the web app ("Nothing to download. It opens in your browser.").
Headpin is now an iPhone app (ADR-154), so these send a bowler to the App
Store. They are about the features and that the app is free, and say
nothing about Headpin Pro, purchases or subscriptions, by the owner's call; to
keep "free" true, they show only what the free app has. They are for the
launch: run them once the listing is live.

| File | What it is |
| --- | --- |
| `headpin-reel.mp4` | 1080 x 1920, 33 s. The feature reel. One league night in a full iPhone frame (the line over a PBA pattern, ball, line, lane view, scoring, the line carrying over, a 2-1 move, the spare ball and line already set, the tenth). Then the rest of the app under a teal "Free" pill: unlimited games, average and trends, the whole arsenal, hundreds of balls, oil patterns, and "All free. No limits. No account." It ends on "Free on the App Store". Made by `scripts/ad-content/reel/` (see its README). |
| `still-*-feed.png` | 1080 x 1350 (4:5) feed stills: line, pins, arsenal, retarget, patterns, spares. |
| `still-*-story.png` | 1080 x 1920 (9:16) story stills, the same six. |

The stills keep the 2026-10-15 pictures and headlines, with the pill now
"Free on the App Store". The stats still is replaced by an arsenal still ("Your
whole bag, free."), since the stats picture shows a Pro card, and the retarget
still says "It's free to download. Unlimited games. No account." instead of
"It's free to try".

The reel's voiceover is Kokoro (Apache 2.0, so it can run in paid ads) in its
`af_heart` voice, with two lines given their tone by
`scripts/ad-content/reel/tone.py`, mixed to -15 LUFS. The captions are burned
in, since most feed video plays muted. Headpin is "Head pin" in the voice
script so the p is not swallowed.

What the reel says, beat by beat, is the `VOICE` list in
`scripts/ad-content/reel/compose.mjs`. "No limits" is games, sessions and the
arsenal, which have no cap in the free app (`docs/PRO-LAUNCH.md`).

The App Store has no Android listing yet (ADR-154), so target these at iPhone
users; an Android bowler who taps through has nowhere to go but the web app.

To rebuild after the app changes, see `scripts/ad-content/reel/README.md`; the
stills come from `ADS_STATE=... npm run ads:stills`.
