# Roadmap

Work that has not been built. Ranked by expected impact, not by ease. Shipped
work leaves this file and lives in `CHANGELOG.md`, so anything here is still
open.

---

## High impact

### Headpin Pro and the iOS app

A free app with one Pro unlock, sold only in the store apps, with no accounts and
no server (ADR-154). The phases, the free and Pro split, and how the catalog
refreshes offline are in [PRO-LAUNCH.md](./PRO-LAUNCH.md).

### The Live Activity, seen on a phone

ADR-221 puts the game on the Lock Screen and in the Dynamic Island. It was
written without Xcode or a phone, so the first job is to open the project, build
it, and look at the three layouts on a device. After that: follow the accent
palette the bowler chose (the widget has the felt palette only), end an activity
that a closed app left behind when the app next opens, and renumber a showing
game after a delete renumbers its session's games.

---

## Medium impact

### Leaves that are one shot

A 6 and a 6-10 are thrown at the same pin, and so are a 4 and a 4-7. Today each
is its own row to fill in and each asks separately. Borrowing a line covers it
by hand (ADR-054); grouping the leaves that share a shot would remove the ask.

Open question, and the reason this is not built: whether the grouping is a
property of the leave (derivable, since both are "the 6 pin is the target") or a
choice the bowler makes per pair. Deriving it is wrong for anyone who plays a
6-10 differently to a 6.

### A first language

The groundwork is in (ADR-220, [I18N.md](./I18N.md)): a catalog, detection and
`Intl` formatting, with about 400 strings still to mark and the guides, the
legal pages and the landing page still English only. Japanese and Korean were
the languages in mind. What is open is the conversion, the translation, and
the decision on right-to-left, which the layout does not support.

### Android follows the system font size

The iPhone app reads Dynamic Type and tells the page (ADR-219). Android has no
equivalent yet: the Capacitor web view's `WebSettings.textZoom` may or may not
follow `Configuration.fontScale` on a given device, and it was not checked on
one. Test the Text size setting and the system font size on a real phone; if
the web view does not follow, set `textZoom` from `fontScale` in
`MainActivity` (care: it would stack with the Text size setting, so write
`--os-text-scale` from the page instead and leave `textZoom` at 100).

### Effects that set state on mount

ESLint reports 22 warnings and no errors: `set-state-in-effect` 10, `refs` 4,
`react-refresh/only-export-components` 8. The first two are deliberate today and
are warnings for that reason, but the pattern is worth revisiting as one change
rather than one file at a time. The third is the cost of a few modules that
export a constant beside a component; it costs a hot reload, never a build.

### Majors this pass did not take

React 19, Tailwind 4 and Vite 8 all have majors out. Nothing here needs them,
and a launch is the wrong week to take three of them at once. `npm audit` is
clean inside the current majors as of September 2026.

### A Content Security Policy

`vercel.json` carries nosniff, a referrer policy, a permissions policy and HSTS,
but no CSP. All three HTML shells run an inline theme script, which a CSP would
need nonces for, and a nonce needs a rendering step this static site does not
have. The alternatives are hashing the three scripts (brittle: any edit to them
breaks the page silently) or moving them to files (a flash of the wrong theme on
every cold load, which is the bug they exist to prevent).

### One card shape for the two nudges

`NextSteps` and `FeedbackPrompt` draw the same card, and draw it twice. Neither
is wrong today, but a third nudge would be a third copy, and that is the point
at which the shape belongs in `ui/`.

---

## Lower impact / exploratory

### A WebKit page that occasionally never finishes loading

Late in a full run, one WebKit test's first `page.goto` hangs waiting for
`load` and never returns: it lands on the 51st of 52 tests, survived raising
the per-test budget to 60s, and does not reproduce in any smaller subset,
including the two specs on either side of it. It looks like accumulation in the
single long-lived WebKit process rather than anything the app does, which is
why the retry is set to 1 everywhere rather than the spec being changed. Worth
returning to with a `--repeat-each` run and a browser trace.

### An end-to-end test of a real service worker takeover

`swUpdate` is covered by unit tests (applies when safe, holds while unsafe, once
per page, the foreground check, the stale-shell error names), but the last mile,
a real worker activating over a real page, is not. Playwright would need a
second built copy of the app served by `vite preview`, deployed mid-run, which
the current single-`webServer` config cannot express. Until then it is the
manual check in `docs/DEPLOYMENT.md`.

### The session sheet is the last sheet off `FormSheet`

`SessionLanePanel` has its own shell: a sheet with a tab track and swipeable
panes inside it, which rises only as far as the scorer's game chips so the
session header stays in view above it, and which therefore carries no close of
its own. Its body is a scroll container of its own, which `FormSheet` also wants
to own, and `FormSheet` always reaches the top, so porting it is a layout
decision rather than a mechanical swap.

### The lane visualizer paints its own dark chrome

`LaneVisualizer` uses `slate-*` and `white/*` directly rather than theme tokens.
That is deliberate, the lane is the same wood in a dark room as a light one, but
it is currently undocumented as an exception in the way `PinGrid`'s wood now is.

---

## Won't do (for now)

- **Server-backed multi-device sync.** The whole product premise is offline-
  first single-device. Cross-device migration is solved by exporting a JSON
  backup and importing it on the other device (ADR-038).
- **User accounts / login.** No backend, so nothing to authenticate against.
- **League/tournament scoring rules** (handicap, brackets, etc.). Out of
  scope for "personal bowling log".
- **Per-ball spare lines.** A leave's strike-ball answer is a move off that
  ball's own line, not a second set of boards, so one move per leave already
  covers every strike ball in the bag (ADR-053).
- **A "finish session" action.** A session ends by being left, which is what
  happens on a lane: you stop bowling and go home. An explicit finish would add
  a state the app then has to keep honest against a bowler who adds a game an
  hour later.
- **A virtualized arsenal.** The catalog is 250 rows and is windowed; an
  arsenal is a dozen balls, and windowing a dozen rows costs more than it saves.
