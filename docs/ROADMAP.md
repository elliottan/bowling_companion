# Roadmap

Work that has not been built. Ranked by expected impact, not by ease. Shipped
work leaves this file and lives in `CHANGELOG.md`, so anything here is still
open.

---

## High impact

### Lint config (ESLint)

CI relies on `tsc` + `noUnusedLocals` today. A standard React + TS ESLint
preset would catch a11y and hooks-rules issues the type checker misses.

---

## Medium impact

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
