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
validation re-derives them on import so a hand-edited JSON can't lie.

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

`final_score` on a `Game` row is written only when
`calculateGameScore(frames).isComplete === true`. Until then, callers compute
the running total themselves.

## Field naming

DB fields and TS interfaces use `snake_case` to stay wire-compatible with
backups and any future export targets. UI-only state uses `camelCase`. See
ADR-002 in [DECISIONS.md](./DECISIONS.md).
