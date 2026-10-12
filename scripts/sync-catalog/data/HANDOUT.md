# Ball catalog handout

State of the catalog ingest and what is left, for whoever picks it up next: an
agent, a session, or a person. Rewritten 2026-10-12 by the session that had page
access (ADR-137). It replaces the earlier handout, which described a run done
from web search summaries alone (ADR-135); everything that run found has since
been re-read against the real pages.

## Where it stands

- **518 balls** across twelve brands: Storm 107, Roto Grip 45, 900 Global 27,
  MOTIV 186, Pyramid 1, and the Brunswick family: Brunswick 32, Hammer 46,
  Ebonite 23, Radical 19, DV8 17, Columbia 300 8, Track 7.
- **Every spec is from a deterministic reading of a source page**
  (`parse-bowwwl`, `parse-motiv`, `parse-ball`; ADR-044), or from a manufacturer
  document. No row is waiting on a re-read: the 62 balls added from search
  summaries last time were all re-read, every one agreed on RG, differential and
  mass bias, and their `readVia` markers are gone.
- **Release months:** 117 balls that had no date now have one. Seventeen still
  have none (list below).
- **Photos:** 480 of 518 balls have one. See "Photos".

## What was done, and with what

| Step | Command | Result |
|---|---|---|
| Re-read the search rows | `parse-bowwwl` over their pages, compared by a script | 61 of 61 agree; 62nd (Portal) parsed directly |
| Fill their gaps | `fill-from-seed -- bowwwl-seed.json --confirms-search --write` | dates, cores, finishes, full cover names, weight tables |
| Date the MOTIV balls | `parse-motiv` found nothing (retired pages carry no date); `parse-bowwwl` then `fill-from-seed` | 87 dated; 5 left alone, see "Disagreements" |
| Rebuild the USBC list | `npm run usbc-index` | 5,110 rows; Track is not a brand in it |
| Select and route | `select-balls -- --since 2025-01-01`, `resolve-sources -- --try-base-names --concurrency 2` | 278 queued; 165 bowwwl, 5 PDF, 2 MOTIV, 106 manual |
| Parse and promote | `parse-bowwwl`, `seed-to-candidates`, `promote-candidates` | 154 added |
| Last session's backlog | same, from the held-back list | 54 more added |

Requests were paced: the parsers wait one second between pages, routing ran two
at a time, and nothing was fetched twice.

Two things worth knowing if you run the pipeline in a cloud session. Node's own
`fetch` ignores the session's proxy unless `NODE_USE_ENV_PROXY=1` is set (curl
does not need it). And `data/candidates/` held 39 older staged files that
`promote` would also process, so they were moved aside for each run and put back.

## Disagreements and oddities to look at

- **Five MOTIV rows disagree with bowwwl on a number** and were left alone, date
  included: Cruel C51 LE (RG), Freestyle Rush (RG, differential), Villain
  (differential), Villain Scorn (differential), Jackal Assault (mass bias).
  MOTIV's own page is the row's source and wins; a person should look at
  whether bowwwl is describing another variant.
- **`Hustle` and `Hustle VP`** were the same page. The existing `Hustle` row
  (id `roto-grip-hustle-2026`) is the Hustle VP's spec, seeded from that page by
  an earlier session; it was kept because arsenal balls may hold its id, and the
  duplicate `Hustle VP` row was dropped. The name is probably wrong.
- **`Motiv TR2`** is refused by promote: MOTIV's page prints a differential of
  0.52. ADR-061 says the parser does not repair its source. Its conflict file is
  in `data/conflicts/`.
- **Colour-named balls.** bowwwl lists some colourways as separate balls with
  their own pages (Hammer's Bubblegum Vibe and Deep Ocean Vibe, Black Widow
  Urethane Mint Solid and Orange Solid, Gem Black Diamond and Blue Sapphire),
  and they were added as bowwwl has them. `fold-colorways` could merge the ones
  with identical specs, but folding a ball already in the catalog moves its id
  (ADR-062), so it needs the `id` pin first.
