import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronRight, Compass } from "lucide-react";
import { PushScreen } from "../components/PushScreen";
import { EmptyState } from "../components/ui/EmptyState";
import { LoadingCard } from "../components/ui/LoadingCard";
import { GROUP_HEADING } from "../components/ui/typography";
import { FIELD_LABEL, FIELD_SELECT } from "../components/ui/field";
import { buildBriefing, type BriefingFinding, type BriefingGap } from "../lib/briefing";
import { useHandedness } from "../lib/handednessContext";
import { setRemembered, useRememberedState } from "../lib/viewMemory";
import { getSessionHistory } from "../services/bowlingRepository";
import { getBalls } from "../services/ballRepository";
import type { Ball, SessionSummary } from "../types/bowling";

/** The chart each callout is about, keyed the way the Stats tab remembers it.
 *  Tapping a callout lands on the number it was talking about, not on whatever
 *  chart happened to be up last time (ADR-065). */
const CHART_FOR: Record<BriefingFinding["kind"], string> = {
  ball: "carryPct",
  expectation: "average",
  gameSlot: "average",
  spares: "sparePct",
  laneBias: "strikePct"
};

const NO_SESSIONS: SessionSummary[] = [];
const NO_BALLS: Ball[] = [];

/**
 * What your own history says about where you are about to bowl (ADR-064).
 *
 * The copy lives here rather than in `lib/briefing`, which returns findings and
 * numbers. That split is what lets the thresholds be tested without asserting
 * on wording, and it keeps the sentences under the design language's rules
 * rather than a calculator's.
 *
 * Every line states what happened and stops. None of them says to bring a
 * particular ball: you do not pick a ball at random, so a ball that carries
 * well somewhere may be the ball you only reach for when the lanes are good.
 */
interface GamePlanViewProps {
  onBack: () => void;
  /** Cross to the Stats tab, having set the filters up for it. */
  onOpenStats: () => void;
  /** Open the night behind "Last time". */
  onOpenSession: (sessionId: number) => void;
}

