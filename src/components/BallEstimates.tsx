import { plural, t } from "@lingui/core/macro";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { CatalogBallImage } from "./CatalogBallImage";
import { BowlingBallIcon } from "./icons";
import { MiniPins } from "./MiniPins";
import { FormSheet } from "./ui/FormSheet";
import { LIST_DIVIDER_INSET, ListGroup } from "./ui/ListGroup";
import { ProBlur } from "./ui/ProLock";
import { GROUP_HEADING } from "./ui/typography";
import { formatLeave } from "../lib/pins";
import { previewSplit, standInEstimate } from "../lib/proPreview";
import {
  type BallEstimate,
  type BallEstimates as Estimates,
  type Counted,
  type LeaveCost
} from "../lib/scoreModel";
import type { Ball } from "../types/bowling";
import type { Manufacturer } from "../types/catalog";
import { formatNumber, formatPercent } from "../lib/format";

/** Whole pins with a sign: "+7", "−3", "0". */
function signedPins(value: number): string {
  const n = Math.round(value);
  if (n === 0) return formatNumber(0);
  return n > 0 ? `+${formatNumber(n)}` : `−${formatNumber(Math.abs(n))}`;
}

/** A share as a whole percentage, or null with nothing to share. */
function rate(made: number, of: number): number | null {
  return of === 0 ? null : (made / of) * 100;
}

function pct(value: number | null): string {
  return value === null ? "-" : formatPercent(value);
}

/** The four rates, in the order the Stats Balls card has them (ADR-149). */
const RATES: ReadonlyArray<{
  key: string;
  /** Read in render, since a message is not built at import. */
  label: () => string;
  aria: (value: string) => string;
  value: (c: Counted) => number | null;
  /** More of it is worse: a split. */
  lowerIsBetter?: boolean;
}> = [
  {
    key: "strike",
    label: () => t({ message: "Strike", comment: "Bowling term. A short column heading over the share of first balls that were strikes." }),
    aria: (value) => t({ message: `strike ${value}`, comment: "Bowling term. Spoken name of the strike rate column, then its percentage." }),
    value: (c) => rate(c.strikes, c.firstBalls)
  },
  {
    key: "after a strike",
    label: () => t({ message: "After strike", comment: "Bowling term. A short column heading over the share of strikes thrown right after a strike." }),
    aria: (value) => t({ message: `after a strike ${value}`, comment: "Bowling term. Spoken name of the strike-after-a-strike rate column, then its percentage." }),
    value: (c) => rate(c.strikesAfterStrike, c.afterStrike)
  },
  {
    key: "leaves that split",
    label: () => t({ message: "Splits", comment: "Bowling term. A short column heading over the share of leaves that were splits." }),
    aria: (value) => t({ message: `leaves that split ${value}`, comment: "Bowling term. Spoken name of the split rate column, then its percentage." }),
    value: (c) => rate(c.splits, c.leaves),
    lowerIsBetter: true
  },
  {
    key: "leaves made",
    label: () => t({ message: "Made", comment: "Bowling term. A short column heading over the share of leaves picked up for a spare." }),
    aria: (value) => t({ message: `leaves made ${value}`, comment: "Bowling term. Spoken name of the spare conversion column, then its percentage." }),
    value: (c) => rate(c.pickups, c.pickupChances)
  }
];

/** A row of four rate tiles. `against`, when given, puts each rate's gap to it
 *  under the number, in points, green where it is the better side. */
