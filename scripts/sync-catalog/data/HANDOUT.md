# Ball catalog handout

State of the catalog ingest, and what is left, for whoever picks it up next:
an agent, a session that can open the spec sites, or a person. Written
2026-10-11 by the session that added the Brunswick family (ADR-135).

## The short version

- The catalog now has the seven Brunswick-family brands (Brunswick, Hammer,
  Ebonite, Track, Radical, DV8, Columbia 300) next to Storm, Roto Grip, 900
  Global, MOTIV and Pyramid.
- This run added **54 balls**, all read from web search output because
  the session's network policy blocked every bowling site (see "How this run
  read the web"). Each one is marked `readVia: "web-search"` in `balls.json`.
- **71 balls** were researched but not added. Their partial readings
  are in `scripts/sync-catalog/data/backlog/`, one candidate file per ball, and
  listed below with the reason.
- **No images** for any of the new balls yet. They show the brand placeholder.
  See "Images" for where clean ones can come from.

## How this run read the web, and how far to trust it

Direct fetches of every bowling site (bowwwl.com, stormbowling.com,
bowling.com and the rest) were refused by the session's egress policy. The
owner approved web search as the source for this run. The search tool returns
a summary of the matching pages, written by a model, not the page text. So:

- Every search was **pinned to one site** with `allowed_domains`, which is what
  lets a reading name its site.
- A reading's `quote` is a substring of the search tool's output, not of the
  page. Every such reading carries `"via": "web-search"`.
- Promote's rules held: each value needs **two different sites agreeing**
  (RG within 0.01, differentials within 0.002), and the value must appear in
  its quote. Nothing read this way is `official`.
- On top of that, every ball was **checked blind**: a second agent (a different
  model), told only the ball's name, found RG, differential, mass bias and core
  symmetry on its own. A contradiction would have held a ball back; none of
  the numbers contradicted, and the check did catch one wrong-ball reading
  (Sublime vs Sublime Focus).
- A ball with **no two-site mass bias reading** was added only where a source
  states its core is symmetric. Otherwise the app would label an asymmetric
  ball "Symmetric" (`deriveCoreType` reads a missing mass bias as symmetric),
  so those balls wait in the backlog for their mass bias.
- All values are the **15 lb** figures. Several databases print 16 lb rows; a
  number with no stated weight was not used.

**What a session with page access should do first:** re-read the rows marked
`readVia: "web-search"` against the real pages (`npm run parse-bowwwl` reads
bowwwl deterministically and needs no quotes), and drop the marker on any row
the page confirms. The search summaries agreed with each other and with the
blind check, but a summary is still not the page.

## Picking up the backlog