- **28 rows have a coverstock the build cannot classify**, so the Solid, Pearl,
  Hybrid filter misses them. Run `npm run sync-catalog` and read its list.

## Not done

**106 queued balls have no bowwwl page and no manufacturer PDF** (USBC rows from
2025 onward). Most are a colourway or a promotional piece; some are real. For
these the earlier method works (web search pinned to one site, two sites per
value, a blind check; ADR-135), or a manufacturer's own page.

- 900 Global (14): Zen Blue Label, Cruise 78D Urethane, Reality Magenta, HB Honey Badger Dark Out, Cruise PC Purple/Copper, HB Honey Badger Wine Pearl, Honey Badger Black U78, Honey Badger II Urethane, Rev Matrix II, Alibi, Lumen, Remaster HB Honey Badger, Vintage Gem, HB Honey Badger BE Black Edition
- Brunswick (15): Vaporize X, LT-48 Pro Obsidian, Johnny Petraglia BVL Red/White/Blue, Hyperize, Vaporize S.E. Purple Pearl, Melee Redaholic-X, Purple Titan Nirvana, V-Mesmerize, LT-48 Pro Ruby, Crimson Rhino Pro, X-Mas Vintage Rhino Pro, The House Viz-A-Ball Yellow, LT-48 Pro Sapphire, Vaporize S.E., Twist Pink-Black
- Columbia 300 (1): Pulse 2025
- Ebonite (13): The One Urethane 78D Navy, Pivot Apex, Shadow Angular One, Mission 1.0, Spartan Melas, GB5 Game Breaker 5 Hybrid, Mission Reload Red-Black-White, Maxim Purple Haze, Thunderbolt Urethane Blue, Turbo-R Purple-Pink 13 Lb & Under, GB5 Game Breaker 5 Pearl, Turbo-R Black/Purple, Turbo-R Ruby
- Hammer (17): Black Widow 3.0 Ruby, Pure Effect, Black Widow Purple Pearl Urethane 78D, Effect Purple Pearl Urethane 78D, Effect Attack Hybrid, Effect Attack Red Solid, Gauntlet Knight Hybrid, Gauntlet Knight Solid, Raw Hammer Black/Grey, Raw Hammer Red/White/Purple, Zero Mercy Black Solid, Zero Mercy Ghost Pearl, NU 2.0, X Twelve Pearl, Axe Green-Smoke, Axe Purple-Pink, 3D Offset Assault
- Motiv (1): Royal Venom
- Radical (2): Prime Power Hitter, Snap Shot Hybrid
- Roto Grip (15): Idol Star, Hustle SNY Salmon/Navy/Yellow, RST Ex-Torque, Attention BP Black/Pink, Megastar, Hustle BP Black/Pink, Exit Rush, Hustle Black Sky, Rockstar Hero, Cosmos All Colors, RST Evolution, Hustle Teal-Black, RST Black, Hustle Earth Blue-Gold-Green, Hustle Glow Mint-Fuchsia-Lemon
- Storm (28): PhysiX Ignition, Ion Max Veil, Ion Pro Pearl PTLP, !Q Focus, Max Orbit Under 13 Lbs., Hy-Road Hybrid, Lock Axis, Savage Lock, SPI Clear All Colors, Ultimate Motor, Pitch Black 78-U, SPI Cube All Colors, Alpha Crux 2025, Pitch Black Blue Pin, Lockout, Hy-Road Boost, Dark Knight, The Joker, Epic Summit, Hy-Road Black, The Road Hybrid, Ice 30 All Colors, Ion Pro Solid R-W-B, Tropical Surge Black-Blue-Pink, Tropical Surge Silver-Purple, Platinum Ford Blue Cube, 25th Strike Out Breast Cancer, Mt. Fuji Clear

