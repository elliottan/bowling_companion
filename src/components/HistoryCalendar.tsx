import { plural, t } from "@lingui/core/macro";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { formatDate, formatNumber } from "../lib/format";
import {
  bowledDays,
  bowledMonths,
  dayKey,
  inBounds,
  monthGrid,
  monthKey,
  monthTotals,
  sameMonth,
  shiftMonth,
  type CalendarDay,
  type CalendarMonth,
  type HeatLevel
} from "../lib/historyCalendar";
import type { SessionSummary } from "../types/bowling";
import { IconButton } from "./ui/IconButton";

type Bounds = { min: CalendarMonth; max: CalendarMonth } | null;

interface HistoryCalendarProps {
  /** The sessions the list shows, so the calendar follows the same filters. */
  sessions: SessionSummary[];
  month: CalendarMonth;
  onMonthChange: (month: CalendarMonth) => void;
  /** The day last tapped, ringed, `YYYY-MM-DD`. */
  selectedDay: string | null;
  onSelectDay: (key: string) => void;
  /** 0 for Sunday, as `Date.getDay` counts. */
  weekStart: number;
  /** The first and last months with a session: the arrows and the picker
   *  stop there, so the calendar never turns to a month before the bowler
   *  started or after their latest night. */
  bounds?: Bounds;
  /** Today, for its ring. A prop so a test can fix it. */
  today?: Date;
}

/**
 * History's month (ADR-252): each day bowled shaded by its average, ranked
 * against the other days shown, so the month's best night is the deepest. A
 * tap on a bowled day takes the list below to it. The first and last weeks
 * are whole, filled with the months either side, dimmed, so a night just over
 * the edge shows and can be tapped too (ADR-261).
 *
 * The month's name opens the months of a year in place of the days, only
 * those inside the bowler's history open to a tap (ADR-261). It was the
 * phone's own month wheels, which on an iPhone show every month whatever the
 * bounds say, so a month before the first session could be scrolled to and
 * was then swapped for another.
 *
 * The shades are the accent fill at rising strength, with ink on the lighter
 * three and the fill's own ink on the deepest, so a day's number reads on
 * every shade in every palette and both themes.
 */
