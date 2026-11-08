import { plural, t } from "@lingui/core/macro";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { formatDate, formatNumber } from "../lib/format";
import {
  bowledDays,
  clampMonth,
  dayKey,
  monthGrid,
  monthInputValue,
  monthTotals,
  parseMonthInput,
  sameMonth,
  shiftMonth,
  type CalendarDay,
  type CalendarMonth,
  type HeatLevel
} from "../lib/historyCalendar";
import type { SessionSummary } from "../types/bowling";
import { IconButton } from "./ui/IconButton";

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
  bounds?: { min: CalendarMonth; max: CalendarMonth } | null;
  /** Today, for its ring. A prop so a test can fix it. */
  today?: Date;
}

/**
 * History's month (ADR-252): each day bowled shaded by its average, ranked
 * against the other days shown, so the month's best night is the deepest. A
 * tap on a bowled day takes the list below to it; the month's name opens the
 * phone's own month and year picker.
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
  const atFirst = bounds !== null && sameMonth(month, bounds.min);
  const atLast = bounds !== null && sameMonth(month, bounds.max);
  const days = useMemo(() => bowledDays(sessions), [sessions]);
  const cells = useMemo(() => monthGrid(month, days, weekStart), [month, days, weekStart]);
  const totals = useMemo(() => monthTotals(month, sessions), [month, sessions]);
  const todayKey = dayKey(today.getFullYear(), today.getMonth(), today.getDate());
  const monthPicker = useMonthInputSupported();

  // The narrow weekday names from the week's first day: S M T W T F S, or
  // M T W T F S S where weeks start on Monday. 2023-01-01 was a Sunday.
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    formatDate(new Date(2023, 0, 1 + ((weekStart + i) % 7)), { weekday: "narrow" })
  );
  const title = formatDate(new Date(month.year, month.month, 1), { month: "long", year: "numeric" });

  return (
    <section
      aria-label={title}
      className="mb-4 rounded-xl border border-edge bg-surface p-3 shadow-sm"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 pl-1">
          {monthPicker ? (
            // The phone's own month and year wheels: a real month input lies
            // over the name, invisible, as `DateButton`'s date input does.
            <span className="relative inline-flex min-h-11 items-center gap-1">
              <span aria-hidden="true" className="text-body font-semibold text-ink">
                {title}
              </span>
              <ChevronDown size={16} aria-hidden="true" className="shrink-0 text-accent" />
              <input
                type="month"
                aria-label={t`Choose month`}
                value={monthInputValue(month)}
                min={bounds ? monthInputValue(bounds.min) : undefined}
                max={bounds ? monthInputValue(bounds.max) : undefined}
                onChange={(e) => {
                  // Held to the bounds here too: the iPhone's wheels show
                  // every month whatever `min` and `max` say.
                  const picked = parseMonthInput(e.target.value);
                  if (picked) onMonthChange(clampMonth(picked, bounds));
                }}
                onClick={(e) => {
                  try {
                    e.currentTarget.showPicker?.();
                  } catch {
                    // Already open, or not allowed from this event.
                  }
                }}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </span>
          ) : (
            <p className="flex min-h-11 items-center text-body font-semibold text-ink">{title}</p>
          )}
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
        <div className="flex shrink-0 items-center">
          <IconButton label={t`Previous month`} disabled={atFirst} onClick={() => onMonthChange(shiftMonth(month, -1))}>
            <ChevronLeft size={22} aria-hidden="true" className="text-accent" />
          </IconButton>
          <IconButton label={t`Next month`} disabled={atLast} onClick={() => onMonthChange(shiftMonth(month, 1))}>
            <ChevronRight size={22} aria-hidden="true" className="text-accent" />
          </IconButton>
        </div>
      </div>

      <div
        aria-hidden="true"
        className="mt-2 grid grid-cols-7 gap-1 text-center text-caption-2 font-semibold text-ink-secondary"
      >
        {weekdays.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((cell, i) =>
          cell ? (
            <DayCell
              key={cell.key}
              cell={cell}
              isToday={cell.key === todayKey}
              isSelected={cell.key === selectedDay}
              onSelect={onSelectDay}
            />
          ) : (
            <span key={`blank-${i}`} aria-hidden="true" />
          )
        )}
      </div>
    </section>
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

  if (!cell.bowled) {
    return (
      <span
        className={`flex h-11 items-center justify-center rounded-lg text-footnote tabular-nums text-ink-secondary ${ring}`}
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
      className={`flex h-11 flex-col items-center justify-center rounded-lg leading-none tabular-nums ${SHADE[cell.level]} ${ring}`}
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

/** Whether this browser has a month picker. Desktop Safari and Firefox take
 *  `type="month"` as a plain text box, which hidden over the name would be a
 *  tap that opens nothing; there the arrows alone move the month. */
function useMonthInputSupported(): boolean {
  const [supported] = useState(() => {
    if (typeof document === "undefined") return false;
    const probe = document.createElement("input");
    probe.setAttribute("type", "month");
    return probe.type === "month";
  });
  return supported;
}
