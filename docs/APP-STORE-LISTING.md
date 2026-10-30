# App Store listing drafts

Draft text for the iPhone app's App Store Connect page, for the owner to review
and paste. It is copy, not code: nothing reads this file. The free and Pro split
it describes is `docs/PRO-LAUNCH.md` and `src/lib/pro.ts` (ADR-154); the voice
is `docs/DESIGN-LANGUAGE.md` section 8 (sentence case, contractions, one word
per thing, no exclamation marks, no em dashes).

The same listing in Japanese, Korean, both Chinese scripts and Spanish is in
[APP-STORE-LISTING-TRANSLATED.md](./APP-STORE-LISTING-TRANSLATED.md).

Every limit below is Apple's, and each count was measured on the text as
written here. Recount after any edit; the counts are in the headings.

Claims stay inside what the app does today. A feature that is not built is not
in the listing, and "hundreds of balls" is used where an exact catalog count
would go out of date with the next catalog update.

## App name (30 of 30)

```
Headpin: Bowling Score & Stats
```

## Subtitle (25 of 30)

```
Every shot, ball and line
```

The name already carries "bowling", "score" and "stats", and Apple indexes both
fields, so none of them is repeated in the keywords. Apple also joins words
across the fields, so "keeper" in the keywords answers a search for "score
keeper".

## Promotional text (164 of 170)

Editable at any time without a new build.

```
Know where your pins are going. Track every ball, see your line over the oil, and find the ball and the spares that make the difference. Works offline at any alley.
```

## Keywords (100 of 100)

Comma separated, no spaces after commas. Words already in the name and subtitle
are left out, and so is "Headpin".

```
league,pins,strike,spare,oil pattern,arsenal,average,tracker,layout,pap,usbc,lane,notes,leave,keeper
```

## Description (under 4,000)

```
Everything you need to understand your game and bowl better, in one app:

1. Scoring
2. Line Visualizer
3. Layouts Visualizer
4. Bowling Ball Arsenal
5. Stats & Charts
6. Spare Lines
7. Oil Patterns
8. Your Games, Your Phone

---

1. Scoring

Keep score the easy way, and turn every game into something you can learn from. Each ball you bowl, with the ball you threw and where you played it, builds a record of your game across the whole season.

---

2. Line Visualizer

See exactly how you're playing the lane. Your line is drawn over the oil, from your feet to the pocket, so when the lanes change you know where to move, and the next time you see that pattern you'll remember what worked.

---

3. Layouts Visualizer

See a layout before you drill it. Dual angle and Storm VLS layouts are drawn on the ball from your own PAP, so you know what you're getting before it goes to the pro shop.

---

4. Bowling Ball Arsenal

Know your bag. Browse over 800 bowling balls with specs and photos, build your arsenal, and see which ball is really scoring for you.

---

5. Stats & Charts

Find out where your pins are going. Your average, your pocket and spare percentages, and the leaves that cost you the most, charted over time so you can watch yourself improve.

---

6. Spare Lines

Make more spares. Headpin remembers how you shoot every leave, so the right line is ready the moment it comes up, and it moves with you as the lanes break down.

---

7. Oil Patterns

Walk in knowing the shot. Look up PBA and Kegel patterns, see the oil laid out on the lane, and plan your line before your first ball.

---

8. Your Games, Your Phone

Your games live on your phone and work offline at any alley, with no account to create. Back up whenever you like and bring your whole history to a new phone.

---

Headpin Pro

Go deeper with one purchase and no subscription. See what's behind your strikes with carry and strike rates, compare every ball in your bag, find the ball you average best with at each alley, and fine-tune lines and layouts to see what changes. Everything you record stays free, forever.

Headpin is independent and isn't affiliated with any ball manufacturer or bowling organization. Ball names and images belong to their owners.
```

## What's new in 1.0 (under 4,000)

```
The first release of Headpin for iPhone.

Score every shot, keep the ball and your line with it, and see what's working. Everything stays on your phone and works without a signal.

If you've bowled with Headpin on the web, export a backup there and import it here from Settings, Backup & restore.
```

## Support and privacy URLs

- Support: `mailto:hello@headpin.app` is the contact the app uses
  (`FEEDBACK_EMAIL`). App Store Connect wants a URL, so use
  `https://headpin.app`.
- Privacy policy: `https://headpin.app/legal`. The app shows the same page's
  text in Settings (ADR-181), so the two cannot differ. The page carries
  the iPhone app's storage and purchase wording, drafted in the same pull
  request, and has to be reviewed before submission.

## Review notes (under 4,000)

