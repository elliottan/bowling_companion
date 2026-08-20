---
name: gather-ball-specs
description: >
  Add bowling balls to the catalog through the four-stage ingest pipeline:
  select a scope, route each ball, parse what parses, read the rest with
  quoted receipts, then promote. Never writes balls.json directly.
trigger: >
  User says "add ball", "gather specs", "research ball", "add new releases",
  or names balls to add to the catalog.
---

# Gather Ball Specs

Balls enter the catalog through `scripts/sync-catalog/pipeline/`, never by
hand-editing `balls.json`. ADR-043 and ADR-044 carry the reasoning; this is the
procedure.

**The rule that matters:** you are the untrusted reader in this pipeline. Every
value you produce must be quoted verbatim from the document you read it in. If a
page does not state a number, the field is `null`. Never fill a gap from
memory, from a sibling ball, or from what the number usually is.

---

## Stage 1: scope the run

Ask the user for scope if they have not given one. Then:

```bash
npm run select-balls -- --since 2026-01-01
npm run select-balls -- --since 2026-01-01 --brand Storm --limit 20
npm run select-balls -- --name "Storm:Phaze V" --name "Motiv:Venom Shock"
```

Writes `data/queue/<run-id>.json`, listing only balls not already in the
catalog. Keep runs small. A phase of 10 to 20 balls is reviewable; 200 is not.

## Stage 2a: route before reading

```bash
npm run resolve-sources -- scripts/sync-catalog/data/queue/<run-id>.json --try-base-names
```

Tags each ball `pdf`, `bowwwl` or `manual`, and prints how many of each. Add
`--try-base-names` when the queue came from USBC, whose rows are per colorway.

**Check every reported name reduction before using it.** A trailing `/` can mean
a colorway ("Hustle Vanilla/Popsicle" is a Hustle) or a different ball entirely
("Attention 78/U" is a urethane model, not a colorway of Attention). Drop the
wrong ones from the run and tell the user which.

## Stage 2b: the free paths, use these first

Anything routed `pdf` or `bowwwl` is parsed by code, costs no tokens, and needs
no quotes from you:

```bash
npm run parse-ball -- "<tech-data-pdf-url>"        # routed pdf
npm run parse-bowwwl -- "<page-url>" [<page-url>…] # routed bowwwl
npm run seed-to-candidates -- bowwwl-seed.json     # staged output to candidates
npm run seed-to-candidates -- single-balls-seed.json
```

Never re-read a page yourself that a parser already handled. That is the whole
point of the routing pass.

If `parse-ball` reports "No spec block (RG/DIFF table) found", the PDF exists but
carries no spec table. Do not read it yourself: try the ball's `bowwwl` page
instead, which is usually there even when routing preferred the PDF.

USBC lists each colorway separately, so several queue rows can be one ball
("Tropical Surge" three times over). Parse it once.

## Stage 2c: the manual path, quoted receipts

Only for balls routed `manual`. Read the manufacturer page, or a spec database,
and write `data/candidates/<brand>-<name>-<year>.json`:

```json
{
  "brand": "Storm",
  "name": "Phaze V",
  "official": true,
  "releaseDate": [{ "value": "2026-02-10", "sourceUrl": "https://…", "quote": "Release Date: February 10, 2026" }],
  "coverstockRaw": [{ "value": "TX-20 Solid Reactive", "sourceUrl": "https://…", "quote": "Coverstock: TX-20 Solid Reactive" }],
  "factoryFinish": [{ "value": "3000-grit Abralon", "sourceUrl": "https://…", "quote": "Factory Finish 3000-grit Abralon" }],
  "coreName": [{ "value": "Velocity", "sourceUrl": "https://…", "quote": "Core: Velocity" }],
  "rg": [{ "value": 2.48, "sourceUrl": "https://…", "quote": "RG 2.48" }],
  "diff": [{ "value": 0.051, "sourceUrl": "https://…", "quote": "Differential 0.051" }],
  "mbDiff": []
}
```

- `official: true` only for a manufacturer-published document (their own product
  page or spec PDF). Then one reading per field is enough.
- `official: false` for anything else. Then each field needs readings from **two
  different sites**, and they must agree.
- An absent field is `[]`, not a guessed value.
- `quote` must be text that actually appears in the document and must contain the
  value. Promote checks this mechanically and refuses the ball otherwise.
- 15 lb values go in the top-level `rg`/`diff`/`mbDiff`. `weights` is optional
  and only from a table already in front of you.

**Not every USBC row is a ball.** `select-balls` already drops the "(Under 13
Lb.)" line, X-Outs, and rows with no approval date. What survives can still be
promotional or internal equipment ("SPI Cube", "Big D Pro Am") that no source
publishes specs for. When two searches find nothing, stop and report it. A ball
missing from the catalog is a fine outcome; an invented row is not.

**Bot checks.** Some manufacturer sites challenge automated fetches. Do not try
to bypass or solve a challenge. Use the browser tools, and if a challenge
appears, stop that ball, tell the user, and continue with the rest. The run is
resumable; the queue file is still there.

## Stage 3: promote

```bash
npm run promote-candidates -- --dry-run
npm run promote-candidates
```

Refusals land in `data/conflicts/` with the reason. Handle each explicitly:

- **collision**: the ball is already in the catalog. Decide with the user:
  update the existing row, add a colorway to it, or the name was wrong.
- **sources disagree**: go back to the documents. Never split the difference.
- **value does not appear in its quote**: you fabricated or mistyped it. Re-read
  the source.
- **out of range**: usually a units or decimal-place slip.

A ball already in the catalog with fields missing is an **update**, not a new
row, and filling in its `releaseDate` changes its id. Ids are permanent: arsenal
balls hold a `catalog_ref_id`. Take the other fields and leave the date, unless
the user asks otherwise.

## Stage 4: images and review

```bash
npm run add-ball-image -- "<ball name or SKU>" "<direct image url>"
npm run fetch-images
npm run contact-sheet
```

`parse-bowwwl` records `_imageUrl` on each staged entry; that is the URL to pass
to `add-ball-image`. Open `scripts/sync-catalog/contact-sheet.html` and look at
it, in both light and dark. A bad cut or an off-centre ball is only visible to an
eye. A ball with no usable image keeps the placeholder; never substitute a photo
from a retailer.

## Finish

```bash
npm run sync-catalog
npm run verify
```

`sync-catalog` must print "All clean." Add a `docs/CHANGELOG.md` line when the
run adds balls a user would notice. Then commit and push.

---

## References

- ADR-043, ADR-044 in `docs/DECISIONS.md`: the trust rules and why they exist
- ADR-039: where images come from, and the rights position
- `scripts/sync-catalog/pipeline/`: the pipeline source
