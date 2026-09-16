import { X } from "lucide-react";
import { useMemo } from "react";
import type { OilPass, OilPattern } from "../types/bowling";
import {
  boardTotals, formatSheetBoard, headlineRatio, oilStats, patternClass,
  patternLength, PATTERN_CLASS_LABEL, trackZoneRatios,
} from "../lib/oilPattern";
import { LANE_BOARDS } from "../lib/laneGeometry";
import { useOverlay } from "../lib/useOverlay";
import { GROUP_HEADING } from "./ui/typography";

/**
 * A pattern sheet, in the app (ADR-106).
 *
 * The same numbers a bowler would go to the PDF for, read off the load table
 * the app already has: the totals, the graph and every pass. It exists so a
 * pattern from the catalog needs no link out at all. A link is a worse version
 * of this, one that needs signal, leaves the app, and lands on a document in
 * whichever of Kegel's three layouts that sheet happens to use.
 *
 * Nothing here is stored. Every figure is derived from the passes, the same way
 * the lane draws them (ADR-101), so the sheet and the lane cannot disagree.
 */

interface PatternSheetProps {
  pattern: OilPattern;
  onClose: () => void;
}

export function PatternSheet({ pattern, onClose }: PatternSheetProps) {
  const ref = useOverlay<HTMLDivElement>(onClose);
  const stats = useMemo(() => oilStats(pattern.passes), [pattern.passes]);
  const ratio = useMemo(() => headlineRatio(pattern.passes), [pattern.passes]);
  const zones = useMemo(() => trackZoneRatios(pattern.passes), [pattern.passes]);
  const totals = useMemo(() => boardTotals(pattern.passes ?? []), [pattern.passes]);
  const shape = patternClass(ratio);
  const feet = patternLength(pattern);

  const forward = (pattern.passes ?? []).filter((p) => p.direction === "forward");
  const reverse = (pattern.passes ?? []).filter((p) => p.direction === "reverse");

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-surface-sunken" role="dialog" aria-modal="true"
      aria-label={`${pattern.name} pattern sheet`}>
      <div ref={ref} className="flex h-full flex-col overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-edge bg-surface px-3 py-2.5">
          <h2 className="min-w-0 flex-1 truncate text-base font-bold text-ink">{pattern.name}</h2>
          <button type="button" onClick={onClose} aria-label="Close"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-secondary hover:bg-surface-muted">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="mx-auto w-full max-w-3xl space-y-4 px-3 py-4 sm:px-6">
          {stats.length === 0 ? (
            <p className="text-sm text-ink-secondary">
              {feet != null
                ? `${Math.round(feet)} ft. This pattern has no load table, so there is nothing more to show.`
                : "This pattern has no load table, so there is nothing to show."}
            </p>
          ) : (
            <>
              {/* The four figures a sheet leads with. */}
              <dl className="grid grid-cols-2 gap-2">
                <Figure label="Distance" value={`${Math.round(stats.length)} ft`} />
                <Figure label="Volume" value={`${stats.volumeMl.toFixed(2)} mL`} />
                <Figure
                  label="Ratio"
                  value={ratio != null ? `${ratio.toFixed(2)}:1` : "unknown"}
                  note={shape ? PATTERN_CLASS_LABEL[shape] : undefined}
                />
                <Figure
                  label="Forward / reverse"
                  value={`${stats.forwardMl.toFixed(2)} / ${stats.reverseMl.toFixed(2)} mL`}
                />
              </dl>

              <section>
                <h3 className={GROUP_HEADING}>Oil across the lane</h3>
                <p className="mt-0.5 text-xs text-ink-tertiary">
                  Units of oil on each board, left gutter to right. The shape of this
                  is the pattern.
                </p>
                <BoardGraph totals={totals} />
              </section>

              {zones.length > 0 && (
                <section>
                  <h3 className={GROUP_HEADING}>Track zones</h3>
                  <p className="mt-0.5 text-xs text-ink-tertiary">
                    How much more oil the middle carries than each band of boards.
                  </p>
                  <ul className="mt-1.5 grid grid-cols-3 gap-1.5 text-xs tabular-nums">
                    {zones.map((zone) => (
                      <li key={zone.label} className="rounded-lg border border-edge bg-surface px-2 py-1.5">
                        <span className="block text-ink-tertiary">{zone.label}</span>
                        <span className="block font-semibold text-ink">{zone.ratio.toFixed(2)}:1</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <PassTable title="Forward" passes={forward} />
              {reverse.length > 0 && <PassTable title="Reverse" passes={reverse} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border border-edge bg-surface px-3 py-2">
      <dt className="text-xs text-ink-tertiary">{label}</dt>
      <dd className="text-lg font-bold tabular-nums text-ink">
        {value}
        {note && <span className="ml-1.5 text-xs font-semibold text-ink-secondary">{note}</span>}
      </dd>
    </div>
  );
}

/**
 * The graph a pattern sheet prints: one bar per board, tallest where the oil is
 * deepest. Drawn rather than plotted because there are exactly 39 bars and the
 * only axis that matters is the board number.
 */
function BoardGraph({ totals }: { totals: number[] }) {
  const peak = Math.max(...totals, 1);
  const W = 100;
  const H = 34;
  const gap = 0.25;
  const width = W / LANE_BOARDS;

  return (
    <svg viewBox={`0 0 ${W} ${H + 6}`} className="mt-1.5 h-28 w-full" role="img"
      aria-label={`Oil across the lane, peaking at ${Math.round(peak)} units`}>
      {totals.map((units, i) => {
        const h = (units / peak) * H;
        return (
          <rect
            key={i}
            data-role="board-bar"
            x={i * width + gap / 2}
            y={H - h}
            width={width - gap}
            height={h}
            rx={0.3}
            className="fill-accent-fill"
            opacity={units > 0 ? 0.35 + 0.65 * (units / peak) : 0.12}
          />
        );
      })}
      {/* Board 20 is the centre, and the one every bowler counts from. */}
      {[5, 10, 15, 20, 25, 30, 35].map((board) => (
        <text
          key={board}
          x={(board - 0.5) * width}
          y={H + 5}
          textAnchor="middle"
          className="fill-ink-tertiary"
          fontSize="3.4"
          fontWeight={board === 20 ? 700 : 400}
        >
          {board}
        </text>
      ))}
    </svg>
  );
}

/** Every pass, in the sheet's own terms. */
function PassTable({ title, passes }: { title: string; passes: OilPass[] }) {
  if (passes.length === 0) return null;
  return (
    <section>
      <h3 className={GROUP_HEADING}>{title} passes</h3>
      <div className="mt-1.5 overflow-hidden rounded-xl border border-edge bg-surface">
        <table className="w-full text-xs tabular-nums">
          <thead>
            <tr className="border-b border-edge text-ink-tertiary">
              <th className="px-2 py-1.5 text-left font-medium">Boards</th>
              <th className="px-2 py-1.5 text-right font-medium">Loads</th>
              <th className="px-2 py-1.5 text-right font-medium">µL</th>
              <th className="px-2 py-1.5 text-right font-medium">Feet</th>
            </tr>
          </thead>
          <tbody>
            {passes.map((pass, i) => (
              <tr key={i} className="border-t border-edge/60">
                <td className="px-2 py-1.5 text-ink">
                  {formatSheetBoard(pass.left_board)} to {formatSheetBoard(pass.right_board)}
                </td>
                <td className="px-2 py-1.5 text-right text-ink-secondary">{pass.loads}</td>
                <td className="px-2 py-1.5 text-right text-ink-secondary">{pass.microliters}</td>
                <td className="px-2 py-1.5 text-right text-ink-secondary">
                  {pass.start_distance} to {pass.end_distance}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