export function GamePlanView({ onBack, onOpenStats, onOpenSession }: GamePlanViewProps) {
  const liveHistory = useLiveQuery(() => getSessionHistory());
  const liveBalls = useLiveQuery(() => getBalls());
  const history = liveHistory ?? NO_SESSIONS;
  const isLoading = liveHistory === undefined;
  const balls = liveBalls ?? NO_BALLS;
  const handedness = useHandedness();

  const [alley, setAlley] = useRememberedState("plan:alley", "");
  const [pattern, setPattern] = useRememberedState("plan:pattern", "");

  const allAlleys = useMemo(
    () => [...new Set(history.map((s) => s.session.alley_name))].sort(),
    [history]
  );
  const allPatterns = useMemo(
    () =>
      [
        ...new Set(history.flatMap((s) => (s.session.oil_pattern ? [s.session.oil_pattern] : [])))
      ].sort(),
    [history]
  );

  const briefing = useMemo(
    () => buildBriefing(history, balls, { alley, pattern }, handedness),
    [history, balls, alley, pattern, handedness]
  );

  const where = [alley, pattern].filter(Boolean).join(" · ");

  /**
   * Hand the Stats tab this slice and the number the callout was about.
   *
   * Location and pattern only, plus the chart. A callout that names two things
   * ("game 1 is your best here, game 3 your worst") cannot be turned into one
   * filter without the tap silently picking a side, so it does not try: the
   * game and lane chips are a tap away in the filter sheet.
   */
  function openInStats(kind: BriefingFinding["kind"]) {
    setRemembered("history:alley", alley);
    setRemembered("history:pattern", pattern);
    setRemembered("history:game", null);
    setRemembered("history:lanes", []);
    setRemembered("history:metric", CHART_FOR[kind]);
    onOpenStats();
  }

  return (
    <PushScreen title="Game plan" onBack={onBack}>
      <div className="mx-auto w-full max-w-3xl px-3 pb-8 pt-3 sm:px-6">
        {isLoading ? (
          <LoadingCard />
        ) : history.length === 0 ? (
          <EmptyState
            icon={Compass}
            title="Nothing to go on yet"
            description="Bowl a few nights and this reads them back to you before the next one."
          />
        ) : (
          <>
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <label className={FIELD_LABEL} htmlFor="plan-alley">
                  Location
                </label>
                <select
                  id="plan-alley"
                  value={alley}
                  onChange={(e) => setAlley(e.target.value)}
                  className={FIELD_SELECT}
                >
                  <option value="">Anywhere</option>
                  {allAlleys.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-0 flex-1">
                <label className={FIELD_LABEL} htmlFor="plan-pattern">
                  Pattern
                </label>
                <select
                  id="plan-pattern"
                  value={pattern}
                  onChange={(e) => setPattern(e.target.value)}
                  className={FIELD_SELECT}
                >
                  <option value="">Any</option>
                  {allPatterns.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <p className="mt-3 text-xs text-ink-secondary">
              {briefing.games === 0
                ? `Nothing recorded for ${where || "this"} yet.`
                : `${briefing.games} ${briefing.games === 1 ? "game" : "games"} over ${
                    briefing.sessions
                  } ${briefing.sessions === 1 ? "night" : "nights"}${where ? ` at ${where}` : ""}.`}
            </p>

            {briefing.lastTime && (
              <>
                <h2 className={`${GROUP_HEADING} mb-2 mt-4`}>Last time</h2>
                <LastTimeCard
                  last={briefing.lastTime}
                  onOpen={
                    briefing.lastTime.sessionId != null
                      ? () => onOpenSession(briefing.lastTime!.sessionId as number)
                      : undefined
                  }
                />
              </>
            )}

            {briefing.callouts.length > 0 && (
              <>
                <h2 className={`${GROUP_HEADING} mb-2 mt-4`}>What your history says</h2>
                <div className="space-y-2">
                  {briefing.callouts.map((c) => (
                    <button
                      key={c.kind}
                      type="button"
                      onClick={() => openInStats(c.kind)}
                      className="flex w-full items-center gap-3 rounded-lg border border-edge bg-surface p-3 text-left shadow-sm hover:border-accent-fill"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm leading-relaxed text-ink">{describe(c)}</span>
                        <span className="mt-1 block text-xs text-ink-tertiary">{evidence(c)}</span>
                      </span>
                      <ChevronRight
                        size={18}
                        aria-hidden="true"
                        className="shrink-0 text-ink-tertiary"
                      />
                    </button>
                  ))}
                </div>
              </>
            )}

            {briefing.callouts.length === 0 && briefing.games > 0 && (
              <p className="mt-4 rounded-lg border border-edge bg-surface-muted p-3 text-sm text-ink-secondary">
                Nothing here stands out from the rest of your history yet.
              </p>
            )}

            {briefing.gathering.length > 0 && (
              <>
                <h2 className={`${GROUP_HEADING} mb-2 mt-4`}>Still gathering</h2>
                <ul className="space-y-1.5">
                  {briefing.gathering.map((g) => (
                    <li
                      key={g.kind}
                      className="rounded-lg border border-dashed border-edge-strong bg-surface-muted px-3 py-2 text-xs text-ink-secondary"
                    >
                      {describeGap(g)}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </PushScreen>
  );
}

/** The night itself, and the way into it. */
function LastTimeCard({
  last,
  onOpen
}: {
  last: NonNullable<ReturnType<typeof buildBriefing>["lastTime"]>;
  onOpen?: () => void;
}) {
  const body = (
    <>
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-ink">{last.alley}</span>
        <span className="text-xs tabular-nums text-ink-tertiary">{last.date}</span>
      </span>
      <span className="mt-1 block text-sm text-ink-strong">{describeLastTime(last)}</span>
    </>
  );

  if (!onOpen) {
    return <div className="rounded-lg border border-edge bg-surface p-3 shadow-sm">{body}</div>;
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open ${last.alley}, ${last.date}`}
      className="block w-full rounded-lg border border-edge bg-surface p-3 text-left shadow-sm hover:border-accent-fill"
    >
      {body}
    </button>
  );
}

function describeLastTime(last: NonNullable<ReturnType<typeof buildBriefing>["lastTime"]>): string {
  const scored =
    last.average === null
      ? `${last.games} ${last.games === 1 ? "game" : "games"}, nothing scored`
      : `${last.games} ${last.games === 1 ? "game" : "games"} averaging ${last.average}`;

  if (last.ballName && last.stance !== undefined && last.target !== undefined) {
    return `${scored}. You played the ${last.ballName} from ${last.stance} to ${last.target}.`;
  }
  if (last.ballName) return `${scored}, mostly on the ${last.ballName}.`;
  return `${scored}.`;
}

function describe(c: BriefingFinding): string {
  switch (c.kind) {
    case "ball":
      return `The ${c.name} carries ${c.carryPct}% here. The ${c.runnerUp} carries ${c.runnerUpCarryPct}%.`;
    case "expectation":
      return c.delta > 0
        ? `You average ${c.average} here, ${c.delta} above the rest of your history.`
        : `You average ${c.average} here, ${Math.abs(c.delta)} below the rest of your history.`;
    case "gameSlot":
      return `Game ${c.bestGame} is your best here at ${c.bestAverage}. Game ${c.worstGame} averages ${c.worstAverage}.`;
    case "spares":
      return c.delta > 0
        ? `You make ${c.sparePct}% of your spares here, against ${c.baseline}% elsewhere.`
        : `You make ${c.sparePct}% of your spares here. Elsewhere it is ${c.baseline}%.`;
    case "laneBias":
      return `Lane ${c.lane} strikes ${c.strikePct}% here. Lane ${c.otherLane} strikes ${c.otherStrikePct}%.`;
  }
}

function evidence(c: BriefingFinding): string {
  switch (c.kind) {
    case "ball":
      return `${c.firstBalls} first balls with the ${c.name}`;
    case "expectation":
    case "spares":
      return `${c.games} ${c.games === 1 ? "game" : "games"} here`;
    case "gameSlot":
      return `${c.games} games across those slots`;
    case "laneBias":
      return `${c.games} games on the pair`;
  }
}

function describeGap(g: BriefingGap): string {
  switch (g.kind) {
    case "slice":
      return `${g.need} games here before any of this means anything. You have ${g.have}.`;
    case "ball":
      return `${g.have} of ${g.need} balls with ${g.each}+ first balls each.`;
    case "expectation":
      return `${g.have} of ${g.need} games logged elsewhere.`;
    case "gameSlot":
      return `${g.have} of ${g.need} slots with ${g.each}+ games each.`;
    case "spares":
      return `${g.have} of ${g.need} games logged elsewhere.`;
    case "laneBias":
      return `${g.have} of ${g.need} lanes with ${g.each}+ games each.`;
  }
}
