import { Button } from "./ui/Button";
import { Chip } from "./ui/Chip";
import { GROUP_HEADING } from "./ui/typography";
import type { SessionFilters } from "../views/useSessionFilters";

const selectClass =
  "h-8 max-w-[46%] rounded-full border border-edge-strong bg-surface px-3 text-xs font-medium outline-none focus:border-accent-fill";

/**
 * The filter row History and Stats both carry.
 *
 * One component rather than a copy each, because the whole point of the split
 * is that the two tabs are filtering the same list (ADR-057): two copies would
 * be two chances for the controls to drift out of step with each other.
 */
export function SessionFilterBar({ filters }: { filters: SessionFilters }) {
  const {
    history,
    alley,
    setAlley,
    pattern,
    setPattern,
    gameNumber,
    setGameNumber,
    lanes,
    toggleLane,
    clearLanes,
    allAlleys,
    allPatterns,
    allGameNumbers,
    allLanes
  } = filters;

  if (history.length === 0) return null;

  return (
    <>
      <div className="mb-3 flex gap-2">
        <select value={alley} onChange={(e) => setAlley(e.target.value)} className={selectClass}>
          <option value="">All locations</option>
          {allAlleys.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <select
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          className={selectClass}
        >
          <option value="">All patterns</option>
          {allPatterns.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      {/* gap-2 is load-bearing: Chip expands its tap target 4px past its own box
          top and bottom, so anything tighter would overlap hit regions. */}
      {allGameNumbers.length > 1 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className={GROUP_HEADING}>Game</span>
          <Chip selected={gameNumber === null} onClick={() => setGameNumber(null)}>
            All
          </Chip>
          {allGameNumbers.map((n) => (
            <Chip
              key={n}
              selected={gameNumber === n}
              onClick={() => setGameNumber(gameNumber === n ? null : n)}
            >
              {n}
            </Chip>
          ))}
        </div>
      )}

      {allLanes.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className={GROUP_HEADING}>Lanes</span>
          {allLanes.map((l) => (
            <Chip key={l} selected={lanes.includes(l)} onClick={() => toggleLane(l)}>
              {l}
            </Chip>
          ))}
          {lanes.length > 0 && (
            <Button
              variant="ghost"
              className="px-2 text-xs font-medium text-ink-secondary"
              onClick={clearLanes}
            >
              Clear
            </Button>
          )}
        </div>
      )}
    </>
  );
}
