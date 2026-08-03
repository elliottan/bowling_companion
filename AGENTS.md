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
| Add or restructure a module | `docs/ARCHITECTURE.md` for the import layering |
| Backup, import or merge | ADR-038 + `src/services/backupRepository.ts` |
| Pin input | ADR-006 (inverted input), ADR-001 |
| Viewport, rotation or scroll handling | `docs/VIEWPORT-BUG.md`, in full, before writing a line |
| Anything else | `docs/README.md` routes everything |

## Load-bearing files

`src/App.tsx` (shell, tab routing, overlay stack) · `src/db/bowlingDb.ts`
(Dexie schema + versions) · `src/services/*Repository.ts` (all persistence) ·
`src/types/bowling.ts` (shared types) · `src/lib/scoring.ts` +
`frameController.ts` (scoring engine) · `src/components/PushScreen.tsx` +
`src/lib/useSheetDismiss.ts` (every screen and sheet transition).

## Commands

`npm run dev` · `npm test` (vitest) · `npm run test:e2e` (playwright) ·
`npm run build` (tsc + vite + PWA). Deploy by merging to `main`; the `deploy`
skill is the manual fallback.

## House rules

- Changing **scoring**, the **data model**, or **import/merge** rules adds a new
  ADR to `docs/DECISIONS.md` (never edit an accepted one) and a `CHANGELOG.md`
  entry, in the same PR.
- UI work follows `docs/DESIGN-LANGUAGE.md` rather than inventing chrome.
- Never write an em dash, in code, comments, docs, copy or commits.
