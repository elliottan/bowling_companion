---
name: gather-ball-specs
description: >
  Research and add one or more bowling ball entries to
  scripts/sync-catalog/data/balls.json. Follows the canonical
  search protocol: 2+ sources, citation discipline, no invented numbers.
trigger: >
  User says "add ball", "gather specs", "research ball", or names a
  specific ball to add to the catalog.
---

# Gather Ball Specs

Add one bowling ball at a time to `scripts/sync-catalog/data/balls.json`.
Run `npm run sync-catalog` after each addition to verify the pipeline stays clean.

---

## Target fields (RawBall schema)

Every entry must have all required fields. Optional fields noted.

| Field | Type | Notes |
|---|---|---|
| `brand` | `"Storm" \| "Roto Grip" \| "900 Global" \| "Motiv"` | Must be exact — one of the 4 whitelisted brands. |
| `name` | `string` | Ball model name as printed on the ball (e.g., `"Phaze II"`, `"Hyped Solid"`). No color variants. |
| `releaseDate` | `string \| null` | ISO `yyyy-mm-dd`. Use `yyyy-01-01` when only year is known. `null` if unknown. |
| `coverstockRaw` | `string` | Exact coverstock string from the manufacturer spec sheet (e.g., `"TX-16 Solid Reactive"`). |
| `factoryFinish` | `string \| null` | Factory surface prep string (e.g., `"3000-grit Abralon"`). `null` if not found. |
| `coreName` | `string \| null` | Core name (e.g., `"Velocity"`). `null` if not found. |
| `rg` | `number \| null` | Radius of gyration, two decimal places (e.g., `2.48`). **15 lb value.** `null` if not found. |
| `diff` | `number \| null` | Total differential, three decimal places (e.g., `0.051`). **15 lb value.** `null` if not found. |
| `mbDiff` | `number \| null` | Intermediate/mass-bias differential. `null` means symmetric. **15 lb value.** |
| `sourceUrls` | `string[]` | At least 2 URLs. First URL = primary (manufacturer page). |
| `weights` | `WeightSpec[] \| undefined` | **Optional.** Only include when a spec table is right in front of you with multiple weights listed. Never fetch extra pages just to fill weights. See multi-weight rule below. |

---

## Search method

### Query patterns (use multiple)

1. `"<Brand> <BallName> bowling ball specs"`
2. `"<Brand> <BallName> RG differential"`
3. `"site:stormbowling.com <BallName>"` (or rotogrip.com / 900global.com / motivbowling.com)
4. `"site:bowwwl.com <BallName>"` — the bowwwl.com ball database is a reliable secondary source
5. `"site:bowlingthismonth.com <BallName> review"` — confirms specs independently

### Source discipline

- **Always use 2+ independent sources.** Cite both in `sourceUrls`.
- Prefer manufacturer pages (stormbowling.com, rotogrip.com, 900global.com, motivbowling.com) as `sourceUrls[0]`.
- bowwwl.com ball database is reliable for cross-checking numeric specs.
- **Never invent a number.** If a source gives a value for 16 lb but not 15 lb, do NOT guess the 15 lb value — set the field to `null`.
- **Flag-don't-guess coverstock.** If the coverstock string doesn't clearly match Solid/Pearl/Hybrid/Urethane, use the exact manufacturer string as-is. The build pipeline will flag it for human classification (`coverstockCategory = null`).
- If two sources disagree on a numeric spec by more than rounding error, use the manufacturer value and note the discrepancy in a code comment in balls.json (JSON doesn't support comments — add to `sourceUrls` or leave a note in the PR).

### What to skip

- Color-variant balls (e.g., "Idol Pink Pearl", "Idol Red") — these are the same core ball with a color change. Only add the base model unless the name has a meaningful distinction (e.g., "Phaze II" vs "Phaze III" are different balls; "Idol" vs "Idol Pink Pearl" are not).
- Balls under 13 lb only (marked `**` in the USBC list).
- Balls from brands not in the 4-brand whitelist.

---

## Multi-weight rule

- **Always fill 15 lb** values in the top-level `rg`/`diff`/`mbDiff` fields. These are the defaults.
- **Include `weights[]`** only when a spec table showing multiple weights is already visible in your search results — do not open additional pages just to fill it.
- When including `weights[]`, the 15 lb entry in the array **must match** the top-level values exactly.
- `WeightSpec` shape: `{ weight: number, rg: number | null, diff: number | null, mbDiff: number | null }`.

Example:
```json
"weights": [
  { "weight": 16, "rg": 2.46, "diff": 0.053, "mbDiff": 0.018 },
  { "weight": 15, "rg": 2.48, "diff": 0.051, "mbDiff": 0.017 },
  { "weight": 14, "rg": 2.50, "diff": 0.048, "mbDiff": null }
]
```

---

## Output format

Append to `scripts/sync-catalog/data/balls.json`. Match the existing JSON style (2-space indent, trailing comma on prior last entry).

Example `RawBall` entry:
```json
{
  "brand": "Storm",
  "name": "Phaze II",
  "releaseDate": "2019-01-01",
  "coverstockRaw": "TX-16 Solid Reactive",
  "factoryFinish": "3000-grit Abralon",
  "coreName": "Velocity",
  "rg": 2.48,
  "diff": 0.051,
  "mbDiff": null,
  "sourceUrls": [
    "https://www.stormbowling.com/products/equipment/bowling-balls/bbmtza-phaze-ii",
    "https://www.bowwwl.com/bowling-ball-database/storm/phaze-ii"
  ]
}
```

---

## After adding entries

1. Run `npm run sync-catalog` — must print "All clean." or only expected warnings.
2. Run `npm run usbc-diff` — verify the newly added ball reduces the "missing from catalog" count.
3. Run `npm test` — must stay green.

---

## References

- ADR-007 in `docs/DECISIONS.md` — catalog data model decisions
- `scripts/sync-catalog/` — pipeline source (types.ts, validate.ts, normalize.ts, build.ts)
- `scripts/sync-catalog/usbc/parse-usbc.ts` — discovery script (`npm run usbc-diff`)
