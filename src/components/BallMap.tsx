import { t } from "@lingui/core/macro";
import { useMemo } from "react";
import { COVER_ORDER, specsAt } from "../lib/ballCompare";
import { formatFixed } from "../lib/format";
import type { CatalogBall, CoverstockCategory } from "../types/catalog";
import { coverstockLabel } from "./catalogLabels";

/** Each cover type's hue, from the validated tokens in `index.css`. */
const COVER_COLOR: Record<CoverstockCategory, string> = {
  Solid: "var(--color-cover-solid)",
  Pearl: "var(--color-cover-pearl)",
  Hybrid: "var(--color-cover-hybrid)",
  Urethane: "var(--color-cover-urethane)",
  Polyester: "var(--color-cover-polyester)"
};

const W = 340;
const H = 300;
const PAD = { left: 34, right: 10, top: 12, bottom: 34 };
/** The window every reactive ball falls in; urethane and polyester sit at its
 *  edges or past them, and are drawn on its edge rather than dropped. */
const RG = [2.44, 2.66] as const;
const DIFF = [0, 0.065] as const;

const x = (rg: number) => PAD.left + ((Math.min(Math.max(rg, RG[0]), RG[1]) - RG[0]) / (RG[1] - RG[0])) * (W - PAD.left - PAD.right);
const y = (diff: number) => PAD.top + (1 - (Math.min(Math.max(diff, DIFF[0]), DIFF[1]) - DIFF[0]) / (DIFF[1] - DIFF[0])) * (H - PAD.top - PAD.bottom);

interface Point {
  ball: CatalogBall;
  cx: number;
  cy: number;
  kind: "compared" | "owned";
}

/**
 * Where balls sit by RG and differential (ADR-258): lower RG to the left
 * revs up sooner, higher diff up the chart flares more, and the cover type
 * is the colour. The whole catalog is drawn faint behind. The balls being
 * compared and the bowler's own are numbered markers, ringed when compared,
 * and named in a key under the chart: the strong balls bunch in one corner,
 * and names drawn there sat on one another.
 */
export function BallMap({
  catalog,
  compared,
  owned,
  weight,
  showOwned
}: {
  catalog: readonly CatalogBall[];
  compared: readonly CatalogBall[];
  owned: readonly CatalogBall[];
  weight: number;
  showOwned: boolean;
}) {
  const cloud = useMemo(
    () =>
      catalog
        .filter((b) => b.rg != null && b.diff != null && b.coverstockCategory)
        .map((b) => ({ id: b.id, cx: x(b.rg!), cy: y(b.diff!), color: COVER_COLOR[b.coverstockCategory!] })),
    [catalog]
  );

  const points: Point[] = [];
  const comparedIds = new Set(compared.map((b) => b.id));
  for (const b of compared) {
    const s = specsAt(b, weight);
    if (s.rg != null && s.diff != null) points.push({ ball: b, cx: x(s.rg), cy: y(s.diff), kind: "compared" });
  }
  if (showOwned) {
    for (const b of owned) {
      if (comparedIds.has(b.id)) continue;
      const s = specsAt(b, weight);
      if (s.rg != null && s.diff != null) points.push({ ball: b, cx: x(s.rg), cy: y(s.diff), kind: "owned" });
    }
  }
  // Compared first, then the bag; drawn in reverse so the compared sit on top.
  const numbered = points.map((p, i) => ({ ...p, n: i + 1 }));

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full"
        role="img"
        aria-label={t({ message: "Balls by RG and differential", comment: "Bowling terms: RG is the radius of gyration, differential a ball spec. The spoken name of a chart." })}
      >
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

        {cloud.map((c) => (
          <circle key={c.id} cx={c.cx} cy={c.cy} r={1.8} fill={c.color} opacity={0.3} />
        ))}

        {[...numbered].reverse().map((p) => (
          <g key={p.ball.id}>
            <title>
              {`${p.ball.brand} ${p.ball.name}: RG ${formatFixed(specsAt(p.ball, weight).rg ?? 0, 2)}, ${formatFixed(specsAt(p.ball, weight).diff ?? 0, 3)}`}
            </title>
            {p.kind === "compared" && <circle cx={p.cx} cy={p.cy} r={10.5} fill="none" stroke="rgb(var(--color-accent))" strokeWidth={2} />}
            <circle cx={p.cx} cy={p.cy} r={7.5} fill={COVER_COLOR[p.ball.coverstockCategory ?? "Solid"]} stroke="rgb(var(--color-surface))" strokeWidth={1.5} />
            <text x={p.cx} y={p.cy + 3.2} textAnchor="middle" fontSize={9} fontWeight={700} fill="#fff">
              {p.n}
            </text>
          </g>
        ))}
      </svg>
      {numbered.length > 0 && (
        <ol className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5 min-[380px]:grid-cols-2">
          {numbered.map((p) => (
            <li key={p.ball.id} className="flex min-w-0 items-center gap-2 text-footnote">
              <span
                aria-hidden="true"
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-caption-2 font-bold text-white ${
                  p.kind === "compared" ? "ring-2 ring-accent ring-offset-1 ring-offset-surface" : ""
                }`}
                style={{ background: COVER_COLOR[p.ball.coverstockCategory ?? "Solid"] }}
              >
                {p.n}
              </span>
              <span className="min-w-0 break-words">
                <span className={p.kind === "compared" ? "font-semibold text-ink" : "text-ink"}>{p.ball.name}</span>
                <span className="text-ink-tertiary">
                  {" · "}
                  {p.kind === "compared"
                    ? t({ message: "comparing", comment: "Beside a bowling ball's name in a chart key: it is one of the balls being compared" })
                    : t({ message: "in your bag", comment: "Beside a bowling ball's name in a chart key: the bowler owns it" })}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
      <figcaption className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1 text-caption-2 text-ink-secondary">
        {COVER_ORDER.map((c) => (
          <span key={c} className="inline-flex items-center gap-1">
            <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full" style={{ background: COVER_COLOR[c] }} />
            {coverstockLabel(c)}
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full border-2 border-accent" />
          {t({ message: "Ringed: comparing", comment: "A chart legend entry: the balls being compared are drawn with a ring" })}
        </span>
      </figcaption>
    </figure>
  );
}
