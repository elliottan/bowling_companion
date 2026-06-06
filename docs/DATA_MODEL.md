# Data model

Mirrors `src/types/bowling.ts` and `src/db/bowlingDb.ts`. Anytime you change
either, change this doc.

## TypeScript

```ts
type PinNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

interface Session {
  id?: number;
  date: string;            // YYYY-MM-DD
  alley_name: string;
  oil_pattern?: string;
  general_notes?: string;
}

interface Game {
  id?: number;
  session_id: number;
  game_number: number;     // 1..N, dense within a session
  lane_number?: string;    // free text; "12A", "12-13" both valid
  final_score?: number;    // 0..300, set once the 10th frame closes
  notes?: string;          // free text, per game; trimmed, absent when empty
}

interface Frame {
  id?: number;
  game_id: number;
  frame_number: number;    // 1..10
  shot_1_pins_standing: PinNumber[];
  shot_2_pins_standing?: PinNumber[];
  shot_3_pins_standing?: PinNumber[]; // 10th-frame bonus only
  is_strike: boolean;
  is_spare: boolean;
  shot_1_notes?: string;
  shot_2_notes?: string;
}
```

## Dexie schema

Database: `BowlingCompanionDB`, version 1.

```
sessions  ++id, date, alley_name
games     ++id, session_id, game_number, lane_number, final_score
frames    ++id, game_id, [game_id+frame_number], frame_number, is_strike, is_spare
```

The compound index `[game_id+frame_number]` exists to support upsert-by-frame
during score entry without scanning the whole table.

Adding a **non-indexed** field (e.g. `Game.notes`) needs no Dexie version bump
— stores hold arbitrary object shapes; only the index string above is the
versioned schema. A version bump + migration is required only when an index
is added, removed, or changed.

## Standing-pins convention (ADR-001)

A frame stores the **pins LEFT STANDING** after each shot — not the pins
knocked down. Strikes are encoded as `shot_1_pins_standing: []` (no pins
remaining), spares as `shot_1_pins_standing: [...some]` plus
`shot_2_pins_standing: []`.

Rationale:
- A bowler enters input by tapping the pins that are still up. Storing what
  the user sees avoids translation bugs.
- Counting knocked-down pins is `10 - uniquePins(standing).length`, a single
  line in `lib/pins.ts`.
- A 10th-frame third shot needs to know what was racked before it. Standing
  arrays carry that information directly.

## Scoring rules summary

Implemented in `lib/scoring.ts`. The full reference is the test file
`lib/scoring.test.ts`.

- Open frame = sum of shot 1 + shot 2 pinfall.
- Spare = 10 + next shot's pinfall.
- Strike (frames 1–9) = 10 + next two shots' pinfall.
- Frame 10 may have up to three shots; a third shot is required iff shot 1
  was a strike OR shot 1 + shot 2 cleared all 10. Score is the literal sum
  of the three shots' pinfall.
- Rolling totals stay `null` until all bonus shots needed are available.

`final_score` on a `Game` row is written only when `calculateGameScore(frames).isComplete === true`. Until then, callers compute the running total
themselves.

## Field naming

DB fields and TS interfaces use `snake_case` to keep wire-compatible with
backups and any future export targets. UI-only state uses `camelCase`. See
ADR-002 in [DECISIONS.md](./DECISIONS.md).
