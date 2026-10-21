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

## App name (28 of 30)

```
Headpin: Bowling Scorekeeper
```

## Subtitle (25 of 30)

```
Every shot, ball and line
```

The name already carries "bowling" and "scorekeeper", and Apple indexes both
fields, so neither word is repeated in the keywords.

## Promotional text (159 of 170)

Editable at any time without a new build.

```
Tap the pins you left, add the ball and the boards, and see what's working. It runs offline at the alley, keeps everything on your phone, and needs no account.
```

## Keywords (99 of 100)

Comma separated, no spaces after commas. Words already in the name and subtitle
are left out, and so is "Headpin".

```
league,pins,strike,spare,oil pattern,arsenal,stats,average,tracker,layout,pap,usbc,lane,notes,leave
```

## Description (under 4,000)

```
Headpin keeps score the way you bowl. Tap the pins you left standing and the frame scores itself, strikes, spares, fouls and the tenth included. Add the ball and your boards if you want to, and Headpin remembers them for next time.

It works without a signal, which is the normal case at an alley. Your sessions, games, balls and lines stay on your phone. There's no account to make and no ads.

SCORE EVERY SHOT
Tap the pins left standing and Next. Fix a shot in a finished game, undo the last ball, mark a foul. Each shot can carry the ball, your stance and target, and your breakpoint.

REMEMBER EVERY LINE YOU THREW
See your line drawn over the oil pattern, from the laydown through the arrows to the breakpoint and into the pocket. Spare lines remember how you play each leave.

HUNDREDS OF BALLS AND OIL PATTERNS
Browse the ball catalog with specs and photos, and build your arsenal from it. Look up an oil pattern's load table, see the oil drawn on the lane, and open its original sheet. Missing something? Ask for it from inside the app.

SEE A LAYOUT BEFORE YOU DRILL IT
Dual angle and Storm VLS layouts are drawn on the ball from your PAP, so you can turn the ball and look.

KNOW WHAT'S WORKING
Average, high game and series, strike and spare rates, and a chart of how your game moves.

YOUR GAMES, YOUR FILE
Export a backup any time and import it on another phone. Bowled with Headpin on the web? Export there, import in the app, and your games come with you.

HEADPIN PRO
Headpin is free to download, and recording is free: every shot, ball, line, lane, pattern and note, plus your history and backups. Headpin Pro is one purchase, tied to your Apple ID, with no subscription. It opens the deeper reads: first-ball pocket and carry, the leaves you leave most, how each of your balls strikes and carries, what you'd average with each ball at an alley and the lines that struck most there, and moving a line or changing a layout to see what it does.

Headpin is an independent project and isn't affiliated with any ball manufacturer or bowling organization. Ball names and images belong to their owners.
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
- Privacy policy: `https://headpin.app/legal` (`LEGAL_URL`). The page carries
  the iPhone app's storage and purchase wording, drafted in the same pull
  request, and has to be reviewed before submission.

## Review notes (under 4,000)

```
Headpin is a bowling score keeper. It needs no account, no sign in and no network connection to review: every feature works offline, and only the ball photos and pattern sheets wait for a signal. Launch it, tap Start fresh, pick a hand, and start a session from Home.

There is no backend. Scores, balls and lines are stored on the device only. The app fetches ball photos and oil pattern sheets from headpin.app when online and keeps them on the device afterwards. It sends no analytics from the app.

In-app purchase: one non-consumable, "Headpin Pro", product ID app.headpin.pro, US$9.99. It is a single unlock tied to the Apple ID, with no subscription and no trial. Restore purchase is in Settings and uses the App Store's own restore.

What is free: scoring, every ball, line, lane, pattern and note, history, backup and export, the ball and oil pattern catalogs, share cards, and the basic stats (average, high game and series, strike and spare rates, score trend).

What Pro unlocks: the deeper analysis of those same records. The first-ball card (pocket, carry, strike on strike), the leaves you leave most and spare conversion by leave, how each ball strikes and carries, charts by game slot, the alley report's per-ball averages and line movement, moving a line in the line sandbox, and changing a layout in the layout lab. Without Pro those screens are drawn but locked, and reading a line or layout stays free. Nothing the bowler recorded is ever hidden.

To see a Pro screen: open Stats and scroll to a grayed card, then tap "Get Headpin Pro". The App Store's purchase sheet opens. Settings also has Restore purchase. Use a sandbox tester account to buy.

Bringing games from the web: on first launch the app explains how to import a backup file exported from headpin.app (Settings, Backup & restore). Exporting uses the system share sheet.

Contact: hello@headpin.app
```

## Screenshots: the plan

Apple takes up to 10 per size. The required size is the 6.9 inch iPhone (1320
by 2868); the others scale from it. Headpin is portrait only, so every shot is
portrait. The web landing page already has four shots in `public/shots/`
(`scorer`, `line`, `layout`, `stats`, each in a light and a dark file), but they
are web captures at 780 by 1688, so retake all of them from the app on a
simulator or a phone at store size.

One idea per screenshot, one short line over each, in the app's voice. Light
theme for the first and last, dark for the lane, so the set shows both.

| # | Screen | Line over it |
|---|---|---|
| 1 | The scorer on the tenth frame, pins left standing, stance and target written beside it | Score every shot. |
| 2 | The lane view, a ball path over an oil pattern | Remember every line you threw. |
| 3 | The ball catalog, a ball's page with its specs and photo | Hundreds of balls, one tap. |
| 4 | An oil pattern's load table and the oil on the lane | See the oil before you throw. |
| 5 | The layout lab with a drilled ball | See a layout before you drill it. |
| 6 | Stats: average, trend chart, first-ball cards | Know what's working. |
| 7 | Home with a session in progress | Works without a signal. |
| 8 | Settings, Backup & restore | Your games stay on your phone. |

Shots 1 to 3 carry the pitch, since they are what a browser sees
before it scrolls. Shot 6 should show Pro cards unlocked, with a sandbox
account, so the listing shows what the purchase opens.

Rules for the set: real data from a believable session, not placeholder
numbers; no device frames with a marketing background that hides the app; no
ball brand's logo outside the catalog photos the app itself shows; no claim in a
caption that the description does not make.

## Before submission

- Replace "Hundreds" with a number only if it is checked against the catalog on
  the day.
- Age rating: no objectionable content, no web access beyond headpin.app, no
  user-generated content shared with others.
- Privacy "nutrition label": the app collects nothing it links to the bowler.
  Confirm against the final `legal/` page before answering the questionnaire.
