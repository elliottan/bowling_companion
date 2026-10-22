import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { CatalogBallImage } from "./CatalogBallImage";
import { BowlingBallIcon } from "./icons";
import { MiniPins } from "./MiniPins";
import { LIST_DIVIDER, ListGroup } from "./ui/ListGroup";
import { ProBlur } from "./ui/ProLock";
import { GROUP_HEADING } from "./ui/typography";
import { formatLeave } from "../lib/pins";
import { previewSplit, standInEstimate } from "../lib/proPreview";
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

/** The rates on a ball's row, in the Stats Balls card's order and size, so
 *  every number is on screen without opening the ball (ADR-149). */
const COLUMNS: ReadonlyArray<{ key: string; label: string; value: (c: Counted) => string }> = [
  { key: "strike", label: "Strike", value: (c) => pct(c.strikes, c.firstBalls) },
  { key: "after a strike", label: "After strike", value: (c) => pct(c.strikesAfterStrike, c.afterStrike) },
  { key: "leaves that split", label: "Splits", value: (c) => pct(c.splits, c.leaves) },
  { key: "leaves made", label: "Made", value: (c) => pct(c.pickups, c.pickupChances) }
];

const COLUMN = "w-8 shrink-0 text-right";
const ESTIMATE_COLUMN = "w-10 shrink-0 text-right";
/** Leaves room for the chevron in the heading row, so the columns line up. */
const CHEVRON_COLUMN = "w-3 shrink-0";

/**
 * What you would average with each ball here, with every rate behind it on the
 * row (ADR-147, ADR-149). Ranked, with a ball that has too few first balls here
 * listed last and greyed rather than ranked.
 *
 * `free`, without Pro: that many balls in full, the next one blurred, and the
 * rest left out (ADR-167). The All balls row is every ball together, so it
 * stays.
 */
export function BallEstimates({ report, balls, free }: { report: Estimates; balls: Ball[]; free?: number }) {
  if (report.balls.length === 0) return null;
  const byId = new Map(balls.map((b) => [b.id, b]));
  const preview = free === undefined ? null : previewSplit(report.balls, free);
  return (
    <ListGroup
      heading="Estimated average"
      headingTrailing={
        report.actual !== null && (
          <span className="text-xs tabular-nums text-ink-secondary">
            Actual overall average: {Math.round(report.actual)}
          </span>
        )
      }
    >
      <li
        className="flex items-end gap-1 px-4 pb-1 pt-2 text-[9px] font-semibold uppercase leading-tight text-ink-tertiary"
        aria-hidden="true"
      >
        <span className="min-w-0 flex-1" />
        {COLUMNS.map((c) => (
          <span key={c.key} className={COLUMN}>
            {c.label}
          </span>
        ))}
        <span className={ESTIMATE_COLUMN}>Est.</span>
        <span className={CHEVRON_COLUMN} />
      </li>
      {/* Every ball together, as the row each ball is read against: its
          average is the real one, not an estimate. */}
      <li
        className={`${LIST_DIVIDER} flex items-center gap-1 bg-surface-muted px-4 py-1.5 text-xs tabular-nums text-ink-secondary`}
        aria-label="All balls"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">All balls</span>
          <span className="block text-[10px] text-ink-tertiary">{report.counted.firstBalls} balls</span>
        </span>
        {COLUMNS.map((c) => (
          <span key={c.key} className={COLUMN} aria-label={`${c.key} ${c.value(report.counted)}`}>
            {c.value(report.counted)}
          </span>
        ))}
        <span className={`${ESTIMATE_COLUMN} font-semibold`}>
          {report.actual === null ? "-" : Math.round(report.actual)}
        </span>
        <span className={CHEVRON_COLUMN} />
      </li>
      {(preview ? preview.shown : report.balls).map((estimate) => (
        <BallEstimateRow
          key={estimate.ballId}
          estimate={estimate}
          ball={byId.get(estimate.ballId)}
        />
      ))}
      {preview?.blurred && (
        <li className={LIST_DIVIDER}>
          <ProBlur what="What you'd average with each ball here">
            <ul>
              <BallEstimateRow estimate={standInEstimate(preview.blurred)} ball={byId.get(preview.blurred.ballId)} />
            </ul>
          </ProBlur>
        </li>
      )}
    </ListGroup>
  );
}

function BallEstimateRow({ estimate, ball }: { estimate: BallEstimate; ball: Ball | undefined }) {
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
  // The tilde says estimated before the number is read as a score.
  const headline =
    estimate.estimate === null ? signedPins(estimate.difference) : `~${Math.round(estimate.estimate)}`;
  const tone = thin ? "text-ink-tertiary" : "text-ink";

  return (
    <li className={LIST_DIVIDER}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1 px-4 py-2 text-left text-xs tabular-nums active:bg-surface-muted"
      >
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="h-5 w-5 shrink-0">
            {ball?.catalog_snapshot ? (
              <CatalogBallImage
                src={ball.catalog_snapshot.imageThumb}
                alt=""
                brand={ball.catalog_snapshot.brand as Manufacturer}
                size="thumb"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center rounded-full bg-surface-muted text-ink-tertiary">
                <BowlingBallIcon size={12} aria-hidden="true" />
              </span>
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className={`line-clamp-2 text-[13px] font-semibold leading-tight ${thin ? "text-ink-secondary" : "text-ink"}`}>
              {name}
            </span>
            <span className="block text-[10px] text-ink-tertiary">
              {estimate.firstBalls} {estimate.firstBalls === 1 ? "ball" : "balls"}
              {thin ? ", too few" : ""}
            </span>
          </span>
        </span>
        {COLUMNS.map((c) => (
          <span key={c.key} className={`${COLUMN} ${tone}`} aria-label={`${c.key} ${c.value(estimate.counted)}`}>
            {c.value(estimate.counted)}
          </span>
        ))}
        <span className={ESTIMATE_COLUMN}>
          <span className={`block text-[13px] font-semibold leading-tight ${thin ? "text-ink-tertiary" : "text-ink-strong"}`}>
            {headline}
          </span>
          {estimate.estimate !== null && (
            <span className={`block text-[10px] font-semibold ${diffTone}`}>{signedPins(estimate.difference)}</span>
          )}
        </span>
        <ChevronDown
          size={12}
          aria-hidden="true"
          className={`${CHEVRON_COLUMN} text-ink-tertiary transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <BallEstimateDetail estimate={estimate} />}
    </li>
  );
}

/** The leaves a ball costs most: its rates are already on its row, beside
 *  every ball's above them. */
function BallEstimateDetail({ estimate }: { estimate: BallEstimate }) {
  return (
    <div className="mx-3 mb-3 rounded-lg bg-surface-muted p-3 text-sm">
      {estimate.costliest.length === 0 && (
        <p className="text-xs text-ink-secondary">No leave it gives you is one you often miss.</p>
      )}
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
