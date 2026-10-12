/**
 * Dates, written the way the device writes dates.
 *
 * A session's `date` is a stored `YYYY-MM-DD` string, and it was being printed
 * raw: "2026-09-01" in the session header, in the history list and on the
 * landing page screenshots. That is a database field, not a date a person
 * reads.
 *
 * It is also user-editable free text, so anything that does not parse falls
 * back to the raw string rather than to "Invalid Date".
 */

/** `new Date("2026-09-01")` is UTC midnight, which is the day before in every
 *  timezone west of Greenwich. A stored day has no time in it, so it is built
 *  as a local date instead. */
function parseStoredDate(value: string): Date | null {
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  const parsed = ymd
    ? new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]))
    : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** A stored session day: "1 Sep 2026", or however the device says it. */
export function formatSessionDate(value: string): string {
  const parsed = parseStoredDate(value);
  return parsed
    ? parsed.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
    : value;
}

/**
 * A catalog ball's release: "Mar 2024", or "2024" when the source only gave
 * the year. A release date is stored to the precision it was read at, `yyyy`,
 * `yyyy-mm` or `yyyy-mm-dd` (ADR-134), and the day is never shown: a launch
 * month is what a bowler compares, and several sources pin a month to its 1st.
 * Null when there is no date, or it does not parse.
 */
export function formatReleaseDate(value: string | null | undefined): string | null {
  const m = value ? /^(\d{4})(?:-(\d{2}))?(?:-\d{2})?$/.exec(value.trim()) : null;
  if (!m) return null;
  if (!m[2]) return m[1];
  const month = Number(m[2]);
  if (month < 1 || month > 12) return m[1];
  return new Date(Number(m[1]), month - 1, 1).toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

/** An ISO timestamp, to the minute. For a backup, where the time of day is
 *  what tells two files of the same day apart. */
export function formatTimestamp(iso: string): string {
  const parsed = parseStoredDate(iso);
  return parsed
    ? parsed.toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit"
      })
    : iso;
}

/** Today as the stored `YYYY-MM-DD` key, in the device's own day. `toISOString`
 *  gives the UTC day, which is already tomorrow for a 7 pm league anywhere
 *  west of Greenwich, so a Tuesday session was being filed under Wednesday. */
export function localDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
