import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronDown, ChevronRight, Compass } from "lucide-react";
import { PushScreen } from "../components/PushScreen";
import { EmptyState } from "../components/ui/EmptyState";
import { Button } from "../components/ui/Button";
import { LoadingCard } from "../components/ui/LoadingCard";
import { GROUP_HEADING } from "../components/ui/typography";
import { FIELD_LABEL, FIELD_SELECT } from "../components/ui/field";
import { ChoiceInput } from "../components/ui/SuggestInput";
import { LIST_DIVIDER, ListGroup } from "../components/ui/ListGroup";
import {
  bestLines,
  buildLineReport,
  findLine,
  lastSession,
  MIN_LINE_SHOTS,
  wherePlayed,
  type LineMove,
  type LineRead,
  type LineShot,
  type LineTally
} from "../lib/lineReport";
import { useHandedness } from "../lib/handednessContext";
import { buildFilterOptions, EMPTY_SELECTION } from "../lib/filterFacets";
import { formatSessionDate } from "../lib/dates";
import { formatLeave } from "../lib/pins";
import { useRememberedState } from "../lib/viewMemory";
import { getSessionHistory } from "../services/bowlingRepository";
import { getBalls } from "../services/ballRepository";
import type { Ball, SessionSummary } from "../types/bowling";
import { ErrorBanner } from "../components/ErrorBanner";
import { describeLine } from "../components/alleyHistoryCopy";
import { BallEstimates } from "../components/BallEstimates";
import { estimateBalls } from "../lib/scoreModel";
import { filterSessionsBy } from "../lib/stats";

const NO_SESSIONS: SessionSummary[] = [];
const NO_BALLS: Ball[] = [];

/** Lines named under the last session before the rest are left to the balls. */
const LAST_SESSION_LINES = 4;

/**
 * What each line did at one alley: every ball, the lines it was thrown on, and
 * the shots behind each line one tap deeper.
 *
 * The copy lives here rather than in `lib/lineReport`, which returns counts.
 * Every number is a count ("7 of 10"), never a percentage: most lines are a
 * handful of balls, and a rate hides how few. Nothing says which line to play.
 * A line that struck more may have been thrown later, on a lane that had
 * changed.
 */
interface GamePlanViewProps {
  onBack: () => void;
  /** The line whose shots are open, by `lineReport` id (appNavigation). */
  openLineId: string | null;
  onOpenLine: (lineId: string) => void;
  /** Open the game a shot was thrown in, with its ball lit up. */
  onOpenSessionGame: (sessionId: number, gameId: number, ballId?: number) => void;
  /** Start a session with nothing filled in, from the empty report (ADR-080). */
  onStartScoring?: () => void;
}

export function GamePlanView({
  onBack,
  openLineId,
  onOpenLine,
  onOpenSessionGame,
  onStartScoring
}: GamePlanViewProps) {
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
  const open = findLine(report, openLineId);
  const top = useMemo(() => bestLines(report), [report]);
  const last = useMemo(() => lastSession(report), [report]);

  const where = [alley, pattern, lane && `lane ${lane}`, gameNumber && `game ${gameNumber}`]
    .filter(Boolean)
    .join(" \u00b7 ");

  return (
    <>
      <PushScreen title="Alley report" onBack={onBack} active={!open}>
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
              description="It shows what you'd average with each ball at an alley. Name the alley and note your boards, and it shows which lines worked there too."
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

              {/* The answer first: which ball to expect most from here, then
                  the lines that struck most and what you did last time. The
                  rest is behind a tap. */}
              <div className="mt-4">
                <BallEstimates report={estimates} balls={balls} />
              </div>

              {top.length > 0 && (
                <div className="mt-4">
                  <ListGroup heading="Best lines here">
                    {top.map((line) => (
                      <LineSummaryRow
                        key={line.id}
                        ballName={line.ballName}
                        line={line}
                        tally={line}
                        where={wherePlayed(line.shots)}
                        onOpen={() => onOpenLine(line.id)}
                      />
                    ))}
                  </ListGroup>
                </div>
              )}

              {last && (
                <div className="mt-4">
                  <ListGroup
                    heading={
                      <div className="min-w-0">
                        <h2 className={GROUP_HEADING}>Last session, {formatSessionDate(last.date)}</h2>
                        <p className="truncate text-xs text-ink-secondary">{wherePlayed([last])}</p>
                      </div>
                    }
                  >
                    {last.lines.slice(0, LAST_SESSION_LINES).map((row) => (
                      <LineSummaryRow
                        key={row.line.id}
                        ballName={row.line.ballName}
                        line={row.line}
                        tally={row}
                        onOpen={() => onOpenLine(row.line.id)}
                      />
                    ))}
                  </ListGroup>
                </div>
              )}

              {report.moves.length > 0 && (
                <div className="mt-4">
                  <LineChanges moves={report.moves} onOpenLine={onOpenLine} />
                </div>
              )}

              {report.shots > 0 && (
                <p className="mt-2 px-1 text-xs text-ink-secondary">
                  Thin: under {MIN_LINE_SHOTS} balls.
                </p>
              )}
            </>
          )}
        </div>
      </PushScreen>

      {open && (
        <LineDetail
          line={open}
          onBack={onBack}
          onOpenShot={(shot) =>
            shot.sessionId != null &&
            shot.gameId != null &&
            onOpenSessionGame(shot.sessionId, shot.gameId, open.ballId)
          }
        />
      )}
    </>
  );
}

