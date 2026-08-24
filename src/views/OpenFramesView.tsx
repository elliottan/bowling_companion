import { useMemo } from "react";
import { Target } from "lucide-react";
import { PushScreen } from "../components/PushScreen";
import { MiniPins } from "../components/MiniPins";
import { EmptyState } from "../components/ui/EmptyState";
import { GROUP_HEADING } from "../components/ui/typography";
import { calculateOpenFrames } from "../lib/stats";
import { useSessionFilters } from "./useSessionFilters";

/**
 * Where open frames go, for whatever the Stats tab is currently filtered to.
 *
 * It reads the shared filter itself rather than taking it as a prop: the
 * filter already outlives both tabs (`useSessionFilters`), so an overlay
 * pushed over either of them picks up the same sessions with no threading
 * through `App`.
 */
export function OpenFramesView({ onBack }: { onBack: () => void }) {
  const { filtered, activeLanes } = useSessionFilters();
  const report = useMemo(
    () => calculateOpenFrames(filtered, activeLanes),
    [filtered, activeLanes]
  );

  return (
    <PushScreen title="Open frames" onBack={onBack}>
      <div className="mx-auto w-full max-w-3xl px-3 pb-8 pt-3 sm:px-6">
        {report.games === 0 ? (
          <EmptyState
            icon={Target}
            title="Nothing open yet"
            description="Finish a game and the leaves you missed show up here, heaviest first."
          />
        ) : (
          <>
            <div className="rounded-lg border border-edge bg-surface p-4 shadow-sm">
              <div className="flex items-end gap-2">
                <span className="text-4xl font-bold tabular-nums leading-none text-ink">
                  {report.pinsLeftPerGame}
                </span>
                <span className="pb-1 text-sm font-semibold text-ink-secondary">
                  pins left standing, per game
                </span>
              </div>
              <p className="mt-2 text-sm text-ink-strong">
                {report.openFramesPerGame} open frames a game, across {report.games}{" "}
                {report.games === 1 ? "game" : "games"}.
              </p>
            </div>

            <h2 className={`${GROUP_HEADING} mb-2 mt-4`}>Heaviest leaves</h2>
            <ul className="divide-y divide-edge rounded-lg border border-edge bg-surface shadow-sm">
              {report.leaves.slice(0, 12).map((leave) => (
                <li key={leave.pins.join("-")} className="flex items-center gap-3 px-3 py-2.5">
                  <MiniPins standing={leave.pins} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold tabular-nums text-ink">
                      {leave.conversions} of {leave.chances} made
                    </span>
                    <span className="block text-xs text-ink-secondary">
                      {leave.misses} missed
                    </span>
                  </span>
                  <span className="w-12 shrink-0 text-right">
                    <span className="block text-sm font-bold tabular-nums text-ink">
                      {leave.pinsLeft}
                    </span>
                    <span className="block text-[10px] text-ink-tertiary">pins</span>
                  </span>
                </li>
              ))}
            </ul>

            <p className="mt-3 px-0.5 text-xs leading-relaxed text-ink-secondary">
              Pins left standing, not points lost. Making a spare changes the frame before it
              too, so points lost would mean scoring a game you never bowled.
            </p>
          </>
        )}
      </div>
    </PushScreen>
  );
}
