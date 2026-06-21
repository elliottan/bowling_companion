# Plan: Catalog seeding pipeline + colorways + images

Status: in progress. Owner: Elliot. Started 2026-06-21.

## Why

Web-search ball-spec gathering costs ~24k tokens + ~19 tool calls **per ball**
(measured: ~290k tokens for 20 balls, 8 of which failed). Unsustainable.

Storm publishes spec data as **direct-CDN PDFs with no auth/recaptcha**:
- Per-ball tech sheets: `stormproducts.nyc3.cdn.digitaloceanspaces.com/product_pages/Balls/Storm/<slug>/..._Tech Data.pdf`
- Full year catalogs: `.../web_page_content/DOWNLOADS/2025_SPI-Reprint-small.pdf`

These parse deterministically (labeled `RG DIFF [PSA]` tables + `COVERSTOCK:` /
`WEIGHTBLOCK:` / `FACTORY FINISH:` / `SKU: <code> <NAME>™` fields). Parsing via
script ≈ 0 agent tokens.

## Core principle (all parsers)

PDF text is extracted to a tmp file by a script, parsed deterministically, and
**never loaded into model context** — only small slices are sampled for
verification. This is the same no-LLM pattern as `usbc/parse-usbc.ts`.

## Decisions (locked via grilling 2026-06-21)

| Fork | Decision |
|---|---|
| Colorway model | Nested array on ball: `colorways: [{ sku, color, imageThumb, imageFull }]`; `colorways[0]` = default. Arsenal entry stores `colorwaySku`. |
| Images | Storm-direct CDN, token-efficient. **Deferred to Phase 6** — plan only for now. |
| Packaging | 3 deterministic npm scripts + 1 new `seed-catalog` skill. Keep `gather-ball-specs` as web fallback for balls with no PDF. |
| USBC output | JSON index (`data/usbc-index.json`). |
| Parser output | Staging file under `data/seed/`; human reviews before merge to `balls.json`. |

## What the code already provides

- `CatalogBall` already has `coverstockCategory`, `coreType` (sym/asym), `rg`,
  `diff`, `imageThumb`, `imageFull`. `build.ts` classifies coverstock
  (`mapCoverstock`) and derives sym/asym (`deriveCoreType`).
- Catalog **detail** page already renders coverstock/category/coretype/rg/diff/mbdiff
  and filters on them. Images are stubbed `null` (pipeline not implemented).
- `CatalogBallImage.tsx` renders image with a brand fallback.
- `normalize.ts` has `mapCoverstock`, `deriveCoreType`, `normalizeName`, `slug`.

## Phases (dependency order 0→1→2→3, then 4→5, then 6)

### Phase 0 — USBC searchable index  *(prereq for name reconciliation)*  ✅ DONE 2026-06-21
Shipped: `usbc/extract.ts` (shared download/extract/parse), `usbc/build-index.ts`
(`npm run usbc-index` → `data/usbc-index.json`, 2011 entries), `parse-usbc.ts`
refactored onto the shared module. tsc + 185 tests green.

- Refactor `usbc/parse-usbc.ts`: extract shared PDF download + `parseBallEntries`
  + `parseApprovalDate` (date extraction added 2026-06-21) into a shared module.
- New script `usbc/build-index.ts` → emits `data/usbc-index.json`:
  `[{ brand, name, normalizedName, approvalDate }]`. `usbc-diff` reads the index.
- Verify: ~2000 entries; spot-check Storm names + dates. After this the approved
  PDF is never re-read until a new link is supplied.

### Phase 1 — Catalog PDF parser → staging file  ✅ FUNCTIONAL 2026-06-21
Shipped: `catalog/parse-catalog-pdf.ts` (`npm run parse-catalog -- <pdf> <year>`)
→ `data/seed/spi-<year>-seed.json`. Anchors on `RG DIFF [PSA]` blocks, extracts
weights[]/coverstock/core/finish, parses SKU clauses for colorways, reconciles
name+brand against `usbc-index.json`. On the 2025 catalog: 17 balls, 12 auto-clean,
5 flagged `_needsReview` (logo-only names + spare/mix balls). Multi-brand: SPI
catalog yields Storm + Roto Grip + 900 Global. tsc green.
**Known caveat (refine later):** colorway *grouping* can bleed across a segment
boundary because a ball's SKU/logo is printed above its own RG table — specs are
correct, colorway lists need human verification (the review flow covers this).
Original spec below.

- `parse-catalog-pdf.ts <pdf-url|path> <year>`.
- Anchor on `RG DIFF [PSA]` blocks → weight table, coverstock, weightblock,
  finish, color, SKU, name (text before ™/TM). PSA present ⇒ asymmetric.
- Collapse multi-color SKUs sharing one spec block → one base entry + `colorways[]`.
- Filter accessories (require RG table + coverstock + weightblock).
- Name reconciliation: fuzzy-match parsed name → `usbc-index` canonical via
  `normalizeName`; flag unmatched with `_needsReview`.
- Output `data/seed/storm-<year>-seed.json`. Reusable for past years.
- Verify: ~26 Storm balls; Tropical Surge → 1 entry w/ N colorways; names match USBC.

