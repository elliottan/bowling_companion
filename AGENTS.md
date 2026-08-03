# Bowling Companion — agent guide

Offline-first PWA bowling score keeper. React 18 + Vite + TypeScript + Tailwind,
Dexie/IndexedDB, zero backend. Hosted on Vercel — push/merge to `main`
auto-deploys prod via Vercel's Git integration.

## Read the routed doc before exploring source — don't re-derive

Docs in `docs/` are canonical and maintained. **Docs point to code, never copy
it:** the source of truth for types, schema, and file structure is the code
itself; docs hold the *why* + invariants the code can't express. There is no
type/schema copy in docs to keep in sync — by design.

## Task → source map (read only what the task needs)

| Doing | Read |
|---|---|
| Change schema / types | `src/types/bowling.ts` + `src/db/bowlingDb.ts` (canonical). `docs/DATA_MODEL.md` for invariants + the standing-pins model. |
| Touch scoring | `src/lib/scoring.ts`, `src/lib/frameController.ts` (+ their `*.test.ts`); `docs/DECISIONS.md` ADR-001, ADR-005. |
| Add / edit a view or component | `docs/ARCHITECTURE.md` — layering rules + data flow. Obey the import layering. |
| Any UI work (screens, nav, controls, empty states) | `docs/DESIGN-LANGUAGE.md` — the three navigation shapes, token rules, `PushScreen` + `ui/*` primitives. ADR-040. |
| Backup / import / merge | `docs/DECISIONS.md` ADR-003 + `src/services/backupRepository.ts`. |
| Pin input / mobile UI | ADR-006 (inverted input), ADR-004 (mobile-first 390×844), ADR-001. |
| Anything else | `docs/README.md` indexes all docs. |

## Load-bearing files

`src/App.tsx` (shell + view routing) · `src/db/bowlingDb.ts` (Dexie schema +
versions) · `src/services/*Repository.ts` (all persistence) ·
`src/types/bowling.ts` (shared types) · `src/lib/scoring.ts` +
`frameController.ts` (scoring engine).

## Commands

`npm run dev` · `npm test` (vitest) · `npm run test:e2e` (playwright) ·
`npm run build` (tsc + vite + PWA). Deploy: merge to `main` → Vercel
auto-deploys. Local manual fallback: the `deploy` skill.

## Doc maintenance rule

Changing **scoring**, the **data model**, or **import/merge** rules → add an
entry to `docs/DECISIONS.md` (new ADR; never edit an accepted one) **and**
`docs/CHANGELOG.md` in the same PR.
