# Roadmap

Work that has not been built. Ranked by expected impact, not by ease. Shipped
work leaves this file and lives in `CHANGELOG.md`, so anything here is still
open.

---

## High impact

Nothing open.

---

## Medium impact

### Toolchain majors

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
