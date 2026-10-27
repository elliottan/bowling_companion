# App Store listing drafts

Draft text for the iPhone app's App Store Connect page, for the owner to review
and paste. It is copy, not code: nothing reads this file. The free and Pro split
it describes is `docs/PRO-LAUNCH.md` and `src/lib/pro.ts` (ADR-154); the voice
is `docs/DESIGN-LANGUAGE.md` section 8 (sentence case, contractions, one word
per thing, no exclamation marks, no em dashes).

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

```
Headpin is a bowling score keeper. It needs no account, no sign in and no network connection to review: every feature works offline, and only the ball photos and pattern sheets wait for a signal. Launch it, tap Start fresh, pick a hand, and start a session from Home.

There is no backend. Scores, balls and lines are stored on the device only. The app fetches ball photos and oil pattern sheets from headpin.app when online and keeps them on the device afterwards. It sends no analytics from the app.

In-app purchase: one non-consumable, "Headpin Pro", product ID app.headpin.pro, US$9.99. It is a single unlock tied to the Apple ID, with no subscription and no trial. Restore purchase is in Settings and uses the App Store's own restore.

What is free: scoring, every ball, line, lane, pattern and note, history, backup and export, the ball and oil pattern catalogs, share cards, and the stats: average, high game and series, the pocket rate, the spare rate, every leave and how often each is made, a chart of the average, the pocket and the spare by session and by game, and the best ball.

What Pro unlocks: the rest of those same records read in depth. Carry, strike, strike on strike, first-ball pins and most strikes in a row, on the First ball card and as chart metrics, every other ball's rates and details, the alley report's per-ball averages, moving a line or shaping its hook in the line sandbox, changing the three numbers of a layout in the layout lab, and seeing a ball's own layout drawn from the arsenal. Without Pro those are drawn but locked under a lock icon, and reading a line or layout stays free. Nothing the bowler recorded is ever hidden.

To see a Pro screen: open Stats, where the First ball card shows the pocket and locks the rest, the chart's locked metrics carry a lock, and the Balls card shows its first row and locks the next, and tap "Get Headpin Pro" at the foot of the screen, or a lock, or the Headpin Pro row in Settings. The Headpin Pro page opens and says what Pro adds; its button opens the App Store's purchase sheet. The same page has Restore purchase, and so does Settings. Use a sandbox tester account to buy.

Bringing games from the web: on first launch the app explains how to import a backup file exported from headpin.app (Settings, Backup & restore). Exporting uses the system share sheet.

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
