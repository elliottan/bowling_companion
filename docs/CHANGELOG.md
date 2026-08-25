# Changelog

User-visible changes, newest first, in the spirit of
[Keep a Changelog](https://keepachangelog.com).

No version has been cut since `0.1.0`, and none is planned: the app deploys on
merge to `main` (`docs/DEPLOYMENT.md`), so every section below is a dated batch
of shipped work rather than a release. Thirty of them used to be headed
`[Unreleased]`, which said nothing once they had all shipped.

## A ball's detail page is a place of its own (2026-08)

### Fixed

- **Swiping back from a catalog ball no longer lands on the dashboard.** The
  detail page was local state inside the catalog, so it left no history entry,
  and one edge-drag fired the detail's dismiss, the catalog's dismiss (they
  share an edge, and the gesture bubbled) and the platform's own back at once:
  three screens for one swipe. The open ball now lives in navigation state and
  the URL (`#/home/catalog/ball/<id>`), so back pops it and stops, and a link to
  a ball reopens it.

## Every MOTIV ball links to MOTIV (2026-08)

### Added

- **A link to the manufacturer's own page**, under the specs on a ball's
  screen. MOTIV's licence asks for it so their specs can be checked at the
  source, and it is a separate field from the citation, so a ball whose numbers
  were read elsewhere still points at MOTIV for the ball itself (ADR-064).

## The rest of MOTIV, covers unclassified (2026-08)

### Added

- **Forty-eight more MOTIV balls**, the ones whose coverstock MOTIV never
  explain: the Sniper, Recon, RX1, SX1, TX1 and Tank lines among them. Their
  cover reads as MOTIV write it with the category left "Unclassified", so they
  are searchable and complete on every other spec but do not answer a
  coverstock filter. A hundred and eighty-five MOTIV balls now.

## Fourteen MOTIV balls whose covers MOTIV explain (2026-08)

### Added

- **Fourteen more MOTIV balls**, the ones whose spec cell names a coverstock
  without saying its type. MOTIV expand six of their acronyms in their own
  copy, so HFS reads as a solid and HVH as a hybrid on their say-so rather than
  on the shape of the letters (ADR-063). The Revolt and exclusive Jackal lines
  arrive with them.

## Forty-seven undated MOTIV balls (2026-08)

### Added

- **Forty-seven more MOTIV balls**, the ones whose pages carry no release date:
  the Paranoia, Cruel, Forza, Freestyle, Primal, Tribal, Thrash and Venom lines
  among them, back to the original Tank and Jackal. A hundred and twenty-three
  MOTIV balls now, every one with a picture.

## Twenty-four more MOTIV balls (2026-08)

### Added

- **Twenty-four more MOTIV balls**, specs and photos both from MOTIV, carrying
  the run back from 2022 to 2017: the Tank, Trident, Forge, Jackal, Ripcord and
  Supra lines among them. That is every MOTIV ball whose page carries both a
  release date and a cover the catalog can classify.

## Colourways fold into one ball (2026-08)

### Added

- **A ball sold in several colours is one ball again.** MOTIV file each
  colourway as its own product page, so the Aspire staged four times over. The
  pipeline now folds them before promote, and each colour keeps its own photo:
  the catalog lists one Aspire and one Ascend, badged "4 colors", and their
  detail pages swipe through the four (ADR-062).

## Twenty more MOTIV balls, newest first (2026-08)

### Added

- **Twenty more MOTIV balls**, specs and photos both from MOTIV, working back
  from the most recent: Primal Rage Evolution, Raptor Rush, Subzero Forge,
  Pride Liberty, Supra GT, Venom EXJ, Max Thrill Solid, Evoke, Tank Rampage
  Pearl, Crimson Jackal, Raptor Fury, Nuclear Forge, Pride Dynasty, VIP ExJ
  Sigma, Supra Rally, Primal Shock, Jackal Ambush, Iron Forge, Blue Tank and
  Ripcord Launch. Fifty MOTIV balls now, every one with a picture.

## MOTIV's own site becomes a catalog source (2026-08)

### Added

- **MOTIV balls read from MOTIV**, not a third-party database. MOTIV granted use
  of their site's data, so the pipeline now has a `motiv` route with its own
  parser, and its readings count as the manufacturer's own (ADR-061).
- **Ten more MOTIV balls**, specs and photos both from MOTIV: Jackal Onyx,
  Evoke Hysteria, Forge Fuel, Max Thrill Hybrid, Shadow Tank, Pride, Top Thrill
  Solid, Top Thrill Hybrid, Jackal and Trident.
- **Photos for Forge and Jackal Ghost**, which had specs but no picture.

## MOTIV's top 15 balls added to the catalog (2026-08)

### Added

- **10 new MOTIV balls**: Apex Jackal, Black Venom, Hyper Venom, Jackal Ghost
  V2, Lethal Venom, Nebula, Primal Ghost, Raptor Reign, Steel Forge, Supra
  Clutch. Specs and images sourced from bowwwl.com under MOTIV's data license.
- **Image added for the existing Venom Shock**, which had specs but no photo.

## Stats gets its own tab, and two ways to cut it (2026-08)

### Added

- **Stats is a tab of its own**, next to History rather than a pane you swipe
  to inside it. The two share one filter: narrow the sessions on History, tap
  the chart icon, and the numbers are for exactly those games. The history icon
  on Stats goes back the other way. See ADR-057.
- **Filter by game number.** A row of chips for the position in the night, so
  every number on the screen can be read for your third game alone. It travels
  between the two tabs like the location and pattern filters do.
- **Open frames**, from the Stats tab: how often frames go open and roughly
  what that costs, with makeables, washouts and splits broken out under the
  headline and a bar per night so you can see it moving. The leave list is
  makeables only, and reports opens a game rather than a raw count, since a
  right-hander leaves more 10 pins than anything else and the total says as
  much about the first ball as about the spare (ADR-055, ADR-058, ADR-059).
- **First ball average** on the Stats tiles: pins knocked down by the average
  ball at a full rack, off the same balls as strike and pocket.
- **The best pocket, carry and strike rate are called out** in the ball table.
  A ball needs at least 10 fresh-rack balls to be in the running, so one good
  night with a new ball cannot take the crown, and nothing is highlighted until
  two balls qualify, since best of one is not a comparison. A tie lights both.
- **Game by game**, from the Stats tab: every first game against every second
  game, with average, strike and spare on one column set and pocket and carry
  on the other. Slots with fewer than three games are greyed rather than
  hidden. Tapping a row narrows the whole Stats tab to that slot (ADR-056).

### Changed

- **The filters collapse into a button.** Location, pattern, game and lanes now
  open in a sheet from a round control in the header, which carries a badge
  when anything is on. What is applied stays on screen as a row of chips you
  can tap to remove. A twelve-lane house used to wrap the filter onto three
  rows and push the first number most of the way down the screen; with nothing
  filtered it now takes no room at all (ADR-060).
- **The leaves grid is three cards to a row, not four.** A tabular "100%" and a
  "10/10" will not both fit a quarter of a 390px screen, so the count had been
  quietly clipping. Made-over-chances sits hard left and the rate hard right in
  every cell.

- **Spare lines moved off the tab bar** to the dashboard, alongside the arsenal
  and the catalog, and adds through its nav bar instead of a floating button.
  Stats took the slot. The old `#/spares` link now opens the dashboard.

## Dark mode, native navigation, and one design language (2026-07 to 2026-08)

### Fixed

- **The History trend line now respects the lane filter.** Location and
  pattern already narrowed it; lanes did not, so selecting a pair changed every
  other number on the screen and left the line alone. A game that never touched
  a selected lane now leaves the line, and a night left with no games leaves it
  entirely. A score cannot be split below the pair it was bowled on, so the
  filter applies per game rather than per frame.

- **"Games behind this column" says what it means.** The drill-down is headed
  by the ball alone now, with "Usages in game 3" under it, and each row carries
  the event, the lanes and the pattern as well as the alley and the date. The counts are
  still there, with the rate beside them: `P 7/7 100%`, `C 6/7 86%`, `S 6/7
  86%`, tinted once a rate is worth noticing.

- **The session sheet scrolls to the game you asked for, not past it.** It
  used `scrollIntoView`, which aligns to the viewport and scrolls every
  ancestor on the way, so inside the sheet the heading landed about a panel's
  height too far up. It now scrolls the sheet's own pane.

- **A ball's leaves read in the same order as the leave cards.** They were
  ranked by how often the ball left them and cut at four, so a split could sit
  ahead of a makeable and the rest were not shown at all. They now group the way
  the cards below do, makeables then washouts then splits, and the row scrolls
  sideways instead of stopping at four.

- **The last ball of the 10th no longer counts as a missed spare.** A leave off
  the 12th shot has no spare behind it, but the leaves card scored it as one, so
  a 10 pin left with the game already over pulled the 10-pin conversion rate
  down. Leaves now carry two numbers: how many times the shape was left, and how
  many of those a ball followed. The rate reads off the second, and the cells
  show `made/chances` with a muted `+N` for the leaves nothing could follow. Tap
  a group heading for the definition. The same fix stops a frame still being
  bowled from reporting its open leave as a miss.

### Added

- **Tighter spacing on the score-entry screen.** The gaps above the session
  header, under it, around the game chips and between the scorecard and the
  shot panel each came down a step. Nothing moved or resized, so the tap
  targets are what they were.

- **A trend line across sessions, on the History stats.** One point per night,
  oldest on the left, with a faint dot for every game behind it so a 170/240
  night is not read as two 205s. It follows the filters, so narrowing to a
  house or a pattern narrows the line.

- **Pocket and carry on the ball's own row.** The collapsed row now reads
  `P 84 · C 69 · S 65 · 31`, so the three rates and the sample size are
  legible without expanding the table (which still spells them out in full).

- **The trend lines answer back.** Tapping the History trend marks the night
  with a faint rule and names it below: alley, event, games, average, high and
  low. Tapping that card opens the session. The per-session score line works
  the same way for games: its card goes to that game on the session sheet.
  Inside a session one game is chosen at a time and both tabs read it: the
  stats scope to it, with a "Game 3 only" banner, and the sheet scrolls to it.
  Only the stats mark the chip, since only there does the choice change what is
  on screen; on the sheet a chip is a place to scroll to, so it stays plain,
  and clearing the choice is done on the stats tab.

- **A drill-down lands on the frames it was about.** Tapping a game behind a
  ball opens that session's sheet, scrolled to that game, and the shots thrown
  with that ball tint for a moment and fade. It is a background tint only, so
  nothing moves; with reduced motion the tint simply stays put.

- **The ball each frame opened with, in the corner of its box.** The session
  sheet marks every frame with the ball that threw its first shot: the catalog
  picture where there is one, the ball's initial where there is not. Reading
  down a game now says which ball was up without reading a word.

- **Ball performance reads as a table.** The card no longer folds away, and
  its rates sit in columns under P, C, S and Balls headings rather than running
  along the row as prose, each with its percent sign. Whichever ball row you
  had open survives a trip into a session and back, and History and a session
  sheet each keep their own.

- **Tabs remember where you were.** Leaving History and coming back keeps the
  pane, the filters, the lane selection and the scroll position. Kept in
  memory for the app run, not stored: a reload starts clean.

- **A spare line for your strike ball, stored as a move.** A leave's saved line
  is real boards thrown with a plastic ball, which is wrong the moment you shoot
  that leave with something that hooks. Each leave now also holds a move: stand
  two right of wherever you are playing, pull the arrows in three. It applies to
  whichever strike ball is up, off that ball's own strike line, so it survives
  the lane changing and follows you across the bag. Either half stands alone if
  the leave only moves your feet. See ADR-053.

- **The app offers to save the line you just threw at a leave.** After any spare
  attempt at a leave you have no line for, made or missed, a dismissable line
  offers to keep it, already filled in with what you threw. It used to appear
  only after a make, and it opened an empty form.

- **Borrow another leave's line.** At a leave with nothing saved, a control
  beside the Intended eye lists every spare line you have and drops its boards
  into the box. Some leaves are one shot: a 6 and a 6-10 are thrown at the same
  pin. It only fills the box; whether it becomes that leave's answer is the
  prompt's job after the shot. See ADR-054.

### Changed

- **Changing ball changes the line to that ball's line.** Throw ball A on one
  line, switch to ball B and shoot a different one, then switch back: the box
  kept B's line. Different balls want different parts of the lane, so the box
  now shows the line for whichever ball is selected, and keeps what is there
  only when that ball has no line on record. At a leave it prefers your own
  attempt at that leave with that ball over the saved line for the leave, which
  cannot say which ball it belongs to. See ADR-052.

- **The leaves card drops the leaves you never had a shot at.** A leave off the
  last ball of the 10th has no spare to make, and it used to sit on the card as
  a bare `0/0` with a muted `+1` beside it explaining why. The card now carries
  only leaves a ball actually followed, ranked by those chances. Nothing about
  counting changed: what a ball leaves is still every leave, still on the ball
  that threw it. See ADR-051.

- **Sheets and dialogs now split on one rule: you type in a sheet, you answer a
  dialog.** The ball editor was a sheet and the session editor a centred dialog,
  though they are the same object. Everything you enter data into now rises from
  the bottom edge and can be dragged back through it: the session form, the oil
  pattern form, the lane pair, adding a catalog ball. The keyboard is the reason,
  not the size of the form. A centred dialog holding a focused field gets shoved
  half off-screen on iOS, while a sheet is already anchored to the edge the
  keyboard arrives at.

- **Adding a spare line is where your thumb is.** It sat as a small button in
  the screen's heading while the identical action on Home sat in the floating
  corner button. Both tabs use the corner now, which is what §7b of the design
  language already said.

- **The Active tab opens when nothing is running.** It used to be greyed out in
  the tab bar, which is a dead control that explains nothing. It is a place with
  nothing in it, so it says so and offers to start a session.

- **Form fields, labels and dialog bars all come from one place now.** Field
  chrome was spelled out by hand in seven forms and five of those copies had
  lost their background class, so those inputs fell back to the browser's own
  control colour: a warm grey block in a blue-slate app, worst in dark mode.
  Every field now draws from a single style module, field labels are sentence
  case rather than the small uppercase group heading, and the session and oil
  pattern forms commit through the same bar as the ball editor: close leading,
  tick trailing.

- **Home has a title, and its shortcuts fill the grid.** Every other tab led
  with its name and Home did not. Five shortcut tiles across three columns also
  left a hole in the bottom-right corner; three thirds then two halves fills
  both rows. Destination names are sentence case throughout ("Lane notes",
  "Oil patterns", "Backup & restore").

- **The shot panel fits beside the pin grid without scrolling.** Its right
  column ran 100px taller than the left, so the notes field sat under the tab
  bar. The eyebrow rows were the cost: each held a 17px word and a 14px eye
  icon, but the icon was a full 44px button and set the row's height. The eye
  keeps its 44pt hit region and gives up the box, the way a chip does.

- **The shot panel labels sit above their fields.** STANCE and TARGET were
  parked on the field's own top border as an outline notch, which only works
  while the label is short relative to the box. These labels are nearly as wide
  as the numeric fields they name, so the notch ate the whole top edge and read
  as a label dropped on top of the box.

- **Round buttons on the nav bars, and a back control that is just a chevron.**
  The back control lost its label: naming the screen underneath ("‹ Settings")
  only worked while a screen had one way in, and it started naming places you
  had not come from. A sheet's close and confirm are a cross and a tick in the
  same round shape, so the ball editor's header no longer mixes an icon with a
  word.

### Fixed

- **Four overlays stopped blinking in and out of existence.** Adding a catalog
  ball, replacing all data, editing the lane pair and the first-run handedness
  question all appeared or vanished on a single frame while the sheets beside
  them slid. Every overlay goes through the one motion implementation now, and
  the session panel no longer carries a second hand-rolled copy of it.

- **The install prompt leaves the way it arrived.** It was laid out against the
  bottom edge but animated as a centred dialog, so it sat at the bottom of the
  screen and then scaled away into the middle.

- **The edit prompt on a finished game stops reappearing when you cancel it.**
  Tapping a board or notes field on a completed game raises a confirm before
  anything is rewritten, and the tap is vetoed on pointerdown so the field never
  takes focus. iOS Safari focuses a form control on tap anyway, veto or not, and
  a focused field asks to edit again the moment the dialog hands focus back on
  close, so Cancel raised the prompt straight back and only Edit escaped it. A
  locked field now hands focus back immediately.

- **The shot notes field fits three lines.** Every form control is forced to
  16px on a phone to stop iOS zooming in on focus, so notes were showing under
  two lines of text in a box sized for the 11px desktop metric.

- **The empty session list says something.** Home and History rendered a dashed
  grey box with one sentence, and that sentence told you to start a session
  "from the home tab" while you were standing on the home tab. Both now use the
  app's one empty state, and Home offers the button rather than describing it.

- **The add-game button is not a black slab in light mode.** It wore `bg-ink`,
  which inverts to near-black on a cream page and out-shouted the selected game
  chip beside it. It now wears the same skin as an unselected chip.

- **Error text uses the danger token.** Six places used a raw red from the
  Tailwind palette, which does not lift for dark mode the way the token does.

- **Leaves made in the 10th frame are counted.** A leave was read from the first
  ball of a frame only, which is the whole story in frames 1 to 9 and misses the
  10th, where a bonus ball is thrown at a full rack of its own. A 10th of strike,
  strike, 9 left a pin that appeared in no count anywhere, and the ball that
  threw it was credited with nothing. Every ball thrown at a full rack now makes
  a leave, attributed to the ball that threw it, and a spare made off a bonus
  ball counts as a conversion. See ADR-049.

- **The lane a game starts on is now visible while you bowl it.** Lanes were
  always per game, and so was the starting lane, but nothing on screen said
  which lane frame 1 was on, and the lane editor only opens itself for a game
  whose lanes are unset. So when the house's system failed to cross and started
  a game back on the lane before, there was nothing to notice. The lane editor
  now names the game it is about to change, in its title and above the starting
  lane, and says plainly that it changes that game and no other. The Lane row on
  the scoring screen names the frame its highlight belongs to, so a game that
  starts on 8 and shows a lit 7 on frame 10 reads as the fact it is rather than
  a contradiction.

- **The dashboard's shortcuts no longer move you to Settings.** Lane Notes, Oil
  Patterns and Backup opened from the dashboard used to switch you to the
  Settings tab on the way, so going back showed Settings for a moment before
  landing home. They now slide in over the tab you were on and go straight back
  to it, and their back control is the chevron alone rather than naming a screen
  you never visited. Reached from Settings, they are unchanged.

### Added

- **Pocket and carry percentages, guessed from the leave.** A fresh-rack first
  ball now carries a pocket verdict, worked out from what it left standing and
  flipped in one tap from the corner of the pin deck. The stats screens report
  what share of balls found the pocket and what share of those carried, which
  splits a bad game into "not getting it there" and "getting it there and it is
  not carrying". Old shots are read under the same rule, so history is not
  blank. See ADR-046 for the table.

- **Tap a stat to read what it means.** Pocket, Carry, Strike and Spare each
  explain themselves in one line when tapped, on the tiles and on the rows of a
  ball's table. Tapping again puts the line away, since a definition is read
  once and then in the way.

- **A score trend for the session.** Score by game as a line, the session
  average as a dotted rule, and the high and low games marked. A game that was
  never scored breaks the line rather than being drawn through.

- **Ball performance, by game.** The ball usage card now opens into pocket,
  carry and strike rates per ball, broken out by game number, with that ball's
  most common leaves. Every rate is the plain count, with the number of balls it
  came from next to it, and the list is ordered by balls thrown so the ball you
  actually use leads. Filter by pattern, alley or lane and the whole table
  follows. Tapping a game number opens the games behind that column, and tapping
  one of those goes straight to that game.

- **A repeatable way to add balls to the catalog.** Every ball used to be added
  by hand, so the catalog sat at 50 while the USBC approved list ran to
  thousands. A run now picks its own scope (a date range, a brand, or a named
  list), and everything after the reading step is mechanical: values only enter
  the catalog quoted from a named source, sources that disagree raise a conflict
  instead of being averaged, and a ball whose name matches one already there is
  held back rather than added twice. Ball images from every source are now
  framed identically, so no ball renders larger than its neighbour in the grid.
  See ADR-043 and ADR-044.

- **Seven more balls in the catalog,** all with photos: Absolute Reign, Code
  Green, DNA Coil II, Monsoon, Phaze Crimson, and the !Q Tour 30 and !Q Tour
  A.I. Tropical Surge gained its per-weight numbers, its release date and a
  photo.

- **Five Roto Grip balls,** all with photos: Attention, Gremlin Tour-X, Hustle,
  hyped UP! and Transform Pearl.

- **Six 900 Global balls,** all with photos: Gear Mark, Honey Badger Wine Pearl,
  Origin, Perfect Reality, Vengeance Returns and Viking Conquest.

- **Fixed:** after a 10th frame of two full-rack shots (strike then strike), the
  next game's first frame carried the ball and line from the *first* of them.
  It now carries the last one thrown. A spare attempt in the 10th still never
  seeds anything, since it was aimed at a leave. See ADR-045.

- **Seven Motiv balls,** all with photos: Covert VIP ExJ, Evoke Mayhem, Frenzy,
  Max Thrill Pearl, Sigma Tour Pearl, Supra Sport and Venom Hysteria.

- **Back closes whatever is in front.** The phone's back gesture already closed
  pushed screens; now it also closes the sheet or dialog on top of them, the
  ball editor and the start-session form included, exactly as Escape does on a
  keyboard. One gesture closes one layer, and the screen underneath stays where
  it was.

- **Screens now push like an app, not a web page.** Your arsenal, the ball
  catalog, a catalog ball's details and every Settings section slide in from the
  right with the same nav bar: a back control that names where you came from
  ("‹ Settings"), the title in the middle, and one action on the right. You can
  drag from the left edge to go back. Adding or editing a ball is now a
  dismissable card rather than a form wedged into the list, and linking a ball
  to the catalog is a full-screen search you can't miss, it used to hide below
  the fold. Lists that are empty explain what belongs there and offer the button
  to start.

- **Everything moves the way you would expect.** Sheets and dialogs rise from
  the bottom and drop back through it (drag one down to dismiss), pushed screens
  slide back out to the right instead of blinking away, and switching tabs
  travels in the direction of the tab you tapped. Going back from a screen you
  opened from another screen now returns to that screen rather than closing
  everything.

- **The home page leads with the action.** Starting a session is a round button
  in the bottom-right corner, with the resume pill beside it when a game is
  live. The shortcut tiles are smaller and now cover Arsenal, Catalog, Line,
  Lane Notes and Oil Patterns.

- **Appearance has its own settings page**, split out of Preferences.

- **Spare lines open the editor on a tap.** The lane view moved to an eye button
  beside the shooting-line boxes, where it costs no extra row.

- **Ball photos look right in dark mode.** They sat on a white tile that the
  dark theme never touched; that tile now follows the theme, and the Pyramid
  Path photo has had its white backdrop cut away.

- **Ball photos, and more balls.** The catalog now shows a real product photo
  for every ball that has one, all framed the same way — square, evenly
  margined, and transparent so they sit right in both light and dark mode. Balls
  outside the Storm family can be added now too: Pyramid joins the brand filter,
  and plastic spare balls get their own **Polyester** coverstock filter instead
  of showing as unclassified. Newly in the catalog: Roto Grip Gem, Roto Grip Halo
  Pearl, Storm !Q Tour Edition, and the Pyramid Path.

- **Corrected ball data.** Pitch Black was listed as a 2025 ball; it's from 2014.
  Zen Master and Wolverine now carry their 12 and 13 lb specs, which the
  catalog was missing.

- **Oil patterns have their own settings page.** Settings → Oil Patterns lists
  every pattern you've used, and lets you add or rename one and give it a link
  to its pattern sheet — usually a PDF. Where a pattern has a link, its name in
  the session panel becomes tappable, so the sheet is one tap away mid-session.
  Renaming a pattern now updates it everywhere, including your past sessions and
  stats. Deleting one that sessions still use archives it instead: it disappears
  from the picker for new sessions, and your history keeps its name.

- **Your line fills itself in from the last time you threw that ball.** Pick a
  ball and, if the line box is empty, it fills with the line you used for that
  same ball — preferring the same lane, reaching back through the game and
  earlier games in the session. Shooting a spare with your strike ball inherits
  that ball's strike line, ready to adjust off. A saved or session spare line
  still wins, and anything you typed yourself is never overwritten.

- **Dark mode.** The app follows your device setting out of the box, and
  Settings → Preferences lets you pin Light or Dark instead. Your choice is
  applied before the app draws, so there's no white flash on open.

### Changed

- **Importing a backup now replaces everything, instead of merging.** The file
  you import becomes your data, exactly as it was when you exported it — nothing
  is blended with what's already on the device. Because that deletes anything
  not in the file, the app shows you what you're about to lose, asks you to type
  REPLACE, and downloads a copy of your current data first. **Note:** you can no
  longer combine two devices by importing one into the other.

- **Spare % is now your makeable-spare rate.** Washouts (the head pin left
  standing with a gap behind it, like 1-2-10) no longer count towards it, the
  same way real splits never have. Tap the Spare tile to see the rule.
- **Leaves are grouped as Makeables, Washouts and Splits**, each sorted by how
  often you've faced them. The "rare leaves" section is gone.

- **Every control is now big enough to hit.** Buttons, filter chips and icon
  buttons meet Apple's 44pt minimum. The worst offenders were the Arsenal
  row's edit and delete buttons, which sat side by side at 32px with one of
  them destructive.
- **Text is bigger and darker where it was hard to read.** Nothing sits below
  11px any more, and low-contrast grey body text has been darkened.
- **One colour means one thing.** Success was previously green in one place
  and a different green in another; warnings, errors and success now each
  have a single treatment that works in both themes.
- **Lane filters remember where you were.** Picking lanes at one location, then
  looking at another, no longer throws the selection away: the other location's
  lanes filter nothing, and coming back restores what you had picked. The chips
  and the Clear button always show what is actually filtering.
- **The app starts faster.** The ball catalog, the arsenal editor and the lane
  view load when you open them rather than on every launch, which is about 8%
  less to download before the first screen paints.

### Added

- **Back works.** The system back button (and the left-edge swipe) now closes
  the screen you are on instead of the whole app, one screen at a time. A
  reload returns you to where you were rather than the home tab, and screens
  have addresses, so a link can point at a session or a settings page.

### Fixed

- **The home buttons no longer jump on arrival.** The + button and the resume
  pill appeared a little high for a moment, then dropped into place, because the
  tab-switch animation moved the frame they were positioned against.
- **Start a session, cancel, start again, and the form is there.** The second
  time it opened invisible: you could tap its fields but not see it.
- **The pin numbers on spare cards are readable.** At 9px they were far too
  faint against their circles, in both themes.
- **The breakpoint now shows when you shoot a spare with a hooking ball.** It
  was hidden on every spare attempt; it's hidden only for your plastic spare
  ball now, which is the ball that actually has no breakpoint.
- **A saved spare line can no longer wipe a line you just set.** The lookup ran
  in the background and could land after you'd changed balls, clearing the box.
- **The "Save spare line" prompt renders with its tint again.** It referenced
  a colour that was never defined, so its interior was transparent.
- **Errors are announced to screen readers.** Every failure banner was
  previously silent.
- **Dialogs and sheets handle the keyboard.** Escape closes them, Tab stays
  inside, and focus returns to whatever opened them.
- **The status bar is legible when installed to the Home Screen.** It was
  white-on-cream.

## Spare lines behave like every other line (2026-07-22)

### Fixed

- **The green Final dot is always on the drawn line.** When your aim can't
  reach the pin, the ball rides straight — the dot now sits where the shot
  actually finishes instead of floating on the pin it never reaches, and the
  `Final` label names that board. The pin still turns red to say you missed
  it (ADR-033).

### Changed

- **Spare lines answer the view toggle.** Switching to Top-down on a spare
  now slides the lane aside and stacks the board controls in a side column,
  exactly as a strike line does — the two views were diverging for no reason.
- **A spare line's stance drives its slide and laydown.** Type a stance and
  both follow through the drift model (ADR-030), the same way score entry
  works. The slide tick shows on the spare lane surface too.
- **The spare form's board boxes match the shot panel** — Stance and Target
  with headings on the box border, and a `Slide → Laydown` readout under
  them. The standalone Laydown box is gone; drag the peg to override it.
- **Tapping a spare goes straight to the lane.** The form in between is only
  reached by pressing and holding a card, which is also where you change the
  pins or delete the spare. The lane saves what you set on close, hook
  timing included — previously the save dropped it.
- **The visualizer takes a Stance** on the Spares tab, since that is now the
  only place a spare line is edited. Laydown follows it through the drift
  model, exactly as in score entry.
- **Spare cards read `Stand` / `Arrow`**, with `Slide → Laydown` derived
  underneath, instead of `S / L / T`. The `Pin -0.2` line is gone: it was a
  straight-line board that ignored hook, and the lane now shows the real
  finish honestly.
- **The drag handle is gone from spare cards** — press and hold anywhere on a
  card to pick it up and reorder; let go without moving and its details open.
- **The pin deck is drawn taller.** The triangle was compressed to the point
  of looking flat; rows now sit 6 plane-units apart (was 5), which is as far
  as the drawing extent allows. No geometry changed — the rack is decorative.
- **The read-only `Bkpt` box is gone from the lane controls.** It could only
  ever be changed by dragging the breakpoint, which already labels itself on
  the lane.

## The Actual line records your slide (2026-07-21)

### Changed

- **The Actual line now takes Slide and Target**, not Stance and Target — you
  don't observe your own stance after a shot, you observe where you slid
  (ADR-032). Intended still takes Stance. Old shots keep what they stored:
  a recorded stance shows as its derived slide until you next edit that shot.
- **Every board box has its own heading**, printed on the box's top border.
  A filled-in `23` says whether it's a slide, a stance, or a target without
  you having to remember the column order — and the heading costs no height.
- **The ball is its own control.** Its thumbnail and name sit at the top of
  the shot panel; tapping opens a picker of your arsenal with the current ball
  ticked. The `BALL` label, the select chrome, and the second "manage arsenal"
  icon are gone — managing the arsenal is a link inside the picker.
- **Notes is two lines and scrolls**, instead of one line that grew and pushed
  the panel down.
- **Breakpoint reads `Bkpt 15.5 (42ft)`** instead of `Bkpt 15.5·42ft`.
- **On a finished game, the confirm prompt now appears on the tap itself** —
  for the ball, the board boxes, and notes. Previously the field focused and
  the keyboard opened before the prompt could stop you.
- **Intended shows its derived Slide** beside Laydown; **Actual shows its
  Laydown and estimated breakpoint.**

### Fixed

- **The ball picture no longer blinks back to the placeholder on every shot.**
  Moving between shots rebuilds the shot panel, which restarted the image's
  fade-in each time even though the browser already had the picture. A source
  that has decoded once now paints straight away.

### Added

- **The Actual line opens in the lane visualiser too.** It starts with the
  laydown and target pinned, so the first thing you can drag is where the
  ball actually finished — the rest of the line re-solves around it.
- **Locked pegs show a lock and can be released from the number itself.**
  Tapping a locked stepper unlocks it; previously locks were only reachable
  by tapping the peg on the lane.

### Changed — shot panel

- **The shot panel no longer scrolls.** Ball, both lines, and notes now fit
  on one screen with every board filled in (360px, down from ~474px). The
  two full-width "View … line" buttons became an eye control in each line's
  heading row, and the derived boards read as one chain —
  `Slide 24 → Laydown 21 → Bkpt 1·28ft` — in the order the ball meets them.
- **Consistent panel styling.** One label scale, one corner radius, one field
  treatment (recessed until focused), and lining figures throughout, so entered
  numbers and derived numbers are told apart by weight rather than by boxes.

## Completed games confirm before an edit (2026-07-21)

### Changed

- **Editing a completed game asks first.** The first change you make to a
  finished game — a pin tap, the ball, a line, notes, the lanes, or a drag
  in the lane visualizer — is held back and a confirm appears instead, so a
  stray tap can no longer silently rewrite a recorded shot (there is no
  undo). Confirm once and the rest of the game edits freely; cancel and the
  next attempt asks again. Returning to the game (or switching to another
  and back) asks again. Viewing is untouched: the scorecard, the deck, and
  the lane visualizer all read normally. Games in progress never ask.

## Resume + catalog-restore fixes (2026-07-20)

### Fixed

- **Leaving the Active tab mid-frame no longer loses the second ball.**
  Re-opening the scorer with a frame that had only its first (non-strike)
  shot recorded resumed at the *next* frame, leaving the second ball
  unenterable. It now resumes at ball 2 with the correct standing pins —
  including games already stuck in that state.
- **The ball catalog repopulates after a backup restore.** Restoring a
  backup carried over the catalog version marker without the catalog data,
  so sync considered itself up to date and the catalog stayed empty. Sync
  now re-downloads whenever the local catalog table is empty.

## UI/UX audit pass (2026-07-20)

### Changed

- Settings is grouped under "Bowling", "Data & safety", and "Support"
  headings, and the Backup & Restore row now shows the last backup date
  (or "Never backed up").
- Dashboard/History session cards: the alley name wraps instead of
  truncating, the games · average line is larger, and the ACTIVE badge now
  means "has an unfinished game" rather than "last opened".
- Ball catalog: active filters show as removable chips under the search bar
  while the filter panel is closed.
- Stats: spare/split leaves are sorted by attempts, with under-sampled
  leaves grouped in a dimmed "Rare leaves" section.
- Score entry: section labels bumped from 10px to 12px for alley
  readability; the notes box starts at two rows and grows with content.

### Fixed

- The "Game lanes" dialog no longer re-opens on every return to the Active
  tab — it auto-opens at most once per game, before any shots are bowled.
- Screen-reader labels added to the settings rows, home shortcut cards, and
  session cards, which previously announced as unnamed buttons.

## iOS rotation viewport recovery (2026-07-19)

### Fixed

- **Taps land where you tap after rotating.** Rotating out and back left iOS
  holding the document scrolled 62px, so every button had to be tapped slightly
  above itself until you relaunched the app. The app never scrolls the document
  by design, so any offset is now clamped back to zero — except while you're
  typing, since iOS scrolls the page to keep a focused field visible.

- **The mobile tab bar no longer leaves a permanent blank strip below itself
  — after rotating back to portrait, or after dismissing the on-screen
  keyboard.** The app shell is now `position: fixed; inset: 0`, so the browser
  resolves its size against the live viewport on every paint. All JS viewport
  measurement is gone; iOS has nothing left to report stale. Found by shipping
  five candidate fixes behind a runtime switch and testing them back to back on
  a real installed PWA — see `docs/VIEWPORT-BUG.md` for the four earlier
  attempts that failed and why.

## Settings: feedback + donation links (2026-07-19)

### Added

- Two new rows in Settings: "Send feedback" opens a Google Form in a new tab;
  "Buy me a coffee" opens a Buy Me a Coffee donation link.

## Breakpoint is display-only in score entry (2026-07-19)

### Changed

- Score entry's Intended line no longer has a typeable breakpoint field —
  only stance and target. Once both are set, a read-only breakpoint chip
  (matching the existing laydown chip) shows the derived apex; tapping it
  opens the lane visualizer, which is now the only place to edit breakpoint
  or hook timing. The chip only appears for a genuine hook (not a straight
  or unreachable line), and never appears on a spare attempt.

## Drift model: stance-zone drift + release offset (2026-07-19)

### Added

- **Drift zones** (Settings → Preferences): the single "laydown offset" is
  now a "release offset" plus three configurable stance zones (Outside /
  Middle / Inside), each with its own drift amount — where you stand on the
  approach can now change how much your feet drift before the slide. Defaults
  keep everyone's existing laydown calculation unchanged.
- A small "slide" tick now shows on the strike line visualizer at the derived
  slide-foot board, alongside the laydown marker.

### Changed

- The laydown calculation is now `laydown = stance − drift(stance) −
  release_offset` instead of a single subtraction; with default settings
  (drift = 0 everywhere) the result is identical to before.

## Data safety: persistent storage + backup nudges (2026-07-19)

### Added

- **Persistent storage request.** On launch, the app asks the browser to
  make its IndexedDB storage persistent (best-effort; reduces the chance of
  Safari evicting data). The result shows as a status line in Settings →
  Backup & Restore.
- **Backup reminder banner** on the dashboard: after 3+ sessions since your
  last export (or 3+ sessions total if you've never backed up), a
  dismissible banner offers "Export backup" (jumps to Backup & Restore) or
  "Later" (snoozes for a week). On iOS Safari (not installed) or Android,
  the banner also offers to open the install prompt, noting that installing
  protects data from iOS's 7-day cleanup for non-installed PWAs.

## PWA native-feel polish + update flow (2026-07-19)

### Added

- **iOS "Add to Home Screen" now looks like a real app** — status bar
  overlays the page (with safe-area padding added so content doesn't sit
  under it), and the home-screen icon/title are set via new iOS meta tags.
- **Update-available toast.** The service worker no longer silently swaps
  itself and reloads mid-game; when a new version is ready, a small toast
  offers an Update button so you choose when to reload.
- **Install-app sheet** (component only, not yet wired into the UI) offering
  the native install prompt on Android/Chrome and static "Add to Home
  Screen" instructions on iOS Safari.

### Changed

- Buttons/links now respond instantly to taps (`touch-action: manipulation`),
  removing the double-tap-zoom delay.

## Root error boundary (2026-07-19)

### Added

- **A crashed render no longer whitescreens the app.** A root error boundary
  wraps the app; on an uncaught render error it shows a recovery screen with
  a Reload button and an Export backup button (works independently of the
  crashed tree) instead of a blank page. No crash reporting/analytics added.

## Fresh-rack bonus ball seeding fix (2026-07-19, ADR-029)

### Fixed

- **10th-frame bonus ball after a spare no longer inherits the spare's line/ball** —
  it now seeds from the most recent strike-attempt (fresh-rack) shot.

## Honest lines: derived laydown, real breakpoints, peg locks (2026-07-09, ADR-028)

### Added

- **Your line now starts where the ball actually lands.** A new "Laydown offset"
  setting (Settings → Preferences, default 6 boards) derives the laydown from
  your stance; drag the laydown point to override it for a single line. The
  scorer shows the derived laydown as a chip on the Intended line — tap it to
  open the lane view.
- **Tap a point to lock it.** Locked points (laydown / target / final, up to
  two) get an amber ring + 🔒 and never move — drags, steppers, and edits that
  would push them all stop at the wall.
- **"Pocket" / "Re-aim" chip** snaps the final back to the pocket (strike) or
  the leave's ideal aim (spare) whenever it's off.

### Fixed

- **The breakpoint can no longer appear below your target.** Straight, inward,
  and unreachable lines show no breakpoint at all — the marker only appears
  when the ball genuinely swings outside the target board.
- **Spare hooks can't draw off the lane / off the screen anymore.**
- **Spare attempts open the lane view in spare mode** — aimed at your actual
  leave, not the pocket.
- **Hook sliders have no dead zones** — their ranges are computed live from
  what the line can actually do, with the bounds shown at the track ends.

### Changed

- **The lane view header is gone** — the lane renders full-height; close (top
  right), view toggle and hook options (top left) float over it.
- **The replay button is gone** — tap anywhere on the lane to re-roll the shot.
  The animated ball is now clearly a ball (amber) and fades out at the pins.
- **In/out arrows (◀ ▶) replace − / +** on the lane view's board steppers,
  matching the score-entry screen; direction is handedness-aware.
- **The pin deck is less compressed** — bigger pins, taller rack.

## Aim cascade on walled breakpoint drags (2026-07-05, ADR-027)

### Added

- **Dragging the breakpoint past what hook timing allows now moves your aim
  with it** — the line follows your finger instead of resisting; whichever of
  target/laydown you touched least recently gives way (ADR-027).

## Unified hook timing, magnetic breakpoint drag (2026-07-04, ADR-026)

### Added

- **Strike and spare lines now share one hook model** — the same "Hook start" and
  "Hook length" sliders shape both; the old "Breakpoint distance" slider is gone (ADR-026).
- **The breakpoint marker is draggable in both modes and chases your finger** —
  dragging solves both timing knobs at once ("magnetic" drag).

### Fixed

- **A lofted (off-lane) laydown no longer pushes the breakpoint marker off the screen.**

### Changed

- **Existing strike lines keep their tuned breakpoint depth** (automatic migration);
  untouched lines adopt the new, more realistic skid→late-hook default look.

## Late-hook breakpoint rail, top-down camera stays put (2026-07-04, ADR-025)

### Fixed

- **The breakpoint rail reaches all the way out.** Dragging it now sweeps out to a sharp late hook near the gutter instead of stalling partway across the lane.
- **Straight-down-a-board lines put the breakpoint at the target**, not down at the foul line.
- **The camera stays top-down after you drag a point** — it used to snap back to your previous angle on release.

## Draggable breakpoint, auto-hook, tunable spare hook, visualizer polish (2026-07-03, ADR-024)

### Added

- **Drag the breakpoint again.** The breakpoint rides a rail: drag it and the strike line reshapes — how far down-lane the ball reaches before hooking back — and can never draw an impossible wiggle. The stored breakpoint always matches what's drawn.
- **Hook options.** A "⋯" button opens hook controls. Strike lines get a **Breakpoint distance** slider; spare lines get **Hook start** and **Hook length** sliders (how early the ball leaves the skid and how long it takes to recover into the pin).
- **Replay button** re-rolls the ball down your line; it also replays after you tweak a value.
- **Board ruler.** Labelled board numbers sit along the foul line so dragging reads in boards at a glance. Each peg (laydown / target / breakpoint / final) now has its own colour, and labels no longer overprint each other.

### Fixed

- **Dragging is accurate.** Handles now track your finger exactly and reach the lane edges (the old mapping ignored the letterboxing around the lane).
- **You can type in the number fields.** They used to fight every keystroke; typing now commits when you leave the field or press Enter, with −/+ steppers for quick nudges.
- **Grabbing a handle no longer flattens the view for good** — it snaps flat while you drag, then returns to your previous angle.
- **Spare Final handle** now sets depth as well as board when you drag it up/down.

### Changed

- **Every strike line curves by default** (auto-hook); a dead-straight line is just the case where the final sits on the aim line.

## Strike line is one smooth curve target→final (2026-07-01, ADR-023)

### Fixed

- **Strike line is smooth even on big crosses.** A line that crossed a lot (e.g. laydown 37.5 → target 19) used to ride the ball to the gutter and draw a hard corner at the lane edge. The strike is now a single smooth curve from the target to the final; when the line would run off the lane, the breakpoint is automatically brought nearer so the curve stays on the lane and smooth. Truly unreachable aims draw a smooth straight line (a guttering shot), with the pegs kept on the lane so you can always grab them.

## Strike line uses the spare curve; breakpoint is derived (2026-07-01, ADR-022)

### Fixed

- **No more S-shaped strike line.** The strike line previously could curve right then left between the target and the breakpoint (impossible for a real ball) when the breakpoint sat off the aim line. The strike now draws the exact same clean, one-direction curve as the spare — straight skid, single smooth hook, straight roll — so it can never wiggle.

### Changed

- **Breakpoint is now read-only — the rightmost point of the curve.** Instead of dragging the breakpoint to shape the line, the breakpoint board/distance are shown as a read-out of the curve's furthest-out point. You shape the line with laydown, target and final.

## Strike line rebuilt to match the spare (2026-06-30, ADR-021)

### Changed

- **Strike line uses the same clean curve as the spare** — straight skid, one smooth hook through the breakpoint, then a straight roll into the pocket — now on the linear lane mapping (no kinks). The breakpoint (board + distance) is the apex: the furthest-out point where the ball turns and hooks back. The line can never cross to the gutter side of the dashed focal, and the breakpoint clamps onto the focal if you drag it past it.

### Fixed

- **Inside aims no longer draw an impossible line.** When the aim already heads to the hook side, the curve previously bulged to the gutter side of the focal — physically impossible. The ball now always stays on the hook side of the focal, for every aim. If the aim is steep enough to send the ball off the lane, the ball rides the lane edge and the breakpoint/final cap at the edge — everything stays on the lane so the handles remain draggable (they no longer fly off-screen).

## Ball usage in stats (2026-06-30)

### Added

- **Ball usage on the History → Stats page.** A breakdown of how many frames and games each ball has been thrown in, across all sessions (respects the lane filter). A frame counts once per ball used in it; a game counts if the ball appears in any frame.

## Straight lines: linear lane mapping + decorative pin rack (2026-06-30, ADR-020)

### Fixed

- **Lines now render perfectly straight.** The dashed focal line and the spare ball's roll no longer kink near the pins. The lane's vertical scale had a bend at the head pin (added to spread the pin deck) that made every straight line bend on screen — now the scale is linear, so straight is straight, in both top-down and bowler views.

### Changed

- **Pin deck is now a decorative rack.** With the lane scale linearised, the pins are drawn as a fixed-scale 4-3-2-1 triangle (in the correct columns) rather than being placed by true depth. The ball still lands in the right pin's column.

## Spare ball path: skid → hook → roll (2026-06-30, ADR-019)

### Changed

- **Spare ball path redrawn as a real ball motion.** The spare line now rolls straight off the laydown, hooks once through a smooth curve, then rolls straight into the pin — instead of the old fixed bow. The curve now responds to the laydown, can never cross to the gutter side of the dashed focal line, and never wiggles back on itself.
- **Focal guide sits exactly on the skid.** Fixed a rendering bug where the dashed focal line read as offset from the straight laydown→target segment (it was drawn as a single line across the pin-deck scale break).

### Fixed

- **Unreachable spares are honest.** If the pocket/pin sits on the gutter side of the straight focal line (no hook can get back out to it), the ball is drawn dead straight off the back of the lane and the leave pin turns red, rather than drawing an impossible curve.

## Spare lines: aim, hook, depth, pin deck (2026-06-29, ADR-018)

### Added

- **Derived spare aim point.** Viewing a spare line now auto-places the final target at the best spot to make that leave — the centre of the pin for a single, the pocket between the front two connected pins for a cluster, and a thin slide-across clip for splits (offset by the real slide angle). Back-row leaves sit at their true depth.
- **Smooth spare ball path.** The spare line draws a gentle curve from the target to the final point (the dashed focal line stays as the perfectly-straight reference) — no breakpoint needed, and the spare ball isn't drawn dead straight.
- **Configurable final depth.** A Final-distance (ft) control on the spare visualizer; spare pins aren't always on the front row.

### Changed

- **Pin deck redrawn.** The deck now renders as a proportioned 4-3-2-1 triangle of round pins instead of a flat smear, in both the strike-line and spare visualizers. Standing leave pins read bright; the rest ghost out. Point math still uses real lane distances — only the rendering is rescaled.
- **Spare lines drop the breakpoint.** Spare lines no longer configure a breakpoint or breakpoint distance (use hook strength instead). When a saved spare line auto-fills the line during scoring, the breakpoint field is hidden.

---

## Active-scorer fixes (2026-06-25)

### Fixed

- **10th-frame shot-3 spare bug (#4).** After a spare on shot 2, shot 3 is a fresh rack; it now shows a pin count or `X`, never an erroneous `/` symbol.
- **Leave tie-break sort (#5).** When two leaves have equal attempt counts, they now sort by fewer standing pins first, then lower pin number — producing a consistent, readable order.
- **Baby splits reclassified as spare opportunities (#6, ADR-016).** A new `isBabySplit` function identifies splits whose standing pins are all laterally adjacent (e.g. 3-10, 9-10, 5-6). These are counted as spare opportunities in the spare rate; wide splits (e.g. 7-10, 4-6) are excluded from both numerator and denominator. The Spares bar now shows a `non-splits` subtitle. Baby splits appear in the Spare rates leave table; only wide splits appear under Splits.
- **Save-as-you-go — no data loss on game-switch (#1, ADR-017).** Every submitted shot is persisted immediately (including mid-frame after shot 1 of an open frame). The live draft (ball/line/notes entered before recording pins) is flushed to the DB on game-switch, unmount, tab-background, and page-hide — as long as it has pin interaction.
- **Ball auto-pick removed; context carry (#2, #3, ADR-017).** The hardcoded "first ball in list" default is gone. Shot 1 of any frame carries ball + line + notes from the previous same-lane frame in the current game, then from the most-recent same-lane frame in earlier games of the session. Spare attempts default to the spare ball (if configured) else the shot-1 ball. Fresh-rack bonus balls (10th after strike/spare) carry from the shot just thrown.

---

## Catalog v3: colorways + PDF seeding (2026-06)

### Added

- **Lane line visualizer (ADR-011 – ADR-015).** A fullscreen view that draws your
  line over a wood lane as a real shot — a straight skid along your aim, a hook
  that starts gently at the arrows, steepens to peak at the breakpoint, then eases
  to a near-straight finish into the pocket — with a drag-to-tilt camera (a framed
  top-down ⇄ bowler-eye view) and direct drag-to-edit pegs (laydown, target,
  breakpoint, final) plus matching numeric inputs. A dotted **focal line** (your
  laydown→target aim extended down the lane) marks the boundary the ball can never
  cross: it rides the line on the skid and only ever peels to the hook side, and
  once it starts hooking it never swings back. Your laydown and target stay exactly
  where you put them; the breakpoint and final are dependent — on a wide or steep
  aim the breakpoint slides gutter-ward to the furthest apex a smooth, on-side hook
  can actually reach. The laydown can loft off the edge of the lane. In the bowler
  view the lane is centred and the inputs drop to a bottom bar;
  top-down keeps them on the side. Reachable from score entry, the spare-line form,
  and Settings. Adds `breakpoint_distance` and `final_board` to the line model (the
  v2 `hook_start_distance` peg was removed).

### Fixed

- **Catalog stuck on a stale ball count.** Devices stayed on an old catalog (e.g. 12 balls) even after a larger catalog deployed, and refresh didn't help. Client sync now **upserts the full catalog** (updating existing balls and removing stale ids) instead of append-only, and `catalog.json`/manifest are fetched **NetworkFirst** so a new catalog syncs on the first refresh (ADR-010). Corrected specs, colorways, and images now propagate to already-synced devices.
- **Ball detail opened as a broken inline panel.** Tapping a catalog ball now opens a proper full-screen modal (brand/name in a sticky header, dismissable with an X, no Back button) that always opens at the top, instead of an `absolute` panel that appeared above the scrolled list.

### Added (more balls + tooling)

- **2022–2024 SPI catalogs parsed.** Each catalog year uses a different weight-table layout, so there's a per-format parser: `parse-catalog-columnar` (2022 + 2023, transposed tables) and `parse-catalog-2024` (per-row, values-after-weight). 11 new Storm balls merged (Absolute, DNA, Fate, Phaze V, Revenant, Summit, Summit Peak, The Road, Absolute Power, Hy-Road Pearl, Electrify Pearl).
- **Manual ball add (`add-ball-manual` skill + `add-ball-image`).** Paste a ball's spec text + a direct image URL → entry added with a clean webp image. Added Wolverine and Zen Master (900 Global) this way.
- **Image denylist.** `fetch-images` skips ad-sheet carves known to be bad (wrong crop / dark background), so re-runs don't re-add them.

### Added (images)

- **Ball hero images (Phase 6).** `npm run fetch-images` extracts each ball's photo from its Storm ad-sheet PDF (carves the embedded JPEG, resizes to webp) into `public/catalog/img/`; `build.ts` merges a sidecar `images.json`. One image per ball (Storm ad sheets are single-color), shown in the row thumbnail and detail carousel.

### Changed

- **Catalog rows show specs on mobile.** The compact spec line (coverstock category · core type · RG · Diff) is now always visible on every catalog row, not just on `sm:` and wider.

### Added

- **Colorway display.** Catalog rows with multiple colorways show a "N colors" badge; the ball-detail page has a swipeable colorway carousel with pagination dots and the color name; the add-to-arsenal dialog has a colorway picker that saves the chosen `colorway_sku` on the ball.
- **Catalog seeded from Storm 2025 catalog.** 11 colorway-bearing Storm balls merged in (e.g. Tropical Surge with 4 colorways), via the new PDF pipeline.
- **Colorways schema (ADR-009).** New `Colorway { sku, color, imageThumb?, imageFull? }` and optional `colorways?: Colorway[]` on `CatalogBall` + `RawBall`; optional `colorway_sku?` on `Ball`. All non-indexed — no Dexie bump. UI (catalog-row badge, detail-page swipe carousel, arsenal colorway picker) is follow-on.
- **Deterministic PDF seeding pipeline (ADR-009).** `npm run usbc-index` (USBC PDF → searchable `usbc-index.json`), `npm run parse-catalog` (SPI year catalog → staging seed file, all three brands), `npm run parse-ball` (one tech-data PDF or pasted text → staging seed file). Ball name + brand reconciled against the USBC index; unresolved balls flagged for review. Wrapped in the `seed-catalog` skill. Costs ~0 model tokens vs LLM web search.

## Catalog v2: UX overhaul (2026-06)

### Changed

- **Catalog as full-screen modal.** `CatalogView` now renders as a `fixed inset-0 z-50` overlay, covering the bottom nav bar on all screen sizes.
- **Row/list view.** Catalog ball grid replaced with a compact single-column row list (thumbnail · brand · name · specs) for faster scanning and numeric comparison.
- **Dual-range slider: single track with filled segment.** RG and Diff sliders now render one track with the selected range highlighted; values commit only on pointer/touch/key release to avoid excess re-renders.
- **"Add to my arsenal" fix.** Fixed broken dialog from detail view — the confirm dialog is now always mounted at the overlay root, reachable from both list and detail view.
- **Spec list styling.** `SpecItem` rows in the detail panel are now rendered as key/value rows with a subtle divider instead of bordered white boxes that looked like input fields.
- **Arsenal: catalog specs line.** Arsenal ball rows now show a compact specs line (coverstock category, core, RG, Diff) when a catalog snapshot is present.
- **Arsenal: icon-only "Browse catalog" button.** The text label is dropped; the `BookOpen` icon remains with an `aria-label`.
- **Arsenal: weight field.** Add/edit form gains a weight selector (10–16 lb, default 15). Weight is saved on `Ball` and used to select per-weight specs from the catalog when the ball is catalog-linked.

### Added

- **"Owned" badge in catalog.** Catalog rows for balls already in the user's arsenal display a small "Owned" badge.
- `weight?: number` optional field on `Ball` type (non-indexed; no Dexie schema bump).

### Removed

- Release Year filter facet removed from catalog filters.
- "View on manufacturer site" link removed from catalog detail panel.

## Catalog v2: multi-weight schema + USBC discovery (2026-06)

### Added

- **Multi-weight ball specs schema.** `CatalogBall` and `RawBall` gain an
  optional `weights?: WeightSpec[]` array for per-weight RG/diff/mbDiff. The
  existing top-level fields remain the 15 lb default; `weights` is omitted when
  absent. Backward-compatible — no UI or sort/filter changes required.
- **USBC discovery script** (`scripts/sync-catalog/usbc/parse-usbc.ts`).
  Downloads the USBC approved-ball PDF, extracts all brand+name pairs
  deterministically (text layer; no OCR), and diffs against `balls.json` using
  `normalizeName`. Run with `npm run usbc-diff`. PDF cached in `tmp/` (gitignored).
- **Gather-ball-specs skill** (`.claude/skills/gather-ball-specs/SKILL.md`).
  Codifies the 2-source search protocol, field definitions, multi-weight rule,
  and post-add verification steps for adding new balls to the catalog.
- `DEFAULT_WEIGHT = 15` constant exported from `src/types/catalog.ts`.
- ADR-008 (multi-weight schema + USBC discovery) in `docs/DECISIONS.md`.

## Roadmap features (2026-06)

### Added

- **Bowling ball catalog.** Searchable, filterable reference catalog of
  manufacturer balls (Storm, Roto Grip, 900 Global, Motiv) with specs
  (coverstock, core, RG, Diff, MB Diff). Served as a static JSON from the CDN,
  hydrated into IndexedDB on first open, then searched/filtered 100% offline.
  Reached from a Dashboard widget and Settings → Arsenal; "Add from catalog"
  snapshots a catalog ball's specs into your arsenal. Data is hand-curated and
  source-cited (`scripts/sync-catalog`, `npm run sync-catalog`); see ADR-007.

### Changed

- **Inverted pin input.** Each shot now starts with all pins down; tap the pins
  left standing. Recording with no taps is a strike/spare. Stored data and
  scoring are unchanged (see ADR-006).
- **Slide-to-select pins.** Drag across the pin deck to toggle several pins in
  one stroke. The first pin sets the stroke's mode (select or deselect); the
  rest follow it, so a single drag never both adds and removes. Pure mode-lock
  logic in `src/lib/pinGesture.ts`.
- **Edit previous frames.** Tap any frame on the scorecard to re-score it; the
  frame highlights, the pin grid re-captures its shots, and totals + completion
  recompute on save. Later frames keep their recorded shots. Cancel restores the
  pre-edit state.
- **Deploy docs + skill.** `docs/DEPLOYMENT.md` documents the build + deploy
  flow (`npm run build` → `vercel --prod`, zero config). A local `deploy` skill
  (`.claude/skills/deploy/`) runs the verify-then-ship gate.

### Added

- **PWA / installable offline app.** App is now installable to the home screen
  and boots with no network. `vite-plugin-pwa` (Workbox) precaches the app
  shell on install; the service worker auto-updates on next load after a new
  deploy. Manifest uses felt-700 theme color and a 🎳 icon set generated by
  `scripts/generate-icons.mjs` (`npm run icons` to regenerate). IndexedDB data
  is untouched by the cache layer. Design:
  `docs/archive/2026-06-07-pwa-offline-design.md`.
- **Playwright smoke tests** (`e2e/`). Chromium-only, run against the dev
  server at 390×844. Covers: strike/spare/open scoring with running-total
  assertion, session persistence into history, and the export → wipe →
  import backup round-trip. Run with `npm run test:e2e`. Unit tests
  (`npm test`) remain Playwright-free via the vitest `e2e/` exclude.
- **GitHub Actions CI** (`.github/workflows/ci.yml`). Runs on push + PR to
  `main`: `npm ci` → unit tests → build (typecheck + bundle + PWA) →
  Playwright e2e. Uploads the Playwright report as an artifact on failure.
  README shows a status badge.
- **Per-game notes.** Each game gets an optional free-text note (ball, lane
  move, what worked). Edited in a collapsible field on the active session
  screen, saved on blur; shown under the game in History. New `notes?` field
  on `Game` — non-indexed, so no Dexie migration (see DATA_MODEL). Backup
  validation accepts it; old backups without it import unchanged.
- **Stats dashboard.** New "Stats" tab (5th) aggregating across all sessions:
  average score, high game, completed-game count, strike %, spare %, and a
  by-alley breakdown. Pure aggregation in `src/lib/stats.ts` (no schema
  change) over the existing session history; UI in `StatsView` + `Stats`.
  Metric definitions recorded in DECISIONS ADR-005. Bottom tab bar goes
  4→5 columns on mobile.

## Thermo-nuclear review (2026-05)

### Fixed

- 10th-frame strike + shot 2 saved no longer marks the game complete and
  silently blocks the required third shot. Mid-game reload now resumes the
  correct shot (regression test: `frameController.test.ts` "hydrates a
  partially-filled 10th frame requiring shot 3"). See ADR-001.
- Double-tapping **Add game** no longer creates two games with the same
  `game_number`. The read-then-add is wrapped in a Dexie `rw` transaction
  and the button is disabled while in-flight.
- Saving a frame no longer clears the status message or resets local scorer
  state. `ActiveGameScorer` keys its hydrate effect on `gameKey` only.
- All-gutter games (`final_score === 0`) can now advance to the next game.
- Backup import will not overwrite an unrelated local row when ids happen to
  collide. Merge now matches by content key (date + alley_name for sessions,
  session_id + game_number for games, game_id + frame_number for frames). See
  [DECISIONS.md ADR-003](./DECISIONS.md#adr-003--backup-import-merges-by-content-key-never-by-id).
- Backup validation now bounds `game_number <= 99` and `final_score in [0, 300]`.

### Changed (UI)

- Mobile-first redesign across all views; no horizontal page overflow at
  390×844. See [DECISIONS.md ADR-004](./DECISIONS.md#adr-004--mobile-first-at-iphone-390x844).
- Bottom tab-bar navigation on mobile (icon + label), top bar on `sm+`.
- Scorecard renders as a 5×2 grid of compact frame chips on `<sm`; falls back
  to the traditional 10-cell row on `sm+`.
- Pin grid drops the legend; "click pin to knock it down" is the model.
  Standing = outlined white, down = filled felt.
- `SessionForm` collapses oil pattern + notes behind a `<details>` disclosure.
- `ActiveGameScorer` no longer accepts six display props. Single `mode` prop.
- `ActiveSessionView` header compacts to back arrow + alley name + Add game.
- `BackupRestoreView` collapses to one card with two buttons + drop zone.
- `DashboardView` drops the marketing hero. Single H1 + form.
- `SessionHistory` becomes a clickable card list with inline score chips.

### Changed (internals)

- Pin helpers (`ALL_PINS`, `knockedDownCount`, `uniquePins`,
  `pinsClearedBetween`) moved to `src/lib/pins.ts`. `scoring.ts` and
  `scoreDisplay.ts` no longer carry their own slightly-divergent copies.
- Repository return types tightened to `Promise<number>`. `SaveFrameInput`
  collapsed to `Omit<Frame, "game_id">`.
- tsconfig now enforces `noUnusedLocals`, `noUnusedParameters`,
  `noFallthroughCasesInSwitch`.

### Added

- `docs/` folder with ARCHITECTURE, DATA_MODEL, DECISIONS, CHANGELOG, ROADMAP.
- Tests: 10th-frame strike chain (shot 3), 10th-frame hydrate-partial,
  10th-frame hydrate-complete, content-matched import merge,
  scorecard mobile-width regression. 21 → 26 tests.

### Removed

- `bowling-spec.md` — content split into `docs/ARCHITECTURE.md` and
  `docs/ROADMAP.md`.
- Unused `lane.700` and `lane.900` Tailwind shades.
- Duplicate `overflow-x-hidden` on `<main>` (kept on `html`/`body` only).

---

## [0.1.0] — Phase 1–4 foundation (2026-05)

- **Phase 1 — Project Scaffolding & Dexie DB Setup.** Vite + React + TS +
  Tailwind + Dexie. Repository helpers, scoring helpers, unit tests.
- **Phase 2 — Interactive 10-Pin Input & Scoring Engine.** `PinGrid` triangle,
  frame controller state machine, traditional scorecard with X / `/` symbols
  and rolling totals.
- **Phase 3 — Session Management & Entry UI.** Dashboard with start-session
  form, active session view, sequential game creation, session history.
- **Phase 4 — Backup, Restore & Data Safety.** JSON export with download,
  import-from-file with validation, merge with the local DB.