export function HistoryCalendar({
  sessions,
  month,
  onMonthChange,
  selectedDay,
  onSelectDay,
  weekStart,
  bounds = null,
  today = new Date()
}: HistoryCalendarProps) {
  // The year whose months are showing, or null while the days are.
  const [pickingYear, setPickingYear] = useState<number | null>(null);
  const picking = pickingYear !== null;
  const atFirst = bounds !== null && sameMonth(month, bounds.min);
  const atLast = bounds !== null && sameMonth(month, bounds.max);
  const days = useMemo(() => bowledDays(sessions), [sessions]);
  const cells = useMemo(() => monthGrid(month, days, weekStart), [month, days, weekStart]);
  const totals = useMemo(() => monthTotals(month, sessions), [month, sessions]);
  const todayKey = dayKey(today.getFullYear(), today.getMonth(), today.getDate());

  // The narrow weekday names from the week's first day: S M T W T F S, or
  // M T W T F S S where weeks start on Monday. 2023-01-01 was a Sunday.
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    formatDate(new Date(2023, 0, 1 + ((weekStart + i) % 7)), { weekday: "narrow" })
  );
  const title = formatDate(new Date(month.year, month.month, 1), { month: "long", year: "numeric" });
  const yearBack = pickingYear !== null && bounds !== null && pickingYear <= bounds.min.year;
  const yearOn = pickingYear !== null && bounds !== null && pickingYear >= bounds.max.year;

  return (
    <section
      aria-label={title}
      className="mb-4 rounded-xl border border-edge bg-surface p-3 shadow-sm"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 pl-1">
          <button
            type="button"
            aria-label={t`Choose month`}
            aria-expanded={picking}
            onClick={() => setPickingYear(picking ? null : month.year)}
            className="inline-flex min-h-11 items-center gap-1 text-left active:opacity-60"
          >
            <span className="text-body font-semibold text-ink">{title}</span>
            <ChevronDown
              size={16}
              aria-hidden="true"
              className={`shrink-0 text-accent transition-transform duration-200 motion-reduce:transition-none ${picking ? "rotate-180" : ""}`}
            />
          </button>
          <p className="text-footnote text-ink-secondary">
            {plural(totals.sessions, { one: "# session", other: "# sessions" })}
            {totals.average !== null && (
              <>
                {" · "}
                <span className="font-bold text-accent">{formatNumber(totals.average)}</span>{" "}
                {t({ message: "avg", comment: "Short for average, beside a session's average score." })}
              </>
            )}
          </p>
        </div>
        {/* Picking, the arrows turn the year; else the month. */}
        {pickingYear !== null ? (
          <div className="flex shrink-0 items-center">
            <IconButton label={t`Previous year`} disabled={yearBack} onClick={() => setPickingYear(pickingYear - 1)}>
              <ChevronLeft size={22} aria-hidden="true" className="text-accent" />
            </IconButton>
            <IconButton label={t`Next year`} disabled={yearOn} onClick={() => setPickingYear(pickingYear + 1)}>
              <ChevronRight size={22} aria-hidden="true" className="text-accent" />
            </IconButton>
          </div>
        ) : (
          <div className="flex shrink-0 items-center">
            <IconButton label={t`Previous month`} disabled={atFirst} onClick={() => onMonthChange(shiftMonth(month, -1))}>
              <ChevronLeft size={22} aria-hidden="true" className="text-accent" />
            </IconButton>
            <IconButton label={t`Next month`} disabled={atLast} onClick={() => onMonthChange(shiftMonth(month, 1))}>
              <ChevronRight size={22} aria-hidden="true" className="text-accent" />
            </IconButton>
          </div>
        )}
      </div>

      {pickingYear !== null ? (
        <MonthPicker
          year={pickingYear}
          month={month}
          bounds={bounds}
          bowled={bowledMonths(sessions)}
          onPick={(picked) => {
            setPickingYear(null);
            onMonthChange(picked);
          }}
        />
      ) : (
        <>
          <div
            aria-hidden="true"
            className="mt-2 grid grid-cols-7 gap-1 text-center text-caption-2 font-semibold text-ink-secondary"
          >
            {weekdays.map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>

          <div className="mt-1 grid grid-cols-7 gap-1">
            {cells.map((cell) => (
              <DayCell
                key={cell.key}
                cell={cell}
                isToday={cell.key === todayKey}
                isSelected={cell.key === selectedDay}
                onSelect={onSelectDay}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/** A year's twelve months, in place of the days. Only the months inside the
 *  bowler's history take a tap; a month bowled carries a dot. */
function MonthPicker({
  year,
  month,
  bounds,
  bowled,
  onPick
}: {
  year: number;
  month: CalendarMonth;
  bounds: Bounds;
  bowled: Set<string>;
  onPick: (month: CalendarMonth) => void;
}) {
  const yearName = formatDate(new Date(year, 0, 1), { year: "numeric" });
  return (
    <div role="group" aria-label={yearName} className="mt-2">
      <p aria-hidden="true" className="mb-1 text-center text-footnote font-semibold tabular-nums text-ink-secondary">
        {yearName}
      </p>
      <div className="grid grid-cols-4 gap-1">
        {Array.from({ length: 12 }, (_, m) => {
          const candidate = { year, month: m };
          const open = inBounds(candidate, bounds);
          const current = sameMonth(candidate, month);
          const date = new Date(year, m, 1);
          return (
            <button
              key={m}
              type="button"
              disabled={!open}
              aria-pressed={current}
              aria-label={formatDate(date, { month: "long", year: "numeric" })}
              onClick={() => onPick(candidate)}
              className={`flex h-11 flex-col items-center justify-center rounded-lg text-footnote font-semibold leading-none ${
                current ? "bg-accent-fill text-accent-on-fill" : open ? "bg-surface-muted text-ink active:opacity-60" : "text-ink-tertiary opacity-50"
              }`}
            >
              {formatDate(date, { month: "short" })}
              <span
                aria-hidden="true"
                className={`mt-1 h-1 w-1 rounded-full ${bowled.has(monthKey(candidate)) ? (current ? "bg-accent-on-fill" : "bg-accent") : "bg-transparent"}`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

const SHADE: Record<HeatLevel, string> = {
  0: "bg-surface-muted text-ink",
  1: "bg-accent-fill/15 text-ink",
  2: "bg-accent-fill/35 text-ink",
  3: "bg-accent-fill/65 text-ink",
  4: "bg-accent-fill text-accent-on-fill"
};

function DayCell({
  cell,
  isToday,
  isSelected,
  onSelect
}: {
  cell: CalendarDay;
  isToday: boolean;
  isSelected: boolean;
  onSelect: (key: string) => void;
}) {
  const ring = isSelected
    ? "ring-2 ring-ink ring-offset-1 ring-offset-surface"
    : isToday
      ? "ring-1 ring-ink-secondary"
      : "";

  // A day of the month either side reads as quieter than the month's own.
  const outside = cell.outside ? "opacity-40" : "";

  if (!cell.bowled) {
    return (
      <span
        aria-hidden={cell.outside || undefined}
        className={`flex h-11 items-center justify-center rounded-lg text-footnote tabular-nums ${cell.outside ? "text-ink-tertiary" : "text-ink-secondary"} ${ring}`}
      >
        {formatNumber(cell.day)}
      </span>
    );
  }

  const average = cell.bowled.average;
  const date = formatDate(new Date(cell.key + "T00:00:00"), { weekday: "long", month: "long", day: "numeric" });
  return (
    <button
      type="button"
      aria-label={average !== null ? t`${{ date }}, average ${{ average: formatNumber(average) }}` : date}
      aria-pressed={isSelected}
      onClick={() => onSelect(cell.key)}
      className={`flex h-11 flex-col items-center justify-center rounded-lg leading-none tabular-nums ${SHADE[cell.level]} ${outside} ${ring}`}
    >
      <span className="text-caption-2 opacity-80">{formatNumber(cell.day)}</span>
      {average !== null ? (
        <span className="mt-0.5 text-footnote font-bold">{formatNumber(average)}</span>
      ) : (
        // A night still being bowled: no average yet, a dot for the day.
        <span aria-hidden="true" className="mt-1 h-1.5 w-1.5 rounded-full bg-accent" />
      )}
    </button>
  );
}
