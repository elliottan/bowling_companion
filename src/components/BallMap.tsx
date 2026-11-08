import { t } from "@lingui/core/macro";
import { useId } from "react";
import { specsAt, type MapPoint } from "../lib/ballCompare";
import { formatFixed, formatNumber } from "../lib/format";
import { siteUrl } from "../lib/platform";
import type { CatalogBall } from "../types/catalog";

const W = 340;
const H = 300;
const PAD = { left: 34, right: 14, top: 16, bottom: 34 };
/** The window every reactive ball falls in; urethane and polyester sit at its
 *  edges or past them, and are drawn on its edge rather than dropped. */
const RG = [2.44, 2.66] as const;
const DIFF = [0, 0.065] as const;
/** A marker's radius: big enough to show the ball's photo. */
const R = 11;

const x = (rg: number) => PAD.left + ((Math.min(Math.max(rg, RG[0]), RG[1]) - RG[0]) / (RG[1] - RG[0])) * (W - PAD.left - PAD.right);
const y = (diff: number) => PAD.top + (1 - (Math.min(Math.max(diff, DIFF[0]), DIFF[1]) - DIFF[0]) / (DIFF[1] - DIFF[0])) * (H - PAD.top - PAD.bottom);

/**
 * Where balls sit by RG and differential (ADR-258, ADR-261): lower RG to the
 * left revs up sooner, higher diff up the chart flares more. Each ball is its
 * own photo, numbered as the key names it, edged in the accent when picked to
 * compare and in a quiet ring when only owned. Only the balls being compared
 * and the bowler's own are drawn: the whole catalog behind them said nothing
 * a bowler used. A tap on a ball asks for it (`onPick`), with where it was
 * tapped, so the screen can hang its card off it.
 */
export function BallMap({
  points,
  weight,
  activeId,
  onPick
}: {
  points: readonly MapPoint[];
  weight: number;
  /** The ball whose card is open, drawn on top. */
  activeId?: string | null;
  onPick?: (ball: CatalogBall, anchor: DOMRect) => void;
}) {
  const clip = useId();
  const placed = points.flatMap((p) => {
    const s = specsAt(p.ball, weight);
    return s.rg != null && s.diff != null ? [{ ...p, cx: x(s.rg), cy: y(s.diff), rg: s.rg, diff: s.diff }] : [];
  });
  // The first numbered on top, and the ball whose card is open over them all.
  const drawn = [...placed].reverse().sort((a, b) => Number(a.ball.id === activeId) - Number(b.ball.id === activeId));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full"
      role="img"
      aria-label={t({ message: "Balls by RG and differential", comment: "Bowling terms: RG is the radius of gyration, differential a ball spec. The spoken name of a chart." })}
    >
      <defs>
        <clipPath id={clip} clipPathUnits="objectBoundingBox">
          <circle cx={0.5} cy={0.5} r={0.5} />
        </clipPath>
      </defs>
      {[2.45, 2.5, 2.55, 2.6, 2.65].map((rg) => (
        <g key={rg}>
          <line x1={x(rg)} x2={x(rg)} y1={PAD.top} y2={H - PAD.bottom} stroke="rgb(var(--color-edge))" strokeWidth={1} />
          <text x={x(rg)} y={H - PAD.bottom + 13} textAnchor="middle" fontSize={9} fill="rgb(var(--color-ink-tertiary))">
            {formatFixed(rg, 2)}
          </text>
        </g>
      ))}
      {[0.02, 0.04, 0.06].map((d) => (
        <g key={d}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(d)} y2={y(d)} stroke="rgb(var(--color-edge))" strokeWidth={1} />
          <text x={PAD.left - 4} y={y(d) + 3} textAnchor="end" fontSize={9} fill="rgb(var(--color-ink-tertiary))">
            {formatFixed(d, 2)}
          </text>
        </g>
      ))}
      <text x={(PAD.left + W - PAD.right) / 2} y={H - 4} textAnchor="middle" fontSize={9.5} fill="rgb(var(--color-ink-secondary))">
        {t({ message: "RG: lower revs up sooner", comment: "Bowling term: RG is the radius of gyration. A chart's horizontal axis title." })}
      </text>
      <text
        x={10}
        y={(PAD.top + H - PAD.bottom) / 2}
        textAnchor="middle"
        fontSize={9.5}
        fill="rgb(var(--color-ink-secondary))"
        transform={`rotate(-90 10 ${(PAD.top + H - PAD.bottom) / 2})`}
      >
        {t({ message: "Diff: higher flares more", comment: "Bowling term: diff is the differential. A chart's vertical axis title." })}
      </text>

      {drawn.map((p) => {
        const src = siteUrl(p.ball.imageThumb);
        const active = p.ball.id === activeId;
        return (
          <g
            key={p.ball.id}
            data-ball={p.ball.id}
            role={onPick ? "button" : undefined}
            tabIndex={onPick ? 0 : undefined}
            aria-label={onPick ? `${p.ball.brand} ${p.ball.name}` : undefined}
            className={onPick ? "cursor-pointer outline-none" : undefined}
            onClick={(e) => onPick?.(p.ball, e.currentTarget.getBoundingClientRect())}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onPick?.(p.ball, e.currentTarget.getBoundingClientRect());
              }
            }}
          >
            <title>{`${p.ball.brand} ${p.ball.name}: RG ${formatFixed(p.rg, 2)}, ${formatFixed(p.diff, 3)}`}</title>
            {/* A finger's reach around the photo, unseen. */}
            <circle cx={p.cx} cy={p.cy} r={R + 8} fill="transparent" />
            <circle cx={p.cx} cy={p.cy} r={R} fill="rgb(var(--color-surface-muted))" />
            {src && (
              <image
                href={src}
                x={p.cx - R}
                y={p.cy - R}
                width={R * 2}
                height={R * 2}
                preserveAspectRatio="xMidYMid slice"
                clipPath={`url(#${clip})`}
              />
            )}
            {/* Selected in the accent, owned in a quiet ring; both, the accent. */}
            <circle
              cx={p.cx}
              cy={p.cy}
              r={R + (p.selected ? 1.5 : 0.75)}
              fill="none"
              stroke={p.selected ? "rgb(var(--color-accent))" : "rgb(var(--color-ink-secondary))"}
              strokeWidth={p.selected ? 3 : 1.5}
            />
            {active && <circle cx={p.cx} cy={p.cy} r={R + 5} fill="none" stroke="rgb(var(--color-ink))" strokeWidth={1.5} strokeDasharray="3 2" />}
            <circle
              cx={p.cx + R * 0.72}
              cy={p.cy - R * 0.72}
              r={6.5}
              fill={p.selected ? "rgb(var(--color-accent-fill))" : "rgb(var(--color-ink-strong))"}
              stroke="rgb(var(--color-surface))"
              strokeWidth={1.25}
            />
            <text
              x={p.cx + R * 0.72}
              y={p.cy - R * 0.72 + 3}
              textAnchor="middle"
              fontSize={8.5}
              fontWeight={700}
              fill={p.selected ? "rgb(var(--color-accent-on-fill))" : "rgb(var(--color-surface))"}
            >
              {formatNumber(p.n)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
