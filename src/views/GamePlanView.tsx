import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronRight, Compass } from "lucide-react";
import { PushScreen } from "../components/PushScreen";
import { EmptyState } from "../components/ui/EmptyState";
import { LoadingCard } from "../components/ui/LoadingCard";
import { GROUP_HEADING } from "../components/ui/typography";
import { FIELD_LABEL, FIELD_SELECT } from "../components/ui/field";
import { LIST_DIVIDER, ListGroup } from "../components/ui/ListGroup";
import {
  buildLineReport,
  findLine,
  MIN_LINE_SHOTS,
  type BallRead,
  type LineMove,
  type LineRead,
  type LineShot
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

const NO_SESSIONS: SessionSummary[] = [];
const NO_BALLS: Ball[] = [];

/** Lines shown under a ball before the rest go behind "Show all". A session of
 *  small moves leaves a long tail of lines thrown once or twice. */
const LINES_SHOWN = 5;

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
}

export function GamePlanView({
  onBack,
  openLineId,
  onOpenLine,
  onOpenSessionGame
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

  const report = useMemo(
    () => buildLineReport(history, balls, { alley, pattern, lane }, handedness),
    [history, balls, alley, pattern, lane, handedness]
  );
  const open = findLine(report, openLineId);

  const where = [alley, pattern, lane && `lane ${lane}`].filter(Boolean).join(" \u00b7 ");

  return (
    <>
      <PushScreen title="Alley report" onBack={onBack} active={!open}>
        <div className="mx-auto w-full max-w-3xl px-3 pb-8 pt-3 sm:px-6">
          {error ? (
            <ErrorBanner>Your sessions could not be read. Reload the app, then try again.</ErrorBanner>
          ) : isLoading ? (
            <LoadingCard />
          ) : history.length === 0 ? (
            <EmptyState
              icon={Compass}
              title="Nothing to go on yet"
              description="Bowl a few sessions and this reads back what each line did."
            />
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
                {report.shots === 0
                  ? `Nothing recorded for ${where || "this"} yet.`
                  : `${report.shots} first ${report.shots === 1 ? "ball" : "balls"} over ${
                      report.sessions
                    } ${report.sessions === 1 ? "session" : "sessions"}${where ? ` at ${where}` : ""}.`}
              </p>

              {report.moves.length > 0 && (
                <div className="mt-4">
                  <ListGroup heading="Line changes">
                    {report.moves.map((move) => (
                      <MoveRow key={move.id} move={move} onOpen={() => onOpenLine(move.to.lineId)} />
                    ))}
                  </ListGroup>
                </div>
              )}

              {report.balls.map((ball) => (
                <BallLines key={ball.ballId ?? "none"} ball={ball} onOpenLine={onOpenLine} />
              ))}

              {report.shots > 0 && (
                <p className="mt-2 px-1 text-xs text-ink-tertiary">
                  What each line did, not what to play. A line marked thin has under{" "}
                  {MIN_LINE_SHOTS} balls.
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

const COUNT_COLUMN = "w-16 shrink-0 text-right tabular-nums";

/** One ball: its lines, most thrown first, under the same two counts. */
function BallLines({ ball, onOpenLine }: { ball: BallRead; onOpenLine: (id: string) => void }) {
  const [showAll, setShowAll] = useState(false);
  const lines = showAll ? ball.lines : ball.lines.slice(0, LINES_SHOWN);
  return (
    <div className="mt-4">
      <ListGroup
        heading={<h2 className="truncate text-sm font-semibold text-ink-strong">{ball.name}</h2>}
        headingTrailing={
          <span className="shrink-0 text-xs tabular-nums text-ink-tertiary">
            {ofCount(ball.strikes, ball.thrown)} strikes
          </span>
        }
      >
        {ball.lines.length === 0 ? (
          <li className="px-3 py-2.5 text-sm text-ink-secondary">No line recorded with this ball.</li>
        ) : (
          <li className={`flex items-center gap-3 px-3 pt-2 ${GROUP_HEADING}`} aria-hidden="true">
            <span className="min-w-0 flex-1">Line</span>
            <span className={COUNT_COLUMN}>Pocket</span>
            <span className={COUNT_COLUMN}>Strikes</span>
            <span className="w-4 shrink-0" />
          </li>
        )}
        {lines.map((line, i) => (
          <li key={line.id} className={i === 0 ? "" : LIST_DIVIDER}>
            <button
              type="button"
              onClick={() => onOpenLine(line.id)}
              aria-label={`${lineBoards(line)}: pocket ${ofCount(line.pocket, line.thrown)}, strikes ${ofCount(line.strikes, line.thrown)}`}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-surface-muted"
            >
              <span className="min-w-0 flex-1 truncate text-sm text-ink">
                {lineBoards(line)}
                {line.thin && <span className="text-xs text-ink-tertiary"> thin</span>}
              </span>
              <span className={`${COUNT_COLUMN} text-sm text-ink-secondary`}>
                {ofCount(line.pocket, line.thrown)}
              </span>
              <span className={`${COUNT_COLUMN} text-sm font-semibold text-ink`}>
                {ofCount(line.strikes, line.thrown)}
              </span>
              <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-ink-tertiary" />
            </button>
          </li>
        ))}
        {!showAll && ball.lines.length > LINES_SHOWN && (
          <li className={LIST_DIVIDER}>
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="w-full px-3 py-2.5 text-left text-sm font-semibold text-accent active:bg-surface-muted"
            >
              Show all {ball.lines.length} lines
            </button>
          </li>
        )}
      </ListGroup>
    </div>
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
