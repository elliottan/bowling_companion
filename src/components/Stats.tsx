import { BarChart3, ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";
import { CatalogBallImage } from "./CatalogBallImage";
import { MiniPins } from "./MiniPins";
import type { Manufacturer } from "../types/catalog";
import { isBabySplit, isSplit, isWashout } from "../lib/pins";
import type {
  BallGameCell,
  BallPerformance,
  BallPerformanceReport,
  BowlingStats,
  LeaveStats
} from "../lib/stats";
import { BallGameSessionsDialog } from "./BallGameSessionsDialog";
import { ScoreTrendChart } from "./ScoreTrendChart";
import type { Game } from "../types/bowling";
import { GROUP_HEADING } from "./ui/typography";

// Definitions, tapped rather than printed: they are read once and then in the
// way. Short enough to land in a glance.
const POCKET_NOTE =
  "Pocket: balls thrown at a full rack that hit the pocket. Read from the leave, and you can flip it on any shot.";
const CARRY_NOTE =
  "Carry: pocket hits that struck. It answers whether the rack fell when you got it there.";
const STRIKE_NOTE =
  "Strike: balls thrown at a full rack that struck. It is pocket multiplied by carry, so it drops when either does.";
const SPARE_NOTE =
  "Spare: makeable leaves converted. Washouts and real splits are left out.";

interface StatsProps {
  stats: BowlingStats;
  isLoading?: boolean;
  leaves?: LeaveStats[];
  ballPerformance?: BallPerformanceReport;
  /** Open a specific game of a session. Wired where there is somewhere to go:
   *  a game-number column then opens the games behind it. */
  onOpenGame?: (sessionId: number, gameId: number) => void;
  /** Games of the session being shown, for the score trend. Omitted on the
   *  aggregate History screen: a line through games from different nights,
   *  houses and patterns draws a continuity that was never bowled. */
  games?: Array<Pick<Game, "game_number" | "final_score">>;
}

export function Stats({
  stats,
  isLoading = false,
  leaves,
  ballPerformance,
  onOpenGame,
  games
}: StatsProps) {
  const [showBallPerformance, setShowBallPerformance] = useState(false);
  // One note at a time, opened by tapping the stat it explains. A definition
  // read once is enough, so it stays a tap rather than permanent copy.
  const [note, setNote] = useState<string | null>(null);

  const toggleNote = (text: string) => setNote((curr) => (curr === text ? null : text));

  if (isLoading) {
    return (
      <p className="rounded-lg border border-edge bg-surface p-4 text-sm text-ink-secondary shadow-sm">
        Loading...
      </p>
    );
  }

  if (stats.totalGames === 0) {
    return (
      <div className="rounded-lg border border-dashed border-edge-strong bg-surface p-6 text-center">
        <BarChart3 className="mx-auto mb-2 text-ink-tertiary" aria-hidden="true" size={24} />
        <p className="text-sm text-ink-secondary">
          No games yet. Stats appear once you finish a game.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-5 gap-1.5">
        <Tile label="Games" value={String(stats.completedGames)} />
        {/* High over low, each on its own line — two 3-digit scores side by
            side don't fit the tile width. */}
        <Tile
          label=""
          valueClass="text-xs text-ink"
          value={
            // Score left, letter right, the pair centred as one block so the
            // two rows line up whatever the digit count.
            <span className="mx-auto flex w-fit flex-col leading-tight">
              <span className="flex items-baseline gap-1 text-accent">
                <span className="flex-1 text-left">{fmt(stats.highGame)}</span>
                <span className="text-ink-tertiary">H</span>
              </span>
              <span className="flex items-baseline gap-1 text-danger-600">
                <span className="flex-1 text-left">{fmt(stats.lowGame)}</span>
                <span className="text-ink-tertiary">L</span>
              </span>
            </span>
          }
        />
        <Tile label="Avg" value={fmt(stats.averageScore)} />
        <Tile
          label="Strike"
          value={pct(stats.strikePct)}
          onClick={() => toggleNote(STRIKE_NOTE)}
        />
        <Tile
          label="Spare"
          value={pct(stats.sparePct)}
          onClick={() => toggleNote(SPARE_NOTE)}
        />
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <Tile
          label="Pocket"
          value={pct(stats.pocketPct)}
          onClick={() => toggleNote(POCKET_NOTE)}
        />
        <Tile label="Carry" value={pct(stats.carryPct)} onClick={() => toggleNote(CARRY_NOTE)} />
      </div>

      {games && games.length > 0 && <ScoreTrendChart games={games} />}

      {note && <StatNote text={note} onDismiss={() => setNote(null)} />}

      {ballPerformance && ballPerformance.balls.length > 0 && (
        <div className="rounded-lg border border-edge bg-surface p-3 shadow-sm">
          <button
            type="button"
            onClick={() => setShowBallPerformance((v) => !v)}
            className={`flex w-full items-center justify-between gap-2 ${GROUP_HEADING}`}
          >
            Ball performance
            <ChevronDown
              size={16}
              aria-hidden="true"
              className={showBallPerformance ? "rotate-180" : ""}
            />
          </button>
          <div className={showBallPerformance ? "mt-2" : "hidden"}>
            <ul className="divide-y divide-edge">
              {ballPerformance.balls.map((b) => (
                <BallPerformanceRow key={b.ballId} ball={b} onOpenGame={onOpenGame} />
              ))}
            </ul>
          </div>
        </div>
      )}

      {(() => {
        const all = leaves ?? [];
        if (all.length === 0) return null;
        // Three groups, easiest first: makeables (ordinary leaves), washouts
        // (head pin standing with a gap behind it), and real splits.
        const splits = all.filter((l) => isSplit(l.pins) && !isBabySplit(l.pins));
        const washouts = all.filter((l) => isWashout(l.pins));
        const makeables = all.filter(
          (l) => !isWashout(l.pins) && (!isSplit(l.pins) || isBabySplit(l.pins))
        );
        return (
          <>
            <LeaveSection title="Makeables" leaves={makeables} />
            <LeaveSection title="Washouts" leaves={washouts} />
            <LeaveSection title="Splits" leaves={splits} />
          </>
        );
      })()}
    </div>
  );
}

/** Tapped definition of a stat, dismissed by tapping it. */
function StatNote({ text, onDismiss }: { text: string; onDismiss: () => void }) {
  return (
    <button
      type="button"
      onClick={onDismiss}
      className="w-full rounded-lg border border-edge bg-surface-muted p-3 text-left text-xs text-ink-secondary"
    >
      {text} Tap to dismiss.
    </button>
  );
}

function BallPerformanceRow({
  ball,
  onOpenGame
}: {
  ball: BallPerformance;
  onOpenGame?: (sessionId: number, gameId: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [drilldown, setDrilldown] = useState<BallGameCell | null>(null);
  const [note, setNote] = useState<string | null>(null);
  return (
    <li className="py-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left text-sm"
      >
        <span className="h-7 w-7 shrink-0">
          {ball.imageThumb || ball.brand ? (
            <CatalogBallImage
              src={ball.imageThumb}
              alt=""
              brand={ball.brand as Manufacturer}
              size="thumb"
            />
          ) : (
            <span className="block h-full w-full rounded-full bg-edge" aria-hidden="true" />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate font-medium text-ink-strong">{ball.name}</span>
        <span className="shrink-0 tabular-nums text-ink-secondary">
          <span className="font-semibold text-ink">{pct(ball.strikePct)}</span> strike
          {" · "}
          <span className="font-semibold text-ink">{ball.firstBalls}</span> balls
        </span>
        <ChevronDown size={14} aria-hidden="true" className={open ? "rotate-180" : ""} />
      </button>

      {open && (
        <div className="mt-2 space-y-2 rounded-lg bg-surface-muted p-2">
          <table className="w-full text-[11px] tabular-nums">
            <thead>
              <tr className="text-ink-tertiary">
                <th className="text-left font-semibold">Game</th>
                {ball.byGame.map((c) => (
                  <th key={c.gameNumber} className="text-right font-semibold">
                    {onOpenGame && c.sessions.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => setDrilldown(c)}
                        aria-label={`Games behind ${ball.name}, game ${c.gameNumber}`}
                        className="underline decoration-dotted underline-offset-2"
                      >
                        {c.gameNumber}
                      </button>
                    ) : (
                      c.gameNumber
                    )}
                  </th>
                ))}
                <th className="text-right font-semibold">All</th>
              </tr>
            </thead>
            <tbody className="text-ink-secondary">
              <MetricRow
                label="Pocket"
                cells={ball.byGame.map((c) => rateOf(c.pocket, c.firstBalls))}
                total={ball.pocketPct}
                onExplain={() => setNote((curr) => (curr === POCKET_NOTE ? null : POCKET_NOTE))}
              />
              <MetricRow
                label="Carry"
                cells={ball.byGame.map((c) => rateOf(c.pocketStrikes, c.pocket))}
                total={ball.carryPct}
                onExplain={() => setNote((curr) => (curr === CARRY_NOTE ? null : CARRY_NOTE))}
              />
              <MetricRow
                label="Strike"
                cells={ball.byGame.map((c) => rateOf(c.strikes, c.firstBalls))}
                total={ball.strikePct}
                onExplain={() => setNote((curr) => (curr === STRIKE_NOTE ? null : STRIKE_NOTE))}
              />
              <tr>
                <td className="text-left text-ink-tertiary">Balls</td>
                {ball.byGame.map((c) => (
                  <td key={c.gameNumber} className="text-right text-ink-tertiary">
                    {c.firstBalls}
                  </td>
                ))}
                <td className="text-right text-ink-tertiary">{ball.firstBalls}</td>
              </tr>
            </tbody>
          </table>

          {note && <StatNote text={note} onDismiss={() => setNote(null)} />}

          {drilldown && onOpenGame && (
            <BallGameSessionsDialog
              open
              ballName={ball.name}
              gameNumber={drilldown.gameNumber}
              sessions={drilldown.sessions}
              onSelect={onOpenGame}
              onClose={() => setDrilldown(null)}
            />
          )}

          {ball.leaves.length > 0 && (
            <div className="grid grid-cols-4 gap-1.5">
              {ball.leaves.slice(0, 4).map((leave) => (
                <LeaveCountCell key={leave.pins.join("-")} leave={leave} />
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function MetricRow({
  label,
  cells,
  total,
  onExplain
}: {
  label: string;
  cells: Array<number | null>;
  total: number | null;
  onExplain: () => void;
}) {
  return (
    <tr>
      <td className="text-left font-semibold text-ink">
        <button type="button" onClick={onExplain} className="underline decoration-dotted underline-offset-2">
          {label}
        </button>
      </td>
      {cells.map((value, i) => (
        <td key={i} className="text-right">
          {pct(value)}
        </td>
      ))}
      <td className="text-right font-semibold text-ink">{pct(total)}</td>
    </tr>
  );
}

function rateOf(made: number, opportunities: number): number | null {
  if (opportunities === 0) return null;
  return Math.round((made / opportunities) * 100);
}

function LeaveSection({ title, leaves }: { title: string; leaves: LeaveStats[] }) {
  if (leaves.length === 0) return null;
  // Most-bowled first, so the leaves with meaningful sample sizes lead.
  const sorted = [...leaves].sort((a, b) => b.attempts - a.attempts);
  return (
    <div className="rounded-lg border border-edge bg-surface p-3 shadow-sm">
      <h2 className={`mb-3 ${GROUP_HEADING}`}>
        {title}
      </h2>
      <div className="grid grid-cols-4 gap-1.5">
        {sorted.map((leave) => (
          <LeaveCell key={leave.pins.join("-")} leave={leave} />
        ))}
      </div>
    </div>
  );
}

/** Per-ball leaves answer "what does this ball leave", not "do I make it": the
 *  conversion is about the spare game, and it is already on the leaves card. */
function LeaveCountCell({ leave }: { leave: LeaveStats }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-edge bg-surface p-2 text-center shadow-sm">
      <MiniPins standing={leave.pins} size="sm" />
      <span className="text-sm font-bold tabular-nums text-ink">
        {leave.attempts}
        <span className="text-[11px] font-semibold text-ink-secondary">
          {leave.attempts === 1 ? " time" : " times"}
        </span>
      </span>
    </div>
  );
}

function LeaveCell({ leave }: { leave: LeaveStats }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-edge bg-surface p-2 text-center shadow-sm">
      <MiniPins standing={leave.pins} size="sm" />
      {/* The pin diagram already names the leave — attempts on the left, rate
          on the right, one row. */}
      <div className="flex w-full items-baseline justify-between gap-1">
        <span className="text-[11px] tabular-nums text-ink-secondary">
          {leave.conversions}/{leave.attempts}
        </span>
        <span
          className={`text-sm font-bold ${
            leave.conversionPct !== null && leave.conversionPct >= 70
              ? "text-accent"
              : "text-ink"
          }`}
        >
          {leave.conversionPct !== null ? `${leave.conversionPct}%` : "-"}
        </span>
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  valueClass = "text-lg text-ink",
  onClick
}: {
  label: string;
  value: ReactNode;
  valueClass?: string;
  onClick?: () => void;
}) {
  const className = "rounded-lg border border-edge bg-surface px-1 py-2 text-center shadow-sm";
  const body = (
    <>
      <p className={`font-bold tabular-nums ${valueClass}`}>{value}</p>
      {label && (
        <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-secondary">{label}</p>
      )}
    </>
  );
  if (!onClick) return <div className={className}>{body}</div>;
  return (
    <button type="button" onClick={onClick} className={`${className} w-full`}>
      {body}
    </button>
  );
}

function fmt(value: number | null): string {
  return value === null ? "-" : String(value);
}

function pct(value: number | null): string {
  return value === null ? "-" : `${value}%`;
}
