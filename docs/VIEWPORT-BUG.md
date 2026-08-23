# The iOS standalone rotation-height bug

**PAINTING: RESOLVED, 2026-07-21.** The fix is strategy A: the app shell is
`position: fixed; inset: 0` and nothing measures the viewport. Confirmed on a
real installed PWA after five attempts. Everything below is kept as the record
of what failed and why, so it does not get re-tried.

**HIT-TESTING: RESOLVED, 2026-07-21.** iOS left the document scrolled 62px
after a rotation round-trip, displacing every touch target. Fixed by clamping
the document scroll back to zero. See "Round 2" at the bottom.

**If you are about to add JS viewport measurement back into `App.tsx`, read
this whole file first.** Four separate measurement schemes have already been
shipped and rejected on the device.

## Symptom

On iPhone, **installed PWA only** (`display: standalone` from the Home Screen,
NOT reproducible in Safari as a normal tab):

1. Rotate portrait → landscape → portrait.
2. The app shell ends up **shorter than the screen**. A blank white strip
   (body background, not `bg-lane-50`) appears below the bottom tab bar, and
   the whole UI sits pushed up.
3. It is **permanent**: no further event recovers it. Only a relaunch does.

A closely-related variant was also reported after focusing and dismissing a
text input (on-screen keyboard); see attempt 3.

## Why standalone-only matters

Standalone has no browser chrome, so there is no URL bar collapse/expand to
drive the viewport-resize machinery Safari exercises constantly. The working
theory is that iOS simply **does not re-run the resize/layout pass** for the
standalone webview on a rotation round-trip, leaving *every* JS-visible metric
(`innerHeight`, `documentElement.clientHeight`, `visualViewport.height`,
`100dvh`) reporting the pre-rotation value in agreement with each other. If
that theory holds, **no measurement strategy can work**: the fix has to stop
depending on a measured pixel height, or force iOS to relayout.

Unverified. Confirming it is worth more than another guess: a build that
renders its live metrics on screen would settle it.

## Current architecture (the thing under suspicion)

`src/App.tsx` sets a CSS custom property `--app-height` from JS on a set of
events, and the shell is `<div style={{ height: "var(--app-height, 100dvh)" }}>`
with `html, body { height: 100%; overflow: hidden }` in `src/index.css`.

## What has not worked

Each of these shipped to production and was rejected by manual testing on the
real device.

### 1. `100dvh` alone (original)

Shell sized purely in CSS. **Failed:** `dvh` resolves stale after the rotation
round-trip in standalone. This is what started the whole saga.

### 2. Poll `window.innerHeight` until stable

On `orientationchange`, poll every 100ms; stop after the value repeats for 3
ticks or 2s elapses. **Failed:** a stale reading is *perfectly stable*, so the
poll confidently latched the wrong (landscape) height and stopped. "Stopped
changing" is not evidence of "settled".

### 3. Read `visualViewport.height` instead of `innerHeight`

**Failed, and regressed the keyboard case.** `visualViewport.height` shrinks to
the keyboard-free strip when the on-screen keyboard opens, so the re-measure
scheduled after `focusout` landed mid-animation and pinned a keyboard-shrunk
height. Rotation was not fixed either.

Do not size the shell from `visualViewport.height`.

### 4. `documentElement.clientHeight` + orientation cross-check

Measure the layout viewport (keyboard-immune), and reject any sample whose
aspect ratio contradicts `matchMedia("(orientation: portrait)")`, so a stale
landscape box can no longer be latched while portrait. Poll the full window
with no early exit. Also measure on mount.

**Failed on rotation** (it did fix the keyboard variant). Strongly suggests
`matchMedia` orientation goes stale *in agreement with* the metrics in
standalone, i.e. the cross-check has nothing to catch, which is the evidence
behind the theory above.

## The five-way bake-off (attempt 5): how A was found

Testing one candidate per deploy was too slow when each round costs a deploy, a
reinstall and a rotation. So all five shipped in a single build behind a
runtime switch with a live metrics overlay, and were tested back to back on one
Home Screen install. **A passed. B, C, D and E all failed.**

| # | Strategy | Measures? | Result |
|---|---|---|---|
| **A** | Shell `position: fixed; inset: 0` | No | ✅ **PASS, this is the fix** |
| **B** | No sized shell; document flows, nav `position: fixed` | No | ❌ failed |
| **C** | Height from `window.screen` | Yes | ❌ failed |
| **D** | Keep `100dvh`, force a relayout on rotation | No | ❌ failed |
| **E** | `ResizeObserver` driving `--app-height` | Yes | ❌ failed |

### Why this result is informative

C and E failing alongside the four earlier attempts closes the door on
measurement: reading the layout viewport, the visual viewport, the screen, and
observing layout directly have now *all* been tried and all lost.

