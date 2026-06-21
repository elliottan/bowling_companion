---
name: add-ball-manual
description: >
  Add one ball to the catalog from copy-pasted manufacturer spec text plus a
  direct image URL. For quick manual additions when a ball is missing and there
  is no parseable PDF — the user pastes the spec blurb and an image link.
trigger: >
  User pastes a ball's specs (prose + Coverstock/Core/Finish/Color/Release Date
  + per-weight RG/Diff) and asks to add it, optionally with an image URL.
---

# Add Ball Manual

Add a single ball from pasted spec text + a direct image URL. The paste is small
plain text already in the conversation, so the agent parses it directly (no PDF,
no extra token cost). Use this for one-off manual additions; for bulk use
`seed-catalog` (PDF pipelines).

## Steps

1. **Extract a RawBall from the pasted text.** Map the fields:
   - `brand` — one of Storm / Roto Grip / 900 Global / Motiv (infer from the
     blurb; the SKU prefix helps: `BBMG…` = 900 Global, etc.).
   - `name` — the ball model name as printed (no color variant).
   - `coverstockRaw` — the exact `Coverstock:` value. **Flag-don't-guess:** if the
     prose and the structured field disagree (e.g. field says "Pearl" but the
     blurb says "Solid"), use the explicit `Coverstock:` field and call out the
     conflict to the user.
   - `factoryFinish`, `coreName` (drop "Symmetric/Asymmetric Core" suffix),
     `releaseDate` (ISO yyyy-mm-dd).
   - `rg`/`diff`/`mbDiff` — the **15 lb** values. Symmetric core ⇒ `mbDiff: null`.
   - `weights[]` — every weight block listed (`{ weight, rg, diff, mbDiff }`).
   - `colorways: [{ sku, color }]` — the `SKU:` and `Color:` from the paste.
   - `sourceUrls` — the manufacturer site + the image URL (≥1 required).
2. **Append to `scripts/sync-catalog/data/balls.json`** (dedupe by brand+name).
3. **Attach the image** (if a URL was given). It is a direct image (PNG/JPG),
   not a PDF, so download + resize directly — no carving:
   ```bash
   npm run add-ball-image -- <sku-or-name> <image-url>
   ```
   This writes webp thumb/full to `public/catalog/img/` and records
   `data/images.json`. Direct product images come out clean (unlike ad-sheet
   carves).
4. **Rebuild + verify:** `npm run sync-catalog` must print "All clean."; then
   `npm test`. Commit when the user asks.

## Notes

- Multiple images = multiple colorways: run `add-ball-image` per colorway SKU.
  (Current `add-ball-image` keys the image to the ball; per-colorway images can be
  wired later if needed.)
- The catalog is read-only client-side; a version bump re-syncs all devices
  (ADR-010), so the new ball + image reach users on next refresh.
