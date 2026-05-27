# Roadmap

Future work that hasn't been built yet. Ranked by expected impact, not by
ease. Anything actually scheduled should also have an entry in CHANGELOG
under `[Unreleased]`.

---

## High impact

### Playwright smoke test for the core flow

End-to-end coverage of: start session → score frames 1-9 with mixed
strike/spare/open → 10th-frame strike + bonus shots → export backup → wipe
local DB → import → confirm history intact. Lives in `tests/e2e/`. CI gate.

### GitHub Action: lint + test + build on PR

`npm ci && npm test && npm run build` on every PR. No lint config exists
yet; either add ESLint with the standard React + TS preset or rely on `tsc`
+ `noUnusedLocals` already configured.

### PWA install + service worker

Manifest, icons, offline service worker. Lets a user add the app to their
home screen at the alley and run it with no network. The data model is
already offline-only, so this is purely a delivery-channel upgrade.

---

## Medium impact

### Per-game notes

The `Game` row only carries `lane_number` and `final_score` today. Bowlers
often want a short text note per game (which ball, lane condition shift,
etc.). Single field, no migration risk, but updates DATA_MODEL.md.

### Score statistics dashboard

New view that aggregates across sessions: average game, high game, strike
percentage, spare-conversion percentage, splits left, by-alley breakdowns.
Pure computation over existing data; no schema change.

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