function RateTiles({ counted, against }: { counted: Counted; against?: Counted }) {
  return (
    <dl className="grid grid-cols-4 gap-1.5">
      {RATES.map((r) => {
        const value = r.value(counted);
        const base = against ? r.value(against) : null;
        const gap = value !== null && base !== null ? Math.round(value) - Math.round(base) : null;
        const better = gap !== null && (r.lowerIsBetter ? gap < 0 : gap > 0);
        const gapLabel =
          gap === null
            ? ""
            : gap === 0
              ? t({ message: "same as all balls", comment: "A ball's rate equals every ball's together. Spoken after the rate." })
              : gap > 0
                ? t({ message: `${formatNumber(gap)} points above all balls`, comment: "Spoken: a ball's rate is this many percentage points above every ball's together." })
                : t({ message: `${formatNumber(-gap)} points below all balls`, comment: "Spoken: a ball's rate is this many percentage points below every ball's together." });
        return (
          <div
            key={r.key}
            className="flex min-w-0 flex-col items-center rounded-xl bg-surface-sunken px-1 py-2 text-center"
            aria-label={[r.aria(pct(value)), gapLabel].filter(Boolean).join(", ")}
          >
            <dd className="order-1 text-headline font-bold tabular-nums leading-tight text-ink">{pct(value)}</dd>
            {against && (
              <dd
                aria-hidden="true"
                className={`order-2 text-caption-2 font-semibold tabular-nums ${
                  gap === null || gap === 0 ? "text-ink-tertiary" : better ? "text-success-700" : "text-danger-700"
                }`}
              >
                {gap === null ? "-" : gap === 0 ? "=" : `${gap > 0 ? "▲" : "▼"}${formatNumber(Math.abs(gap))}`}
              </dd>
            )}
            <dt className="order-3 mt-0.5 break-keep text-caption-2 font-semibold uppercase leading-tight tracking-wide text-ink-tertiary [overflow-wrap:normal]">
              {r.label()}
            </dt>
          </div>
        );
      })}
    </dl>
  );
}

/**
 * The bowler at this alley, first: the real average, what it is read from, and
 * the four rates every ball together (ADR-243). It is what each ball below is
 * read against, so it leads.
 */
export function AlleySummary({
  report,
  shots,
  sessions
}: {
  report: Estimates;
  shots: number;
  sessions: number;
}) {
  const average = report.actual === null ? "-" : formatNumber(Math.round(report.actual));
  return (
    <section className="rounded-[26px] bg-surface p-4" aria-label={t`Your average here`}>
      <p className="text-footnote text-ink-secondary">{t`Your average here`}</p>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-large-title font-extrabold leading-none tracking-tight tabular-nums text-ink">{average}</span>
        <span className="text-footnote text-ink-secondary">
          {t`${{ sessions: plural(sessions, { one: "# session", other: "# sessions" }) }} · ${{ shots: t({ message: plural(shots, { one: "# ball", other: "# balls" }), context: "balls thrown", comment: "A count of shots thrown (first balls), not of bowling balls owned" }) }}`}
        </span>
      </p>
      <div className="mt-3">
        <RateTiles counted={report.counted} />
      </div>
    </section>
  );
}

/**
 * Every ball ranked by what you would average with it here, each a row that
 * opens the ball in a sheet: its rates against every ball's, and the leaves
 * it costs most (ADR-243). The row says only what it ranks by, so the list
 * reads as an order, not a table.
 *
 * `free`, without Pro: that many balls in full, the next one blurred, and the
 * rest left out (ADR-167).
 *
 * `scope` names the alley and filters the numbers are read through, for the
 * sheet's bar (ADR-130).
 */
export function BallEstimates({
  report,
  balls,
  free,
  scope
}: {
  report: Estimates;
  balls: Ball[];
  free?: number;
  scope?: string;
}) {
  const [openId, setOpenId] = useState<number | null>(null);
  if (report.balls.length === 0) return null;
  const byId = new Map(balls.map((b) => [b.id, b]));
  const preview = free === undefined ? null : previewSplit(report.balls, free);
  const open = openId === null ? undefined : report.balls.find((e) => e.ballId === openId);
  return (
    <>
      <ListGroup
        heading={t({ message: "By ball", comment: "Heading over a list of the bowler's balls, ranked." })}
        headingTrailing={<span className="text-xs text-ink-secondary">{t`Estimated average`}</span>}
      >
        {(preview ? preview.shown : report.balls).map((estimate) => (
          <BallEstimateRow
            key={estimate.ballId}
            estimate={estimate}
            ball={byId.get(estimate.ballId)}
            onOpen={() => setOpenId(estimate.ballId)}
          />
        ))}
        {preview?.blurred && (
          <li className={LIST_DIVIDER_INSET}>
            <ProBlur what={t`What you'd average with each ball here`}>
              <ul>
                <BallEstimateRow estimate={standInEstimate(preview.blurred)} ball={byId.get(preview.blurred.ballId)} />
              </ul>
            </ProBlur>
          </li>
        )}
      </ListGroup>
      {open && (
        <FormSheet
          title={byId.get(open.ballId)?.name ?? t`Removed ball`}
          subtitle={scope}
          onClose={() => setOpenId(null)}
        >
          <BallEstimateDetail estimate={open} report={report} />
        </FormSheet>
      )}
    </>
  );
}