### Phase 2 — Single-ball "add a ball" (PDF link or paste)  ✅ DONE 2026-06-21
Shipped: `catalog/parse-blocks.ts` (shared parser — `getText`/`segment`/`parseBall`/
`loadUsbcIndex`, run-based ALL-CAPS name extraction tolerant of prose), refactored
`parse-catalog-pdf.ts` onto it (regression: still 12/17), and `catalog/parse-ball-pdf.ts`
(`npm run parse-ball -- <url|path|->`) → appends to `data/seed/single-balls-seed.json`.
Verified: `!Q Tour 78/U` tech PDF **and** stdin paste both → correct name/brand/specs/
weights, not flagged. tsc + 185 tests green.

- `parse-ball-pdf.ts <url|->` — tech-data PDF URL or pasted text on stdin.
  Same tolerant label parser. One `RawBall` (+colorway) to a staging file.
- Verify: `!Q Tour 78/U` → RG 2.49 / .029 @15lb, Controll Solid Urethane,
  C³ core, 500-grit, Crimson.

### Phase 3 — Skill `seed-catalog`  ✅ DONE 2026-06-21
Shipped `.claude/skills/seed-catalog/SKILL.md` — documents all 3 modes
(`parse-ball`, `parse-catalog`, `usbc-index`), the never-load-PDF-into-context rule,
and the staging → review → merge flow. `gather-ball-specs` remains the web fallback.

- Documents all 3 scripts, the token-safe protocol, and the
  staging → review → merge flow. `gather-ball-specs` stays as web fallback.

### Phase 4 — Schema + build: colorways  ✅ DONE 2026-06-21  *(ADR-009 + CHANGELOG)*
Shipped: `Colorway` type + `colorways?` on `CatalogBall` (`src/types/catalog.ts`),
`colorways?` on `RawBall` (`scripts/sync-catalog/types.ts`), `colorway_sku?` on
`Ball` (`src/types/bowling.ts`), build passthrough + `KEY_ORDER` (`build.ts`).
**No Dexie migration** — all fields non-indexed; manifest-hash change re-syncs
`ball_catalog` (ADR-007). ADR-009 + CHANGELOG (Catalog v3) added. tsc + sync-catalog
clean + 185 tests green. Note: ADR numbering — the plan said ADR-008 but that was
taken (multi-weight); this is **ADR-009**.

- Add `Colorway { sku, color, imageThumb, imageFull }`; add `colorways: Colorway[]`
  to `RawBall` + `CatalogBall`. `build.ts` defaults top-level image from `colorways[0]`.
- Arsenal entry stores `colorwaySku` (bowling.ts + repository + Dexie version bump).
- Verify: sync-catalog clean; tests green; arsenal upgrade test.

### Phase 5 — UI: colorway display  ✅ DONE 2026-06-21
Shipped in `src/views/CatalogView.tsx`: (1) catalog list rows now show
always-visible compact specs (was `hidden sm:block`) + a `Palette` "N colors"
badge; (2) `ColorwayCarousel` on the detail page — swipeable image + pagination
dots + color-name label; (3) add-to-arsenal dialog colorway picker → persists
`colorway_sku` on the `Ball` (verified in IndexedDB: Tropical Surge → `TQZ`).
Merged 11 colorway-bearing balls into `balls.json` (34 total) for live data,
incl. Tropical Surge with 4 named colorways. Preview-verified on mobile (375px),
no console errors. tsc + 185 tests green.

- Catalog list row: compact specs (coverstock cat, sym/asym, RG, diff) + multi-colorway badge.
- Ball details: swipeable image carousel + pagination dots; swipe changes colorway.
- Arsenal: pick colorway on add; show chosen image.
- Verify: preview — swipe + dot highlight.

### Phase 6 — Images  *(in progress — option B)*
**Probe verdict (2026-06-21):** no deterministic per-colorway image source on the
Storm CDN. Bucket listing denied; ~15 filename guesses 403 (calibrated: 200=hit,
403=miss); search indexes only PDFs. Folder/file naming is inconsistent
(`!Q_Tour_78U`, `Alpha_Crux`, `Gremlin_Tour-X`; `Concept Tech Data Final.pdf` vs
`Storm_adsheet_Bionic-nobleed.pdf`). **No clean URL pattern.**
- **Option A** (ship without images) — placeholder already works. Rejected by user.
- **Option B** (chosen) — extract the **hero photo per ball** from its ad-sheet PDF
  (confirmed: Bionic ad sheet has 8 image XObjects incl. JPEGs; Tropical Surge ad
  sheet exists at `Storm_adsheet_TropicalSurge-nobleed.pdf`). One photo per ball,
  reused across colorways (ad sheets are single-color). Plumbing: derive/guess the
  ad-sheet URL per ball (fallback search), download, extract the largest JPEG
  (`poppler` `pdfimages` or pdf render), resize → webp thumb/full →
  `public/catalog/img/`, write `imageThumb`/`imageFull` back. Per-colorway photos
  are **not feasible** from this source (option C).
