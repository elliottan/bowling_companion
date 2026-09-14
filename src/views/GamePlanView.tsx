import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronRight, Compass } from "lucide-react";
import { formatSessionDate } from "../lib/dates";
import { PushScreen } from "../components/PushScreen";
import { EmptyState } from "../components/ui/EmptyState";
import { LoadingCard } from "../components/ui/LoadingCard";
import { GROUP_HEADING } from "../components/ui/typography";
import { FIELD_LABEL, FIELD_SELECT } from "../components/ui/field";
import { LIST_DIVIDER, ListGroup } from "../components/ui/ListGroup";
import { Chip } from "../components/ui/Chip";
import {
  buildBriefing,
  type BriefingFinding,
  type BallRates,
  type BallScope,
  type BriefingGap,
  type ScopeBall,
  type ScopeSpan,
  type GameLine,
  type MovementSlot
} from "../lib/briefing";
import { useHandedness } from "../lib/handednessContext";
import { buildFilterOptions, EMPTY_SELECTION } from "../lib/filterFacets";
import { setRemembered, useRememberedState } from "../lib/viewMemory";
import { getSessionHistory } from "../services/bowlingRepository";
import { getBalls } from "../services/ballRepository";
import type { Ball, Handedness, SessionSummary } from "../types/bowling";
import { ErrorBanner } from "../components/ErrorBanner";

/** The chart each callout is about, keyed the way the Stats tab remembers it.
 *  Tapping a callout lands on the number it was talking about, not on whatever
 *  chart happened to be up last time (ADR-065b). */
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
 * What your own history says about where you are about to bowl (ADR-064b).
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
  /** Push the Stats screen, having set the filters up for it. A push rather
   *  than a tab switch, so back returns to the callout that made the point
   *  (ADR-083). */
  onOpenStats: () => void;
  /** Open the night behind "Last time". */
  onOpenSession: (sessionId: number) => void;
}

