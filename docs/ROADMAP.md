# Roadmap

Future work that hasn't been built yet. Ranked by expected impact, not by
ease. Anything actually scheduled should also have an entry in CHANGELOG
under `[Unreleased]`.

---

## Shipped (2026-06)

These were the prior roadmap top items; see CHANGELOG `[Unreleased] — Roadmap
features` for detail.

- ✅ PWA install + offline service worker.
- ✅ Playwright smoke tests (scoring + backup round-trip).
- ✅ GitHub Actions CI (test + build + e2e).
- ✅ Per-game notes.
- ✅ Stats dashboard (avg, high, strike %, spare %, by-alley).
- ✅ Inverted pin input (start down, tap to leave standing).
- ✅ Slide-to-select on the pin deck.
- ✅ Editing previously-entered frames.

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

### Phase 5 — Lane visualization (deferred from the original spec)

Original spec proposed a lane-visualization view modeling bowler inputs:
stance board, release board, target arrows, breakpoint, pocket target.
Render lane boards, arrows, breakpoint, and intended path. Support simple
path presets: straight, inside-out, outside-in, hook. Save optional
visualization metadata to sessions or games in a later schema version.

Notes if it gets picked up:

- Keep v1 visualization **lightweight and independent from scorekeeping**.
  Two separate component trees.
- Likely needs `LaneVisualization.tsx` (component) + `LaneVisualizationView.tsx`
  (route). Lane geometry math lives in a new `src/lib/lane.ts` to stay testable.
- Per-shot annotation requires a new `Frame.shot_N_visualization?` field or
  a sibling table `frame_annotations`. Either way, ADR-005 before code.
- Visual checkpoint at 390×844 before merge, per ADR-004.

---

## Won't do (for now)

- **Server-backed multi-device sync.** The whole product premise is offline-
  first single-device. Cross-device migration is solved by exporting a JSON
  backup and importing it on the other device (ADR-003).
- **User accounts / login.** No backend, so nothing to authenticate against.
- **League/tournament scoring rules** (handicap, brackets, etc.). Out of
  scope for "personal bowling log".
