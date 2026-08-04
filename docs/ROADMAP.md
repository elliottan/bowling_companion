# Roadmap

Work that has not been built. Ranked by expected impact, not by ease. Shipped
work leaves this file and lives in `CHANGELOG.md`, so anything here is still
open.

---

## High impact

Nothing open.

---

## Medium impact

### Back should close an open sheet

Back closes pushed screens (ADR-041) but not sheets and dialogs, so the ball
editor and the start-session form ignore it. Attempted 2026-08-04 and reverted.

Giving each open sheet a sentinel history entry to be eaten by the back that
closes it works for a single dialog (verified: open, back, dialog closes, route
untouched; and a self-close consumes its own sentinel so nothing is left
behind). It breaks once the side effects live in `useSheetDismiss`'s
register/unregister: StrictMode double-invokes that effect, and the phantom
cleanup runs a real `history.back()`. Measured in dev: opening a sheet logged
`PUSH sentinel, BACK(), PUSH sentinel`, and the nested case (ball editor over
the pushed arsenal) then ate the arsenal's entry instead of the sheet's and
walked out of the app.

The shape that should work: one reconciler owning a single sentinel, keyed on
"is anything open" rather than on each registration, which is what the reverted
branch was moving to when it was stopped. Needs a test for the nested case
specifically, since the single-sheet case passes either way.

`npm audit` reports seven dev-only advisories (two critical) whose only fixes
are majors: vite 8, vitest 3/4, sharp 0.35. Nothing reaches users, and vite 8
under `vite-plugin-pwa` needs its own verification pass.

### Effects that set state on mount

ESLint's `set-state-in-effect` flags 19 places (and `refs` another 9). They are
deliberate today and the rules are warnings for that reason, but the pattern is
worth revisiting as one change rather than one file at a time.

### Splits-left tracking

The stats dashboard could add common splits left / converted once the data
model captures which pins remained (it already does, via standing-pin arrays).

---

## Lower impact / exploratory

Nothing open.

---

## Won't do (for now)

- **Server-backed multi-device sync.** The whole product premise is offline-
  first single-device. Cross-device migration is solved by exporting a JSON
  backup and importing it on the other device (ADR-038).
- **User accounts / login.** No backend, so nothing to authenticate against.
- **League/tournament scoring rules** (handicap, brackets, etc.). Out of
  scope for "personal bowling log".
