# Bowling Companion — docs

This folder is the source of truth for everything beyond the source tree.
Anything that isn't code lives here.

## Index

| Doc | Purpose |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Module map, data flow, where to put new code |
| [DATA_MODEL.md](./DATA_MODEL.md) | Session/Game/Frame types, Dexie schema, scoring conventions |
| [DESIGN-LANGUAGE.md](./DESIGN-LANGUAGE.md) | Navigation shapes, controls, tokens, empty states, motion, copy |
| [DECISIONS.md](./DECISIONS.md) | ADR-light log of load-bearing decisions |
| [CHANGELOG.md](./CHANGELOG.md) | User-visible changes |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Build + deploy to production (Vercel) |
| [ROADMAP.md](./ROADMAP.md) | Future work that hasn't been built yet (Phase 5 lives here) |

## Maintenance rule

Any change touching **scoring**, **the data model**, or **import/merge rules**
MUST update [DECISIONS.md](./DECISIONS.md) and [CHANGELOG.md](./CHANGELOG.md)
in the same PR. The rest of the app code can be read; these three areas have
implicit invariants that need to be written down.

UI/UX work updates the CHANGELOG only.
