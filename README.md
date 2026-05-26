# Bowling Companion

Bowling Companion is a lightweight, offline-first bowling score keeper built as a local-only browser app.

## Tech Stack

- React 18
- Vite
- TypeScript
- Tailwind CSS
- Dexie.js / IndexedDB
- Vitest

## Current Status

- Phase 1: project scaffolding, Dexie setup, repository helpers, scoring helpers, and tests.
- Phase 2: interactive 10-pin input, frame controller, 10th-frame logic, and scorecard UI.

## Getting Started

```bash
npm install
npm run dev
```

The app runs locally at `http://127.0.0.1:5173/` by default.

## Scripts

```bash
npm test
npm run build
```

## Project Notes

The app is designed to require no backend. Bowling sessions, games, and frames are stored locally in IndexedDB through Dexie.js.
