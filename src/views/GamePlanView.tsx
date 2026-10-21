import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Compass } from "lucide-react";
import { PushScreen } from "../components/PushScreen";
import { EmptyState } from "../components/ui/EmptyState";
import { Button } from "../components/ui/Button";
import { LoadingCard } from "../components/ui/LoadingCard";
import { ProLock } from "../components/ui/ProLock";
import { FIELD_LABEL, FIELD_SELECT } from "../components/ui/field";
import { ChoiceInput } from "../components/ui/SuggestInput";
import { buildLineReport } from "../lib/lineReport";
import { useHandedness } from "../lib/handednessContext";
import { buildFilterOptions, EMPTY_SELECTION } from "../lib/filterFacets";
import { useRememberedState } from "../lib/viewMemory";
import { getSessionHistory } from "../services/bowlingRepository";
import { getBalls } from "../services/ballRepository";
import type { Ball, SessionSummary } from "../types/bowling";
import { ErrorBanner } from "../components/ErrorBanner";
import { BallEstimates } from "../components/BallEstimates";
import { estimateBalls } from "../lib/scoreModel";
import { filterSessionsBy } from "../lib/stats";

const NO_SESSIONS: SessionSummary[] = [];
const NO_BALLS: Ball[] = [];

/**
 * What you would average with each ball at one alley, read from the games
 * bowled there.
 *
 * The lines (the best ones at an alley, the last session's, and how a line
 * moved between sessions) were on this screen until ADR-163 took them off for
 * now: they were not clear enough yet. `lib/lineReport` still builds them and
 * keeps its tests, and the navigation state that opened one is still in
 * `appNavigation`, so they can come back as they were.
 *
 * Every number is a count ("7 of 10"), never a percentage: most groups are a
 * handful of balls, and a rate hides how few.
 */
interface GamePlanViewProps {
  onBack: () => void;
  /** Start a session with nothing filled in, from the empty report (ADR-080). */
  onStartScoring?: () => void;
}

