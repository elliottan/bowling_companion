# Design language

How the app is put together on screen. This doc holds the *rules and the why*;
the components that enforce them are the source of truth for the markup:
`src/components/PushScreen.tsx`, `src/components/ui/*`, and the token block in
`src/index.css`.

The target device is a phone held in one hand (ADR-004: 390×844). Everything
below follows from that: thumb-reachable controls, one job per screen, and no
chrome that a desktop would justify but a phone would not.

## 1. Navigation: three shapes, and only three

| Shape | What it is | Use it when |
|---|---|---|
| **Tab** | The five bottom-bar destinations | Top-level areas the user switches between |
| **Push** | `PushScreen`, sliding in from the trailing edge with a leading back control | Going *deeper*: a list to a detail, Settings to a section |
| **Dialog / sheet** | `ConfirmDialog` and `FormSheet` | A *task* on top of the current screen, answerable and dismissable. Which of the two: §1a |

The distinction that matters: **a push is a place, a sheet is a task.** The
arsenal used to be a bottom sheet, which is why it never felt right: you
navigate *into* your arsenal, you do not perform it on top of something else.

`PushScreen` has two modes:

- `overlay` (default) floats above everything, tab bar included. For a screen
  reachable from several tabs (the arsenal, the catalog, a catalog ball).
- `inline` fills the current tab's scroll area, tab bar stays live. For a push
  *within* a tab (every Settings section).

Every push gets, without exception:

- a leading back control: the chevron alone, in a round button, labeled
  "Back" for screen readers. It used to name the screen underneath ("‹ Settings"),
  which read as a lie once the same screen could be pushed from several places:
  opened from the dashboard it named a tab the user had never navigated from;
- a centered title, one line, 17px semibold;
- at most **one** trailing action, always an `IconButton`;
- in overlay mode, Escape + a focus trap (`useOverlay`).

Back out of a push with the chevron or with the platform's own back gesture
(Android's button, iOS's left-edge swipe). The app does not implement a
back-swipe of its own: competing with the platform's drew the screen underneath
twice (ADR-065).

## 1a. Sheet or dialog: you type in a sheet, you answer a dialog

Both are tasks on top of the current screen, and the split between them is the
keyboard, not the size of the job:

- **`FormSheet`** (`src/components/ui/FormSheet.tsx`) rises from the bottom
  edge, drags back through it, and carries the close leading and the commit
  trailing in its own bar. Everything you enter data into: the session form, the
  ball editor, a spare line, the lane pair, adding a catalog ball. Bottom rather
  than centered because that is the edge the keyboard arrives at; a centered
  dialog holding a focused field gets shoved half off-screen on iOS.
- **`ConfirmDialog`** settles in the middle and scales back out. Questions with
  buttons, including a confirm that has to be earned by typing a phrase, because
  typing `ERASE` is answering rather than entering.
- **`AnchoredMenu`** (`src/components/ui/AnchoredMenu.tsx`) is the long-press
  menu on a row or a chip. Its scrim is transparent, not dimmed: a menu is
  anchored to the thing it acts on, and dimming would hide it.

Before this rule the app had it both ways: the ball editor was a sheet and the
session editor a centered dialog, though they are the same object.

## 1b. Round controls on chrome

A control that sits on a nav bar or a sheet header is round and icon-only:
the back chevron, the trailing action, a sheet's close and its confirm. The
word is dropped, not the meaning, so `IconButton`'s required `label` carries it
("Back", "Save", "Add"). Use `IconButton variant="round"`, never a hand-rolled
circle.

Frosted glass chrome (a translucent backdrop-filter bar) was tried on these and
removed: it approximated Apple's Liquid Glass without the refraction that makes
that effect work, and read as haze over the content rather than as a surface.
Chrome is opaque.

## 2. Controls

`Button`, `IconButton`, `Chip`, `SegmentedControl` and `Fab` are the only
control primitives. Build from them rather than hand-rolling a button. Both `Button` sizes and `IconButton` clear
the 44pt minimum tap target structurally, and `IconButton` requires `label`, so
an unnamed icon button cannot be constructed.

The 44pt floor is a *hit* target, not a box. `Chip` and `IconButton compact`
both draw smaller than that and carry the target on an invisible `::after`,
which is how a control rides in a dense row without setting the row's height.
The expansion must not reach over a neighbouring control: `Chip` grows
vertically only, and `compact` grows upward only, because it sits in a heading
row with content directly beneath it.

`SegmentedControl` (`src/components/ui/SegmentedControl.tsx`) is one track with
N segments and exactly one selected: a theme, a handedness. A row of `Chip`s is
not that, and reads as one because chips sit apart with gaps between them and
any number of them can be on. The theme picker was three chips before, and the
shared track is what says "pick one" before a single label is read.

