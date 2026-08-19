# Bowling Companion, agent guide

Offline-first PWA bowling score keeper. React 18 + Vite + TypeScript + Tailwind,
Dexie/IndexedDB, zero backend. Push or merge to `main` and Vercel's Git
integration deploys prod.

## Read the routed doc before exploring source

Docs in `docs/` are canonical and maintained. They point at code and never copy
it: types, schema and file structure are read from `src/`, and the docs carry
the reasoning and invariants the code cannot express. So there is no duplicated
shape to drift, by design.

## Task to source map (read only what the task needs)

| Doing | Read |
|---|---|
| Change schema or types | `src/types/bowling.ts` + `src/db/bowlingDb.ts` (canonical), then `docs/DATA_MODEL.md` for the invariants |
| Touch scoring | `src/lib/scoring.ts`, `src/lib/frameController.ts` and their tests; ADR-001, ADR-005, ADR-017 |
| Any UI work: screens, nav, controls, motion, copy | `docs/DESIGN-LANGUAGE.md`. It is the whole rule set, and ADR-040 is the why |
| Navigation, back, or routing | `src/lib/appNavigation.ts` + `appRoute.ts` + `useHistoryRoute.ts`; ADR-041 for why back goes through history |
| Add or restructure a module | `docs/ARCHITECTURE.md` for the import layering |
| Add balls to the catalog | `scripts/sync-catalog/pipeline/` (select, promote, images); ADR-043 for the trust rules, ADR-039 for the image position |
| Backup, import or merge | ADR-038 + `src/services/backupRepository.ts` |
| Pin input | ADR-006 (inverted input), ADR-001 |
| Viewport, rotation or scroll handling | `docs/VIEWPORT-BUG.md`, in full, before writing a line |
| Anything else | `docs/README.md` routes everything |

## Load-bearing files

`src/App.tsx` (shell) + `src/lib/appNavigation.ts` (the tab/session/overlay
state machine it renders) · `src/db/bowlingDb.ts`
(Dexie schema + versions) · `src/services/*Repository.ts` (all persistence) ·
`src/types/bowling.ts` (shared types) · `src/lib/scoring.ts` +
`frameController.ts` (scoring engine) · `src/components/PushScreen.tsx` +
`src/lib/useSheetDismiss.ts` (every screen and sheet transition).

## Commands

`npm run dev` · `npm run verify` (the full gate: vitest, then tsc + vite +
PWA build, then playwright). The parts are `npm test`, `npm run build`,
`npm run test:e2e`; ship only on a green `verify`. Deploy by merging to
`main`; the `deploy` skill is the manual fallback.

`verify` is the gate, not a formality: `.githooks/pre-push` runs it before any
push to `main`, because pushing to `main` *is* the deploy. Vercel builds it and
never reads CI, and a failing run on `main` files a `ci-failure` issue. `npm
install` wires the hook up.

Run it as its own command. Chaining `npm run verify | grep ... && git commit`
skips the commit whenever the grep exits non-zero, silently.

## Tests that bite

- Assert on the Intended line box inside `waitFor`. `LineInput` syncs its text
  from the prop in an effect, so the box fills a tick after the ball label.
  Asserting straight after the label passes locally and fails on CI.
- Run the whole suite before pushing, not the one file you touched. A race that
  only loses under load is invisible in an isolated run.

## House rules

- Changing **scoring**, the **data model**, or **import/merge** rules adds a new
  ADR to `docs/DECISIONS.md` (never edit an accepted one) and a `CHANGELOG.md`
  entry, in the same PR.
- UI work follows `docs/DESIGN-LANGUAGE.md` rather than inventing chrome.
- Never write an em dash, in code, comments, docs, copy or commits.
