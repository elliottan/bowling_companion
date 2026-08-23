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

### The spare line editor is the last form off the shared shell

`SpareLineFormDialog` still carries its own header and a footer row of Save /
Cancel / Delete, where every other form now uses `ui/FormSheet` and puts the
commit in the bar (DESIGN-LANGUAGE §1a). It has a third action and a nested
visualizer, so it needs a decision about where Delete lives rather than a
mechanical port.

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