/** A count as the screen says it: "7 of 10". */
export function ofCount(made: number, total: number): string {
  return `${made} of ${total}`;
}

/** The boards of a line, or what there is of them. */
export function lineBoards(line: { stance?: number; target?: number }): string {
  return describeLine({ stance: line.stance, target: line.target });
}

/** One line and how it went, for the two lists at the top: the ball, the
 *  boards, and the strikes as a count. */
function LineSummaryRow({
  ballName,
  line,
  tally,
  where,
  onOpen
}: {
  ballName: string;
  line: LineRead;
  tally: LineTally;
  /** The alley and pattern it was thrown on, where the list spans sessions. */
  where?: string;
  onOpen: () => void;
}) {
  return (
    <li className={LIST_DIVIDER}>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${ballName}, ${lineBoards(line)}: strikes ${ofCount(tally.strikes, tally.thrown)}, pocket ${ofCount(tally.pocket, tally.thrown)}`}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-surface-muted"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs text-ink-secondary">{ballName}</span>
          <span className="block truncate text-sm font-semibold text-ink">{lineBoards(line)}</span>
          {where && <span className="block truncate text-xs text-ink-tertiary">{where}</span>}
        </span>
        <span className="shrink-0 text-right tabular-nums">
          <span className="block text-sm font-semibold text-ink">
            {ofCount(tally.strikes, tally.thrown)}
          </span>
          <span className="block text-xs text-ink-secondary">strikes</span>
        </span>
        <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-ink-tertiary" />
      </button>
    </li>
  );
}

/** Two lines with one ball in one session, each side counted in that session. */
function MoveRow({ move, onOpen }: { move: LineMove; onOpen: () => void }) {
  return (
    <li className={LIST_DIVIDER}>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-surface-muted"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate font-semibold text-ink">{move.ballName}</span>
            <span className="shrink-0 text-xs text-ink-tertiary">
              {formatSessionDate(move.date)}
            </span>
          </span>
          <span className="block text-sm text-ink">
            {lineBoards(move.from)}, then {lineBoards(move.to)}
          </span>
          <span className="block text-xs tabular-nums text-ink-secondary">
            Strikes {ofCount(move.from.strikes, move.from.thrown)}, then{" "}
            {ofCount(move.to.strikes, move.to.thrown)}
          </span>
          <span className="block text-xs tabular-nums text-ink-secondary">
            Pocket {ofCount(move.from.pocket, move.from.thrown)}, then{" "}
            {ofCount(move.to.pocket, move.to.thrown)}
          </span>
        </span>
        <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-ink-tertiary" />
      </button>
    </li>
  );
}

/** The line changes, behind one row: the least needed of the three lists, and
 *  the one that made the screen long. */
function LineChanges({
  moves,
  onOpenLine
}: {
  moves: LineMove[];
  onOpenLine: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <ListGroup>
      <li>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-surface-muted"
        >
          <span className="min-w-0 flex-1 text-sm font-semibold text-ink">Line changes</span>
          <span className="text-xs tabular-nums text-ink-tertiary">{moves.length}</span>
          <ChevronDown
            size={16}
            aria-hidden="true"
            className={`shrink-0 text-ink-tertiary transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      </li>
      {open &&
        moves.map((move) => (
          <MoveRow key={move.id} move={move} onOpen={() => onOpenLine(move.to.lineId)} />
        ))}
    </ListGroup>
  );
}

