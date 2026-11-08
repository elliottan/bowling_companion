import type { SessionSummary } from "../types/bowling";

/**
 * The month on History's calendar (ADR-252): which days were bowled, each
 * day's average, and how deeply each is shaded.
 *
 * Pure, so the grid and the shading are tested without a screen. The screen is
 * `components/HistoryCalendar.tsx`.
 */

/** A month, `month` counted from 0 as `Date` counts it. */
export interface CalendarMonth {
  year: number;
  month: number;
}

/** One bowled day: every session on it, and the average of its finished games. */
export interface BowledDay {
  sessions: number;
  /** Rounded mean of every finished game that day, across its sessions. Null
   *  while none is finished, a night still being bowled. */
  average: number | null;
}

/** How deeply a bowled day is shaded, 1 lightest to 4 deepest. 0 is a day
 *  bowled with no finished game, which has nothing to rank. */
export type HeatLevel = 0 | 1 | 2 | 3 | 4;

export interface CalendarDay {
  /** The stored day, `YYYY-MM-DD`, as a session's `date` is. */
  key: string;
  day: number;
  bowled: BowledDay | null;
  level: HeatLevel;
  /** A day of the month before or after, filling the first or last week, so
   *  a night bowled just over the month's edge shows on it. */
  outside: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The stored key of a day in a month: `2026-10-21`. */
export function dayKey(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

export function monthOfDate(date: Date): CalendarMonth {
  return { year: date.getFullYear(), month: date.getMonth() };
}

/** The month `delta` months on, across a year's end either way. */
export function shiftMonth({ year, month }: CalendarMonth, delta: number): CalendarMonth {
  const index = year * 12 + month + delta;
  return { year: Math.floor(index / 12), month: ((index % 12) + 12) % 12 };
}

/** Every day bowled among `sessions`, by its stored key. */
export function bowledDays(sessions: SessionSummary[]): Map<string, BowledDay> {
  const tally = new Map<string, { sessions: number; total: number; games: number }>();
  for (const { session, games } of sessions) {
    const t = tally.get(session.date) ?? { sessions: 0, total: 0, games: 0 };
    t.sessions += 1;
    for (const g of games) {
      if (g.final_score !== undefined) {
        t.total += g.final_score;
        t.games += 1;
      }
    }
    tally.set(session.date, t);
  }
  const days = new Map<string, BowledDay>();
  for (const [key, t] of tally) {
    days.set(key, { sessions: t.sessions, average: t.games ? Math.round(t.total / t.games) : null });
  }
  return days;
}

/**
 * The shade of an average among the averages on screen. Ranked against each
 * other, not against fixed scores: the month's best night is the deepest and
 * its worst the lightest, whatever the bowler averages, and a filter that
 * narrows the month re-ranks what is left. A month with one average, or all
 * alike, has nothing to rank, and shows them a step under the deepest.
 */
export function heatLevel(average: number, min: number, max: number): Exclude<HeatLevel, 0> {
  if (max <= min) return 3;
  const t = (average - min) / (max - min);
  return (1 + Math.min(3, Math.floor(t * 4))) as Exclude<HeatLevel, 0>;
}

/**
 * The month's grid, in whole weeks: the days of the month before fill the
 * first week up to the 1st, and the days of the month after fill the last
 * week, both marked `outside`. Weeks start on `weekStart`, 0 for Sunday as
 * `Date.getDay` counts.
 *
 * Only the month's own averages set the scale, so a night just over the edge
 * never moves this month's shading; it is shaded on the same scale, held to
 * the lightest and deepest steps.
 */
export function monthGrid(
  { year, month }: CalendarMonth,
  days: Map<string, BowledDay>,
  weekStart: number
): CalendarDay[] {
  const first = new Date(year, month, 1).getDay();
  const lead = (first - weekStart + 7) % 7;
  const length = new Date(year, month + 1, 0).getDate();
  const trail = (7 - ((lead + length) % 7)) % 7;

  const cells: CalendarDay[] = [];
  const averages: number[] = [];
  // `new Date` carries a day past either end of the month into the next one.
  for (let offset = -lead; offset < length + trail; offset += 1) {
    const date = new Date(year, month, 1 + offset);
    const key = dayKey(date.getFullYear(), date.getMonth(), date.getDate());
    const outside = offset < 0 || offset >= length;
    const bowled = days.get(key) ?? null;
    if (!outside && bowled?.average != null) averages.push(bowled.average);
    cells.push({ key, day: date.getDate(), bowled, level: 0, outside });
  }
  const min = Math.min(...averages);
  const max = Math.max(...averages);
  for (const cell of cells) {
    const average = cell.bowled?.average;
    if (average == null) continue;
    cell.level = averages.length ? heatLevel(Math.min(max, Math.max(min, average)), min, max) : 3;
  }
  return cells;
}

/** Every month with a session among `sessions`, as `YYYY-MM`, for the month
 *  picker's dots. */
export function bowledMonths(sessions: SessionSummary[]): Set<string> {
  return new Set(sessions.map(({ session }) => session.date.slice(0, 7)));
}

/** The stored key of a month, `2026-10`, as a session's date starts. */
export function monthKey({ year, month }: CalendarMonth): string {
  return `${year}-${pad(month + 1)}`;
}

/** Bowled days and their sessions in a month, for the line under its name. */
export function monthTotals(
  { year, month }: CalendarMonth,
  sessions: SessionSummary[]
): { sessions: number; average: number | null } {
  const prefix = `${year}-${pad(month + 1)}-`;
  let count = 0;
  let total = 0;
  let games = 0;
  for (const { session, games: gs } of sessions) {
    if (!session.date.startsWith(prefix)) continue;
    count += 1;
    for (const g of gs) {
      if (g.final_score !== undefined) {
        total += g.final_score;
        games += 1;
      }
    }
  }
  return { sessions: count, average: games ? Math.round(total / games) : null };
}

/**
 * The day a week starts on where the bowler is, 0 for Sunday. Read from the
 * device's region rather than the app's language: English is spoken where
 * weeks start on Sunday and where they start on Monday. Sunday where the
 * browser cannot say.
 */
export function weekStartFor(locale: string | undefined): number {
  if (!locale) return 0;
  try {
    const loc = new Intl.Locale(locale) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number };
      weekInfo?: { firstDay: number };
    };
    const first = loc.getWeekInfo?.().firstDay ?? loc.weekInfo?.firstDay;
    return typeof first === "number" ? first % 7 : 0;
  } catch {
    return 0;
  }
}

