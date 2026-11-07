/**
 * The last few things searched for, newest first (ADR-247).
 *
 * In localStorage rather than Dexie: a convenience for this phone, like the
 * theme, and nothing a backup should carry or a restore bring back. It can be
 * missing or unreadable (a private window, a cleared site), and then there are
 * simply no recent searches.
 */

const KEY = "headpin:recent-searches";
/** As many as the search screen shows. */
export const RECENT_LIMIT = 5;

export function readRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string" && v.trim() !== "").slice(0, RECENT_LIMIT)
      : [];
  } catch {
    return [];
  }
}

function write(list: string[]) {
  try {
    if (list.length === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage full or blocked: the search still works, it just forgets.
  }
}

/** Put a search at the front, dropping an earlier copy of it in any case. */
export function addRecentSearch(query: string): string[] {
  const value = query.trim();
  if (!value) return readRecentSearches();
  const key = value.toLowerCase();
  const next = [value, ...readRecentSearches().filter((v) => v.toLowerCase() !== key)].slice(0, RECENT_LIMIT);
  write(next);
  return next;
}

export function removeRecentSearch(query: string): string[] {
  const key = query.toLowerCase();
  const next = readRecentSearches().filter((v) => v.toLowerCase() !== key);
  write(next);
  return next;
}

export function clearRecentSearches(): void {
  write([]);
}
