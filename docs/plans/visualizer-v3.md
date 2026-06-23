# Lane Visualizer v3 — plan

Rebuild of the line model after first-round testing. Decisions captured live
(grill session 2026-06-23). Executor: Opus (plan + execute, TDD).

## Model (RH; mirror for LH)

Four editable pegs + derived path:

| Peg | Position | DOF |
|---|---|---|
| Laydown | board @ foul line (0 ft) | board |
| Target | board @ arrows; **Y snaps to chevron** `arrowFeet(board)` | board |
| Breakpoint | board + distance — the **apex / rightmost** | board + dist |
| Final | board @ 60 ft; default pocket 17.5, draggable | board |

Hook-start peg **removed**. `hook_start_distance` field kept (optional, unread).

### Curve
- **Skid:** straight `laydown → target`.
- **Hook+roll:** two cubic Béziers, C1-continuous:
  1. `target → breakpoint`: start tangent = skid heading (smooth off arrows,
     `c1` clamped so x never passes the apex), end tangent = **vertical** (apex).
  2. `breakpoint → final`: start tangent vertical (smooth at apex), end tangent =
     roll heading toward final.
- Vertical tangent at the apex ⟹ breakpoint is the **strict rightmost** point.
  This is the fix for the v2 right-overshoot bug.

### Constraints (hook side = higher board for RH, lower for LH)
| # | Rule | Capable pegs |
|---|---|---|
| order | `0 < arrowFeet(target) < bpDist < 60` | bpDist (clamp) |
| wall | breakpoint on/hook-side of `laydown→target` skid line at bpDist | breakpoint, laydown, target |
| roll | final on/hook-side of breakpoint | final, breakpoint |

### Solver (recency-priority)
On any edit: the edited peg is **held** (most recent). For each violated
constraint, move the **least-recently-adjusted capable peg ≠ held** to its
boundary; if that peg would leave [1,39], **cascade** to the next capable peg;
if none can satisfy, **clamp the held peg**. Final defaults to pocket but
yields to feasibility even when user-pinned. Typing an input == dragging it.

## Phases

1. **Geometry** (`laneGeometry.ts` + test): export `arrowFeet`, `skidBoardAt`;
   rewrite `buildLinePath` (two-cubic vertical-apex; drop hook-start vertex).
   Verify: `npm test -- laneGeometry`.
2. **Solver** (`laneGeometry.ts` + test): `solveLine(line, held, recency, hand)`
   enforcing order/wall/roll via cascade. Verify: `npm test -- laneGeometry`.
3. **Wiring** (`LaneVisualizer.tsx`, `LaneSurface.tsx` + tests): 4 pegs, drag +
   5 inputs (Laydown/Target/Breakpoint board, Bkpt ft 16–59, Final board) routed
   through `solveLine` with recency state; drop hook marker; polish Bowler view.
   Verify: `npm test`, `npm run build`, preview screenshots.
4. **Docs**: ADR-013 + CHANGELOG. Verify: present.

Final gate: `npm test` + `npm run build` green, then deploy.
