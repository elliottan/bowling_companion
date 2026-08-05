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
| **Dialog / sheet** | `ConfirmDialog`, `BallFormDialog`, the picker sheets | A *task* on top of the current screen, answerable and dismissable |

The distinction that matters: **a push is a place, a sheet is a task.** The
arsenal used to be a bottom sheet, which is why it never felt right: you
navigate *into* your arsenal, you do not perform it on top of something else.

`PushScreen` has two modes:

- `overlay` (default) floats above everything, tab bar included. For a screen
  reachable from several tabs (the arsenal, the catalog, a catalog ball).
- `inline` fills the current tab's scroll area, tab bar stays live. For a push
  *within* a tab (every Settings section).

Every push gets, without exception:

- a leading back control: the chevron alone, in a round glass button, labelled
  "Back" for screen readers. It used to name the screen underneath ("‹ Settings"),
  which read as a lie once the same screen could be pushed from several places:
  opened from the dashboard it named a tab the user had never navigated from;
- a centred title, one line, 17px semibold;
- at most **one** trailing action, always an `IconButton`;
- an edge-drag-back gesture and, in overlay mode, Escape + a focus trap
  (`useOverlay`).

## 1b. Glass chrome

The nav bar, the tab bar and the round controls sitting on them are glass: a
backdrop blur with the saturation lifted, a translucent fill and a hairline
edge (`.glass`, `.glass-control` in `src/index.css`). Content scrolls under
them and stays legible while still colouring what is on top.

This is an approximation of Apple's Liquid Glass, not the thing itself. That is
a native API (SwiftUI `.glassEffect`) doing real refraction on the GPU; the web
has backdrop-filter and nothing else, so the result is frosted rather than
liquid. Where backdrop-filter is unsupported the fill goes fully opaque, because
a 55% wash over moving content cannot be read.

Use `IconButton variant="glass"` for a control on that chrome, never a
hand-rolled circle. Anywhere else, glass is wrong: it is chrome, not decoration.

## 2. Controls

`Button`, `IconButton`, `Chip` are the only control primitives. Build from them
rather than hand-rolling a button. Both `Button` sizes and `IconButton` clear
the 44pt minimum tap target structurally, and `IconButton` requires `label`, so
an unnamed icon button cannot be constructed.

**Colour goes in a variant, never in `className`.** Tailwind resolves competing
utilities by stylesheet order, not attribute order, so a colour passed through
`className` silently loses to the variant's. Add a variant instead, which is
why `danger-ghost` exists alongside `danger`.

Destructive actions: the trigger sits with the thing it destroys (delete lives
*inside* the ball editor, not as a third icon on the list row), and always goes
through `ConfirmDialog`.

## 3. Surfaces and colour

Semantic tokens only: `surface`, `surface-sunken`, `surface-muted`, `ink`,
`ink-secondary`, `edge`, `accent`, `danger`, `success`, `warning`. Never a raw
Tailwind palette colour (`bg-slate-100`, `text-red-500`) in app code: the tokens
flip between light and dark, the palette does not. That exact bug shipped once:
a hardcoded `slate-100` behind every ball photo, a white card glowing in dark
mode.

Depth: `surface-sunken` is the page, `surface` is a card on it, `edge` draws the
boundary. Cards are `rounded-xl` (`rounded-2xl` for a full-width empty state),
one `shadow-sm`, no stacked shadows.

## 4. Lists and rows

A list row is a **single tap target** that opens the thing. Secondary actions
move into the destination, not onto the row; the exception is a drag handle,
which is a separate control because it is a different gesture. Rows carry a
48px leading thumbnail where one exists, title, and one truncated line of
secondary text.

## 5. Empty states

Every list that can be empty renders `EmptyState`: circular accent icon, title,
one sentence saying what lives here and why it is worth filling, and the primary
action. A bare grey "No X yet." sentence is not acceptable, because the empty
screen is where a user decides whether the feature is for them.

## 6. Forms

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
- **Centred dialogs** settle in and scale back out (`useSheetDismiss`,
  `align: "center"`).
- **Tab switches** enter from the side of the tab that was tapped, so the
  travel matches the reach.

Keyframes live in `src/index.css`; interactive drags own their own transform
and never animate against a keyframe. Everything is off under
`prefers-reduced-motion`, which each hook checks before deferring an unmount.

Every close path goes through the hook's `dismiss`, confirm buttons included
(`dismiss(onConfirm)`), or the exit is skipped for that path alone.

## 7b. The primary action

A screen with one dominant action puts it in a floating round button in the
bottom-trailing corner, above the tab bar, where the thumb already is. Anything
else that floats (the resume-session pill) shares that row to its left rather
than displacing it.

## 8. Copy

No em dashes, anywhere. A comma, a colon, or a full stop always works, and the
em dash is the clearest tell of text nobody wrote by hand.

Sentence case everywhere except the small uppercase group headings, which take
their classes from `GROUP_HEADING` (`src/components/ui/typography.ts`). Second
person, active voice, and say what happens rather than what the app does:
"Shots already recorded with this ball keep their scores" beats "Deletion is
permanent". No exclamation marks.
