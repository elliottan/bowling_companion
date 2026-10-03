# Headpin quality pass, 2026-10-03

Pre-launch review (Instagram ads) of the app at `c5c7033`. Two parts: bugs, then UI and UX.
Written for the agent that will implement the fixes, so every item names the file, the cause,
the fix and how to prove it.

**How this was tested.** Code reading, plus the real app on the Vite dev server in mobile
Chromium (390x844, touch) with the owner's real backup restored (27 sessions, 94 games, 1538
shots, 8 balls, 17 spare lines). The line seeding was also replayed against every shot in
that backup by calling the app's own `seedForShot` (script in the appendix), so the seeding
numbers below are measured, not guessed.

**House rules that apply to the fixes** (from `CLAUDE.md`): no em dashes anywhere; UI follows
`docs/DESIGN-LANGUAGE.md`; a change to an accepted ADR's rule is a *new* ADR plus a
`CHANGELOG.md` entry; `npm run verify` green before any push; assert on the Intended line box
inside `waitFor`.

---

## Fix first (before spending on ads)

| # | What | Severity |
|---|---|---|
| B1 | The ball (and sometimes the line) shown on screen is not saved with the shot | Critical, silent data loss |
| B2 | Switching from the spare ball to a strike ball at a leave keeps the spare line | High, the bug you reported |
| B4 | After a ball change, the next frame brings the old ball back; game 1 frame 2 opens with no ball | High, the "find last ball" wonkiness |
| B5 | Quick move buttons sit where the keyboard and the Actual boxes are | High, you reported it |
| B6 | Share offer re-asks on every finished game, every old session, every relaunch | Medium, you reported it |
| U1, U2 | Home and Settings restructure | Launch polish |

---

# Part 1: Bugs

## B1. Critical: the ball on screen is not recorded when the next shot's seed matches the last one

**Symptom (reproduced).** Start a session, pick a ball (Gem) in frame 1 and leave the line
empty, then just keep tapping Next. Screen vs IndexedDB:

```
lanes 9/10 set                      no lanes set
F1 shows Gem   stored ball=Gem      F1 shows Gem   stored ball=Gem
F2 shows Gem   stored ball=Gem      F2 shows Gem   stored ball=-     <- lost
F3 shows Gem   stored ball=-  <-    F3 shows none  stored ball=-
F4 shows Gem   stored ball=-  <-    ...every frame after is blank
F5 shows none  stored ball=-
```

The same happens to a typed line in a single-lane or no-lane session: frame 3 typed Pitch Black
24/17, frame 4 showed Pitch Black 24/17, frame 4 was stored with no ball and no line, and every
later frame opened empty. A bowler who types a line on every frame on a lane pair is mostly
unaffected, which is why it has not shown up in your own data, but a new user from an ad
(picks a ball, does not type boards, often skips lanes) loses the ball on most frames, the
per-ball stats are wrong, and the scorer looks like it "forgot" the ball.

**Cause.** `submitShot` resets `currentShotMeta` to `{}` (`src/lib/frameController.ts:68` and
siblings). The only thing that writes it back is the sync effect at
`src/components/ActiveGameScorer.tsx:317-327`, which runs only when `selectedBallId`,
`intendedLine`, `actualLine` or `shotNotes` *change*. The seeding effect (`:381`) then sets
the same ball id and, for a same-lane carry, the *same object reference* for the line
(`resolveIntended` returns `prev.intended` as is, and that object is the one stored on the
previous shot). React bails out, the sync effect never runs, and the shot is recorded with
the empty meta while the panel shows the ball.

**Fix.** Stop relying on an effect to mirror the draft into the controller. In `recordShot`
(`:493`) build the meta from the draft state at the moment of recording:
`{ ball_id: selectedBallId, intended: intendedLine, actual: actualLine, notes: shotNotes.trim() || undefined, ...pocket, ...extraMeta }`,
and do the same in the unmount and page-hide flush (`flushRef`, `:668`, which goes through
`buildLiveFrame(gameState)` and has the same hole). Then delete the sync effect, or keep it
only if something else reads `currentShotMeta`. Belt and braces: have `seedForShot` return
copies (`{ ...prev.intended }`) so a seed is never the stored object.