/** A shot's first ball in a word or two. */
export function describeShot(shot: Pick<LineShot, "pinsStanding" | "pocket">): string {
  if (shot.pinsStanding.length === 0) return "Strike";
  const leave = formatLeave(shot.pinsStanding);
  return shot.pocket ? `${leave}, pocket` : leave;
}

/** One line: its three counts, what it left, then every shot in the order
 *  thrown. `onBack` is the same pop as the report's: the reducer takes the open
 *  line off before it touches the overlay stack. */
function LineDetail({
  line,
  onBack,
  onOpenShot
}: {
  line: LineRead;
  onBack: () => void;
  onOpenShot: (shot: LineShot) => void;
}) {
  // One group per game, newest session first, which is the order the shots
  // already arrive in.
  const games: Array<{ key: string; heading: string; shots: LineShot[] }> = [];
  for (const shot of line.shots) {
    const key = `${shot.sessionId ?? shot.date}:${shot.gameNumber}`;
    const last = games[games.length - 1];
    if (last?.key === key) last.shots.push(shot);
    else {
      games.push({
        key,
        heading: `${formatSessionDate(shot.date)} \u00b7 game ${shot.gameNumber}`,
        shots: [shot]
      });
    }
  }

  return (
    <PushScreen title={describeLine(line)} onBack={onBack}>
      <div className="mx-auto w-full max-w-3xl space-y-4 px-3 pb-8 pt-3 sm:px-6">
        <div className="grid grid-cols-3 gap-2">
          <CountTile label="Strikes" made={line.strikes} total={line.thrown} note="first balls" />
          <CountTile label="Pocket" made={line.pocket} total={line.thrown} note="first balls" />
          <CountTile label="Carry" made={line.pocketStrikes} total={line.pocket} note="pocket hits" />
        </div>

        {line.leaves.length > 0 && (
          <ListGroup heading="What it left">
            {line.leaves.map((leave) => (
              <li
                key={leave.pins.join("-")}
                className={`${LIST_DIVIDER} flex items-baseline justify-between gap-3 px-3 py-2.5`}
              >
                <span className="text-sm text-ink">{formatLeave(leave.pins)}</span>
                <span className="text-xs tabular-nums text-ink-tertiary">
                  {leave.count === 1 ? "once" : `${leave.count} times`}
                </span>
              </li>
            ))}
          </ListGroup>
        )}

        {games.map((game) => (
          <ListGroup key={game.key} heading={game.heading}>
            {game.shots.map((shot, i) => (
              <li key={`${shot.frameNumber}:${i}`} className={LIST_DIVIDER}>
                <button
                  type="button"
                  onClick={() => onOpenShot(shot)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-surface-muted"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold text-ink">{describeShot(shot)}</span>
                      <span className="shrink-0 text-xs tabular-nums text-ink-tertiary">
                        Frame {shot.frameNumber}
                        {shot.lane ? `, lane ${shot.lane}` : ""}
                      </span>
                    </span>
                    {shot.notes && (
                      <span className="block text-xs text-ink-secondary">{shot.notes}</span>
                    )}
                  </span>
                  <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-ink-tertiary" />
                </button>
              </li>
            ))}
          </ListGroup>
        ))}
      </div>
    </PushScreen>
  );
}

function CountTile({
  label,
  made,
  total,
  note
}: {
  label: string;
  made: number;
  total: number;
  note: string;
}) {
  return (
    <div className="rounded-xl border border-edge bg-surface p-3 shadow-sm">
      <div className={GROUP_HEADING}>{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-ink-strong">
        {ofCount(made, total)}
      </div>
      <div className="text-xs text-ink-tertiary">{note}</div>
    </div>
  );
}
