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