Apple's guideline 2.1 request for the first submission asked for seven answers,
in the Resolution Center and in the Notes field of App Review Information, for
every later submission too. This is that text, numbered as Apple numbered it.
The screen recording goes with it as an attachment; its shot list is in
"Before submission". Every claim was checked against the code: the usage
counts (ADR-120) report only from the host `headpin.app`, and the app's page
is `localhost`, so the app sends none.

```
1. Screen recording
Attached, recorded on an iPhone running the latest iOS with the submitted build. It starts at launch and shows first run, scoring a game, the line drawn on the lane, the ball catalog and arsenal, oil patterns, stats, buying Headpin Pro with a sandbox account, the unlocked features, Restore purchase, and backup export.
The app has no accounts, no registration and no login, so there is no account creation or deletion flow. It has no user-generated content shared between users: nothing one user creates is shown to another inside the app, so no reporting or blocking mechanism applies.

2. Purpose and audience
Headpin is a score keeper and game tracker for tenpin bowlers, mainly league and tournament bowlers who want to improve. Most score apps record only the score. Headpin records each shot: which ball was thrown, where it was played on the lane, and which pins were left. It then shows the bowler what is working: their line drawn over the oil pattern, pocket and spare percentages, the leaves that cost them most, and which ball scores best for them. It also includes a reference catalog of bowling balls and oil patterns, and a layout visualizer for planning a ball's drilling. It works fully offline, because bowling alleys often have no signal.

3. Setup and access
No login, credentials or sample files are needed. Launch the app, tap Start fresh, choose a hand (grip and name are optional), tap Next, and start a session from Home. Tap the pins left standing to score each ball. Stats, Arsenal (your balls and the ball catalog), oil patterns and the line sandbox are reached from the tab bar and Home. Settings has Backup & restore, which exports a file through the system share sheet and imports one. To see Pro: open Stats and tap any lock or "Get Headpin Pro", or use the Headpin Pro row in Settings. Use a sandbox tester account to purchase.

4. External services
- Apple StoreKit / In-App Purchase, for the one Pro unlock and Restore purchase.
- headpin.app (our own static website, hosted on Vercel), from which the app downloads ball photos, oil pattern sheets and catalog updates when online. These are kept on the device. No user data is sent.
- The system share sheet and Mail, used only when the user chooses to export a backup or send feedback.
There is no backend, no authentication service, no AI service, no advertising, and no analytics or tracking SDK in the app. All scores and records are stored only on the device.

5. Regional differences
None. The app works the same in all regions. Content is in English, and the In-App Purchase uses App Store pricing for each storefront.

6. Regulated industry and third-party material
The app is not in a regulated industry. The ball catalog lists publicly published manufacturer specifications, with product photos used to identify each ball, and the oil patterns are the publicly published PBA and Kegel pattern specifications. The App Store description and the app state that Headpin is independent and not affiliated with any manufacturer or bowling organization, and that ball names and images belong to their owners.

7. In-App Purchase
One non-consumable: "Headpin Pro", product ID app.headpin.pro, US$9.99. It is a one-time unlock with no subscription and no trial. Pro adds deeper analysis of what the bowler has already recorded: carry, strike and first-ball stats; rates for every ball in the arsenal; per-ball averages in the alley report; moving and shaping lines in the line sandbox; changing layouts in the layout lab; and extra accent colors. Recording, history, backup, the catalogs and the core stats are free.
To reach it: tap any lock icon, "Get Headpin Pro" at the foot of Stats, the banner on Home, or Settings > Headpin Pro. Each opens the Headpin Pro page, whose button opens the App Store purchase sheet. Restore purchase is on that page and in Settings.

Contact: hello@headpin.app
```

## The Headpin Pro in-app purchase

- Image (1024 by 1024, shown in offer code redemptions):
  `marketing/app-store/headpin-pro-1024.png`, drawn by
  `node scripts/app-store/pro-icon.mjs`.
- Review Information screenshot (for App Review only, never on the store):
  `marketing/app-store/headpin-pro-review.png`, the Headpin Pro page as a free
  download sees it, with Get Headpin Pro and Restore purchase.

## Screenshots

Apple takes up to 10 per size. App Store Connect asks for the 6.3 inch iPhone
(1206 by 2622) as well as the 6.9 inch (1320 by 2868), so the script writes both. Headpin is portrait only, so every shot is
portrait.

The set is built: `marketing/app-store/2026-10-27/`, made by
`scripts/app-store/screenshots.mjs` from the real app. `captioned/` (6.9 inch)
and `captioned-6.3/` are the sets to upload; `plain/` and `plain-6.3/` are the same ten screens with no caption, for a listing or a
press kit that wants the bare app. The script drives the app at the 6.9 inch
size with the phone's safe areas, and tells the page it is inside the iPhone
app, so every screen carries the app's copy, not the web's. The store answers
at the US price, so a locked card shows its preview marked Pro, as a free
download sees it. The app shows no price of its own: Apple's purchase sheet
names it.

