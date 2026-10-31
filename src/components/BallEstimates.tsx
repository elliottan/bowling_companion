import { plural, t } from "@lingui/core/macro";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { CatalogBallImage } from "./CatalogBallImage";
import { BowlingBallIcon } from "./icons";
import { MiniPins } from "./MiniPins";
import { LIST_DIVIDER, ListGroup } from "./ui/ListGroup";
import { ProBlur } from "./ui/ProLock";
import { GROUP_HEADING } from "./ui/typography";
import { columnWidth } from "../lib/headingWidth";
import { formatLeave } from "../lib/pins";
import { previewSplit, standInEstimate } from "../lib/proPreview";
import { type BallEstimate, type BallEstimates as Estimates, type Counted } from "../lib/scoreModel";
import type { Ball } from "../types/bowling";
import type { Manufacturer } from "../types/catalog";
import { formatNumber, formatPercent } from "../lib/format";

/** Whole pins with a sign: "+7", "−3", "0". */
function signedPins(value: number): string {
  const n = Math.round(value);
  if (n === 0) return formatNumber(0);
  return n > 0 ? `+${formatNumber(n)}` : `−${formatNumber(Math.abs(n))}`;
}

function pct(made: number, of: number): string {
  return of === 0 ? "-" : formatPercent((made / of) * 100);
}

/** The rates on a ball's row, in the Stats Balls card's order and size, so
 *  every number is on screen without opening the ball (ADR-149). */
const COLUMNS: ReadonlyArray<{
  key: string;
  /** Read in render, since a message is not built at import. */
  label: () => string;
  aria: (value: string) => string;
  value: (c: Counted) => string;
}> = [
  {
    key: "strike",
    label: () => t({ message: "Strike", comment: "Bowling term. A short column heading over the share of first balls that were strikes." }),
    aria: (value) => t({ message: `strike ${value}`, comment: "Bowling term. Spoken name of the strike rate column, then its percentage." }),
    value: (c) => pct(c.strikes, c.firstBalls)
  },
  {
    key: "after a strike",
    label: () => t({ message: "After strike", comment: "Bowling term. A short column heading over the share of strikes thrown right after a strike." }),
    aria: (value) => t({ message: `after a strike ${value}`, comment: "Bowling term. Spoken name of the strike-after-a-strike rate column, then its percentage." }),
    value: (c) => pct(c.strikesAfterStrike, c.afterStrike)
  },
  {
    key: "leaves that split",
    label: () => t({ message: "Splits", comment: "Bowling term. A short column heading over the share of leaves that were splits." }),
    aria: (value) => t({ message: `leaves that split ${value}`, comment: "Bowling term. Spoken name of the split rate column, then its percentage." }),
    value: (c) => pct(c.splits, c.leaves)
  },
  {
    key: "leaves made",
    label: () => t({ message: "Made", comment: "Bowling term. A short column heading over the share of leaves picked up for a spare." }),
    aria: (value) => t({ message: `leaves made ${value}`, comment: "Bowling term. Spoken name of the spare conversion column, then its percentage." }),
    value: (c) => pct(c.pickups, c.pickupChances)
  }
];

/** Widths in rem times `--type-scale`, so a column grows with the numbers in
 *  it: fixed, "100%" at a large text size ran into the next column. Every row
 *  is `type-cap-dense`, so they all grow alike and stay aligned. */
const COLUMN = "shrink-0 text-right";
const ESTIMATE_COLUMN = "shrink-0 text-right";
/** A column is as wide as its numbers or its heading, whichever is wider, so a
 *  heading in a longer language gets its room (a gap, and never a break inside
 *  a word) and every row, given the same width, stays aligned under it. */
const estimateHeading = () => t({ message: "Est.", comment: "Short column heading: estimated average." });
const columnStyle = (c: { label: () => string }) => ({ width: columnWidth(2, [c.label()]) });
const estimateStyle = () => ({ width: columnWidth(2.25, [estimateHeading()]) });
/** The rate columns and the chevron, kept together on the row's right edge. The
 *  name has a floor of its own: when the columns of a long language leave it
 *  less than that, the name takes the line above and the rates sit under it,
 *  still right-aligned under their headings, rather than the name being cut to
 *  a letter a line. */