**Press feedback is `active:`, never `hover:` alone.** `hover:` is compiled
behind `@media (hover: hover)` (`future.hoverOnlyWhenSupported` in
`tailwind.config.js`), so it does nothing on a phone, which is the target
device. It is set that way because iOS *latches* `:hover` on tap and clears it
only when something else is tapped: the session header and the series score
both kept their hover background after a tap and read as buttons stuck down,
and opening a sheet over one did not clear it either. `active:` releases on
pointerup and cannot latch.

**Color goes in a variant, never in `className`.** Tailwind resolves competing
utilities by stylesheet order, not attribute order, so a color passed through
`className` silently loses to the variant's. Add a variant instead, which is
why `danger-ghost` exists alongside `danger`.

Destructive actions: the trigger sits with the thing it destroys (delete lives
*inside* the ball editor, not as a third icon on the list row), and always goes
through `ConfirmDialog`.

**Icons.** Lucide, at the size the control asks for, for anything universal: a
close, a share, a chevron, a trash. A *bowling* idea gets one of the app's own
glyphs from `src/components/icons/` instead, because the nearest Lucide
neighbour says something else: `Waves` for an oil pattern is water, `Crosshair`
for a spare line is a scope. They are drawn on Lucide's grid at stroke 2 with
round caps and take the same props, so every consumer accepts either.

## 3. Surfaces and color

Semantic tokens only: `surface`, `surface-sunken`, `surface-muted`, `ink`,
`ink-secondary`, `edge`, `accent`, `danger`, `success`, `warning`. Never a raw
Tailwind palette color (`bg-slate-100`, `text-red-500`) in app code: the tokens
flip between light and dark, the palette does not. That exact bug shipped once:
a hardcoded `slate-100` behind every ball photo, a white card glowing in dark
mode.

Depth: `surface-sunken` is the page, `surface` is a card on it, `edge` draws the
boundary. Cards are `rounded-xl` (`rounded-2xl` for a full-width empty state),
one `shadow-sm`, no stacked shadows.

**The one exception is the lane.** A pin deck is maple and a knocked-down pin is
tan, in a dark room as much as a light one, and a deck that went slate at night
would stop being a deck. `PinGrid` paints those colours literally and exports
`WOOD_PIN_DOWN` so the pocket toggle sitting on the same surface matches it
rather than repeating the hex. `LaneVisualizer` is the same argument at full
screen. Nothing else may reach for a raw palette colour, and anything that
does has to earn it the way these two did: by depicting a physical object whose
colour is not the app's to choose.

## 4. Lists and rows

Rows that belong together are **one card with hairline dividers**
(`src/components/ui/ListGroup.tsx`), not a stack of separate cards with gaps.
The gapped stack is what Settings, the lane notes and the oil patterns all had,
and five cards in a column read as five unrelated objects that happen to be
adjacent; one card says they are one list, and the `GROUP_HEADING` above it says
what they have in common. The divider is drawn by the row below as an inset
pseudo-element (`LIST_DIVIDER*`), starting where the text starts, because a
full-bleed rule under a leading icon cuts the icon column in half.

`ListRow` is the row: leading icon tile, label, one truncated line of secondary
text, and a trailing chevron. A row that *leaves the app* swaps the chevron for
an outward arrow, since the chevron means "deeper into this app" everywhere
else.

A list row is a **single tap target** that opens the thing. Secondary actions
move into the destination, not onto the row; the exception is a drag handle,
which is a separate control because it is a different gesture, and a link out
of the app, which is a different destination rather than an action on the row.
Rows carry a 48px leading thumbnail where one exists, title, and one truncated
line of secondary text.

## 4b. Numbers on screen

A number carries its own definition or it does not go on screen. The group
heading above a stat is a button that opens what it counts (ADR-040), which is
cheaper than printing a sentence nobody reads twice.

Two rules learned the hard way:

- **An annotation that exists to explain why the number beside it looks wrong
  means the number is wrong for that card.** The leaves card once read `0/0`
  with a muted `+1` next to it, for a leave the 10th frame's last ball made and
  no ball could follow. The `+1` was repair work. The fix was to take those
  leaves off a card about converting, not to caption them (ADR-051).
- **Frequency and rate do not share a cell.** What a ball leaves is on the ball;
  whether you convert it is on the leaves card. Putting both in one number
  forces a denominator that is right for neither.

## 5. Empty states

Every list that can be empty renders `EmptyState`: circular accent icon, title,
one sentence saying what lives here and why it is worth filling, and the primary
action. A bare gray "No X yet." sentence is not acceptable, because the empty
screen is where a user decides whether the feature is for them.

A screen whose *whole* content is empty leads with the empty state rather than
burying it under chrome. Home does this on a device with no sessions. What it
does not do is remove the chrome: the shortcut grid moves below the empty state
and stays reachable, because it is the only way to several screens (ADR-069).

## 6. Forms