One idea per screenshot, a headline and one line under it, in the app's voice.
Every screen is in the app's dark theme, at the owner's request.

| # | Screen | Headline | Under it |
|---|---|---|---|
| 1 | The scorer in the tenth, the 10 left standing, ball and line beside it | Score every shot. | Tap the pins you left. Unlimited games, free. |
| 2 | The lane view, the line over 2019 PBA Shark 48 | Remember every line you threw. | Your line drawn over the oil, shot by shot. |
| 3 | The arsenal, nine balls | Your whole arsenal, free. | Every ball you own, with no cap on the bag. |
| 4 | Stats: average, the trend chart, the first-ball card, spares | Know what's working. | Your average, pocket and spares, over time. |
| 5 | A catalog ball's page, photo and specs | Over 800 balls, one tap. | Specs and photos. Build your bag from them. |
| 6 | 2019 PBA Shark 48: its numbers and the oil on the lane | See the oil before you throw. | Load tables and the oil drawn on the lane. |
| 7 | The layout lab as it opens: the drilled ball, what it will do, the sliders | See a layout before you drill it. | Dual angle and Storm VLS, drawn from your PAP. |
| 8 | Stats with Pro bought: carry, strike and every ball, under the Headpin Pro badge | Go deeper with Pro. | Carry, strike, ball by ball. One purchase, no subscription. |
| 9 | Home, tonight's game in progress, with the Pro banner | Works without a signal. | No account to make. Built for the alley. |
| 10 | History: five weeks of league nights | Every night, on your phone. | Unlimited sessions. Back up any time, free. |

Shots 1 to 3 carry the pitch, since they are what a browser sees before it
scrolls, and they say what is free. Shot 8 is the one Pro screen.

Rules for the set:

- **A screen that shows Pro says so** (App Review Guideline 2.3.2: screenshots
  must make clear when a featured item needs a purchase). Shot 8 carries the
  Headpin Pro badge and the price model in its line. Shots 2, 4, 6 and 7 are
  taken with Pro owned, at the owner's request, so no lock sits over them:
  what they feature (a line, a pattern and a layout drawn, and the stats their
  captions name) is free to read. Shot 4 does show carry and strike on the
  First ball card, which are Pro; if App Review objects, retake it without Pro.
- Real data from a believable bowler, not placeholder numbers: five weeks of
  league nights (`scripts/ad-content/history.mjs`) and tonight's game.
- The phone is whole, and the same size in the same place on every shot; the
  caption never covers the app.
- **The phone is a real one.** Every picture of the app, here and on the
  landing page, is taken on and drawn in one phone, the 6.9 inch iPhone, from
  one file (`scripts/app-store/iphone.mjs`): its screen, its safe areas, a 62pt
  glass corner with a 14pt border round it, and a 126 by 37 Dynamic Island 14pt
  from the top. The status bar is drawn into the top inset, so the island sits
  in it between the time and the battery and never over the app. The landing
  page's CSS phone copies the same numbers as ratios.
- No ball brand's logo outside the catalog photos the app itself shows, and no
  claim in a caption that the description does not make.
- The pages are rendered by Chromium with Inter, which is close to the iPhone's
  own San Francisco but not it, and the tab bar is the page's own floating
  capsule, where the iPhone app draws the system's (ADR-161). Retake the plain
  set on a simulator before submission if either difference matters; the
  captioned pass (`frame.html`) takes any 1320 by 2868 screenshot.

## Before submission

- **The screenshots are current as of 0.69.1** (`marketing/app-store/2026-10-27/`).
  Retake them when a screen in the set changes:
  `node scripts/app-store/screenshots.mjs`, from the state `npm run shots`
  saves, so the landing page and the store show the same bowler.

- "Over 800" balls was checked against `public/catalog/catalog.json` (832) on
  2026-10-27. Recheck it before each submission.
- Age rating: no objectionable content, no web access beyond headpin.app, no
  user-generated content shared with others.
- Privacy "nutrition label": the app collects nothing it links to the bowler.
  Confirm against the final `legal/` page before answering the questionnaire.
- The screen recording for the review notes, on a physical iPhone on the latest
  iOS, with the submitted build from TestFlight, installed fresh and signed into
  a sandbox Apple Account. One take, from the Home Screen: launch, first run (Start fresh, a hand, Next),
  score a game, a shot's line on the lane, the catalog and arsenal, a pattern,
  Stats with its locks, the Pro page and the sandbox purchase, the same screens
  unlocked, Restore purchase in Settings, and a backup export.
- The Headpin Pro product is attached to the version under review, with its
  review screenshot, or review fails on guideline 3.1.1.
