# Bowling Companion docs

Everything that is not code. Docs point at code and never restate it: types,
schema and file structure are read from `src/`, and these files carry only the
reasoning and invariants the code cannot express.

## Where to go

| I am about to... | Read |
|---|---|
| Change scoring or the frame state machine | [DECISIONS.md](./DECISIONS.md) ADR-001, ADR-005, ADR-017 |
| Change the schema, types or migrations | [DATA_MODEL.md](./DATA_MODEL.md) |
| Add or restructure a module | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| Build any UI | [DESIGN-LANGUAGE.md](./DESIGN-LANGUAGE.md) |
| Touch backup, import or merge | [DECISIONS.md](./DECISIONS.md) ADR-038 |
| Touch viewport, rotation or scroll handling | [VIEWPORT-BUG.md](./VIEWPORT-BUG.md) first, without exception |
| Ship a build | [DEPLOYMENT.md](./DEPLOYMENT.md) |
| Pick up new work | [ROADMAP.md](./ROADMAP.md) |
| Write a release note | [CHANGELOG.md](./CHANGELOG.md) |

[archive/](./archive/) holds delivered plans and specs. They are history, not
documentation, and are not a source of truth for anything.

## Maintenance rules

1. A change to **scoring**, **the data model**, or **import/merge rules** adds
   an ADR to [DECISIONS.md](./DECISIONS.md) and an entry to
   [CHANGELOG.md](./CHANGELOG.md), in the same PR. Never edit an accepted ADR;
   supersede it.
2. UI and UX work updates [CHANGELOG.md](./CHANGELOG.md). If it establishes a
   pattern others should follow, it updates
   [DESIGN-LANGUAGE.md](./DESIGN-LANGUAGE.md) too.
3. No doc restates a type, a schema, or a file listing. Link to the code.
4. No em dashes in anything written here.
