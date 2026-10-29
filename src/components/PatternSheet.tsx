import { ArrowUpRight, ChevronRight, Pencil } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import type { OilPass, OilPattern } from "../types/bowling";
import {
  formatSheetBoard, headlineRatio, oilBands, oilStats, oilZones, patternClass, peakUnits,
  patternLength, PATTERN_CLASS_LABEL, trackZoneRatios,
} from "../lib/oilPattern";
import { LANE_BOARDS, arrowFeet } from "../lib/laneGeometry";
import { GROUP_HEADING } from "./ui/typography";
import { IconButton } from "./ui/IconButton";
import { PushScreen } from "./PushScreen";
import { LaneViewIcon } from "./icons";
import { catalogSheet, type KeptSheet } from "../services/patternCatalog";

/**
 * A pattern sheet, in the app (ADR-106).
 *
 * The same numbers a bowler would go to the PDF for, read off the load table
 * the app already has: the totals, the lane drawing and every pass. It exists so a
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
  /** False while the visualizer it opened is up on top. The sheet stays open
   *  under it, so closing the visualizer comes back here and not to the list,
   *  but it lets go of back and Escape, which belong to the visualizer. */
  active?: boolean;
  /** Open the pattern's editor. At the foot of the sheet rather than in its
   *  bar, which already carries its one action (DESIGN-LANGUAGE §1). */
  onEdit?: () => void;
}

