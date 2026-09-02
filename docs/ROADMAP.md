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

### Dependency advisories

`npm audit` reports two high-severity advisories, `nanoid` and `pdfjs-dist`,
both with fixes available inside the current majors (`npm audit fix`). Neither
reaches a user: `pdfjs-dist` is used by the catalog seeding scripts and `nanoid`
is a build-time transitive. Worth taking with a full `verify` behind it.

### Effects that set state on mount

ESLint's `set-state-in-effect` flags 8 places and `refs` another 9. They are
deliberate today and both rules are warnings for that reason, but the pattern is
worth revisiting as one change rather than one file at a time.

---

## Lower impact / exploratory

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
