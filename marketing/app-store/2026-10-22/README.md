# App Store screenshots, October 22, 2026

The iPhone app's screenshots for App Store Connect, taken from the real app at
0.56.0 by `scripts/app-store/screenshots.mjs`, on the phone in
`scripts/app-store/iphone.mjs`, the same one the landing page's pictures are
taken on and drawn in. The captions, the order and the
rules behind them are in `docs/APP-STORE-LISTING.md` ("Screenshots").

| Folder | What it is |
| --- | --- |
| `captioned/` | The set to upload: ten 1320 x 2868 PNGs (6.9 inch iPhone), each the app in a phone under its headline. Upload them in file order. |
| `plain/` | The same ten screens, 1320 x 2868, with no caption or phone: the app as a screenshot on a phone shows it, status bar included. |

Only the 6.9 inch size is needed: App Store Connect scales it for the smaller
iPhones. iPad is not offered for 1.0 (ADR-160).

Shot 8 is the one Pro screen and carries the Headpin Pro badge (App Review
Guideline 2.3.2). The rest are taken without Pro, so where a Pro card shows it
shows its locked preview marked Pro, as a free download sees it.

The screens are rendered by Chromium as the iPhone app (the page is told it is
inside the app, and the store answers as StoreKit would). Two differences from a
phone remain: the font is Inter, not San Francisco, and the tab bar is the
page's own capsule, not the system bar the iPhone app draws (ADR-161). Retake
`plain/` on a simulator if either matters for review; `frame.html` captions any
1320 x 2868 screenshot.

To rebuild after the app changes:

```sh
npm run dev
SHOTS_STATE=/tmp/headpin-state.json SHOTS_DIR=/tmp/shots npm run shots
STORE_STATE=/tmp/headpin-state.json STORE_OUT=marketing/app-store/<date> \
  node scripts/app-store/screenshots.mjs
```

`STORE_ONLY=pro,history` takes only the screens whose names hold those words.