export function PatternSheet({
  pattern,
  onClose,
  onOpenInLineVisualizer,
  active = true,
  onEdit
}: PatternSheetProps) {
  const stats = useMemo(() => oilStats(pattern.passes), [pattern.passes]);
  const ratio = useMemo(() => headlineRatio(pattern.passes), [pattern.passes]);
  const zones = useMemo(() => trackZoneRatios(pattern.passes), [pattern.passes]);
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
      active={active}
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
                <h3 className={GROUP_HEADING}>Oil on the lane</h3>
                <p className="mt-0.5 text-xs text-ink-tertiary">
                  The lane as the sheet draws it: boards across, feet up from the
                  foul line, darker where there is more oil. The faint wash is where
                  the machine only buffs, laying no oil of its own.
                </p>
                <LaneMap passes={pattern.passes ?? []} length={stats.length} />
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

          {onEdit && (
            <button type="button" onClick={onEdit} className={SHEET_ROW}>
              Edit pattern
              <Pencil size={16} aria-hidden="true" className="shrink-0 text-ink-tertiary" />
            </button>
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
            <span className="block whitespace-nowrap text-caption-2 leading-tight tracking-tighter text-ink-tertiary">
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

/** How far the sheet zooms: a tap goes to TAP_ZOOM, a pinch anywhere up to MAX_ZOOM. */
const TAP_ZOOM = 2.5;
const MAX_ZOOM = 5;
const clampZoom = (scale: number) => Math.min(MAX_ZOOM, Math.max(1, scale));

/**
 * The original sheet, in the app (ADR-136). Its pages were drawn as images when
 * the sheet was kept, so this needs no PDF reader and works on a phone whose
 * browser will not show a PDF inline. The PDF itself is the one trailing action,
 * for printing or sharing.
 *
 * Zoom is the viewer's own, by a tap or a pinch, and never the page's. This
 * screen is a `position: fixed` layer pushed from inside other fixed layers (the
 * pattern list opens from the session sheet), and iOS moves nested fixed layers
 * apart when the page is pinch-zoomed, which showed the pattern screen beside
 * the sheet (docs/VIEWPORT-BUG.md, "Pinch zoom"). So a pinch here is taken by
 * the viewer: `touch-action` leaves the browser panning only, and Safari's own
 * gesture events, which it fires whatever `touch-action` says, are cancelled.
 * Either way the spot under the fingers stays under them.
 */
function SheetViewer({ title, sheet, onClose }: { title: string; sheet: KeptSheet; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  // The pinch listeners outlive a render, so they read the scale from here.
  const scaleRef = useRef(1);
  const across = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  // Where the zoom is centred, as a fraction of the pages, and where that spot
  // is on screen, so it stays put while everything around it grows.
  const focus = useRef<{ fx: number; fy: number; x: number; y: number } | null>(null);

  const zoomTo = useCallback((next: number, x: number, y: number) => {
    const pages = pagesRef.current;
    if (!pages) return;
    const box = pages.getBoundingClientRect();
    // A page not laid out yet has no spot to hold; it just zooms.
    focus.current =
      box.width > 0 && box.height > 0
        ? { fx: (x - box.left) / box.width, fy: (y - box.top) / box.height, x, y }
        : null;
    setScale(clampZoom(next));
  }, []);

  useLayoutEffect(() => {
    scaleRef.current = scale;
    const spot = focus.current;
    const row = across.current;
    const pages = pagesRef.current;
    if (!spot || !row || !pages) return;
    const box = pages.getBoundingClientRect();
    row.scrollLeft += box.left + spot.fx * box.width - spot.x;
    const down = row.parentElement?.closest<HTMLElement>(".overflow-y-auto");
    if (down) down.scrollTop += box.top + spot.fy * box.height - spot.y;
    focus.current = null;
  }, [scale]);

  // Native listeners, because a pinch has to be able to cancel the page's own
  // zoom, and React's touch handlers are passive.
  useEffect(() => {
    const row = across.current;
    if (!row) return;
    let pinch: { distance: number; scale: number } | null = null;
    const span = (touches: TouchList) =>
      Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);

    const start = (event: TouchEvent) => {
      if (event.touches.length === 2) pinch = { distance: span(event.touches), scale: scaleRef.current };
    };
    const move = (event: TouchEvent) => {
      if (!pinch || event.touches.length !== 2) return;
      event.preventDefault();
      const [a, b] = [event.touches[0], event.touches[1]];
      const distance = span(event.touches);
      if (pinch.distance > 0) {
        zoomTo((pinch.scale * distance) / pinch.distance, (a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
      }
    };
    const end = (event: TouchEvent) => {
      if (event.touches.length < 2) pinch = null;
    };
    const cancelPageZoom = (event: Event) => event.preventDefault();

    row.addEventListener("touchstart", start, { passive: true });
    row.addEventListener("touchmove", move, { passive: false });
    row.addEventListener("touchend", end);
    row.addEventListener("touchcancel", end);
    for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
      row.addEventListener(type, cancelPageZoom, { passive: false });
    }
    return () => {
      row.removeEventListener("touchstart", start);
      row.removeEventListener("touchmove", move);
      row.removeEventListener("touchend", end);
      row.removeEventListener("touchcancel", end);
      for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
        row.removeEventListener(type, cancelPageZoom);
      }
    };
  }, [zoomTo]);

  const zoomed = scale > 1;
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
      {/* The screen scrolls down the page; this scrolls across it when zoomed.
          Panning only: a pinch is the viewer's, never the page's. */}
      <div
        ref={across}
        data-role="sheet-viewer"
        className="scrollbar-none min-h-full overflow-x-auto overscroll-x-none bg-surface-muted [touch-action:pan-x_pan-y]"
      >
        <div
          ref={pagesRef}
          className={`mx-auto space-y-2 p-2 ${zoomed ? "max-w-none" : "w-full max-w-3xl"}`}
          style={zoomed ? { width: `${scale * 100}%` } : undefined}
        >
          {sheet.pages.map((page, i) => (
            <button
              key={page}
              type="button"
              aria-label={zoomed ? "Zoom out" : "Zoom in"}
              onClick={(event: MouseEvent<HTMLButtonElement>) =>
                zoomTo(zoomed ? 1 : TAP_ZOOM, event.clientX, event.clientY)
              }
              className={`block w-full [touch-action:pan-x_pan-y] ${zoomed ? "cursor-zoom-out" : "cursor-zoom-in"}`}
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
 * The lane drawing a pattern sheet prints beside its tables: boards across,
 * feet up from the foul line, each spot shaded by the oil on it, and a line
 * where the oil ends. Drawn to read, not to scale: a lane is 60 ft long and 39
 * boards wide, so the feet are squeezed to keep the shape on one screen, and
 * the drawing stops a little past the pattern rather than running to the pins.
 */
function LaneMap({ passes, length }: { passes: OilPass[]; length: number }) {
  const zones = useMemo(() => oilZones(passes), [passes]);
  const bands = useMemo(() => oilBands(zones), [zones]);
  const peak = Math.max(peakUnits(zones), 1);
  // A pass that travels but loads nothing still buffs the oil along the lane,
  // which is how a sheet's drawing reaches the pattern distance past its last
  // load. The sheet paints it in its own colour, and so does this.
  const buffed = passes.filter(
    (p) => (p.loads === 0 || p.microliters === 0) && p.start_distance !== p.end_distance && p.right_board >= p.left_board
  );

  // Up to the next 5 ft past the end of the oil, so the dry lane beyond it shows.
  const top = Math.ceil((length + 2) / 5) * 5;
  const LEFT = 9; // room for the feet scale
  // The same gutter on the right, empty, so the lane sits in the middle of the
  // screen rather than pushed right by the scale.
  const RIGHT = LEFT;
  const W = 100;
  const LANE_RIGHT = W - RIGHT;
  const H = 96;
  const BASE = H + 2;
  const board = (LANE_RIGHT - LEFT) / LANE_BOARDS;
  const x = (b: number) => LEFT + (b - 1) * board;
  const y = (feet: number) => BASE - (feet / top) * H;
  const ticks = Array.from({ length: Math.floor(top / 5) + 1 }, (_, i) => i * 5);

  return (
    <svg
      viewBox={`0 0 ${W} ${BASE + 6}`}
      className="mt-1.5 w-full"
      role="img"
      aria-label={`Oil on the lane, ending at ${Math.round(length)} ft`}
    >
      {/* The wood. */}
      <rect x={LEFT} y={BASE - H} width={LANE_RIGHT - LEFT} height={H} className="fill-surface-muted" />

      {/* One layer at one opacity, so passes buffing the same stretch twice
          do not stack up into something that reads as oil. */}
      <g opacity={0.14}>
        {buffed.map((pass, i) => {
          const near = Math.min(pass.start_distance, pass.end_distance);
          const far = Math.max(pass.start_distance, pass.end_distance);
          return (
            <rect
              key={i}
              data-role="buff-band"
              x={x(pass.left_board)}
              y={y(far)}
              width={(pass.right_board - pass.left_board + 1) * board}
              height={y(near) - y(far)}
              className="fill-accent-fill"
            />
          );
        })}
      </g>

      {bands.map((band, i) => (
        <rect
          key={i}
          data-role="oil-band"
          x={x(band.fromBoard)}
          y={y(band.stop)}
          width={(band.toBoard - band.fromBoard + 1) * board}
          height={Math.max(y(band.start) - y(band.stop), 0.1)}
          className="fill-accent-fill"
          opacity={0.15 + 0.85 * (band.units / peak)}
        />
      ))}

      {/* The grid a printed sheet carries, laid over the oil so it reads
          through it: a line between every two boards, heavier every five like
          the arrows and dots, and one across every five feet. */}
      <g data-role="lane-grid" className="stroke-ink" pointerEvents="none">
        {Array.from({ length: LANE_BOARDS - 1 }, (_, i) => i + 1).map((b) => (
          <line
            key={`b${b}`}
            x1={x(b) + board} x2={x(b) + board} y1={BASE - H} y2={BASE}
            strokeWidth={b % 5 === 0 ? 0.2 : 0.1}
            opacity={b % 5 === 0 ? 0.5 : 0.3}
          />
        ))}
        {ticks.slice(1).map((feet) => (
          <line
            key={`f${feet}`}
            x1={LEFT} x2={LANE_RIGHT} y1={y(feet)} y2={y(feet)}
            strokeWidth={0.15} opacity={0.45}
          />
        ))}
      </g>

      {/* The arrows, on their chevron: the centre one furthest down-lane, the
          outer ones stepping back toward the foul line, as the lane's own are
          (laneGeometry.arrowFeet). Each points at the pins. */}
      {[5, 10, 15, 20, 25, 30, 35].map((b) => {
        const cx = x(b) + board / 2;
        const tip = y(arrowFeet(b));
        return (
          <path
            key={`a${b}`}
            data-role="lane-arrow"
            d={`M ${cx} ${tip} L ${cx + board * 0.45} ${tip + 3} L ${cx - board * 0.45} ${tip + 3} Z`}
            className="fill-ink"
            opacity={0.75}
          />
        );
      })}

      {/* The feet, every five, with the foul line at the bottom. */}
      {ticks.map((feet) => (
        <g key={feet}>
          <line x1={LEFT - 1} x2={LEFT} y1={y(feet)} y2={y(feet)} className="stroke-ink-tertiary" strokeWidth={0.2} />
          <text x={LEFT - 1.6} y={y(feet) + 1.1} textAnchor="end" fontSize="3.2" className="fill-ink-tertiary">
            {feet}
          </text>
        </g>
      ))}

      {/* Where the oil ends: the figure a bowler reads the sheet for. */}
      <line
        data-role="oil-end"
        x1={LEFT} x2={LANE_RIGHT} y1={y(length)} y2={y(length)}
        className="stroke-ink" strokeWidth={0.35} strokeDasharray="1.4 0.9"
      />
      <text x={LANE_RIGHT - 0.5} y={y(length) - 1.2} textAnchor="end" fontSize="3.6" fontWeight={700} className="fill-ink">
        {Math.round(length)} ft
      </text>

      {/* Boards, counted in from each gutter, as on the graph below. */}
      {[5, 10, 15, 20, 25, 30, 35].map((b) => (
        <text key={b} x={x(b) + board / 2} y={BASE + 4.6} textAnchor="middle" fontSize="3.2"
          fontWeight={b === 20 ? 700 : 400} className="fill-ink-tertiary">
          {20 - Math.abs(b - 20)}
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
