# Roadmap

Work that has not been built. Ranked by expected impact, not by ease. Shipped
work leaves this file and lives in `CHANGELOG.md`, so anything here is still
open.

---

## High impact

Nothing open.

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

### The session sheet is the last full-screen surface off `FormSheet`

`SessionLanePanel` has its own shell: a full-height sheet with a tab track and
swipeable panes inside it. It now carries the close control §1b asks for, but
its body is a scroll container of its own, which `FormSheet` also wants to own,
so porting it is a layout decision rather than a mechanical swap.

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