/** Consecutive sessions on one day, under one heading. The list is newest
 *  first, so a day's sessions are already together. */
export function groupByDay(sessions: SessionSummary[]): Array<{ date: string; sessions: SessionSummary[] }> {
  const groups: Array<{ date: string; sessions: SessionSummary[] }> = [];
  for (const summary of sessions) {
    const last = groups[groups.length - 1];
    if (last && last.date === summary.session.date) last.sessions.push(summary);
    else groups.push({ date: summary.session.date, sessions: [summary] });
  }
  return groups;
}

const SHOWN_KEY = "historyCalendar";

/** Whether History shows its calendar. On until the bowler hides it, and
 *  remembered on this device, as the theme is. */
export function readCalendarShown(): boolean {
  try {
    return localStorage.getItem(SHOWN_KEY) !== "hidden";
  } catch {
    return true;
  }
}

export function writeCalendarShown(shown: boolean): void {
  try {
    if (shown) localStorage.removeItem(SHOWN_KEY);
    else localStorage.setItem(SHOWN_KEY, "hidden");
  } catch {
    // Private mode or storage blocked: it holds for this run only.
  }
}

/** The months a bowler can turn the calendar to: the first session's to the
 *  last's. Null with no sessions. */
export function monthBounds(sessions: SessionSummary[]): { min: CalendarMonth; max: CalendarMonth } | null {
  let first: string | null = null;
  let last: string | null = null;
  for (const { session } of sessions) {
    if (first === null || session.date < first) first = session.date;
    if (last === null || session.date > last) last = session.date;
  }
  if (first === null || last === null) return null;
  const toMonth = (date: string): CalendarMonth => ({ year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) - 1 });
  return { min: toMonth(first), max: toMonth(last) };
}

const monthIndex = ({ year, month }: CalendarMonth) => year * 12 + month;

/** `month`, held within `bounds`. */
export function clampMonth(
  month: CalendarMonth,
  bounds: { min: CalendarMonth; max: CalendarMonth } | null
): CalendarMonth {
  if (!bounds) return month;
  if (monthIndex(month) < monthIndex(bounds.min)) return bounds.min;
  if (monthIndex(month) > monthIndex(bounds.max)) return bounds.max;
  return month;
}

/** Whether `month` is inside `bounds`; every month is with no bounds. */
export function inBounds(
  month: CalendarMonth,
  bounds: { min: CalendarMonth; max: CalendarMonth } | null
): boolean {
  return !bounds || (monthIndex(month) >= monthIndex(bounds.min) && monthIndex(month) <= monthIndex(bounds.max));
}

/** Whether `a` is the same month as `b`. */
export function sameMonth(a: CalendarMonth, b: CalendarMonth): boolean {
  return monthIndex(a) === monthIndex(b);
}