**With page access** (allow `www.bowwwl.com`, `bowl.com`, and the manufacturer
domains in the environment's network settings):

1. `npm run usbc-index` to rebuild the USBC list with the new brands. Their
   spellings in `WHITELISTED_BRANDS` (`scripts/sync-catalog/usbc/extract.ts`)
   were never checked against the PDF; confirm them first.
2. `npm run select-balls -- --brand Hammer --since 2024-01-01` and so on, then
   the `gather-ball-specs` skill as written. bowwwl pages route to the free
   parser.
3. For a backlog ball, the candidate file already holds what was found: add the
   missing readings and move it to `data/candidates/`, then
   `npm run promote-candidates`.

**With web search only**, the procedure this run used:

1. Pin each search to one site. The pair that works: bowwwl.com (a spec table
   by weight; take the 15 lb row) and bowling.com product pages, which print
   `2.48 (for 15# ball)`. bowlingball.com and bowlersmart.com are good thirds.
   bowlingthismonth.com rarely states the weight, and its dates are review
   dates, not release dates.
2. Quote the tool's output exactly, tag `"via": "web-search"`, and write `[]`
   for any field without two agreeing sites.
3. Have a second agent check the numbers blind (name only), then promote.
4. Budget: the session allows about 200 web searches per turn across all
   agents. About 4 per ball is enough; run batches of 10 to 15 balls.

## Not researched yet

The most-used balls this run did not reach (each generation is its own ball):

- **Storm:** IQ Tour line (Nano, Emerald, Solid), Marvel Pearl, Code Black,
  Spectre, Lock, Gravity Evolve, recent 2026 releases.
- **Roto Grip:** Hustle line (Hustle Ink is in; Hustle M/B, Hustle PRB, Hustle
  Hybrid), Idol line (Optimum Idol, Idol Synergy), Attention line, Gem line
  (Gem is in), Rubicon UC3, Wonder.
- **900 Global:** Zen 25, Eternity Pi, Dream (thin files in the backlog),
  Honey Badger (original), Altered Reality variants, Origin EX, Sublime
  (backlog).
- **Brunswick:** Quantum Bias, Quantum Evo Response, Prism Hybrid, Warp, Fury
  line, Cutting Edge, Crown 78U.
- **Hammer:** Black Widow Ghost, Black Widow 2.0 Pearl, Effect (the original),
  the Vibe and Raw Hammer lines (each is several balls on one core: Purple
  Vibe, Ocean Vibe and so on; pick them one by one).
- **Ebonite / Track / Columbia 300:** The One line beyond Ovation, Game Breaker
  line beyond 4 and 5, more of the Track Paradox and Kinetic lines. Columbia 300
  "Delta Force" and "Swing" were not found under those names on bowwwl or
  bowling.com (only Dynamic Swing, Power Swing and so on).
- **DV8 / Radical:** Violent Collision, Hooligan, Zombie, Radical Deep Impact,
  No Doubt, Intel Tour, Evil Eye Pearl.
- **MOTIV:** about 100 MOTIV rows have no release date. `parse-motiv` reads them
  from motivbowling.com once that host is allowed (ADR-061 permission).
- **USBC:** the approved list has about 2,000 rows for the four original brands
  alone, so the long tail is large. Recent releases first.

## Images

None of the balls added here has an image. Where clean ones can come from, best
first:

1. **Ask the brands, as MOTIV was asked** (ADR-061). Brunswick (which owns
   Hammer, Ebonite, Track, Radical, DV8 and Columbia 300) and Storm (Storm, Roto
   Grip, 900 Global) each publish dealer media kits with transparent product
   renders. One permission email per group covers eleven of the twelve brands,
   and settles the rights question ADR-039 and ADR-119 left open.
2. **The manufacturers' own product pages.** The Brunswick-family sites
   (brunswickbowling.com, hammerbowling.com and the rest) are Shopify stores,
   so `https://<host>/products/<handle>.json` returns the product's image URLs
   as JSON: deterministic, one request per ball, no scraping of HTML. The
   handle is the last path segment of the product page URL, and many backlog
   files carry that URL in `_notes`. Storm's group serves images from the SPI
   CDN that `scripts/sync-catalog/pipeline/sources.ts` already knows
   (`BRAND_FOLDER`; add nothing for Storm, Roto Grip, 900 Global).
3. **Then the existing pipeline:** `npm run add-ball-image -- "<name>" "<url>"`,
   `npm run fetch-images`, `npm run contact-sheet`, and look at the sheet in
   both themes. The normaliser trims, scales and centres every image the same
   way, so source framing does not matter.
4. **A photo without transparency** (a ball on white) can be cut out offline
   with a background-removal model (for example `rembg`, which runs locally)
   before the normaliser. Check every cut on the contact sheet: a bad alpha edge
   is obvious to an eye and invisible to a test.
5. **Never a retailer's photo** (the `gather-ball-specs` rule). A ball with no
   manufacturer image keeps the placeholder.

Hosts to allow for the image work: the manufacturer domains above, and the SPI
CDN host in `sources.ts`.

## The balls

### Added to the catalog in this run (54)

Every row carries `readVia: "web-search"` in `balls.json`.

| Brand | Ball | Released | Coverstock | Core | RG | Diff | MB diff |
|---|---|---|---|---|---|---|---|
| 900 Global | Cove | **?** | RB 85 Hybrid | Magna A.I. | 2.49 | 0.044 | (sym) |
| 900 Global | Ember | **?** | Reserve Blend 82 Pearl | Magna A.I. | 2.49 | 0.044 | (sym) |
| 900 Global | Portal | 2026-10-02 | RB 92 Solid | Conduit A.I. | 2.59 | 0.05 | 0.019 |
| 900 Global | Vengeance | 2026-01 | RB91 | Blast A.I. | 2.47 | 0.055 | (sym) |
| Brunswick | Combat | 2025-08 | Alpha Premier Pearl | Rampart | 2.502 | 0.051 | 0.019 |
| Brunswick | Combat Hybrid | 2026-02 | Alpha Premier Hybrid | Rampart | 2.502 | 0.051 | 0.019 |
| Brunswick | Combat Solid | 2026-08 | Alpha Premier Solid | Rampart | 2.502 | 0.051 | 0.019 |
| Columbia 300 | Pulse | 2025-08 | Hyperflex | Pulse PowerCOR | 2.468 | 0.045 | (sym) |
| DV8 | Severe Collision | 2025-07 | HK22C Havoc Hybrid | Collision | 2.462 | 0.052 | 0.019 |
| Ebonite | Entity | 2025-07-10 | HK22C Optimize Solid | Entity | 2.515 | 0.052 | 0.02 |
| Ebonite | Game Breaker 4 | **?** | GB 12.0 Solid | Enhanced V2 | 2.48 | 0.048 | (sym) |
| Ebonite | Real Time | **?** | HK22 with GB13.7 Solid | Big Time | 2.508 | 0.054 | (sym) |
| Hammer | Black Pearl Urethane | 2024-03 | Urethane Pearl 78D | LED | 2.65 | 0.015 | (sym) |
| Hammer | Black Widow 2.0 | 2020-11 | Aggression Solid | Gas Mask | 2.5 | 0.058 | 0.016 |
| Hammer | Black Widow 2.0 Hybrid | **?** | Aggression Hybrid | **?** | 2.5 | 0.058 | 0.016 |
| Hammer | Black Widow 3.0 | 2024-01 | Aggression Solid | Gas Mask | 2.5 | 0.058 | 0.016 |
| Hammer | Black Widow 3.0 Dynasty | 2026-01 | Cohesion Solid | Gas Mask | 2.5 | 0.058 | 0.016 |
| Hammer | Black Widow Mania | 2025-01 | Cohesion Pearl | Gas Mask | 2.5 | 0.058 | 0.016 |
| Hammer | Black Widow Tour V1 | 2025-09 | Aggression Hybrid | Gas Mask Low Diff | 2.5 | 0.034 | 0.016 |
| Hammer | Effect Tour | 2024-11 | TourV3 Solid | Huntsman Tour | 2.472 | 0.036 | 0.012 |
| Hammer | Full Effect | 2026-03 | HK22C² | Huntsman | 2.47 | 0.05 | 0.017 |
| Hammer | Maximum Effect | 2025-09 | Cohesion Hybrid | Huntsman | 2.47 | 0.05 | 0.017 |
| Hammer | Purple Pearl Urethane 78D | 2026-03 | Urethane Pearl 78D | Super LED | 2.632 | 0.034 | (sym) |
| Hammer | Scorpion Low Flare | 2024-01 | Semtex Hybrid | LED 3.0 | 2.474 | 0.031 | (sym) |
| Hammer | Scorpion Sting | 2022-09 | Semtex Pearl | LED 3.0 | 2.485 | 0.045 | (sym) |
| Hammer | Scorpion Strike | 2024-07 | Semtex Pearl | LED 3.0 | 2.485 | 0.045 | (sym) |
| Radical | Bonus | **?** | Forged Solid | Bonus | 2.487 | 0.03 | (sym) |
| Radical | Vexed | **?** | HK22C+ solid reactive | **?** | 2.498 | 0.036 | 0.012 |
| Roto Grip | Attention Star | **?** | eTrax Plus Pearl | Momentous AV + A.I. | 2.48 | 0.049 | 0.017 |
| Roto Grip | Hustle Camo | **?** | VTC Solid | **?** | 2.53 | 0.03 | (sym) |
| Roto Grip | Hustle Wine | **?** | VTC Pearl | **?** | 2.53 | 0.03 | (sym) |
| Roto Grip | Idol Helios | **?** | XtremeTrax | **?** | 2.49 | 0.052 | (sym) |
| Roto Grip | Idol Pearl | **?** | eTrax-P18 | **?** | 2.49 | 0.052 | (sym) |
| Roto Grip | Perfect Gem | **?** | E-R1 Solid | Gem + A.I. | 2.49 | 0.057 | 0.017 |
| Roto Grip | Rockstar | 2025-02 | NanoStar Solid | Rocker + A.I. | 2.48 | 0.05 | (sym) |
| Roto Grip | Rockstar Amped | 2025-10 | NanoStar Pearl | **?** | 2.48 | 0.05 | (sym) |
| Roto Grip | RST Hyperdrive | **?** | MicroTrax | **?** | 2.52 | 0.055 | 0.017 |
| Roto Grip | X-Cell | **?** | eTrax ULTRA | **?** | 2.5 | 0.056 | 0.019 |
| Storm | !Q Tour Fusion | **?** | R2S Hybrid | Centripetal Control | 2.49 | 0.029 | (sym) |
| Storm | Crux Prime | **?** | SPEC Solid | Catalyst | 2.5 | 0.052 | 0.017 |
| Storm | Drive | 2018-02 | R2S Nano Hybrid | Dual-Drive | 2.57 | 0.05 | (sym) |
| Storm | Hy-Road 40 | 2025-06 | A1S Pearl | **?** | 2.57 | 0.046 | (sym) |
| Storm | Hy-Road Max | **?** | NeX Solid | Inverted Fe2 | 2.57 | 0.046 | (sym) |
| Storm | Hy-Road X | **?** | R2X | **?** | 2.57 | 0.046 | (sym) |
| Storm | Next Factor | 2025-12 | R3S Pearl Reactive | RAD-TQ | 2.56 | 0.051 | 0.017 |
| Storm | Nova | **?** | R2X Hybrid | Ignition | 2.49 | 0.052 | 0.019 |
| Storm | Phaze 4 | **?** | R2S Pearl Reactive | Velocity | 2.48 | 0.051 | (sym) |
| Storm | Phaze A.I. | **?** | TX-16 Pearl Reactive | Velocity A.I. | 2.47 | 0.053 | (sym) |
| Storm | Phaze III | **?** | R3S Hybrid | Velocity | 2.48 | 0.051 | (sym) |
| Storm | Super Nova | **?** | NeX Solid | Ignition | 2.49 | 0.052 | 0.019 |
| Storm | Trend | **?** | R2S Pearl | Piston | 2.52 | 0.049 | (sym) |
| Track | Theorem | 2023-12-07 | Prime Response Hybrid (HK22) | MC2 | 2.473 | 0.046 | 0.017 |
| Track | Theorem Pearl | 2024-11 | Prime Response Pearl (HK22) | MC2 | 2.473 | 0.046 | 0.017 |
| Track | Theorem Solid | 2025-08-14 | Super Response Solid (HK22C) | MC2 | 2.473 | 0.046 | 0.017 |

### Researched but not added (71)

Candidate files are in `scripts/sync-catalog/data/backlog/`, with every reading found so far and a `_notes` field. **Missing** names the fields with no two-site reading.

| Brand | Ball | Why not added | Missing | Notes from the reader |
|---|---|---|---|---|
| 900 Global | Dream | missing coverstockRaw; sourceUrls must be non-empty | coverstockRaw, rg, diff, coreName, releaseDate, mbDiff, factoryFinish | bowwwl: original Dream released Aug 2014, S74 Response Pearl, Identity core, RG 2.480 diff 0.054 only from similar-balls table (no 15 lb). bowling.com has no Dream page. Thin. |
| 900 Global | Dream On | ASYM_NO_MBDIFF: check says asymmetric; no two-site mbDiff | coreName, releaseDate, mbDiff, factoryFinish | Asymmetric Identity core. bowwwl release Feb 2018 only. mbDiff 0.024 from bowwwl only. MBDIFF: bowlersmart.com states 15 lb 'RG, .054 differential, and .024 intermediate differential' for Dream On. bowwwl.com shows 0.024 MB Diff in a Similar Balls row with no weight stated; bowling.com gives no mass |
| 900 Global | Eternity Pi | missing rg, diff | rg, diff, releaseDate, mbDiff, factoryFinish | Asymmetric. bowwwl release Sep 2023 only. bowwwl RG 2.490/diff 0.050/mb 0.014 weight ambiguous; bowling.com states 15 lb 2.49/0.050/0.014, so numbers left []. |
| 900 Global | Sublime | Held back by review: the blind check found the Sublime's own bowwwl page lists only 13 and 12 lb rows, and 2.470 / 0.056 are the Sublime Focus's numbers. The gathered readings are probably the wrong ball. | releaseDate, mbDiff | Symmetric Immersed A.I. core. bowwwl release Dec 2023 only. |
| 900 Global | Zen 25 | missing coverstockRaw; sourceUrls must be non-empty | coverstockRaw, rg, diff, coreName, releaseDate, mbDiff, factoryFinish | bowwwl self-conflicts (S77 Response Pearl vs RB 83 Pearl; Melee Low RG vs Meditate A.I.), no 15 lb row. bowling.com 15 lb: RG 2.48, diff 0.053, Meditate Symmetric A.I., Reserve Blend 83 Pearl Reactive, Power Edge. bowwwl release Jan 2025 only. No two-site agreement on any field. |
| Brunswick | Alert | missing rg, diff | rg, diff, coreName, releaseDate, mbDiff, factoryFinish | Oct 2025 release only on bowwwl; factory finish only on bowlingthismonth (500/1000/2000 SiaAir); core name Alert only on bowlingball.com. 15 lb values: only bowwwl states 15 lb; bowlingthismonth/bowlingball.com print unlabeled weight values that agree, so rg/diff/mbDiff left [] under the 15 lb-state |
| Brunswick | Crown Victory | missing rg, diff | rg, diff, mbDiff, factoryFinish | Hybrid cover. Finish conflict: bowwwl says 500/1000/1500 Siaair + Crown Factory Compound, bowlingthismonth says 1500 SiaAir + Crown Factory Compound, so factoryFinish []. Product page: https://www.bowlingball.com/products/bowling-balls/brunswick/17814/crown-victory.html . 15 lb: only bowwwl states 1 |
| Brunswick | Crown Victory Pearl | missing rg, diff | rg, diff, mbDiff | Product page: https://www.bowlingball.com/products/bowling-balls/brunswick/18067/crown-victory-pearl.html . 15 lb: only bowwwl states 15 lb (RG 2.540, diff 0.045); other sites print unlabeled weight values that agree, so rg/diff left [] under the 15 lb-stated rule. |
| Brunswick | Danger Zone | missing rg, diff | rg, diff, mbDiff, factoryFinish | 2025 relaunch of the 1996 ball. bowwwl states 15 lb RG 2.501 / diff 0.048; bowlingball.com/btm unlabeled values agree, so rg/diff []. Factory finish only on btm (500/1000/2000 SiaAir with Crown Factory Compound). Product page: https://www.bowlingball.com/products/bowling-balls/brunswick/17986/danger |
| Brunswick | Energize | missing rg, diff | rg, diff, releaseDate, mbDiff, factoryFinish | Release 10/23/2025 only on bowlingball.com (bowwwl shows none). bowwwl cover uses an en dash (HK22C – EVO Hybrid) so not used. Finish only btm (500/1000/1500 SiaAir with Crown Factory Compound). 15 lb: bowwwl states RG 2.478, diff 0.048, mbDiff 0.017; others unlabeled and agree. Product page: https: |
| Brunswick | Ethos | missing coverstockRaw | coverstockRaw, rg, diff, releaseDate, mbDiff, factoryFinish | Original Ethos (pearl; Ethos Hybrid Oct 2024 and Ethos Solid Jun 2025 are separate balls, not written). Ethos core is symmetric. rg/diff left [] because the bowwwl 15 lb figure (RG 2.481, diff 0.053: 'At 15 lb the RG is 2.481 with a differential of 0.053') came from the core's table, not the ball pa |
| Brunswick | Fanatic | missing coverstockRaw; sourceUrls must be non-empty | coverstockRaw, rg, diff, coreName, releaseDate, mbDiff, factoryFinish | Original Fanatic: bowwwl only (Jul 2016, Relativity V Max cover, I-Block symmetric core, RG 2.540 diff 0.052 at 15 lb). bowling.com results only had Fanatic BTU, so no second source. See brunswick-fanatic-btu.json. |
| Brunswick | Fanatic BTU | missing rg, diff | rg, diff, mbDiff, factoryFinish | BTU cover. SYMMETRIC: bowling.com: 'Low Differential I-Block Symmetric'. rg/diff only bowling.com (RG 2.601 diff 0.030, 15#), bowwwl gave none. productUrl https://www.bowling.com/products/discontinued/brunswick-fanatic-btu.htm is a retailer. |
| Brunswick | Hypnotize | missing rg, diff | rg, diff, mbDiff | 15 lb: only bowwwl states 15 lb (RG 2.510, diff 0.056, mbDiff 0.017); others unlabeled and agree. Product page: https://www.bowlingball.com/products/bowling-balls/brunswick/17786/hypnotize.html |
| Brunswick | Infinity Quest | missing rg, diff | rg, diff, mbDiff | Solid. 15 lb: only bowwwl states 15 lb (RG 2.521, diff 0.051, mbDiff 0.010); others unlabeled and agree. Product page: https://www.bowlingball.com/products/bowling-balls/brunswick/17850/infinity-quest.html |
| Brunswick | Infinity Quest Pearl | missing rg, diff | rg, diff, releaseDate, mbDiff | Release date: bowwwl snippet shows none; btm June 2026 is review date. 15 lb: bowwwl states RG 2.521, diff 0.051, mbDiff 0.010 at 15 lb; other sites unlabeled (agree), so rg/diff/mbDiff []. Product page: https://www.bowlingball.com/products/bowling-balls/brunswick/18349/infinity-quest-pearl.html |
| Brunswick | Kingpin | missing coverstockRaw; sourceUrls must be non-empty | coverstockRaw, rg, diff, coreName, releaseDate, mbDiff, factoryFinish | Original Kingpin (Oct 2017). Sources conflict/thin: bowling.com says RG 2.518 diff 0.055 (15 lb) and release Oct 2017; bowwwl only gave Kingpin Ultra Low RG core page data (2.483/0.055) so no ball-page reading. Nothing with two sites. Asymmetric core Kingpin Ultra Low RG. |
| Brunswick | Melee Jab | missing rg | rg, releaseDate, mbDiff, factoryFinish | SYMMETRIC: bowwwl.com: 'The core is the Melee Low RG symmetric'. RG conflict: bowwwl 2.487 at 15 lb vs bowling.com 2.537 (bowling.com lists 2.487 for Blood Red/Midnight Blue/Carbon), so rg []. Release Dec 2014 (bowwwl 'released in December 2014'); bowling.com only says 'listed December 2014' so not  |
| Brunswick | Mindset | missing rg, diff | rg, diff, releaseDate, mbDiff, factoryFinish | Asymmetric Mindset core. bowling.com 'Mindset Solid' page: RG 2.487 (15#), diff 0.050 (15#); bowlingthismonth: RG 2.487, diff 0.050, intermediate diff 0.021 (weight not stated); bowwwl gave 15 lb figures only for Perfect Mindset (sibling, not used). So rg/diff/mbDiff []. Release Mar 2023 bowwwl only |
| Brunswick | Prism Solid | missing coverstockRaw | coverstockRaw, releaseDate, mbDiff, factoryFinish | Only the Solid was worked; Prism Hybrid, Prism Warp and Prism Warp Hybrid exist as separate balls (Portal core, 2.465/0.051). releaseDate Oct 2019 for Solid came from bowwwl only (bowling.com dated the Hybrid). bowling.com rg/diff quote is a shared-line statement covering the Prism models incl. Soli |
| Brunswick | Quantum Evo Hybrid | ASYM_NO_MBDIFF: check says asymmetric; no two-site mbDiff | releaseDate, mbDiff, factoryFinish | Asymmetric QCS-18, no mbDiff found (so []). releaseDate: bowwwl says August 2022 but bowlingthismonth only gives a review date (August 2022), so []. factoryFinish wording differs (bowling.com '500 and 2000 Siaair Micro Pad' vs BTM '500 / 2000 SiaAir'), left []. diff: bowwwl 0.052 vs bowling.com 0.05 |
| Brunswick | Quantum Evo Pearl | missing coverstockRaw | coverstockRaw, rg, diff, mbDiff | Cover wording differs between sites (Evolution Pearl Reactive vs Evolution Reactive pearl) so coverstockRaw []. 15 lb: bowwwl states RG 2.511, diff 0.053, mbDiff 0.024; bowlingball unlabeled agrees. Product page: https://www.bowlingball.com/products/bowling-balls/brunswick/16581/quantum-evo-pearl.ht |
| Brunswick | Quantum Evo Solid | missing coverstockRaw | coverstockRaw, rg, diff, mbDiff, factoryFinish | Cover wording differs (Evolution Solid vs Evolution Reactive solid) so coverstockRaw []. Finish only bowlingball (500/1500 Siaair). 15 lb: bowwwl states RG 2.502, diff 0.048, mbDiff 0.012; bowlingball unlabeled agrees. Product page: https://www.bowlingball.com/products/bowling-balls/brunswick/16580/ |
| Brunswick | Rhino | missing coverstockRaw | coverstockRaw, releaseDate, mbDiff, factoryFinish | 2016 Rhino (solid and pearl colorways are separate bowwwl pages; same core). SYMMETRIC: bowwwl.com: 'Brunswick Light Bulb symmetric core'. Release May 2016 bowwwl only. Coverstock R-16 solid / R-16 pearl differ by colorway so []. bowling.com reading is from the Blue/Cadet Grey/Silver Pearl colorway  |
| Brunswick | Strategy | missing rg, diff | rg, diff, releaseDate, mbDiff, factoryFinish | Not found on bowwwl. Release April 16, 2026 only on bowlingball.com (btm April 2026 is review date). Finish only on btm. 15 lb not stated anywhere (unlabeled RG 2.509, diff 0.047, mbDiff 0.016 agree on btm and bowlingball.com). Product page: https://www.bowlingball.com/products/bowling-balls/brunswi |
| Brunswick | Zenith | missing coverstockRaw; sourceUrls must be non-empty | coverstockRaw, rg, diff, coreName, releaseDate, mbDiff, factoryFinish | Solid original (Nov 2020; Pearl Mar 2021 and Hybrid Aug 2021 are separate). bowling.com Zenith Solid: RG 2.485 diff 0.052 (15 lb); BTM same numbers but no weight stated; bowwwl ball page figures conflict (summary showed Kingpin Ultra Low RG 2.483/0.055) and the 15 lb 2.485/0.052 came from the core p |
| DV8 | Brutal Nightmare | missing rg, diff | rg, diff, mbDiff, factoryFinish | 2013 ball (outside 2024-26). RG: bowwwl 15 lb 2.505 vs bowlingball.com 2.557 (weight unstated), conflict, so []. Finish only bowlingball.com. |
| DV8 | Hater | Held back by review: the bowwwl 15 lb quote came from the Hater core page, not the ball's page. | mbDiff, factoryFinish | Original Hater (bowling.com calls it Hater Hybrid, bowlingball.com 'Hater'). Finish: only bowlingball.com (500/1500 Siaair micro pad), so []. mbDiff 0.024 at 15 lb only from bowling.com, so []. bowwwl 15 lb values come from its Hater core page. |
| DV8 | Hater Pearl | Held back by review: the bowwwl 15 lb quote came from the Hater core page, not the ball's page. | mbDiff, factoryFinish | Finish: bowwwl 500/1000/1500 Siaair and Crown Factory Compound only one site, so []. 15 lb RG/diff: bowwwl value is from the shared Hater core page. mbDiff 0.024 only bowling.com. |
| DV8 | Heckler | missing rg, diff | rg, diff, mbDiff | Solid Heckler (Nov 2024). 15 lb RG/diff/mbDiff (2.504/0.051/0.010) stated only by bowling.com; bowwwl gives 16 lb, bowlingball.com and bowlingthismonth state no weight, so rg/diff/mbDiff []. Finish bowwwl+bowlingthismonth agree on 500/2000 Siaair. |
| DV8 | Heckler Hybrid | missing rg, diff | rg, diff, mbDiff, factoryFinish | Nov 2025. Finish only bowwwl (500/1000/1500 Siaair, Crown Factory Compound). RG/diff 15 lb only bowling.com, so []. |
| DV8 | Heckler Taunt | missing rg, diff | rg, diff, mbDiff | June 2026. bowwwl says Unholy core asymmetric, bowlingthismonth says symmetrical (conflict, core name agrees). 15 lb RG/diff only bowling.com, so []. |
| DV8 | Intense Collision | missing coverstockRaw | coverstockRaw, rg, diff, mbDiff, factoryFinish | August 2026. Coverstock spelling differs (HK22C2 vs HK22C superscript 2) and finish spelling differs, so []. 15 lb specs only bowling.com (2.462/0.052/0.019), bowwwl gave 16 lb, so []. |
| DV8 | Pitbull Bark | Held back by review: one of its two mbDiff readings is a generic bowlersmart line covering several Pitbull listings, not this ball's page. |  | bowwwl+bowling.com agree on 15 lb RG/diff. Finish is 1000 grit Siaair Micro Pad (bowling.com prints '1,000', bowlingball.com '1000'), value kept as 'Siaair Micro Pad' so quotes match. mbDiff: bowwwl table shows 0.020 but no second 15 lb source. bowling.com: https://www.bowling.com/products/dv8-pitbu |
| DV8 | Pitbull Bite | ASYM_NO_MBDIFF: check says asymmetric; no two-site mbDiff | mbDiff | bowwwl and bowling.com both state 15 lb RG/diff. mbDiff: only bowlingball.com states 0.020 without a weight, so []. Coverstock/core/finish agreed by bowwwl+bowling.com. bowling.com page: https://www.bowling.com/products/discontinued/dv8-pitbull-bite.htm MBDIFF: bowwwl.com states 15 lb Pitbull Bite M |
| DV8 | Pitbull Growl | Held back by review: one of its two mbDiff readings is a generic bowlersmart line covering several Pitbull listings, not this ball's page. | factoryFinish | bowwwl+bowling.com agree on 15 lb RG/diff. Finish disagrees in format (bowling.com 500/2,000 Siaair Micro Pad; bowlingthismonth 500 / 2000 SiaAir), left []. mbDiff 0.020 at 15 lb only from bowwwl. bowling.com: https://www.bowling.com/products/dv8-pitbull-growl.htm |
| DV8 | Thug | missing rg, diff | rg, diff, coreName, mbDiff, factoryFinish | Original Thug (Oct 2014), outside 2024-26. Core ambiguous (Medium RG vs Low RG Thug), RG range only, so those []. bowlingball.com page: https://www.bowlingball.com/products/bowling-balls/dv8/11772/thug.html |
| Ebonite | Game Breaker 5 Pearl | missing rg, diff | rg, diff, mbDiff, factoryFinish | rg/diff/mbDiff: bowlingball.com lists RG 2.480, diff 0.048 with no weight stated; bowwwl lists 13 lb only (2.574/0.040). No 15 lb pair, so []. Manufacturer URL not searched. |
| Ebonite | The One Ovation | missing rg, diff | rg, diff, mbDiff, factoryFinish | Release Sep 2025 on both sites. Only bowling.com gave 15 lb values (RG 2.466, diff 0.056, mass bias 0.027); bowwwl gave only 12 lb (RG 2.593, diff 0.041, MB 0.014) and itself flags that the numbers match The One Remix, so rg/diff/mbDiff []. Core disagreement: both name Centrex Symmetrical Mass Bias  |
| Ebonite | Turbo X | missing rg, diff | rg, diff, mbDiff, factoryFinish | Current (2025) Turbo X; not the 1990s original. rg/diff: bowlingball.com lists RG 2.517 / .040 with no weight; bowwwl lists 16 lb (2.527/0.035). Disagree and no 15 lb, so []. Coverstock string shortened to 'GB 10.7 Solid' (bowwwl 'HK22 - GB 10.7 Solid', bowlingball.com 'HK22 GB 10.7 Solid'). Manufac |
| Ebonite | Turbo/R | missing coverstockRaw | coverstockRaw, rg, diff, coreName, mbDiff, factoryFinish | May 2017. rg/diff []: bowling.com states 15 lb (RG 2.59, diff 0.035) but bowwwl base entry (2.590/0.035) does not state weight. coverstock/core only on bowwwl (GB 10.7 Solid, Turbo/R symmetric core); budget ran out before a second source. |
| Hammer | Black Widow Urethane | missing coverstockRaw | coverstockRaw, mbDiff | Dec 2017 original per bowwwl and bowling.com. hammerbowling.com lists a 'Black Widow Urethane' page with Feb 25, 2022 release (likely a re-release); date not used there. Cover wording differs (Urethane Solid vs Urethane) so omitted. |
| Hammer | Effect | missing rg, diff | rg, diff, factoryFinish | RG/diff 2.470/0.050 (15 lb) only on hammerbowling.com; bowwwl's 2.483/0.043 is 16 lb. Productpage: https://hammerbowling.com/products/hammer-effect |
| Hammer | Envy | ASYM_NO_MBDIFF: check says asymmetric; no two-site mbDiff | releaseDate, mbDiff, factoryFinish | Asymmetric Launcher core; mbDiff 0.021 bowwwl only so []. Release Sep 2022 bowwwl only. bowwwl noted an inconsistent 2.537/0.053 snippet on the page; 2.505/0.055 from the core table matches bowling.com. |
| Hammer | NU Blue Hammer | missing coverstockRaw | coverstockRaw, releaseDate, mbDiff, factoryFinish | SYMMETRIC: bowwwl.com: 'a symmetric LED core'. Release Nov 2023 bowwwl only. Cover is non-urethane (wording differs). Finish 500/1000 Siaair Micro Pad bowling.com only. |
| Hammer | Obsession | ASYM_NO_MBDIFF: check says asymmetric; no two-site mbDiff | coreName, releaseDate, mbDiff, factoryFinish | Asymmetric. mbDiff: BTM 0.013 (weight not stated), bowwwl 0.011 at 16 lb, so []. Release Feb 2021 bowwwl only (BTM gives review month). bowling.com page is 'Obsession Solid'. Core name not in two quotes ('Obsession core' bowling.com only). |
| Hammer | Purple Pearl Urethane | missing coverstockRaw | coverstockRaw, mbDiff, factoryFinish | Productpage: https://hammerbowling.com/products/purple-pearl-urethane. Release is year-only on bowling.com. |
| Hammer | Rip'D Solid | ASYM_NO_MBDIFF: check says asymmetric; no two-site mbDiff | mbDiff, factoryFinish | Asymmetric. mbDiff 0.014 only on bowwwl so []. Manufacturer spelling Rip'D. |
| Hammer | Special Effect | ASYM_NO_MBDIFF: check says asymmetric (mbDiff 0.017); no two-site mbDiff | mbDiff, factoryFinish | Productpage: https://hammerbowling.com/products/hammer-special-effect. mbDiff 0.017 only on hammerbowling.com. MBDIFF: bowlersmart.com states 15 lb Special Effect 'an intermediate differential of .017' (RG 2.470, diff .050). bowling.com prints an unlabeled '0.017 (15#)' ('probably the mass bias diff |
| Radical | Evil Eye | missing coverstockRaw | coverstockRaw, coreName, releaseDate, mbDiff, factoryFinish | Oct 2025 only bowwwl. Coverstock: bowwwl HK22C vs bowling.com 'HK22 solid reactive', not the same string, so []. mbDiff 0.009 to 0.023 range per drilling, not recorded. Core name not stated by two sites. |
| Radical | Incognito | missing coverstockRaw | coverstockRaw, releaseDate, mbDiff, factoryFinish | Nov 2020 release only from bowwwl (bowlingthismonth gives review dates only), so []. Coverstock S.H.A.R.P. only bowwwl; finish only bowlingthismonth. mbDiff 0.017 at 15 lb only bowwwl. Core name from bowwwl core page title and bowling.com's The Spy sentence. |
| Radical | Katana Dragon | Held back by review: one mbDiff reading is bowlersmart's "mass bias strength", which may not be the intermediate differential. | factoryFinish | June 2018. mbDiff 0.020 only from bowwwl; finish only bowling.com (500, 1000, and 2000 Siaair Micro Pad). |
| Radical | Outer Limits Black Hole | missing coverstockRaw | coverstockRaw, releaseDate, factoryFinish | Jan 2026 only bowwwl; coverstock (HK-22C solid) and finish only bowling.com. |
| Roto Grip | Exit | missing coverstockRaw; sourceUrls must be non-empty | coverstockRaw, rg, diff, coreName, releaseDate, mbDiff, factoryFinish | Only bowwwl found (Feb 2025, Hyper Response II pearl, Defense A.I. core, RG 2.490 diff 0.053, weight not stated). BTM and BowlerX returned nothing for Exit. |
| Roto Grip | Transformer | missing rg, diff | rg, diff, releaseDate, mbDiff, factoryFinish | bowwwl release Jan 2026 only. RG 2.51/diff 0.051/mb 0.015: bowling.com states 15 lb; bowwwl does not label the weight clearly (inferred), so left []. |
| Roto Grip | UFO | ASYM_NO_MBDIFF: check says asymmetric; no two-site mbDiff | coreName, mbDiff, factoryFinish | Asymmetric. mbDiff 0.016 only from bowwwl. Core E.T. worded differently, left []. MBDIFF: bowlersmart.com: 'RG (15LB): 2.52, Differential (15LB): .054, Mass Bias Strength: .016'. bowling.com gives no mass bias; bowwwl.com UFO figures only appear indirectly in the Clone comparison table with no 15 lb |
| Roto Grip | Vintage Gem | missing coverstockRaw; sourceUrls must be non-empty | coverstockRaw, rg, diff, coreName, releaseDate, mbDiff, factoryFinish | bowwwl page exists (Oct 2025 overseas, eTrax Plus, Defiant LRG); BTM has no page. No second source. |
| Storm | Incite | missing rg, diff | rg, diff, releaseDate, mbDiff | bowwwl RG 2.500/diff 0.053/int 0.013 weight unstated; bowling.com only has 'Incite Hybrid' page (15 lb RG 2.50, diff 0.053), not confirmed same ball; rg/diff/mbDiff []. Release Feb 2021 only bowwwl. |
| Storm | Marvel Maxx | missing coverstockRaw; sourceUrls must be non-empty | coverstockRaw, rg, diff, coreName, releaseDate, mbDiff, factoryFinish | Only bowwwl (original 2014, NRG Smooth Solid, Centripetal, RG 2.480 diff 0.050, weight unstated); bowling.com search returned no Marvel Maxx. Nothing with two readings. |
| Storm | Marvel S | missing rg, diff | rg, diff, mbDiff, factoryFinish | Manufacturer spelling Marvel-S. bowwwl release Jul 2013, bowlingball.com July 16, 2013. SYMMETRIC: bowwwl 'Centripetal symmetric' (bowwwl.com); bowlingball.com 'symmetric core'. bowlingball.com RG 2.48 / diff 0.050 has no weight stated, so rg/diff [] despite bowwwl 15 lb RG 2.480, diff 0.050. Finish |
| Storm | Motor Rev | missing coverstockRaw; sourceUrls must be non-empty | coverstockRaw, rg, diff, coreName, releaseDate, mbDiff, factoryFinish | bowwwl only (Dec 2025, RX Pro Pearl, Torque A.I., overseas release). Search budget exhausted before bowling.com. |
| Storm | Parallax | ASYM_NO_MBDIFF: check says asymmetric; no two-site mbDiff | releaseDate, mbDiff, factoryFinish | bowwwl: Aug 2020 (only source for date). 15 lb on bowwwl: RG 2.520, diff 0.054, MB Diff 0.019 (one source, mbDiff []). Asymmetric Aeroflo. Finish 1500-grit Polished only on bowling.com. Distinct from Parallax Effect (pearl). |
| Storm | PhysiX | SYMMETRY_UNKNOWN: no mbDiff and no source says the core (atomic) is symmetric | releaseDate, mbDiff | bowling.com 15 lb: RG 2.48, diff 0.053; bowwwl states RG 2.480, diff 0.053, MB 0.017 but weight not tied to the numbers in the result, so rg/diff/mbDiff []. Release Oct 2018 only bowwwl. Update: 15 lb RG/diff from bowlersmart.com and bowling.com. mbDiff 0.017 (15 lb) only on bowlersmart.com (bowling |
| Storm | Star Road | missing coverstockRaw; sourceUrls must be non-empty | coverstockRaw, rg, diff, coreName, releaseDate, mbDiff, factoryFinish | bowwwl only (Oct 2025, NRG Solid, Inverted Fe2, RG 2.570 diff 0.046, weight unstated). Search budget exhausted before bowling.com. |
| Storm | Sure Lock | Held back by review: bowwwl names two different cores for it (Nirvana Ultra Low RG Asymmetric, and RAD-X), so the core and its symmetry are unsettled. | diff, mbDiff, factoryFinish | bowwwl contradicts itself on core (Nirvana Ultra Low RG Asymmetric header vs RAD-X Core in spec section); RAD-X agrees with bowling.com, recorded from the bowwwl spec section sentence. bowwwl diff 0.054 has no weight stated, so diff [] (bowling.com 15 lb diff 0.054 only one). mbDiff not seen. Finish |
| Storm | Torrent | missing rg, diff | rg, diff, releaseDate, mbDiff | bowwwl: release February 2017 (only source). bowwwl RG/diff given at 16 lb only; bowling.com 15 lb RG 2.56, diff 0.044, so rg/diff []. SYMMETRIC: bowwwl 'Booster HV symmetric' (bowwwl.com), mbDiff []. |
| Storm | Trend 2 | missing rg | rg, releaseDate, mbDiff, factoryFinish | bowwwl RG 2.540 weight unstated so rg []. Symmetric. |
| Track | Kinetic Ruby | ASYM_NO_MBDIFF: check says asymmetric; no two-site mbDiff | releaseDate, mbDiff, factoryFinish | bowwwl: release July 2017 (only source); bowling.com no date. bowwwl 15 lb mass bias diff 0.005 only one source so mbDiff []. Finish 500/2000 Abralon only on bowwwl. Asymmetric core (bowwwl). |
| Track | Paradox Black | missing rg, diff | rg, diff, releaseDate, mbDiff | bowwwl: release November 2017, discontinued; bowling.com (X-OUT page) gave no release date so releaseDate []. bowwwl RG 2.480 / diff 0.057 / MB 0.015 is the 'general listing' with weight not stated (16 lb page is 2.490/0.049), so rg/diff/mbDiff [] even though bowling.com states 15 lb RG 2.48, diff 0 |
| Track | Stealth Mode Hybrid | missing rg, diff | rg, diff, mbDiff, factoryFinish | Feb 2026. rg/diff []: only bowlersmart states 15 lb (RG 2.482, diff .056); bowwwl's 15 lb figures belong to the shared Stealth core page, not this ball; trackbowling.com page has no core table. bowwwl listing URL not confirmed for this ball (stealth-mode-hybrid equipment page only); sourceUrl for bo |
| Track | Theorem Delta | missing rg, diff | rg, diff, mbDiff, factoryFinish | Aug 2026. rg/diff/mbDiff []: only bowlersmart states 15 lb (RG 2.473, diff .046, int diff .017); trackbowling.com page snippet had no core table; bowwwl has no Delta page. Candidates if a second 15 lb source confirms: 2.473/0.046/0.017. Manufacturer page https://trackbowling.com/products/theorem-del |

### Coverstock names the classifier cannot place

These rows have `coverstockCategory: null`, so the catalog's cover filter misses
them. The value is the text both sites shared; a fuller name from the page
(e.g. "MicroTrax Solid Reactive") would classify it.

- 900 Global Vengeance: "RB91"
- Columbia 300 Pulse: "Hyperflex"
- Hammer Full Effect: "HK22C²"
- Roto Grip Idol Helios: "XtremeTrax"
- Roto Grip Idol Pearl: "eTrax-P18" (one page also spells it xTrax-P18)
- Roto Grip RST Hyperdrive: "MicroTrax"
- Roto Grip X-Cell: "eTrax ULTRA"
- Storm Hy-Road X: "R2X"

### Readings a page should settle

- **Perfect Gem's release date** was dropped: both readings said October 2026,
  but bowling.com pages carry an "October 2026" footer that is not a release
  date, and the quote reads like it.
- **Full Effect, Maximum Effect, Special Effect** print the same 15 lb numbers
  as the Effect (2.470 / 0.050 / 0.017). They share the Huntsman core, so that
  is plausible, but one search summary called it a possible copy error.
- **Black Widow 3.0's cover**: three sites say HK22 Aggression Solid; the blind
  check said Cohesion Solid, probably reading the Dynasty.
- **Black Widow 3.0 Dynasty's mass bias** is 0.016 on two sites, and one bowwwl
  summary also mentioned 0.015.
- **Combat Solid** (Aug 2026) and **Portal** (Oct 2, 2026) are recent enough
  that their pages may still change.