D failing says the stale value is not a missing-relayout problem: forcing the
reflow did not shake it loose.

The interesting pair is **A passing while B failed**. Both avoid measuring, so
"don't consume a viewport height" was not sufficient on its own. What separates
them is that A's box is resolved by the compositor against the live viewport
every paint, whereas B still depends on the document/`<html>` box being correct
and that box is exactly what iOS gets wrong. The lesson is narrower than
"avoid measuring": **anything downstream of the stale layout viewport is
poisoned, including pure-CSS percentage and flow layouts. Only `position: fixed`
escapes it.**

### The harness

Removed once A was confirmed (`viewportStrategy.ts`, `ViewportLab.tsx`, the
`[data-vp]` CSS block, and the strategy effect in `App.tsx`). Recoverable from
git history if another round is ever needed: the overlay reporting `gap`,
`client`, `innerHeight`, `visualVP`, `100dvh` and `screen` side by side is what
made a five-way comparison practical.

### Never tried (unnecessary now)

- `-webkit-fill-available`.
- Remount/re-key the shell after rotation.
- Locking orientation in the manifest (sidesteps rather than fixes).

## Testing notes

- **Must be tested as an installed PWA.** Safari-tab testing proves nothing:
  the bug does not reproduce there, so a green Safari result is not a pass.
- Desktop browser automation cannot reproduce it either; the preview pane
  resizes via CDP, which does not even fire `resize`.
- Reinstall from the Home Screen after each deploy, and confirm the service
  worker actually updated. A stale SW will happily serve the old build and
  look like a failed fix.

## Round 2: tap displacement (RESOLVED)

After `fixed inset-0` shipped, the blank strip is gone but interaction is still
wrong after a rotation round-trip: **you have to tap above an element to
activate it.** Painting and hit-testing disagree.

This is the same root cause wearing a different hat. The compositor honours the
live viewport for a `position: fixed` layer, which is why the paint is now
right, but hit-testing still resolves through the stale layout viewport, so
the touch coordinate space is shifted relative to the pixels.

### Measure before guessing

Nine fixes in, the pattern is clear: attempts that reasoned from a theory
failed, and the one that worked came from a build that tested candidates
side by side. So round 2 ships a probe (`ViewportProbe.tsx`) that reports the
displacement instead of inferring it.

On every tap it takes the element iOS delivered the event to, then walks
`document.elementFromPoint` outward from the tap coordinates until the two
agree. That distance is the displacement, in CSS px, signed:

- `hit dy: 0`: hit-testing is correct.
- `hit dy: -40`: the hit region sits 40px above where the element is painted.

It also reports `vvOffTop`, `vvPageTop`, `scrollY` and `docTop`, because a
non-zero visual-viewport offset or a stray document scroll is the most likely
mechanism and would show up directly in those numbers.

### The measurement that settled it

Four candidates shipped alongside the probe. Testing them back to back:

| Fix | `vvOffTop` | `scrollY` | `docTop` | Taps |
|---|---|---|---|---|
| `none` (control) | 62 | 62 | 62 | ❌ displaced |
| `kick` (force reflow) | 62 | 62 | 62 | ❌ displaced |
| `remount` (re-key shell) | 62 | 62 | 62 | ❌ displaced |
| `scroll` (reset offset) | **0** | **0** | **0** | ✅ **correct** |

Unambiguous, and it identifies the mechanism rather than just the remedy:
**iOS leaves the document scrolled by 62px**, roughly the safe-area top inset,
after a rotation round-trip in standalone. The `fixed` shell keeps painting
against the visual viewport, but taps resolve in layout space, so every target
sits displaced by exactly that offset until relaunch.

Reflowing and remounting both left the offset at 62 and both failed, which
confirms the offset *is* the bug rather than a side effect of one.

### The fix

Clamp the document scroll to zero (`src/lib/viewportScroll.ts` + the effect in
`App.tsx`). This app never legitimately scrolls the document: `html, body` are
`overflow: hidden`, the shell is `position: fixed`, and scrolling is confined to
`<main>`, so any non-zero offset is spurious by construction.

Bound to `scroll` as well as `orientationchange`, so it is self-healing rather
than rotation-specific: whatever knocks the document off zero, it returns.

**The one exception is the on-screen keyboard.** iOS scrolls the page to reveal
a focused field, and clamping that would hide what the user is typing into, so
the reset is skipped while a text field has focus. That exception is the whole
reason the logic lives in a tested pure function.

### A note on the probe's blind spot

`hit dy` read `ok` in every configuration, including the broken ones. The probe
compared `event.target` against `document.elementFromPoint`, and both resolve in
the *same* displaced coordinate space, so they agreed while both were wrong.

What actually caught it was the offset rows sitting next to the verdict. Worth
remembering: an instrument that can only compare two readings from the same
subsystem cannot detect that subsystem being shifted as a whole.
