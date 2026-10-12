import { ArrowUpRight, ChevronRight } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import type { OilPass, OilPattern } from "../types/bowling";
import {
  boardTotals, formatSheetBoard, headlineRatio, oilStats, patternClass,
  patternLength, PATTERN_CLASS_LABEL, trackZoneRatios,
} from "../lib/oilPattern";
import { LANE_BOARDS } from "../lib/laneGeometry";
import { GROUP_HEADING } from "./ui/typography";
import { IconButton } from "./ui/IconButton";
import { PushScreen } from "./PushScreen";
import { LaneViewIcon } from "./icons";
import { catalogSheet, type KeptSheet } from "../services/patternCatalog";

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
 *
 * A place you go into from the pattern list, so it is a push (DESIGN-LANGUAGE
 * §1), with the visualizer as its one trailing action. It is not a route, so
 * `backCloses` lets the platform's back pop it before the list underneath.
 */

interface PatternSheetProps {
  pattern: OilPattern;
  onClose: () => void;
  /** Jump to the line visualizer with this pattern already drawn on the lane.
   *  Omitted where the pattern has no load table to draw (nothing would show
   *  up) or the caller has no visualizer to send you to. */
  onOpenInLineVisualizer?: () => void;
}

export function PatternSheet({ pattern, onClose, onOpenInLineVisualizer }: PatternSheetProps) {
  const stats = useMemo(() => oilStats(pattern.passes), [pattern.passes]);
  const ratio = useMemo(() => headlineRatio(pattern.passes), [pattern.passes]);
  const zones = useMemo(() => trackZoneRatios(pattern.passes), [pattern.passes]);
  const totals = useMemo(() => boardTotals(pattern.passes ?? []), [pattern.passes]);
  const shape = patternClass(ratio);
  const feet = patternLength(pattern);

  const keptSheet = useKeptSheet(pattern.catalog_id);
  const [viewing, setViewing] = useState(false);

  const forward = (pattern.passes ?? []).filter((p) => p.direction === "forward");
  const reverse = (pattern.passes ?? []).filter((p) => p.direction === "reverse");

  return (
    <PushScreen
      title={pattern.name}
      onBack={onClose}
      backCloses
      trailing={
        onOpenInLineVisualizer && stats.length > 0 ? (
          <IconButton label="Try in the line visualizer" onClick={onOpenInLineVisualizer} variant="round">
            <LaneViewIcon size={22} aria-hidden="true" />
          </IconButton>
        ) : undefined
      }
    >
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
                    How many times more oil the middle carries than each band of
                    boards, read left to right across the lane as the sheet prints it.
                  </p>
                  <TrackZoneRow zones={zones} />
                </section>
              )}

              <PassTable title="Forward" passes={forward} />
              {reverse.length > 0 && <PassTable title="Reverse" passes={reverse} />}
            </>
          )}

          {keptSheet ? (
            <button
              type="button"
              onClick={() => setViewing(true)}
              className={SHEET_ROW}
            >
              Original pattern sheet
              <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-ink-tertiary" />
            </button>
          ) : (
            pattern.url && (
              // A link the bowler typed for a pattern of their own. It leaves
              // the app, so it carries the outward arrow (DESIGN-LANGUAGE §4).
              <a href={pattern.url} target="_blank" rel="noopener noreferrer" className={SHEET_ROW}>
                Original pattern sheet
                <ArrowUpRight size={16} aria-hidden="true" className="shrink-0 text-ink-tertiary" />
              </a>
            )
          )}
        </div>
        {viewing && keptSheet && (
          <SheetViewer title={pattern.name} sheet={keptSheet} onClose={() => setViewing(false)} />
        )}
    </PushScreen>
  );
}

const SHEET_ROW =
  "flex w-full items-center justify-between gap-2 rounded-xl border border-edge bg-surface px-3 py-2.5 text-left text-sm font-semibold text-ink active:bg-surface-muted";

/**
 * The track zone ratios in one row, the way the sheet prints them: left zones,
 * the middle, right zones, each a bare number. A ratio is always "to 1", so the
 * ":1" on every cell was noise, and the middle itself reads 1.00 because it is
 * what every other cell is measured against. A dry zone has no ratio to give.
 */
const ZONE_ROW = ["3L-7L", "8L-12L", "13L-17L", "18L-18R", "17R-13R", "12R-8R", "7R-3R"] as const;