**Prove it.** A component test in `ActiveGameScorer.seeding.test.tsx`: pick a ball, record
four frames without touching anything, assert every persisted frame (via `onFrameComplete`)
carries the ball id. Run it three ways: no lanes, one lane, a pair. Add the single-lane typed
line case (type a line in frame 3, record frame 4 untouched, assert frame 4 stored it).
Consider a one-off repair note in `CHANGELOG.md`; past shots cannot be recovered.

## B2. High: switching to a strike ball at a leave keeps the spare ball's line

**Symptom (reproduced).** Leave the 10 pin. The scorer selects Path (spare ball) and fills
31/22 from your saved 10-pin line. Switch to Gem: the box still says 31/22.

**Cause.** `lineForBall` (`src/lib/shotSeeding.ts:109-149`) at a leave, for a strike ball:
own attempt this session, then the `strike_offset` move, then **the leave's absolute line**
(`:148`, `spareLineBoards(saved)`), which is the spare ball's boards. You have no
`strike_offset` on any of your 17 spare lines, so a strike ball always gets the spare ball's
line. And when nothing is found the caller keeps what is there
(`ActiveGameScorer.tsx:376`, `if (found) setIntendedLine(found)`), which is again the spare
ball's line. This is ADR-053 step 3 working as written; the rule is what is wrong.

In your data: 81 spare attempts were thrown with a strike ball; in 20 of them a switch would
have left the spare ball's line in the box.