function BallThumb({ ball }: { ball: Ball | undefined }) {
  return (
    <span className="h-[30px] w-[30px] shrink-0">
      {ball?.catalog_snapshot ? (
        <CatalogBallImage
          src={ball.catalog_snapshot.imageThumb}
          alt=""
          brand={ball.catalog_snapshot.brand as Manufacturer}
          size="thumb"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center rounded-full bg-surface-muted text-ink-tertiary">
          <BowlingBallIcon size={14} aria-hidden="true" />
        </span>
      )}
    </span>
  );
}

/** The gap to the bowler's own average as a pill: green above, red below. */
function DifferencePill({ estimate }: { estimate: BallEstimate }) {
  const diff = Math.round(estimate.difference);
  const tone = estimate.thin
    ? "bg-surface-muted text-ink-tertiary"
    : diff > 0
      ? "bg-success-50 text-success-700"
      : diff < 0
        ? "bg-danger-50 text-danger-700"
        : "bg-surface-muted text-ink-tertiary";
  return (
    <span className={`shrink-0 rounded-full px-1.5 py-px text-caption-2 font-bold tabular-nums ${tone}`}>
      {signedPins(estimate.difference)}
    </span>
  );
}

/** The tilde says estimated before the number is read as a score. */
function headline(estimate: BallEstimate): string {
  return estimate.estimate === null
    ? signedPins(estimate.difference)
    : `~${formatNumber(Math.round(estimate.estimate))}`;
}

function BallEstimateRow({
  estimate,
  ball,
  onOpen
}: {
  estimate: BallEstimate;
  ball: Ball | undefined;
  onOpen?: () => void;
}) {
  const name = ball?.name ?? t`Removed ball`;
  const { thin } = estimate;
  const strike = pct(rate(estimate.counted.strikes, estimate.counted.firstBalls));
  const count = t({ message: plural(estimate.firstBalls, { one: "# ball", other: "# balls" }), context: "balls thrown", comment: "A count of shots thrown (first balls), not of bowling balls owned" });
  return (
    <li className={LIST_DIVIDER_INSET}>
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-[52px] w-full items-center gap-3.5 px-4 py-2 text-left active:bg-surface-muted"
      >
        <BallThumb ball={ball} />
        <span className="min-w-0 flex-1">
          <span className={`block break-words text-body font-semibold leading-snug ${thin ? "text-ink-secondary" : "text-ink"}`}>
            {name}
          </span>
          <span className="block text-footnote leading-snug text-ink-secondary">
            {thin
              ? t({ message: plural(estimate.firstBalls, { one: "# ball, too few", other: "# balls, too few" }), comment: "A count of shots thrown (first balls) with a ball, too few to trust the estimate" })
              : t({
                  message: `${count} · strike ${strike}`,
                  comment: "Under a ball's name: the shots thrown with it (already counted, e.g. 349 balls), then its strike rate as a percentage"
                })}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className={`text-headline font-bold tabular-nums ${thin ? "text-ink-tertiary" : "text-ink"}`}>
            {headline(estimate)}
          </span>
          {estimate.estimate !== null && <DifferencePill estimate={estimate} />}
        </span>
        <ChevronRight size={17} strokeWidth={2.25} aria-hidden="true" className="shrink-0 text-ink-tertiary" />
      </button>
    </li>
  );
}