const RATES_GROUP = "ml-auto flex shrink-0";
const NAME_CELL = "min-w-[5.5rem] flex-1";
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
      heading={t`Estimated average`}
      headingTrailing={
        report.actual !== null && (
          <span className="text-xs tabular-nums text-ink-secondary">
            {t`Actual overall average: ${{ average: formatNumber(Math.round(report.actual)) }}`}
          </span>
        )
      }
    >
      <li
        className="type-cap-dense flex justify-end px-3 pb-1 pt-2 font-semibold uppercase leading-tight text-ink-tertiary"
        aria-hidden="true"
      >
        <span className={`${RATES_GROUP} items-end`}>
          {/* The headings hold their base size inside columns that grow, so a
              word fits its column at every text size. */}
          {COLUMNS.map((c) => (
            <span key={c.key} className={COLUMN} style={columnStyle(c)}>
              <span className="type-cap-fixed block break-keep text-caption-2 [overflow-wrap:normal]">{c.label()}</span>
            </span>
          ))}
          <span className={ESTIMATE_COLUMN} style={estimateStyle()}>
            <span className="type-cap-fixed block break-keep text-caption-2 [overflow-wrap:normal]">{estimateHeading()}</span>
          </span>
          <span className={CHEVRON_COLUMN} />
        </span>
      </li>
      {/* Every ball together, as the row each ball is read against: its
          average is the real one, not an estimate. */}
      <li
        className={`${LIST_DIVIDER} type-cap-dense flex flex-wrap items-center bg-surface-muted px-3 py-1.5 text-xs tabular-nums text-ink-secondary`}
        aria-label={t`All balls`}
      >
        <span className={`${NAME_CELL} pr-1`}>
          <span className="block font-semibold">{t`All balls`}</span>
          <span className="block text-caption-2 text-ink-tertiary">
            {t({ message: plural(report.counted.firstBalls, { one: "# ball", other: "# balls" }), context: "balls thrown", comment: "A count of shots thrown (first balls), not of bowling balls owned" })}
          </span>
        </span>
        <span className={`${RATES_GROUP} items-center`}>
          {COLUMNS.map((c) => (
            <span key={c.key} className={COLUMN} style={columnStyle(c)} aria-label={c.aria(c.value(report.counted))}>
              {c.value(report.counted)}
            </span>
          ))}
          <span className={`${ESTIMATE_COLUMN} font-semibold`} style={estimateStyle()}>
            {report.actual === null ? "-" : Math.round(report.actual)}
          </span>
          <span className={CHEVRON_COLUMN} />
        </span>
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
          <ProBlur what={t`What you'd average with each ball here`}>
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
  const name = ball?.name ?? t`Removed ball`;
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
    estimate.estimate === null ? signedPins(estimate.difference) : `~${formatNumber(Math.round(estimate.estimate))}`;
  const tone = thin ? "text-ink-tertiary" : "text-ink";

  return (
    <li className={LIST_DIVIDER}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="type-cap-dense flex w-full flex-wrap items-center px-3 py-2 text-left text-xs tabular-nums active:bg-surface-muted"
      >
        <span className={`${NAME_CELL} flex items-center gap-1.5 pr-1`}>
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
            <span className={`line-clamp-3 text-footnote font-semibold leading-tight [overflow-wrap:anywhere] ${thin ? "text-ink-secondary" : "text-ink"}`}>
              {name}
            </span>
            <span className="block text-caption-2 text-ink-tertiary">
              {thin
                ? t({ message: plural(estimate.firstBalls, { one: "# ball, too few", other: "# balls, too few" }), comment: "A count of shots thrown (first balls) with a ball, too few to trust the estimate" })
                : t({ message: plural(estimate.firstBalls, { one: "# ball", other: "# balls" }), context: "balls thrown", comment: "A count of shots thrown (first balls), not of bowling balls owned" })}
            </span>
          </span>
        </span>
        <span className={`${RATES_GROUP} items-center`}>
          {COLUMNS.map((c) => (
            <span key={c.key} className={`${COLUMN} ${tone}`} style={columnStyle(c)} aria-label={c.aria(c.value(estimate.counted))}>
              {c.value(estimate.counted)}
            </span>
          ))}
          <span className={ESTIMATE_COLUMN} style={estimateStyle()}>
            <span className={`block text-footnote font-semibold leading-tight ${thin ? "text-ink-tertiary" : "text-ink-strong"}`}>
              {headline}
            </span>
            {estimate.estimate !== null && (
              <span className={`block text-caption-2 font-semibold ${diffTone}`}>{signedPins(estimate.difference)}</span>
            )}
          </span>
          <ChevronDown
            size={12}
            aria-hidden="true"
            className={`${CHEVRON_COLUMN} text-ink-tertiary transition-transform ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>
      {open && <BallEstimateDetail estimate={estimate} />}
    </li>
  );
}

/** The leaves a ball costs most: its rates are already on its row, beside
 *  every ball's above them. */
function BallEstimateDetail({ estimate }: { estimate: BallEstimate }) {
  const costliestLeaves = t({
    message: "Costliest leaves",
    comment: "Bowling term. The pin leaves (what is left standing after the first ball) that cost this bowler the most."
  });
  return (
    <div className="mx-3 mb-3 rounded-lg bg-surface-muted p-3 text-sm">
      {estimate.costliest.length === 0 && (
        <p className="text-xs text-ink-secondary">{t`No leave it gives you is one you often miss.`}</p>
      )}
      {estimate.costliest.length > 0 && (
        <section>
          <h3 className={GROUP_HEADING}>{costliestLeaves}</h3>
          <ul className="mt-1.5 space-y-1.5" aria-label={costliestLeaves}>
            {estimate.costliest.map((leave) => (
              <li key={leave.pins.join("-")} className="flex items-center gap-3">
                <MiniPins standing={leave.pins} />
                <span className="min-w-0 flex-1 font-semibold text-ink">{formatLeave(leave.pins)}</span>
                <span className="shrink-0 text-right text-xs tabular-nums text-ink-secondary">
                  <span className="block">{t`Left ${{ count: leave.left }}`}</span>
                  <span className="block font-semibold text-ink">
                    {leave.thin
                      ? t`${{ made: leave.made }}/${{ chances: leave.chances }} made, few`
                      : t`${{ made: leave.made }}/${{ chances: leave.chances }} made`}
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