**Fix (needs a new ADR that supersedes ADR-053's step 3 for strike balls).** At a leave:

- spare ball: unchanged (own attempt with this ball, then the saved line);
- strike ball: own attempt *with this ball* this session, then the offset move, then this
  ball's own strike line (`sameBallSeedLine`), and if none of those exist, **empty the box**
  rather than keep a line that belongs to the other kind of ball;
- in `handleLiveBallChange`, when `lineForBall` returns nothing and the ball kind changed
  (spare to strike or back), clear the line instead of keeping it. Same kind, keep it
  (ADR-052's "a starting point to adjust off" still makes sense between two strike balls).

Also consider surfacing the move: when a strike-ball attempt at a leave is recorded and the
leave has no `strike_offset`, the capture banner (B3) can offer "Save as your strike-ball
move for the 10" with the offset computed from the ball's strike line.

**Prove it.** Unit tests in `shotSeeding.test.ts` for each branch, and a scorer test: leave
the 10, spare ball seeded with the saved line, switch to a strike ball, assert (in `waitFor`)
the box shows that ball's strike line, or is empty when it has none.

## B3. High: the spare line capture saves a strike-ball line as the leave's spare line

`offerSpareLine` (`ActiveGameScorer.tsx:473-490`) offers "Save this as your line for ..." after
any attempt at a leave with no saved line, whatever ball threw it. Accept it after a strike-ball
attempt and that hooking-ball line becomes the leave's absolute line, which every future spare
ball attempt at that leave is then seeded with. Your `[1,2,4,10]` (34/29) and `[1,2,4,6,10]`
(34/28) rows look like exactly this.

**Fix.** Offer the absolute line only when the attempt's ball is a spare ball or untagged. After
a strike-ball attempt either skip the offer or offer the `strike_offset` version (B2). Unit test
both.

## B4. High: the "last ball" carry brings back the ball you just changed away from

**Symptom.** You change from Gem to Pitch Black in frame 5. Frame 6 (the other lane) opens with
Gem again; frame 7 with Pitch Black. Separately, game 1 frame 2 always opens with no ball and no
line, though you threw a ball one frame earlier.

**Measured on your backup** (replaying `seedForShot` over every first ball):

- The frame right after a ball change was seeded with the **old ball 70 times out of 85**; you
  kept the new ball in 48 of those.
- Game 1, frame 2 opened with no ball in **27 of 27** sessions.
- Frames 1 and 2 of games 2+: the seeded ball was right 63% of the time.

**Cause.** `seedForShot` takes ball and line as a matched pair from the previous frame on the
*same lane* (`freshRackSeedShot`, `shotSeeding.ts:203`, then `previousSameLaneFrame`). On a
lane pair that frame is two frames back, so it predates any ball change in the frame between.
In game 1 frames 1 and 2 have no same-lane predecessor at all, so frame 2 gets nothing.

**Fix (new ADR, supersedes the ball half of ADR-029 / ADR-017's carry).** Split the pair:

- **ball** = the most recent fresh-rack ball thrown this session, any lane, any game;
- **line** = `sameBallSeedLine(thatBall, ...)`, which already prefers the same lane and falls
  back to the other lane of the pair.

Replayed on your data this rule takes frames 1 and 2 of games 2+ from 63% to **81%** right,
fixes game 1 frame 2 (now seeded from frame 1), leaves the rest of the game unchanged (88% vs
89%), and line accuracy is flat (63% vs 61%, within noise; you move your line most frames, so a
line seed is a starting point either way). Notes should still carry from the same-lane frame.

Not worth doing: seeding game 1 frame 1 from the previous session. Your first ball matched the
previous session's first ball in 4 of 18 cases, so it would be wrong more often than empty.

**Prove it.** Unit tests in `shotSeeding.test.ts` (ball change then next frame on the other
lane; game 1 frame 2) and re-run the appendix replay.

## B5. High: the quick move buttons get mis-tapped (Move 2-1 especially)

What a tap on "Move 2-1" is up against, measured in the running app at 390x844
(`src/components/LineInput.tsx:325-343`):

1. **They only exist while the keyboard is up.** They render when a board field is focused,
   i.e. while iOS's decimal keypad is on screen. They are drawn *below* the focused field: the
   1-1 row starts at y=557 and the 2-1 row at y=637, which on an iPhone is at or under the top
   of the keypad. A thumb aimed at 2-1 lands on the keypad or its toolbar.
2. **Directly under 2-1 are the Actual line boxes** (Slide at y=712). Tapping one focuses it,
   which (`ShotDetailBar.tsx:281`, `onFieldFocus`) **silently copies the Intended line into
   Actual**, moves the keyboard to the other field and collapses the move rows. So a near miss
   on 2-1 records an Actual line the bowler never chose.
3. **The rows are 32px tall** (`h-8`, `:198`) with 8px gaps, under the 44pt floor in
   DESIGN-LANGUAGE §2.
4. **One button, two directions, decided by which half you hit.** The label sits in the middle,
   which is exactly where people tap, and the middle is the ambiguous point.
5. **They fire on `pointerdown`** (`:336`), so a finger that lands to scroll fires a move, and
   there is no way to cancel by sliding off.
6. **Layout jump.** Focusing adds roughly 190px (±0.5 row plus three move rows) above the
   Actual section and blurring removes it, so anything below moves while the bowler is aiming.
   Combined with the focus hand-back in `halfTap` (`:204-213`), iOS can lower and raise the
   keyboard mid-press, which moves the page under the thumb again.
7. In the half-width column the ±0.5 button's chevrons overlap its label ("‹STANCE ±0.5›").

**Fix (recommended).** Make moves independent of the keyboard:

- Add a "Move" control in the Intended eyebrow row (next to the eye) that opens a bottom
  `FormSheet`-style panel (it is a task; DESIGN-LANGUAGE §1a) with, per preset, **two separate
  buttons with words, not halves**: "Left 2-1" and "Right 2-1" (mirrored for a left-hander),
  44pt or taller, plus Stance ±0.5 and Target ±0.5 as separate left/right buttons, and the
  resulting boards shown live ("20/15 → 22/16"). Fire on click, not pointerdown.
- Remove the focus-revealed rows and the focus hand-back hack, so focusing a box is only typing.
- Replace Actual's autofill-on-focus with an explicit "As intended" chip in the Actual eyebrow
  row. A focus must never write data.

If a sheet is too far, the minimum is: render the rows *above* the board fields, make each
direction its own 44pt button, use click, and drop the Actual autofill on focus.

## B6. Medium: the share offer is too sticky

"Game N is in the books. Share the session?" (`src/views/ActiveSessionView.tsx:386-400`, banner
at `:556`). Why it keeps coming back:

- It shows for **any finished game being viewed**, not for a game that was just finished. Open
  any old session from History or Home and close the stats sheet: the offer is there (verified
  on the Sep 30 session).
- Dismissals live in a **module-level `Set`** (`:81`): every relaunch of the installed app
  forgets them and re-asks for every game you look at.
- It is **per game**, so an 8-game league night asks 8 times.
- Tapping **Share does not retire it**; only the X does.

**Fix.** Offer at most once per session, only in `mode === "tab"`, only on the transition (a
game completed by `recordShot` while this view was mounted, not a completed game being opened),
retire it on Share as well as dismiss, and persist the "offered" flag (a `settings` key keyed by
session id, or a field on the session). Optionally stop offering altogether after three
dismissals in a row; the share icon in the header is always there.

## B7. Medium: the lane editor can wipe the second lane

Typing the first lane and moving to the second triggers a save on blur; when that save lands,
the effect at `ActiveSessionView.tsx:157-163` re-syncs both fields from `activeGame.lanes`
(a new array on every refresh), so whatever is already in the second box is replaced by "".
Reproduced in automation (typed 9 then 10, closed, the game had lane 9 only). On a phone it
needs a slow IndexedDB write, so it will be intermittent in the field, which is the worst kind.
**Fix:** re-sync only when `activeGame.id` changes, or not while the lane sheet is open.

## B8. Low

- **History rows flatten lane pairs:** "Lane 7 / 8 / 1 / 2 / 3 / 4 / 5 / 6" wrapping onto two
  lines (`src/components/SessionHistory.tsx:71`). The session header already says "Lanes 7/8,
  1/2, 3/4, 5/6"; use the same formatter.
- **Home grid has an orphan tile.** Seven tiles in a three-column grid leave Oil patterns alone on
  a third row; the comment at `DashboardView.tsx:164` still says "Six of them". U1 replaces the
  grid anyway.
- **Chart label collision:** the dashed average label on the Stats and session charts is drawn
  under the last point ("avg ●93").
- **Stale comment:** `ActiveGameScorer.tsx:136-139` describes "True while the intended line is one
  this ball's history filled in" with no state under it (ADR-052 removed it). Delete it so the
  next reader does not go looking for it.

---

# Part 2: UI and UX

## U1. Home: from a launcher to "tonight"

**What is there now** (top to bottom): install banner, backup banner, Game plan card, a 3x3 grid
of seven shortcuts (Spare lines, Arsenal, Catalog, Line, Layout lab, Lane notes, Oil patterns),
Guides card, Next steps, feedback card, ten Recent sessions, and the Start session FAB plus
Resume pill.

**Problems**

- The thing people open the app to do (start or resume a session) is a small FAB at the bottom.
  Everything above it is equal-weight navigation.
- Seven tiles mix three different kinds of thing: **your stuff** (Arsenal, Spare lines, Lane
  notes, Oil patterns), **reference** (Catalog, Guides) and **tools** (Line, Layout lab). The grid
  says they are the same kind of place.
- "Line" is not a word a new bowler can decode (Settings calls it "Line visualizer").
- Ten Recent sessions duplicate the History tab one tap away.
- Up to two banners, a Next steps block and a feedback card can all stack above the content.
- The **Active** tab is empty most of the time and its empty state repeats Home's Start session.

**Proposal**

1. **Top card = tonight.** If a game is in progress: a large Resume card (alley, game, score so
   far). Otherwise a Start session card with your recent alleys as one-tap chips ("Chinese
   Swimming Club · League", "Seletar Country Club · Adult Interclub") that start a session
   prefilled with that alley, pattern and description, plus "Score now, add details later" as a
   text link. Keep the FAB.
2. **One protection banner, never two** (see U4).
3. **Last session line:** "Sep 30 · Chinese Swimming Club · 963 (241 avg)" linking to it, and
   "Recent sessions" capped at 3 with "All in History".
4. **"My bowling"** as a `ListGroup` (DESIGN-LANGUAGE §4): Arsenal, Spare lines, Lane notes, Oil
   patterns, each with a count or one-line state ("8 balls", "17 leaves").
5. **"Tools and reference"** as a second `ListGroup`: Layout lab, Line visualizer (renamed from
   "Line"), Ball catalog, Guides.
6. Next steps and the feedback card stay, below the top card, at most one at a time.
7. Remove the Game plan card (U3).
8. Tab bar: rename **Active** to **Score**. "Active" describes a state; "Score" says what you do
   there. Same screen, same behaviour.

## U2. Settings: only settings

**What is there now:** a "Bowling" group of seven rows (Arsenal, Spare lines, Lane notes, Oil
patterns, Preferences, Catalog, Line visualizer), then single-row groups App (Appearance), Data &
safety (Backup & restore), Support (Install, Feedback, Coffee), About (Privacy and terms).

**Problems**

- Six of the seven "Bowling" rows are not settings and all six are already on Home, so Settings
  is a second copy of Home with Preferences hidden in the middle. Layout lab and Guides are on
  Home but not here, so even the duplicate is incomplete.
- Three groups hold one row each.
- **Preferences is a wall of text.** The Grip caption alone is ten lines; PAP, release offset and
  the drift model sit beside Handedness as if a new bowler must understand them.

**Proposal**

```
Bowler
  Handedness            Right-handed        (SegmentedControl inline, one-line caption)
  Grip                  One-handed          (SegmentedControl inline, one-line caption)
  Appearance            System

Advanced (used by the lane view and Layout lab)
  PAP                   6 1/8 over, 1 1/2 up
  Release and drift     Offset 3, drift -6 / -5 / -4

Your data
  Backup & restore      Last backup 8 days ago
  Install Headpin       (only when installable)

Support
  Send feedback  ↗
  Buy me a coffee  ↗
  Privacy and terms  ↗
  Version 1.x.y
```

- Remove Arsenal, Spare lines, Lane notes, Oil patterns, Catalog and Line visualizer from
  Settings (they live on Home, U1).
- Handedness and Grip become inline rows; their long explanations move behind a "Why it matters"
  link to a Guides article. One sentence of caption each, maximum.
- PAP, release offset and drift go under "Advanced", collapsed by default for a new user, each
  with a one-line plain-English caption and a pointer to the guide.

## U3. Game plan: fold it into starting a session

**Why it is not useful today** (from running it on your data): it is a separate destination you
have to remember to open in the car park; it opens on your most-bowled alley rather than the one
you are going to; the alley, pattern and lane selects are three columns wide and truncate
("Chinese S"); the ball table uses unexplained P, C, S columns; "How the session moves here" and
"Last time" disagree at a glance (23 to 17 vs 20 to 15) because one is a median and one is a
single night; and the ball table captions itself "What each ball did, not what to bring". It
reports, but it never helps you do the next thing.

**Proposal.** Delete the Home card and put the two parts that are actionable where the decision
is made:

1. **In the Start session sheet**, once an alley is picked (or tapped from a recent-alley chip):
   a compact "Last time here" card: date, average, the ball and opening line per game ("G1 Gem
   20 to 15"). That is the "what did I do last time" answer, at the moment you are about to bowl.
2. **In the scorer, when a new game starts at an alley with history:** a one-line hint under the
   game chips, "Game 2 here: you usually move 2 left", dismissable, from the existing
   "How the session moves" data.
3. Keep the full report reachable as "Alley report" from Stats (filtered to that alley), for the
   bowler who wants the tables. Lane strike rates ("Lane 8 strikes 62%, lane 11 43%") are worth
   keeping there.

## U4. The first week of a new user (what the ad traffic will see)

- **Backup pressure in a browser tab is heavy.** In a tab the policy is due after 1 session and
  overdue after 2 or 5 days (`src/lib/backupNudge.ts:45`), and overdue has no Later. A new user's
  second visit shows a red banner that cannot be dismissed, an amber install banner above it,
  and a "Save a copy" toast after every finished game. Installing is what actually fixes the
  risk, so lead with it: merge the two Home banners into one "Keep your scores safe" card whose
  primary action is **Add to Home Screen** while not installed and **Save a copy** once
  installed, and keep the red overdue state for installed users who have genuinely not backed up.
- **The landing page mockups are out of date.** `public/shots/scorer*.webp` still shows the old
  "Count 7" button instead of "Next (Hit 7)". This is the page the ad lands on; reshoot all four
  from the current build (light and dark).
- **Preferences** jargon (U2) is the first thing a curious new user meets in Settings.
- **Opening a past session** from History or Home lands on a Stats sheet stacked over a session
  screen; closing the sheet reveals a scorer with "Edit shots". It works, but it is two layers for
  "show me that night". Consider landing on the Sheet tab (the scorecard), which is what most
  people mean by opening a past session.

What already works well and should be kept: the "Start fresh / Restore from a backup" first run,
"Score now, add details later", the pin coach line, the Next (Strike) / Next (Hit 7) subtext, the
locked finished game with "Edit shots", and the per-ball stats.

---

## Suggested order of work

1. B1 (with tests), then ship it on its own: it is silent data loss.
2. B2 + B3 + B4 together, as one seeding change with one new ADR and a CHANGELOG entry, verified
   with the replay below.
3. B5 (quick moves) and B6 (share offer).
4. U1 + U2 + U3 (Home, Settings, Game plan) as one navigation change, following
   DESIGN-LANGUAGE.md.
5. U4, B7, B8, then reshoot the landing page.

## Appendix: seeding replay against a backup

Run with `BACKUP=/path/to/headpin-backup.json npx vite-node replay.ts` from the repo root. It
replays every fresh-rack shot through `seedForShot` and through the B4 rule and prints how often
each seeded the ball and line the bowler actually threw. Re-run after B4 and the "current" rows
should match the "alt" rows.

```ts
import { readFileSync } from "fs";
import { seedForShot } from "./src/lib/shotSeeding";
import { isFreshRackShot, sameBallSeedLine } from "./src/lib/lanes";

const t = JSON.parse(readFileSync(process.env.BACKUP!, "utf8")).tables;
const balls = t.balls, spareLines = t.spare_lines, ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const eq = (a: any, b: any) =>
  (a?.stance ?? null) === (b?.stance ?? null) && (a?.target ?? null) === (b?.target ?? null);
const sessions = [...t.sessions].sort((a: any, b: any) => a.date.localeCompare(b.date) || a.id - b.id);
const r: Record<string, [number, number]> = {};
const bump = (k: string, ok: boolean) => { r[k] ??= [0, 0]; r[k][1]++; if (ok) r[k][0]++; };

for (const s of sessions) {
  const games = t.games.filter((g: any) => g.session_id === s.id).sort((a: any, b: any) => a.game_number - b.game_number);
  const done: any[] = [];
  let lastFresh: number | undefined;
  for (const g of games) {
    const frames = t.frames.filter((f: any) => f.game_id === g.id).sort((a: any, b: any) => a.frame_number - b.frame_number);
    const sofar: any[] = [];
    for (const f of frames) {
      const cur: any[] = [];
      f.shots.forEach((shot: any, i: number) => {
        const fresh = i === 0 || isFreshRackShot(cur, i);
        if (fresh && shot.ball_id != null) {
          const seed = seedForShot({ currentShot: i + 1, currentFrameNumber: f.frame_number, availablePins: ALL,
            frames: sofar, currentFrameShots: cur, game: g, previousGames: done, sessionFrames: [], balls, spareLines });
          const altLine = lastFresh != null ? sameBallSeedLine(lastFresh, g, f.frame_number, cur, sofar, done) : undefined;
          const k = f.frame_number <= 2 && i === 0 ? (g.game_number === 1 ? "G1 F1-2" : "G2+ F1-2") : "rest";
          bump(`${k} ball current`, seed.ballId === shot.ball_id);
          bump(`${k} ball alt`, lastFresh === shot.ball_id);
          if (shot.intended) {
            bump(`${k} line current`, eq(seed.intended, shot.intended));
            bump(`${k} line alt`, eq(altLine, shot.intended));
          }
        }
        cur.push(shot);
        if (fresh && shot.ball_id != null) lastFresh = shot.ball_id;
      });
      sofar.push(f);
    }
    done.push({ game: g, frames });
  }
}
for (const [k, [a, b]] of Object.entries(r)) console.log(k.padEnd(24), `${a}/${b}`, `${Math.round((100 * a) / b)}%`);
```

Results on the 2026-10-03 backup:

```
G1 F1-2  ball current   0/52   0%     ball alt  25/52  48%   (frame 1 cannot be known; frame 2 now is)
G2+ F1-2 ball current  82/130 63%     ball alt 105/130 81%
rest     ball current 722/818 88%     ball alt 730/818 89%
G2+ F1-2 line current  46/130 35%     line alt  47/130 36%
rest     line current 513/816 63%     line alt 501/816 61%
```