Field chrome comes from `src/components/ui/field.ts` (`FIELD`, `FIELD_SELECT`,
`FIELD_TEXTAREA`, `FIELD_LABEL`, `FIELD_MICRO_LABEL`), never from a class string
spelled out in the form. Seven forms had spelled it out and five of those copies
had lost `bg-surface`, so those inputs fell back to the browser's own control
color: a warm gray block in a blue-slate app. That is §3's hardcoded-`slate-100`
bug one level down, and one shared string is what stops it recurring.

A field label is sentence case and sits above its field. It is *not* a
`GROUP_HEADING`: the small uppercase style names a group of things, and reusing
it on labels shouts every field name. The dense score panels use
`FIELD_MICRO_LABEL`, a smaller version of the same band. They used to park the
label on the field's own top border as an outline notch, which only reads while
the label is short relative to the box: STANCE and TARGET are nearly as wide as
the numeric fields they name, so the notch ate the whole top edge.

Labels above fields, 44px field height, optional fields marked `(optional)`
rather than required ones marked `*` where possible. A form in a dialog puts
Cancel (an X) leading and the primary action trailing in the dialog's own bar,
so the commit is always in the same place. The single most valuable field goes
first. In the ball editor that is the catalog link, because linking fills in
five other fields for free.

## 7. Motion

Motion is symmetric: anything that animates in animates out. Nothing may
disappear on a frame, because an instant unmount reads as a glitch rather than
as the thing leaving.

- **Push screens** slide in from the trailing edge and back out to it
  (`PushScreen`, which defers the unmount until the exit finishes).
- **Sheets** rise from the bottom edge and fall back through it, and can be
  dragged down to dismiss (`useSheetDismiss`, `align: "bottom"`).
- **Centered dialogs** settle in and scale back out (`useSheetDismiss`,
  `align: "center"`).
- **Tab switches** enter from the side of the tab that was tapped, so the
  travel matches the reach.
- **Collapsing tab headers** flip fully away and fully back, never parking half
  way (`useHeaderCollapse`, `CollapsingHeader`). The scroll says when, the
  header says how: it earns the flip over a threshold of committed travel, then
  transitions its own height. ADR-077.

Keyframes live in `src/index.css`; interactive drags own their own transform
and never animate against a keyframe. Everything is off under
`prefers-reduced-motion`, which each hook checks before deferring an unmount.

Every overlay goes through `useSheetDismiss`. There is exactly one motion
implementation, and no overlay is allowed to hand-roll a second: five once did,
and four of those had no exit at all, so they blinked out of existence while the
sheet beside them slid. `dragHandlers` ignore a press that landed on a button,
so a sheet can make its whole header the drag surface without swallowing the
controls in it.

Every close path goes through the hook's `dismiss`, confirm buttons included
(`dismiss(onConfirm)`), or the exit is skipped for that path alone.

An overlay's outermost element takes `rootStyle` from the hook, which stops it
taking taps while it leaves. An overlay on its way out is a picture of itself:
without this it went on swallowing every tap for the length of the exit, so the
first tap after closing a sheet did nothing at all.

## 7b. The primary action

A **tab** with one dominant action puts it in `ui/Fab.tsx`: a floating round
button in the bottom-trailing corner, above the tab bar, where the thumb already
is. Anything else that floats (the resume-session pill) shares that row to its
left rather than displacing it. Home and Spare lines both add through it.

A **pushed screen** does not: it has a nav bar, and §1 already gives that at
most one trailing action. The arsenal adds from there.

## 8. Copy

No em dashes, anywhere. A comma, a colon, or a full stop always works, and the
em dash is the clearest tell of text nobody wrote by hand.
`src/test/copy.test.ts` fails the build on one, and on the other words this
section settles.

**One word per thing.** A trip to the alley is a *session*, never a night. A
place you bowl is an *alley*, never a location or a house ("house shot" and
"house ball" are bowling phrases and stay). The two boards you set are *stance*
and *target*, on a spare line as much as on a shot. Ellipses are the character
`…`, not three dots. No contractions.

**A button that commits says what it commits.** "Next" on the scorer stays the
word "Next", and what it is about to record is named under it in subtext:
"Strike" or "Hit 7" on a fresh rack, "Spare" or "Hit 0" at a leave. The word
holds still under the thumb, which the label itself could not do while it
changed on every pin tap, and the outcome is still on screen before the ball is
committed. Two adjacent buttons never carry the same word.

**Changing something already recorded asks first.** Editing a recorded shot or
undoing the last ball raises a `ConfirmDialog` naming what changes. A recorded
shot asks once per visit to it, not once per tap: the bowler correcting a pin
is answering a question they have already answered. Entering a new shot never
asks, because choosing the pins left standing is entering it, not changing it.

Sentence case everywhere except the small uppercase group headings, which take
their classes from `GROUP_HEADING` (`src/components/ui/typography.ts`). Second
person, active voice, and say what happens rather than what the app does:
"Shots already recorded with this ball keep their scores" beats "Deletion is
permanent". No exclamation marks.