export function GamePlanView({ onBack, onOpenStats, onOpenSession }: GamePlanViewProps) {
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
  const [rememberedScope, setScope] = useRememberedState("plan:scope", "all");

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
   * With nothing chosen it opens on the house you bowl most, which is the one
   * being asked about nearly every time.
   */
  const alley = allAlleys.includes(rememberedAlley) ? rememberedAlley : (allAlleys[0] ?? "");

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

  const briefing = useMemo(
    () => buildBriefing(history, balls, { alley, pattern, lane }, handedness),
    [history, balls, alley, pattern, lane, handedness]
  );

  // A scope the current slice cannot offer (game 4 at a house you have only
  // ever bowled three games at) falls back to everything, rather than leaving
  // the table blank under a chip that is no longer there.
  const scope =
    briefing.scopes.find((sc) => sc.key === rememberedScope) ?? briefing.scopes[0] ?? null;

  const where = [alley, pattern].filter(Boolean).join(" · ");

  /**
   * Hand the Stats screen this slice and the number the callout was about.
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
        {error ? (
          <ErrorBanner>Your sessions could not be read. Reload the app, then try again.</ErrorBanner>
        ) : isLoading ? (
          <LoadingCard />
        ) : history.length === 0 ? (
          <EmptyState
            icon={Compass}
            title="Nothing to go on yet"
            description="Bowl a few sessions and this reads them back to you before the next one."
          />
        ) : (
          <>
            {/* Nothing to pick between when no session has ever named a house
                (ADR-080), and a select with no options is furniture. */}
            <div className="flex gap-2">
              {allAlleys.length > 0 && (
                <div className="min-w-0 flex-1">
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
            </div>

            <p className="mt-3 text-xs text-ink-secondary">
              {briefing.games === 0
                ? `Nothing recorded for ${where || "this"} yet.`
                : `${briefing.games} ${briefing.games === 1 ? "game" : "games"} over ${
                    briefing.sessions
                  } ${briefing.sessions === 1 ? "session" : "sessions"}${where ? ` at ${where}` : ""}.`}
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

            {briefing.movement.length > 0 && (
              <div className="mt-4">
                <ListGroup heading="How the session moves here">
                  {briefing.movement.map((slot) => (
                    <MovementRow key={slot.gameNumber} slot={slot} />
                  ))}
                </ListGroup>
                <p className="mt-1.5 px-1 text-xs text-ink-tertiary">
                  {describeDrift(briefing.movement, handedness)}
                </p>
              </div>
            )}

            {scope && (
              <>
                <h2 className={`${GROUP_HEADING} mb-2 mt-4`}>Which ball, when</h2>
                {/* Widest first, then game by game, then the windows. Scrolled
                    rather than wrapped: the order is a sequence through a
                    night, and wrapping breaks it into rows that read as
                    groups. */}
                <div className="-mx-3 flex gap-2 overflow-x-auto overscroll-x-contain px-3 pb-1 sm:mx-0 sm:px-0">
                  {briefing.scopes.map((sc) => (
                    <Chip
                      key={sc.key}
                      selected={sc.key === scope.key}
                      onClick={() => setScope(sc.key)}
                      className="shrink-0"
                    >
                      {scopeChip(sc.span)}
                    </Chip>
                  ))}
                </div>
                <ScopeTable scope={scope} lane={lane} />
                <p className="mt-1.5 px-1 text-xs text-ink-tertiary">{scopeNote(scope, lane)}</p>
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
                      className="flex w-full items-center gap-3 rounded-xl border border-edge bg-surface p-3 text-left shadow-sm hover:border-accent-fill"
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
              <p className="mt-4 rounded-xl border border-edge bg-surface-muted p-3 text-sm text-ink-secondary">
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
        <span className="text-xs tabular-nums text-ink-tertiary">{formatSessionDate(last.date)}</span>
      </span>
      <span className="mt-1 block text-sm text-ink-strong">{describeLastTime(last)}</span>
      {last.perGame.length > 0 && (
        <span className="mt-2.5 block border-t border-edge pt-1">
          {last.perGame.map((game) => (
            <GameLineRow key={game.gameNumber} line={game} />
          ))}
        </span>
      )}
    </>
  );

  if (!onOpen) {
    return <div className="rounded-xl border border-edge bg-surface p-3 shadow-sm">{body}</div>;
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open ${last.alley}, ${formatSessionDate(last.date)}`}
      className="block w-full rounded-xl border border-edge bg-surface p-3 text-left shadow-sm hover:border-accent-fill"
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
    return `${scored}. You played the ${last.ballName} from stance ${last.stance} to target ${last.target}.`;
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
    case "movement":
      return `${g.have} of ${g.need} game slots with ${g.each}+ games each, before the line here can be read back.`;
    case "phase":
      return `No ball has ${g.need}+ first balls in any part of a session here yet. Best so far is ${g.have}.`;
  }
}

/** The chip: short enough for a row of them on a 390px screen. */
function scopeChip(span: ScopeSpan): string {
  if (span.kind === "all") return "All games";
  if (span.kind === "game") return `Game ${span.gameNumber}`;
  switch (span.key) {
    case "fresh":
      return "Fresh";
    case "mid":
      return "Mid";
    case "late":
      return "Late";
  }
}

/** The heading above the table, which has room to say what the chip cannot. */
export function describeScope(span: ScopeSpan): string {
  if (span.kind === "all") return "Every game";
  if (span.kind === "game") return `Game ${span.gameNumber}`;
  const range =
    span.toGame === undefined
      ? `game ${span.fromGame} on`
      : `games ${span.fromGame} to ${span.toGame}`;
  switch (span.key) {
    case "fresh":
      return `Fresh \u00b7 ${range}`;
    case "mid":
      return `Mid session \u00b7 ${range}`;
    case "late":
      return `Late \u00b7 ${range}`;
  }
}

/**
 * The line under the table: what this scope is, and what the lane column is
 * doing, said once rather than repeated per row.
 */
export function scopeNote(scope: BallScope, lane: string): string {
  const windows =
    scope.span.kind === "phase"
      ? "Windows overlap because a pattern breaks down by shots thrown on it, not by the clock: game 2 behind a squad of eight is nothing like game 2 bowling alone. "
      : "";
  const lanes = lane
    ? `Lane ${lane} beside every lane here, so a thin lane read can be weighed against the fuller one rather than replace it. A read marked thin is under ${MIN_LANE_BALLS_COPY} balls. `
    : "";
  return `${windows}${lanes}What each ball did, not what to bring.`;
}

/** Repeated in the note above, and the floor `lib/briefing` marks a lane read
 *  thin at. Kept as copy here rather than exported from the calculator, which
 *  returns numbers and findings rather than sentences. */
const MIN_LANE_BALLS_COPY = 8;

/** One scope: the balls, under the same P/C/S columns the Stats ball table
 *  uses, and with the lane read above the house read where a lane is chosen. */
function ScopeTable({ scope, lane }: { scope: BallScope; lane: string }) {
  return (
    <div className="mt-2 rounded-xl border border-edge bg-surface p-3 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="truncate text-sm font-semibold text-ink-strong">
          {describeScope(scope.span)}
        </h3>
        <span className="shrink-0 text-xs tabular-nums text-ink-tertiary">
          {scope.games} {scope.games === 1 ? "game" : "games"}
        </span>
      </div>
      <table className="mt-2 w-full text-xs tabular-nums">
        <thead>
          <tr className="text-ink-tertiary">
            <th className="text-left font-semibold">Ball</th>
            <th className="w-10 text-right font-semibold" title="Pocket">
              P
            </th>
            <th className="w-10 text-right font-semibold" title="Carry">
              C
            </th>
            <th className="w-10 text-right font-semibold" title="Strike">
              S
            </th>
            <th className="w-10 text-right font-semibold">Balls</th>
          </tr>
        </thead>
        {scope.balls.map((ball) => (
          <BallRows key={ball.ballId} ball={ball} lane={lane} />
        ))}
      </table>
    </div>
  );
}

/**
 * One ball: its name, then a row per read.
 *
 * A tbody per ball rather than one long list of rows, so the lane read and the
 * house read under a name are one group to a screen reader as well as to the
 * eye, and the border falls between balls rather than between a ball and its
 * own second line.
 */
function BallRows({ ball, lane }: { ball: ScopeBall; lane: string }) {
  return (
    <tbody className="border-t border-edge">
      <tr>
        <td colSpan={5} className="truncate pt-1.5 text-left text-sm text-ink">
          {ball.name}
        </td>
      </tr>
      {ball.lane && <RateRow label={`Lane ${lane}`} rates={ball.lane} />}
      {/* Named "All lanes" only when there is a lane read to tell it apart
          from. On its own it is simply this ball here, and a qualifier with
          nothing to qualify reads as a filter the reader did not set. */}
      <RateRow label={ball.lane ? "All lanes" : "Here"} rates={ball.house} muted={!!ball.lane} />
    </tbody>
  );
}

function RateRow({
  label,
  rates,
  muted = false
}: {
  label: string;
  rates: BallRates;
  muted?: boolean;
}) {
  const tone = muted ? "text-ink-tertiary" : "text-ink-secondary";
  return (
    <tr className={rates.thin ? "opacity-70" : ""}>
      <td className={`max-w-0 truncate pr-2 text-left text-[11px] ${tone}`}>
        {label}
        {rates.thin && <span className="text-ink-tertiary"> thin</span>}
      </td>
      <td className={`text-right ${tone}`}>{scopePct(rates.pocketPct)}</td>
      <td className={`text-right ${tone}`}>{scopePct(rates.carryPct)}</td>
      <td className={`text-right font-semibold ${muted ? "text-ink-secondary" : "text-ink"}`}>
        {scopePct(rates.strikePct)}
      </td>
      <td className="text-right text-ink-tertiary">{rates.firstBalls}</td>
    </tr>
  );
}

function scopePct(value: number | null): string {
  return value === null ? "-" : `${value}%`;
}

/**
 * One game of the session read back: what you threw and where from.
 *
 * A span rather than a list item, because these sit inside the button that
 * opens the session and a button may not contain a list.
 */
function GameLineRow({ line }: { line: GameLine }) {
  return (
    <span className="flex items-baseline gap-3 py-1">
      <span className="w-14 shrink-0 text-xs text-ink-tertiary">Game {line.gameNumber}</span>
      <span className="min-w-0 flex-1 truncate text-xs text-ink-secondary">
        {describeLine(line)}
      </span>
      {line.score !== null && (
        <span className="shrink-0 text-xs tabular-nums text-ink-tertiary">{line.score}</span>
      )}
    </span>
  );
}

/** One game slot across every session here. */
function MovementRow({ slot }: { slot: MovementSlot }) {
  return (
    <li className={`${LIST_DIVIDER} flex items-baseline gap-3 px-3 py-2.5`}>
      <span className="w-14 shrink-0 text-sm text-ink">Game {slot.gameNumber}</span>
      <span className="min-w-0 flex-1 truncate text-sm text-ink-secondary">
        {describeLine(slot)}
      </span>
      <span className="shrink-0 text-xs tabular-nums text-ink-tertiary">
        {slot.score !== null ? `${slot.score} avg` : `${slot.games} games`}
      </span>
    </li>
  );
}

/** The ball and the boards, saying only what was recorded. */
function describeLine(line: { ballName?: string; stance?: number; target?: number }): string {
  const boards =
    line.stance !== undefined && line.target !== undefined
      ? `${line.stance} to ${line.target}`
      : line.stance !== undefined
        ? `stance ${line.stance}`
        : line.target !== undefined
          ? `target ${line.target}`
          : "";
  if (line.ballName && boards) return `${line.ballName}, ${boards}`;
  return line.ballName ?? boards;
}

/**
 * The move itself, stated once under the rows.
 *
 * Rows give the reader three lines to subtract in their head, and the number
 * they would arrive at is the thing they came for. It describes the shift and
 * stops: whether to make that move on the night is the bowler's call, on lanes
 * this screen has never seen.
 */
export function describeDrift(slots: MovementSlot[], handedness: Handedness): string {
  const first = slots[0];
  const last = slots[slots.length - 1];
  const ballChanged = !!first.ballName && !!last.ballName && first.ballName !== last.ballName;

  const moves: string[] = [];
  if (first.stance !== undefined && last.stance !== undefined && first.stance !== last.stance) {
    moves.push(`${boardsMoved(first.stance, last.stance, handedness)} at the stance`);
  }
  if (first.target !== undefined && last.target !== undefined && first.target !== last.target) {
    moves.push(`${boardsMoved(first.target, last.target, handedness)} at the target`);
  }

  const span = `By game ${last.gameNumber}`;
  if (moves.length === 0 && !ballChanged) {
    return `${span} you are on the same ball and the same line as game ${first.gameNumber}.`;
  }
  if (moves.length === 0) {
    return `${span} you are on the ${last.ballName}, from the same line as game ${first.gameNumber}.`;
  }
  const move = `${span} you have moved ${moves.join(" and ")}`;
  return ballChanged ? `${move}, and onto the ${last.ballName}.` : `${move}.`;
}

/**
 * Boards and which way, in the bowler's own terms.
 *
 * Board numbers rise to the left for a right-hander and to the right for a
 * left-hander, which is the same rule the line adjusters run on
 * (`LineInput`). A higher board is not a direction on its own.
 */
function boardsMoved(from: number, to: number, handedness: Handedness): string {
  const boards = Math.abs(to - from);
  const unit = boards === 1 ? "board" : "boards";
  const towardsHigher = handedness === "right" ? "left" : "right";
  const towardsLower = handedness === "right" ? "right" : "left";
  return `${boards} ${unit} ${to > from ? towardsHigher : towardsLower}`;
}
