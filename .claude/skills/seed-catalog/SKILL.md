---
name: seed-catalog
description: >
  Seed the ball catalog from official Storm/SPI PDF spec sheets — deterministically
  and token-cheaply. Three modes: parse a full year catalog, add one ball from a
  tech-data PDF or pasted spec text, and rebuild the USBC approved-list index.
trigger: >
  User wants to seed/import many balls from a Storm catalog PDF, add a ball by
  pasting a tech-spec PDF link or raw spec text, or refresh the USBC approved-ball
  list. Prefer this over web search whenever an official PDF/spec is available.
---

# Seed Catalog

Deterministic, token-cheap catalog seeding from official Storm Products Inc. (SPI)
PDFs. **No web search, no LLM parsing.** Use this instead of `gather-ball-specs`
whenever a manufacturer PDF or pasted spec sheet is available — it costs ~0 model
tokens vs ~24k/ball for web search. Fall back to `gather-ball-specs` only for balls
with no PDF.

## The cardinal rule — never load a PDF into context

PDFs are large and mostly images. **Never** `Read`/`cat`/`WebFetch` a catalog PDF
into your context. The scripts extract text internally and emit compact JSON.
To inspect, sample small slices only (`grep`, a few lines of `python3`), never the
whole extracted text.

## Modes

### 1. Add one ball (most common) — `npm run parse-ball`
For a single new ball when the user gives a tech-data PDF link or pastes spec text.
```bash
# from Storm's CDN tech sheet:
npm run parse-ball -- "https://stormproducts.nyc3.cdn.digitaloceanspaces.com/product_pages/Balls/Storm/<Slug>/..._Tech%20Data.pdf"
# from a local PDF:
npm run parse-ball -- tmp/some-ball.pdf
# from pasted spec text on stdin:
pbpaste | npm run parse-ball -- -
```
Appends to `scripts/sync-catalog/data/seed/single-balls-seed.json`. The Storm tech-sheet
URL pattern is `…/product_pages/Balls/Storm/<Ball_Name>/Storm_<Ball Name>_Tech Data.pdf`.

### 2. Seed a whole year catalog — `npm run parse-catalog`
```bash
npm run parse-catalog -- <pdf-url-or-path> <year>
# e.g. npm run parse-catalog -- tmp/storm-2025-catalog.pdf 2025
```
Writes `scripts/sync-catalog/data/seed/spi-<year>-seed.json`. One SPI catalog yields
**Storm + Roto Grip + 900 Global** (brand is resolved per ball, not assumed). Past-year
catalogs work the same way — just pass the year. Catalog PDFs live at
`…/web_page_content/DOWNLOADS/<year>_SPI-Reprint-small.pdf`.

### 3. Rebuild the USBC index — `npm run usbc-index`
```bash
npm run usbc-index
```
Downloads/parses the USBC approved-ball PDF → `scripts/sync-catalog/data/usbc-index.json`
(`[{brand, name, normalizedName, approvalDate}]`). The catalog/ball parsers reconcile
names + brands against this index. **Run this first** if `usbc-index.json` is missing or
stale; otherwise it never needs re-running until a new approved-list link is supplied.
`npm run usbc-diff` reports which approved balls are still missing from the catalog
(sorted most-recently-approved first).

## Workflow: staging → review → merge

Parsers write to `scripts/sync-catalog/data/seed/`, **never** directly to `balls.json`.

1. Run the relevant parser. Note the `Need review` count.
2. Inspect the seed file. Entries with `_needsReview: true` had no confident USBC name
   match (logo-only names, spare/mix balls) — fix `name`/`brand` by hand using the
   `_candidateName` hint and `usbc-index.json`.
3. Verify `colorways[]` — colorway *grouping* can bleed across a catalog segment
   boundary (a ball's SKU/logo prints above its own spec table). Specs are reliable;
   colorway lists need a glance.
4. Strip the `_needsReview` / `_candidateName` helper fields, then merge clean entries
   into `scripts/sync-catalog/data/balls.json` (dedupe by `brand`+`name`).
5. `npm run sync-catalog` must print "All clean." (or only expected `coverstockCategory`
   warnings). `npm run usbc-diff` to confirm the missing-count dropped. `npm test` green.

## What the parsers extract per ball

`brand` (via USBC reconciliation), `name`, `coverstockRaw`, `factoryFinish`, `coreName`,
15 lb `rg`/`diff`/`mbDiff`, the full per-weight `weights[]` table, and `colorways[]`
(`{sku, color}`). PSA column in the spec table ⇒ asymmetric (`mbDiff` set).

## Source of truth

Scripts: `scripts/sync-catalog/catalog/parse-blocks.ts` (shared parser),
`parse-catalog-pdf.ts`, `parse-ball-pdf.ts`, `usbc/extract.ts`, `usbc/build-index.ts`.
Catalog data model: ADR-007, and ADR-039 for third-party ingest and image rights. The original build plan is archived at `docs/archive/2026-06-21-catalog-seeding.md`.