/** Red under a third, green over two thirds: a leave you rarely make, and one
 *  you mostly do. */
function makeTone(made: number | null, thin: boolean): string {
  if (made === null || thin) return "text-ink-tertiary";
  if (made < 34) return "text-danger-700";
  if (made >= 67) return "text-success-700";
  return "text-ink";
}

function LeaveTile({ leave }: { leave: LeaveCost }) {
  const made = rate(leave.made, leave.chances);
  return (
    <li className="flex min-w-0 flex-col items-center gap-1 rounded-xl bg-surface-sunken px-1.5 py-2.5 text-center">
      <MiniPins standing={leave.pins} size="sm" />
      <span className="text-footnote font-semibold text-ink">{formatLeave(leave.pins)}</span>
      <span className={`text-title-3 font-bold leading-none tabular-nums ${makeTone(made, leave.thin)}`}>{pct(made)}</span>
      <span className="text-caption-2 leading-tight text-ink-secondary">
        <span className="block">
          {leave.thin
            ? t({ message: "made, few tries", comment: "Under a percentage: the share of this leave picked up, from too few tries to trust" })
            : t({ message: "made", comment: "Under a percentage: the share of this leave picked up for a spare" })}
        </span>
        <span className="block">
          {t({ message: plural(leave.left, { one: "Left # time", other: "Left # times" }), comment: "How many times this ball left these pins standing" })}
        </span>
      </span>
    </li>
  );
}

/** One ball: its estimate against the bowler's average, its rates against
 *  every ball's, and its leaves, costliest first. */
function BallEstimateDetail({ estimate, report }: { estimate: BallEstimate; report: Estimates }) {
  const leavesHeading = t({
    message: "Leaves, costliest first",
    comment: "Bowling term. The pin leaves (what is left standing after the first ball) this ball gave, the ones that cost the most spares first."
  });
  const average = report.actual === null ? null : formatNumber(Math.round(report.actual));
  return (
    <div className="space-y-5 px-4 pb-6 pt-1">
      <div>
        <p className="text-footnote text-ink-secondary">{t`Estimated average`}</p>
        <p className="flex flex-wrap items-center gap-x-2">
          <span className="text-large-title font-extrabold leading-none tracking-tight tabular-nums text-ink">
            {headline(estimate)}
          </span>
          {estimate.estimate !== null && <DifferencePill estimate={estimate} />}
        </p>
        <p className="mt-1 text-footnote text-ink-secondary">
          {estimate.thin
            ? t({
                message: plural(estimate.firstBalls, {
                  one: "Only # ball here, too few to rank.",
                  other: "Only # balls here, too few to rank."
                }),
                comment: "Shots thrown (first balls) with this ball in scope, too few to trust its estimate"
              })
            : average !== null
              ? t({
                  message: `${signedPins(estimate.difference)} a game against your ${average} here`,
                  comment: "Pins a game this ball is worth against the bowler's own average at this alley, e.g. +5 a game against your 196 here"
                })
              : null}
        </p>
      </div>
      <section>
        <h3 className={`${GROUP_HEADING} mb-1.5`}>{t({ message: "Against all balls", comment: "Heading over a ball's rates, each compared with every ball's together" })}</h3>
        <RateTiles counted={estimate.counted} against={report.counted} />
      </section>
      <section>
        <h3 className={`${GROUP_HEADING} mb-1.5`}>{leavesHeading}</h3>
        {estimate.costliest.length === 0 ? (
          <p className="text-footnote text-ink-secondary">
            {t({ message: "No leaves here yet. Every first ball was a strike.", comment: "A ball with no pins left standing after any of its first balls in scope" })}
          </p>
        ) : (
          <ul className="grid grid-cols-3 gap-1.5" aria-label={leavesHeading}>
            {estimate.costliest.map((leave) => (
              <LeaveTile key={leave.pins.join("-")} leave={leave} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