function TrackZoneRow({ zones }: { zones: { label: string; ratio: number }[] }) {
  const byLabel = new Map(zones.map((z) => [z.label, z.ratio]));
  return (
    <ul className="mt-1.5 grid grid-cols-7 gap-0.5 text-center tabular-nums">
      {ZONE_ROW.map((label) => {
        const middle = label === "18L-18R";
        const ratio = middle ? 1 : byLabel.get(label);
        return (
          <li
            key={label}
            className={`min-w-0 rounded-lg border py-1.5 ${middle ? "border-accent bg-accent-soft" : "border-edge bg-surface"}`}
          >
            {/* 9px and tight: seven of these share a phone's width, and a
                label is only worth printing whole. */}
            <span className="block whitespace-nowrap text-[9px] leading-tight tracking-tighter text-ink-tertiary">
              {label}
            </span>
            <span className="block text-sm font-semibold text-ink">
              {ratio != null ? ratio.toFixed(2) : "-"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The original sheet, in the app (ADR-136). Its pages were drawn as images when
 * the sheet was kept, so this needs no PDF reader and works on a phone whose
 * browser will not show a PDF inline. A tap zooms in to read the load table and
 * back out; the PDF itself is the one trailing action, for printing or sharing.
 */
function SheetViewer({ title, sheet, onClose }: { title: string; sheet: KeptSheet; onClose: () => void }) {
  const [zoomed, setZoomed] = useState(false);
  const across = useRef<HTMLDivElement>(null);
  // Where the tap landed, as a fraction of the page, and where on the screen,
  // so zooming in keeps that spot under the finger rather than jumping to the
  // page's top left corner.
  const focus = useRef<{ page: HTMLElement; fx: number; fy: number; x: number; y: number } | null>(null);

  function toggle(event: MouseEvent<HTMLButtonElement>) {
    const page = event.currentTarget;
    const box = page.getBoundingClientRect();
    focus.current = {
      page,
      fx: (event.clientX - box.left) / box.width,
      fy: (event.clientY - box.top) / box.height,
      x: event.clientX,
      y: event.clientY,
    };
    setZoomed((z) => !z);
  }

  useLayoutEffect(() => {
    const spot = focus.current;
    const row = across.current;
    if (!spot || !row) return;
    const box = spot.page.getBoundingClientRect();
    row.scrollLeft += box.left + spot.fx * box.width - spot.x;
    const down = row.parentElement?.closest<HTMLElement>(".overflow-y-auto");
    if (down) down.scrollTop += box.top + spot.fy * box.height - spot.y;
    focus.current = null;
  }, [zoomed]);

  return (
    <PushScreen
      title={title}
      onBack={onClose}
      backCloses
      trailing={
        <IconButton
          label="Open the PDF"
          variant="round"
          onClick={() => window.open(sheet.pdf, "_blank", "noopener,noreferrer")}
        >
          <ArrowUpRight size={20} aria-hidden="true" />
        </IconButton>
      }
    >
      {/* The screen scrolls down the page; this scrolls across it when zoomed. */}
      <div ref={across} className="min-h-full overflow-x-auto bg-surface-muted">
        <div className={`mx-auto space-y-2 p-2 ${zoomed ? "w-[250%] max-w-none" : "w-full max-w-3xl"}`}>
          {sheet.pages.map((page, i) => (
            <button
              key={page}
              type="button"
              aria-label={zoomed ? "Zoom out" : "Zoom in"}
              onClick={toggle}
              className={`block w-full ${zoomed ? "cursor-zoom-out" : "cursor-zoom-in"}`}
            >
              <img
                src={page}
                alt={`${title}, page ${i + 1} of ${sheet.pages.length}`}
                className="block w-full rounded bg-white shadow-sm"
              />
            </button>
          ))}
        </div>
      </div>
    </PushScreen>
  );
}

/** Our copy of a catalog pattern's sheet, once the catalog has said where. */
function useKeptSheet(catalogId: string | undefined): KeptSheet | undefined {
  const [sheet, setSheet] = useState<KeptSheet>();
  useEffect(() => {
    if (!catalogId) return;
    let live = true;
    void catalogSheet(catalogId).then((found) => live && setSheet(found));
    return () => {
      live = false;
    };
  }, [catalogId]);
  return catalogId ? sheet : undefined;
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
          {20 - Math.abs(board - 20)}
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
