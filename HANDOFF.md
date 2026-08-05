# Handoff

Written 2026-08-05. Delete this file once picked up; it is a note between
sessions, not documentation.

## State

`main` at `68d8da2`, clean, in sync with origin, **CI green**, deployed. Read
`docs/README.md` first: it routes by task and is accurate.

The work of the last two sessions: a code and test quality pass, then hash
routing so the system back button works, then two of three lint categories
cleared. Everything below is what is left, in the order I would do it.

## Do not repeat these

- **`npm run verify` is the gate** (lint, unit + coverage floors, build, e2e).
  `.githooks/pre-push` runs it before any push to `main`, because pushing to
  `main` *is* the deploy: Vercel builds it and never reads CI. `npm install`
  wires the hook up.
- A failing run on `main` files a `ci-failure` issue automatically. Issue #2 was
  one of mine; it is closed.
- **Do not chain `npm run verify | grep ... && git commit`.** The grep exits
  non-zero on some runs and silently skips the commit. Cost me a confusing
  round trip.
- Assertions on the Intended line box must be inside `waitFor`. `LineInput`
  syncs its text from the prop in an effect, so the box fills a tick after the
  ball label. That race passes locally and fails on CI. It is why `68d8da2`
  exists.

## Next, in order

### 1. Back does not close sheets and dialogs

Back closes pushed screens (ADR-041) but not the ball editor or the
start-session form, which is the inconsistency a user feels first now that back
works everywhere else. Attempted and reverted; the roadmap entry ("Back should
close an open sheet") has the measured evidence:

- Giving each open sheet a sentinel history entry works for a single dialog.
- It breaks when the history side effects live in `useSheetDismiss`'s
  register/unregister, because StrictMode double-invokes that effect and the
  phantom cleanup fires a real `history.back()`. Logged `PUSH sentinel, BACK(),
  PUSH sentinel` on open, and the nested case (ball editor over the pushed
  arsenal) then ate the arsenal's entry and walked out of the app.
- The shape that should work: **one reconciler owning a single sentinel**, keyed
  on "is anything open", not on each registration. Write the nested-case test
  first; the single-sheet case passes either way and will mislead you.

### 2. Lint category D: refs read during render (9 warnings)

`PushScreen` (5), `useSheetDismiss` (3), `useOverlay` (1). Zero impact today.
Only worth doing if React Compiler is adopted, which is the real decision. The
`dragging` flags move to state cheaply; `useOverlay`'s ref-latest idiom wants
`useEffectEvent`, still experimental, though assigning in an effect works here.

### 3. Lint category A leftovers (8 warnings)

Data loaded in a mount effect. Idiomatic without a query layer. `BallFormDialog`
still fetches catalog specs this way; the rest of the app moved to
`useLiveQuery` in `0910510`. Not worth forcing.

## Things I would not touch without a reason

- **854 em dashes** in comments and docs. UI copy is clean, which is what the
  house rule protects. Most live in `DECISIONS.md`, which forbids editing
  accepted ADRs.
- **Vercel deploy is not gated on CI.** The user explicitly dropped this. It
  needs their dashboard or a `VERCEL_TOKEN` secret.
- **`feat/same-ball-line-autofill`** is an old branch on origin, unrelated to
  this work, left alone.

## Where the recent work lives

| Area | Files | Why |
|---|---|---|
| Navigation state | `lib/appNavigation.ts` | Reducer; the shell renders it |
| Routing / back | `lib/appRoute.ts`, `lib/useHistoryRoute.ts` | ADR-041; back goes through history from every path |
| Shot seeding | `lib/shotSeeding.ts` | Carry-forward rules, ADR-017/029/035 |
| Seeding behaviour | `components/ActiveGameScorer.seeding.test.tsx` | Drives the rendered scorer, survives refactors |

The seeding extraction (`ad4d53d`) also fixed a real bug: resuming a game
mid-frame seeded the spare attempt before `getBalls()` resolved, so the spare
ball was never picked. Seeding now waits for both reads, and the test fails
without that guard (verified by removing it).