**Before 2025:** the USBC list has about 5,000 rows. `select-balls -- --since
2022-01-01 --until 2024-12-31` is the next slice, a brand at a time.

**Track.** Its 7 balls came through bowwwl; the USBC list does not carry the
brand, so there is no queue to work from. Track's own site lists the line.

**Seventeen rows still have no release date:** Storm PhysiX Burst, Storm Concept Purple, Storm Level Up, Motiv Cruel C51 LE, Motiv Freestyle Pink/Black, Motiv Freestyle Rush, Motiv Freestyle, Motiv Sapphire Jackal, Motiv 2020 Revolt, Motiv Villain, Motiv Ascent Pearl Pink/Purple, Motiv Ascent Pearl Red/Black, Motiv Jackal Assault, Motiv Primal Rage 5 YR LE, Motiv RX1 Orange, Motiv Villain Scorn, Storm Phaze II Pearl. Most are older
MOTIV or Storm balls whose pages state none.

**Backlog (`data/backlog/`)**: 3 balls with no bowwwl page, Brunswick Rhino
(the page lists it only as Rhino Pearl), Ebonite Turbo/R and Hammer Rip'D Solid.

## Photos

- **480 of 518 balls have a photo.** The owner said yes to photos for the new
  balls (ADR-138), so 265 came from the source pages (`npm run
  fetch-seed-images -- --skip-ids <ids-before-the-new-balls>`, one request a
  second) and each was checked by eye on a mid-grey background. The shapes are
  clean circles with no white corners; the bright rim on some Storm and Roto
  Grip covers is the ball's own reflection, not a halo.
- **38 balls have none:** Storm 31, Roto Grip 4, 900 Global 3. They are older
  rows with no image URL on record, so there is nothing to fetch. They need a
  bowwwl page parsed (`parse-bowwwl` records the image URL) or a manufacturer
  image, and the owner's yes covered only the new balls.
- **MOTIV's media kit** (a Dropbox folder, covered by MOTIV's permission) was
  downloaded and compared with the current photos for the 86 balls it matches by
  name. They are the same studio renders, so none was replaced. The kit has no
  Jackal Scar or Jackal Fury. It is useful for a MOTIV ball whose own page has
  no usable image.
- **Replacing a photo:** `npm run set-ball-image -- <map.json>`
  (`{"<ball-id>": "<file>"}`) renders it, names it `-p2`, `-p3` so the app's
  30-day photo cache lets it through, and keeps the old file name holding the
  new image because arsenal balls keep a snapshot of the path. A white
  background that got through is `npm run clear-background` first.
- **MOTIV's site refuses a plain user-agent.** Its images need the
  `MOTIV_USER_AGENT` from `pipeline/sources.ts` (ADR-061), which is why the one
  MOTIV photo in this batch was fetched separately.
- **Ask the brands, as MOTIV was asked** (ADR-061). Brunswick (Hammer, Ebonite,
  Track, Radical, DV8, Columbia 300) and Storm (Roto Grip, 900 Global) each
  publish dealer media. One permission email per group would cover eleven of
  the twelve brands and settle the rights question that ADR-138 widened.
- Never a retailer's photo. A ball with no manufacturer or database image keeps
  the placeholder.

## Pyramid Path colourways

Six colours are in: Pink/Black, Hot Pink/Lime, Pink/Teal/Blue, Orange/Black,
Pink/Yellow/Black and Black/Silver. The `sku` values are catalog keys in the
`PATH-PK-BK` style, **not Pyramid SKUs**. A search summary of Pyramid's site also
named nine more (Cosmic Candy Swirl, Purple/Light Purple, Purple/Black/White,
Blue/Light Blue/Lime Green, Emerald/Black/Silver, Navy/Lime Green/White,
Aqua/Silver, Blue/Black/White, Pink/Purple/Silver) that no second source
confirmed. With page access, `https://www.pyramidbowling.com/bowling-balls/Path/`
lists them.
