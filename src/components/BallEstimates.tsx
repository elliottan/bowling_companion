import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { CatalogBallImage } from "./CatalogBallImage";
import { BowlingBallIcon } from "./icons";
import { MiniPins } from "./MiniPins";
import { LIST_DIVIDER_INSET, ListGroup } from "./ui/ListGroup";
import { GROUP_HEADING } from "./ui/typography";
import { formatLeave } from "../lib/pins";
import { type BallEstimate, type BallEstimates as Estimates, type Counted } from "../lib/scoreModel";
import type { Ball } from "../types/bowling";
import type { Manufacturer } from "../types/catalog";

/** Whole pins with a sign: "+7", "−3", "0". */
function signedPins(value: number): string {
  const n = Math.round(value);
  if (n === 0) return "0";
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}

function pct(made: number, of: number): string {
  return of === 0 ? "-" : `${Math.round((made / of) * 100)}%`;
}

/**
 * What you would average with each ball here, and why: its strikes and its
 * leaves, each in pins a game (ADR-147). Ranked, with a ball that has too few
 * first balls here listed last and greyed rather than ranked.
 */
export function BallEstimates({ report, balls }: { report: Estimates; balls: Ball[] }) {
  if (report.balls.length === 0) return null;
  const byId = new Map(balls.map((b) => [b.id, b]));
  return (
    <ListGroup
      heading="Estimated average"
      headingTrailing={
        report.actual !== null && (
          <span className="text-xs tabular-nums text-ink-secondary">
            Yours here {Math.round(report.actual)}
          </span>
        )
      }
    >
      {report.balls.map((estimate) => (
        <BallEstimateRow
          key={estimate.ballId}
          estimate={estimate}
          ball={byId.get(estimate.ballId)}
          everyBall={report.counted}
        />
      ))}
    </ListGroup>
  );
}

function BallEstimateRow({
  estimate,
  ball,
  everyBall
}: {
  estimate: BallEstimate;
  ball: Ball | undefined;
  everyBall: Counted;
}) {
  const [open, setOpen] = useState(false);
  const name = ball?.name ?? "Removed ball";
  const { thin } = estimate;
  const diff = Math.round(estimate.difference);
  const diffTone = thin
    ? "text-ink-tertiary"
    : diff > 0
      ? "text-success-700"
      : diff < 0
        ? "text-danger-700"
        : "text-ink-tertiary";
  const headline = estimate.estimate === null ? signedPins(estimate.difference) : String(Math.round(estimate.estimate));

  return (
    <li className={LIST_DIVIDER_INSET}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-surface-muted"
      >
        <span className="h-9 w-9 shrink-0">
          {ball?.catalog_snapshot ? (
            <CatalogBallImage
              src={ball.catalog_snapshot.imageThumb}
              alt=""
              brand={ball.catalog_snapshot.brand as Manufacturer}
              size="thumb"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center rounded-full bg-surface-muted text-ink-tertiary">
              <BowlingBallIcon size={18} aria-hidden="true" />
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm font-semibold ${thin ? "text-ink-secondary" : "text-ink"}`}>
            {name}
          </span>
          <span className="block truncate text-xs tabular-nums text-ink-secondary">
            {thin
              ? `${estimate.firstBalls} ${estimate.firstBalls === 1 ? "ball" : "balls"}, too few`
              : `${pct(estimate.counted.strikes, estimate.counted.firstBalls)} strikes \u00b7 ${pct(
                  estimate.counted.splits,
                  estimate.counted.leaves
                )} splits`}
          </span>
        </span>
        <span className="shrink-0 text-right tabular-nums">
          <span className={`block text-lg font-semibold leading-tight ${thin ? "text-ink-tertiary" : "text-ink-strong"}`}>
            {headline}
          </span>
          {estimate.estimate !== null && (
            <span className={`block text-xs font-semibold ${diffTone}`}>{signedPins(estimate.difference)}</span>
          )}
        </span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={`shrink-0 text-ink-tertiary transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <BallEstimateDetail estimate={estimate} everyBall={everyBall} />}
    </li>
  );
}

/** The ball's numbers beside every ball's, and the leaves it costs most. */
function BallEstimateDetail({ estimate, everyBall }: { estimate: BallEstimate; everyBall: Counted }) {
  const c = estimate.counted;
  const rows: Array<[string, string, string]> = [
    ["Strike", pct(c.strikes, c.firstBalls), pct(everyBall.strikes, everyBall.firstBalls)],
    ["After a strike", pct(c.strikesAfterStrike, c.afterStrike), pct(everyBall.strikesAfterStrike, everyBall.afterStrike)],
    ["Leaves that split", pct(c.splits, c.leaves), pct(everyBall.splits, everyBall.leaves)]
  ];
  return (
    <div className="mx-3 mb-3 space-y-3 rounded-lg bg-surface-muted p-3 text-sm">
      <table className="w-full tabular-nums">
        <thead>
          <tr className={GROUP_HEADING}>
            <th className="text-left font-semibold">{c.firstBalls} balls</th>
            <th className="w-16 text-right font-semibold">This</th>
            <th className="w-16 text-right font-semibold">All</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, ball, all]) => (
            <tr key={label}>
              <td className="py-0.5 text-ink-secondary">{label}</td>
              <td className="py-0.5 text-right font-semibold text-ink">{ball}</td>
              <td className="py-0.5 text-right text-ink-secondary">{all}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {estimate.costliest.length > 0 && (
        <section>
          <h3 className={GROUP_HEADING}>Costliest leaves</h3>
          <ul className="mt-1.5 space-y-1.5" aria-label="Costliest leaves">
            {estimate.costliest.map((leave) => (
              <li key={leave.pins.join("-")} className="flex items-center gap-3">
                <MiniPins standing={leave.pins} />
                <span className="min-w-0 flex-1 font-semibold text-ink">{formatLeave(leave.pins)}</span>
                <span className="shrink-0 text-right text-xs tabular-nums text-ink-secondary">
                  <span className="block">Left {leave.left}</span>
                  <span className="block font-semibold text-ink">
                    {leave.made}/{leave.chances} made{leave.thin ? ", few" : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
