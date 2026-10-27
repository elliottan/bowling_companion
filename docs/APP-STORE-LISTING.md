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

## Promotional text (154 of 170)

Editable at any time without a new build.

```
Score a game in a few taps, keep the ball and line behind every shot, and find out what's really working. It all stays on your phone, signal or no signal.
```

## Keywords (100 of 100)

Comma separated, no spaces after commas. Words already in the name and subtitle
are left out, and so is "Headpin".

```
league,pins,strike,spare,oil pattern,arsenal,average,tracker,layout,pap,usbc,lane,notes,leave,keeper
```

## Description (under 4,000)

```
Headpin is a bowling score keeper for bowlers who want to get better. Tap the pins still standing after each ball and Headpin does the scoring, strikes, spares and the tenth frame included.

Each shot can carry more when you want it to: the ball you threw, where you stood, the arrow you aimed at and where it broke. A few sessions in, you can see which ball, which line and which spares are costing you pins.

Score at the lanes
• Tap the pins left standing, then Next. It keeps up with league pace.
• Fix any shot later, undo the last ball, or mark a foul.
• Works offline, so a weak signal at the alley never matters.

See your line on the lane
Your stance, target and breakpoint, drawn over the oil pattern you bowled on, from the laydown to the pocket. Save a line for each spare and Headpin opens with it the next time that leave comes up.

Your arsenal, and every ball and pattern
Add your balls from a catalog of hundreds, each with its specs and photo. Look up an oil pattern, read its load table, see the oil drawn on the lane, and open the original sheet. If a ball or pattern is missing, ask for it from inside the app.

Layouts before you drill
Dual angle and Storm VLS layouts are drawn on the ball from your PAP. Turn the ball around and see where everything sits.

Your numbers
Average, high game and series, your pocket and spare percentages, and how often you make every leave, charted session by session.

Your games stay yours
There's nothing to sign up for. Your games live on your phone, and you can export a backup whenever you like and take it to a new one. Bowled with Headpin on the web? Export there and import here.

Headpin Pro
Everything you record is free, forever. Headpin Pro is one purchase, with no subscription, and it reads deeper into those records:
• Strike and carry rates, strikes in a row, and your first-ball pin count
• Strike and carry for every ball in your bag
• What you'd average with each ball at a given alley
• Moving a line on the lane, or changing a layout to see what it does
Buy it once and every Pro feature added later comes with it.

Headpin is independent and isn't affiliated with any ball maker or bowling organization. Ball names and images belong to their owners.
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

## Screenshots

Apple takes up to 10 per size. The required size is the 6.9 inch iPhone (1320
by 2868); the others scale from it. Headpin is portrait only, so every shot is
portrait.

The set is built: `marketing/app-store/2026-10-22/`, made by
`scripts/app-store/screenshots.mjs` from the real app. `captioned/` is the set
to upload; `plain/` is the same ten screens with no caption, for a listing or a
press kit that wants the bare app. The script drives the app at the 6.9 inch
size with the phone's safe areas, and tells the page it is inside the iPhone
app, so every screen carries the app's copy, not the web's. The store answers
at the US price, so a locked card shows its preview marked Pro, as a free
download sees it. The app shows no price of its own: Apple's purchase sheet
names it.

One idea per screenshot, a headline and one line under it, in the app's voice.
The app's theme is light for the scorer, stats, layout and Home, and dark for
the rest, so the set shows both.

| # | Screen | Headline | Under it |
|---|---|---|---|
| 1 | The scorer in the tenth, the 10 left standing, ball and line beside it | Score every shot. | Tap the pins you left. Unlimited games, free. |
| 2 | The lane view, the line over 2019 PBA Shark 48, with the "Unlock editing" chip | Remember every line you threw. | Your line drawn over the oil, shot by shot. |
| 3 | The arsenal, nine balls | Your whole arsenal, free. | Every ball you own, with no cap on the bag. |
| 4 | Stats: average, the trend chart, the first-ball card, the Pro banner | Know what's working. | Average, strike and spare rates, pocket and carry. |
| 5 | A catalog ball's page, photo and specs | Hundreds of balls, one tap. | Specs and photos. Build your bag from them. |
| 6 | 2019 PBA Shark 48: its numbers and the oil on the lane | See the oil before you throw. | Load tables and the oil drawn on the lane. |
| 7 | The layout lab as it opens: the drilled ball, what it will do, the locked sliders | See a layout before you drill it. | Dual angle and Storm VLS, drawn from your PAP. |
| 8 | Stats with Pro bought: carry, strike and every ball, under the Headpin Pro badge | Go deeper with Pro. | Carry, strike, ball by ball. One purchase, no subscription. |
| 9 | Home, tonight's game in progress, with the Pro banner | Works without a signal. | No account to make. Built for the alley. |
| 10 | History: five weeks of league nights | Every night, on your phone. | Unlimited sessions. Back up any time, free. |

Shots 1 to 3 carry the pitch, since they are what a browser sees before it
scrolls, and they say what is free. Shot 8 is the one Pro screen.

Rules for the set:

- **A screen that shows Pro says so** (App Review Guideline 2.3.2: screenshots
  must make clear when a featured item needs a purchase). Shot 8 carries the
  Headpin Pro badge and the price model in its line; every other shot is taken
  without Pro, so a Pro card or control on it is shown locked, as a free
  download has it (shots 2, 4 and 7).
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

- **The screenshots are current as of 0.56.0** (`marketing/app-store/2026-10-22/`).
  Retake them when a screen in the set changes:
  `node scripts/app-store/screenshots.mjs`, from the state `npm run shots`
  saves, so the landing page and the store show the same bowler.

- Replace "Hundreds" with a number only if it is checked against the catalog on
  the day.
- Age rating: no objectionable content, no web access beyond headpin.app, no
  user-generated content shared with others.
- Privacy "nutrition label": the app collects nothing it links to the bowler.
  Confirm against the final `legal/` page before answering the questionnaire.