export function GamePlanView({ onBack, onStartScoring }: GamePlanViewProps) {
  // A failed read used to arrive as an empty list, which reads as "you have
  // never bowled" to someone who has.
  const [error, setError] = useState<Error | null>(null);
  const liveHistory = useLiveQuery(async () => {
    try {
      const rows = await getSessionHistory();
      setError(null);
      return rows;
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      return NO_SESSIONS;
    }
  });
  const liveBalls = useLiveQuery(() => getBalls());
  const history = liveHistory ?? NO_SESSIONS;
  const isLoading = liveHistory === undefined;
  const balls = liveBalls ?? NO_BALLS;
  const handedness = useHandedness();

  const [rememberedAlley, setAlley] = useRememberedState("plan:alley", "");
  const [rememberedPattern, setPattern] = useRememberedState("plan:pattern", "");
  const [rememberedLane, setLane] = useRememberedState("plan:lane", "");

  // A session started without an alley (ADR-080) has no name to filter by, so
  // it is not offered as one. Most bowled first, and the pattern list is only
  // what the chosen house has run (`lib/filterFacets`).
  const allAlleys = useMemo(
    () => buildFilterOptions(history, EMPTY_SELECTION).alleys.filter((a) => a.trim()),
    [history]
  );

  /**
   * This screen reads one place back to you, so "anywhere" is not an answer it
   * can give: an average across three houses is a number about none of them.
   * With nothing chosen it opens on the house you bowled at last, which is the
   * one you are most likely asking about (ADR-115). It used to open on the
   * house bowled most, which on a league night was usually somewhere else.
   */
  const lastAlley = history.find((h) => allAlleys.includes(h.session.alley_name))?.session.alley_name;
  const alley = allAlleys.includes(rememberedAlley)
    ? rememberedAlley
    : (lastAlley ?? allAlleys[0] ?? "");

  const allPatterns = useMemo(
    () => buildFilterOptions(history, { ...EMPTY_SELECTION, alley }).patterns,
    [history, alley]
  );
  // A pattern left over from another house simply stops applying, rather than
  // filtering the briefing down to nothing.
  const pattern = allPatterns.includes(rememberedPattern) ? rememberedPattern : "";

  // Lanes are only offered inside a house: lane 7 is a different lane at every
  // one of them (`lib/filterFacets`). A lane left over from another house stops
  // applying the same way a pattern does.
  const allLanes = useMemo(
    () => buildFilterOptions(history, { ...EMPTY_SELECTION, alley, pattern }).lanes,
    [history, alley, pattern]
  );
  const lane = allLanes.includes(rememberedLane) ? rememberedLane : "";

  // Game 1 on fresh oil and game 4 on a broken-down pair are different lanes
  // to read, so the game in the session narrows everything below too.
  const [rememberedGame, setGame] = useRememberedState("plan:game", "");
  const allGames = useMemo(
    () => buildFilterOptions(history, { ...EMPTY_SELECTION, alley, pattern }).gameNumbers.map(String),
    [history, alley, pattern]
  );
  const gameNumber = allGames.includes(rememberedGame) ? Number(rememberedGame) : undefined;

  const report = useMemo(
    () => buildLineReport(history, balls, { alley, pattern, lane, game: gameNumber }, handedness),
    [history, balls, alley, pattern, lane, gameNumber, handedness]
  );
  // The same games the lines are read from, with make rates from every game
  // you have bowled: a leave is shot the same at every house (ADR-147).
  const estimates = useMemo(
    () =>
      estimateBalls(
        filterSessionsBy(history, {
          alleyName: alley || undefined,
          oilPattern: pattern || undefined,
          gameNumber
        }),
        { lanes: lane ? [lane] : undefined, history }
      ),
    [history, alley, pattern, lane, gameNumber]
  );
  const where = [alley, pattern, lane && `lane ${lane}`, gameNumber && `game ${gameNumber}`]
    .filter(Boolean)
    .join(" \u00b7 ");

  return (
    <PushScreen title="Alley report" onBack={onBack}>
        <div className="mx-auto w-full max-w-3xl px-3 pb-8 pt-3 sm:px-6">
          {error ? (
            <ErrorBanner>Your sessions could not be read. Reload the app, then try again.</ErrorBanner>
          ) : isLoading ? (
            <LoadingCard />
          ) : history.length === 0 ? (
            // What it will show and what feeds it, since "bowl a few sessions"
            // left a new bowler guessing what those sessions needed.
            <EmptyState
              icon={Compass}
              title="Bowl a session to see your report"
              description="It shows what you'd average with each ball at an alley, from the games you bowled there."
            >
              {onStartScoring && (
                <Button variant="primary" onClick={onStartScoring}>
                  Start scoring
                </Button>
              )}
            </EmptyState>
          ) : (
            <>
              {/* Nothing to pick between when no session has ever named a house
                  (ADR-080), and a select with no options is furniture. */}
              {/* The alley gets a row of its own: three selects side by side cut
                  an alley name down to its first word. */}
              {allAlleys.length > 0 && (
                <div className="mb-2">
                    <label className={FIELD_LABEL} htmlFor="plan-alley">
                      Alley
                    </label>
                    <select
                      id="plan-alley"
                      value={alley}
                      onChange={(e) => setAlley(e.target.value)}
                      className={FIELD_SELECT}
                    >
                      {allAlleys.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                  </select>
                </div>
              )}
              <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                  <label className={FIELD_LABEL} htmlFor="plan-pattern">
                    Pattern
                  </label>
                  <ChoiceInput
                    id="plan-pattern"
                    value={pattern}
                    onChange={setPattern}
                    options={allPatterns}
                    placeholder="Any"
                    clearLabel="Clear pattern"
                  />
                </div>
                {/* Only inside a house that has lanes on record: a lane number
                    means nothing across houses, and an empty picker is furniture. */}
                {allLanes.length > 0 && (
                  <div className="w-24 shrink-0">
                    <label className={FIELD_LABEL} htmlFor="plan-lane">
                      Lane
                    </label>
                    <select
                      id="plan-lane"
                      value={lane}
                      onChange={(e) => setLane(e.target.value)}
                      className={FIELD_SELECT}
                    >
                      <option value="">Any</option>
                      {allLanes.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {allGames.length > 1 && (
                  <div className="w-24 shrink-0">
                    <label className={FIELD_LABEL} htmlFor="plan-game">
                      Game
                    </label>
                    <select
                      id="plan-game"
                      value={gameNumber ? String(gameNumber) : ""}
                      onChange={(e) => setGame(e.target.value)}
                      className={FIELD_SELECT}
                    >
                      <option value="">Any</option>
                      {allGames.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <p className="mt-3 text-xs text-ink-secondary">
                {report.shots === 0
                  ? `Nothing recorded for ${where || "this"} yet.`
                  : `${report.shots} ${report.shots === 1 ? "ball" : "balls"}, ${report.sessions} ${
                      report.sessions === 1 ? "session" : "sessions"
                    }`}
              </p>

              {/* Pro: the reads across sessions (ADR-154). With no ball to read
                  there is nothing to tease, and a lone lock over a blank would
                  only be a puzzle. */}
              {estimates.balls.length === 0 ? (
                report.shots > 0 && (
                  <p className="mt-4 rounded-xl border border-edge bg-surface p-3 text-sm text-ink-secondary shadow-sm">
                    No balls to compare here yet. Pick a ball on your shots, and what you'd average with each one shows
                    here.
                  </p>
                )
              ) : (
                <ProLock peek={12} what="What you'd average with each ball here">
                  <div className="mt-4">
                    <BallEstimates report={estimates} balls={balls} />
                  </div>
                </ProLock>
              )}
            </>
          )}
        </div>
    </PushScreen>
  );
}
