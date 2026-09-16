# Data model

**Canonical source of truth. Read these for the current field-level shape:**

- Types → `src/types/bowling.ts`
- Dexie schema, version, and migrations → `src/db/bowlingDb.ts`

This doc deliberately does **not** restate those (a copy drifts, and did). It
records the invariants and the reasoning the code can't carry on its own.

## Standing-pins convention (ADR-001)

A frame stores the **pins LEFT STANDING** after each shot, not the pins
knocked down. Strikes are encoded as an empty standing set (no pins remaining),
spares as a non-empty first-shot set plus an empty second-shot set.

Rationale:
- A bowler enters input by tapping the pins still up. Storing what the user
  sees avoids translation bugs.
- Counting knocked-down pins is `10 - uniquePins(standing).length`, a single
  line in `lib/pins.ts`.
- A 10th-frame third shot needs to know what was racked before it. Standing
  arrays carry that information directly.

Frame-level `is_strike` / `is_spare` are **derived**, not authoritative; backup
normalization re-derives them on import so a hand-edited JSON cannot lie
(ADR-078).

A **fresh-rack** ball is ball 1, or a ball whose predecessor left nothing
standing. It is never "ten pins were available": a gutter or a foul leaves ten
available and the ball after it is a spare attempt. One function answers it,
`lib/lanes.isFreshRackShot`, and the scorer, the stats and the seeding rules all
read that one (ADR-088).

A **foul** (`Shot.foul`, ADR-089) carries the deck exactly as it found it, so it
is worth zero pinfall by the convention above and needs no scoring rule of its
own. The flag only changes what the card draws: F rather than the dash. It is
absent on every shot recorded before the flag existed, which reads as "not a
foul".

## When a Dexie version bump is needed

Adding a **non-indexed** field needs **no** version bump: IndexedDB stores
arbitrary object shapes; only the index string in `bowlingDb.ts` is the
versioned schema. A version bump + migration is required only when an index is
added, removed, or changed. The compound index `[game_id+frame_number]` exists
to support upsert-by-frame during score entry without scanning the table.

Every migration is guarded on **shape, not version** (`Array.isArray(frame.shots)`,
`Array.isArray(game.lanes)`), so a row written by a newer build and reopened by
an older one is left alone rather than migrated twice. `src/db/migrations.test.ts`
opens a real v1 database, writes rows in the shape v1 actually stored, and lets
the app's own Dexie declaration upgrade it: this is the one failure mode with no
recovery, since there is no server holding a second copy.

## A ball's layout (ADR-099)

`Ball.layout_spec` stores the dual angle three plus the ball's own core geometry
(`symmetric`, `pinToCore`), and never the VLS distances: those are a pure
function of the stored numbers (`toVls` in `lib/ballLayout.ts`), so storing them
too would be storing one fact twice. `spec.system` pins one ball to a notation;
unset means the app-wide `layout_system` setting, which in turn defaults to dual
angle.

`Ball.layout`, the free text the arsenal used to take, is still read and never
written. It is not parsed into numbers, because the text says nothing about the
core type or the pin-to-PSA distance the conversion needs, and entering a real
layout is what retires it.

## An oil pattern (ADR-101)

`OilPattern.passes` is the pattern sheet's load table and the whole pattern. The
distance, the volume and the ratio are derived from it (`lib/oilPattern.ts`) and
never stored, so they cannot drift from the table they describe.

Pass boards are absolute, counted from the left edge, 1 to 39. A sheet counts in
from each gutter, so "2L to 2R" is `left_board: 2, right_board: 38`. The app's
own board space is handed, so the mirror belongs at the drawing edge and nowhere
else.

Two rows of a real sheet look broken and are not: a reverse pass ends before it
starts, and a buffer pass carries zero loads. The second is why the pattern
distance is the furthest a pass travels rather than the furthest it oils.
`lib/oilPattern.fixture.ts` holds Kegel's Chromium 6742 so the derivations stay
checked against a sheet rather than against themselves.

`passes` is optional. Every pattern saved before ADR-101 has none, and a pattern
that is only a name is still a label worth having on a session.

## Scoring rules summary

Implemented in `lib/scoring.ts`. The full reference is the test file
`lib/scoring.test.ts`.

- Open frame = sum of shot 1 + shot 2 pinfall.
- Spare = 10 + next shot's pinfall.
- Strike (frames 1–9) = 10 + next two shots' pinfall.
- Frame 10 may have up to three shots; a third shot is required iff shot 1 was
  a strike OR shot 1 + shot 2 cleared all 10. Score is the literal sum of the
  three shots' pinfall.
- Rolling totals stay `null` until all bonus shots needed are available.
- A foul scores as the zero its standing pins already say it is.

`final_score` on a `Game` row is written only when
`calculateGameScore(frames).isComplete === true`. Until then, callers compute
the running total themselves.

## Field naming

DB fields and TS interfaces use `snake_case` to stay wire-compatible with
backups and any future export targets. UI-only state uses `camelCase`. See
ADR-002 in [DECISIONS.md](./DECISIONS.md).
