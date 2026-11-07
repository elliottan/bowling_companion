import { plural, t } from "@lingui/core/macro";
import type { Ball, OilPattern, SessionSummary } from "../types/bowling";
import type { CatalogBall } from "../types/catalog";
import { GUIDES } from "./guides";
import { patternLength } from "./oilPattern";
import { formatNumber } from "./format";

/**
 * The one search over everything the app holds (ADR-247): the bowler's own
 * sessions, patterns and balls, the shipped catalogs, the guides and the
 * words in them, and the screens themselves.
 *
 * Pure: the search screen reads the repositories and hands the rows in, so
 * what matches and in what order is decided here, where a test can read it,
 * and not in a component that needs Dexie to run.
 *
 * Nothing is indexed ahead of time. The largest list is the ball catalog, a
 * few hundred rows, and a case-folded `includes` over that on each keystroke
 * costs less than keeping an index in step with live queries would.
 */

export type SearchSection =
  | "sessions"
  | "patterns"
  | "arsenal"
  | "catalog"
  | "terms"
  | "guides"
  | "screens";

/** Order the sections are shown in. The bowler's own record leads, since a
 *  search for a pattern is most often a search for the nights bowled on it. */
export const SEARCH_SECTIONS: readonly SearchSection[] = [
  "sessions",
  "patterns",
  "arsenal",
  "terms",
  "guides",
  "catalog",
  "screens"
];

/** The History facets a search result can open History filtered by. */
export type SessionFacet = "pattern" | "alley" | "event";

/** Screens a result can open. The names are the search screen's own, mapped
 *  onto navigation where it renders them. */
export type SearchScreen =
  | "arsenal"
  | "catalog"
  | "oil-patterns"
  | "spares"
  | "lanes"
  | "guides"
  | "layout-lab"
  | "line"
  | "game-plan"
  | "backup"
  | "stats"
  | "history"
  | "settings";

export type SearchTarget =
  | { kind: "pattern"; patternId: number }
  | { kind: "sessions"; facet: SessionFacet; value: string }
  | { kind: "arsenal-ball"; ballId: number }
  | { kind: "catalog-ball"; catalogId: string }
  | { kind: "guide"; guideId: string }
  | { kind: "screen"; screen: SearchScreen };

export interface SearchItem {
  /** Unique across the whole index, for React and for tests. */
  key: string;
  section: SearchSection;
  title: string;
  subtitle?: string;
  /** What a query is matched against: the first is the item's name, the rest
   *  are words that find it without being its name (a ball's brand). */
  terms: string[];
  /** A catalog photo, for a ball. */
  image?: string | null;
  brand?: string;
  target: SearchTarget;
}

/** A screen as the search screen describes it: its name in the bowler's
 *  language, and the other words a bowler might type for it. */
export interface ScreenEntry {
  screen: SearchScreen;
  title: string;
  keywords?: string[];
}

export interface SearchSources {
  sessions: readonly SessionSummary[];
  patterns: readonly OilPattern[];
  balls: readonly Ball[];
  catalog: readonly CatalogBall[];
  screens: readonly ScreenEntry[];
}

/** Lowercase, accents off, so "Café" is found by "cafe". For matching only:
 *  it can change a string's length, so it is never used to place a highlight. */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

/** Letters and digits only, so "hyroad" finds the Hy-Road, as the catalog's
 *  own search does (`catalogSearch`). */
function squash(text: string): string {
  return text.replace(/[^\p{L}\p{N}]/gu, "");
}

/**
 * How well one string answers a query, from 0 (not at all) to 100 (exactly).
 *
 * The tiers are what a bowler means by a good match: the whole name, then a
 * name that starts with what was typed, then a word inside it that does
 * ("route" finds "Route 66"), then the letters anywhere. A query of several
 * words matches when every word does, so "storm phys" finds the Storm Physix.
 */
export function matchScore(text: string, query: string): number {
  const q = fold(query);
  if (!q) return 0;
  const s = fold(text);
  if (!s) return 0;
  if (s === q) return 100;
  if (s.startsWith(q)) return 85;
  const words = s.split(/[\s\-/,.()]+/).filter(Boolean);
  if (words.some((w) => w.startsWith(q))) return 70;
  if (s.includes(q)) return 50;
  const sq = squash(q);
  if (sq.length > 1 && squash(s).includes(sq)) return 40;
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length > 1 && tokens.every((tok) => words.some((w) => w.startsWith(tok)))) return 45;
  if (tokens.length > 1 && tokens.every((tok) => s.includes(tok))) return 30;
  return 0;
}

/** Small nudges so equal matches settle in a useful order: the bowler's own
 *  things before the catalog's. */
const SECTION_WEIGHT: Record<SearchSection, number> = {
  sessions: 6,
  patterns: 5,
  arsenal: 5,
  terms: 3,
  screens: 2,
  guides: 1,
  catalog: 0
};

/** A secondary term (a brand, a summary) finds an item, but ranks it below
 *  one whose own name matched. */
const SECONDARY = 0.6;

export function itemScore(item: SearchItem, query: string): number {
  let best = 0;
  item.terms.forEach((term, i) => {
    const score = matchScore(term, query) * (i === 0 ? 1 : SECONDARY);
    if (score > best) best = score;
  });
  return best === 0 ? 0 : best + SECTION_WEIGHT[item.section];
}

/** Values of one session field, with how many sessions carry each, as typed
 *  (the first spelling seen wins, and a different case is the same value). */
function countValues(
  sessions: readonly SessionSummary[],
  valueOf: (s: SessionSummary) => string | null | undefined
): Array<{ value: string; count: number }> {
  const byKey = new Map<string, { value: string; count: number }>();
  for (const s of sessions) {
    const value = valueOf(s)?.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    const entry = byKey.get(key);
    if (entry) entry.count += 1;
    else byKey.set(key, { value, count: 1 });
  }
  return [...byKey.values()];
}

function sessionCount(count: number): string {
  return plural(count, { one: "# session", other: "# sessions" });
}

/** Everything the search can find, built fresh from what the screen read. */
export function buildSearchIndex(sources: SearchSources): SearchItem[] {
  const items: SearchItem[] = [];

  // A pattern searched is most often a question about the sessions bowled on
  // it, so the pattern brings a way into those along with its sheet.
  for (const { value, count } of countValues(sources.sessions, (s) => s.session.oil_pattern)) {
    items.push({
      key: `sessions:pattern:${value.toLowerCase()}`,
      section: "sessions",
      title: t({ message: `Sessions on ${value}`, comment: "A search result: every session bowled on the oil pattern named" }),
      subtitle: sessionCount(count),
      terms: [value],
      target: { kind: "sessions", facet: "pattern", value }
    });
  }
  for (const { value, count } of countValues(sources.sessions, (s) => s.session.alley_name)) {
    items.push({
      key: `sessions:alley:${value.toLowerCase()}`,
      section: "sessions",
      title: t({ message: `Sessions at ${value}`, comment: "A search result: every session bowled at the alley named" }),
      subtitle: sessionCount(count),
      terms: [value],
      target: { kind: "sessions", facet: "alley", value }
    });
  }
  for (const { value, count } of countValues(sources.sessions, (s) => s.session.description)) {
    items.push({
      key: `sessions:event:${value.toLowerCase()}`,
      section: "sessions",
      title: value,
      subtitle: sessionCount(count),
      terms: [value],
      target: { kind: "sessions", facet: "event", value }
    });
  }

  for (const pattern of sources.patterns) {
    if (pattern.id == null) continue;
    const feet = patternLength(pattern);
    items.push({
      key: `pattern:${pattern.id}`,
      section: "patterns",
      title: pattern.name,
      subtitle: feet != null ? t`${{ feet: formatNumber(Math.round(feet)) }} ft` : undefined,
      terms: [pattern.name],
      target: { kind: "pattern", patternId: pattern.id }
    });
  }

  // The arsenal shows retired balls too: the search is for finding a ball,
  // and a retired one is still the bowler's, with its shots.
  for (const ball of sources.balls) {
    if (ball.id == null) continue;
    const snap = ball.catalog_snapshot;
    items.push({
      key: `arsenal:${ball.id}`,
      section: "arsenal",
      title: ball.name,
      subtitle: ball.retired ? t`Retired` : snap?.brand,
      terms: [ball.name, snap?.brand ?? "", snap?.name ?? ""].filter(Boolean),
      image: snap?.imageThumb ?? null,
      brand: snap?.brand,
      target: { kind: "arsenal-ball", ballId: ball.id }
    });
  }

  for (const ball of sources.catalog) {
    items.push({
      key: `catalog:${ball.id}`,
      section: "catalog",
      title: ball.name,
      subtitle: [ball.brand, ball.releaseYear != null ? String(ball.releaseYear) : null].filter(Boolean).join(" · "),
      terms: [ball.name, `${ball.brand} ${ball.name}`, ball.coreName ?? ""].filter(Boolean),
      image: ball.imageThumb,
      brand: ball.brand,
      target: { kind: "catalog-ball", catalogId: ball.id }
    });
  }

  // Every term a guide defines is a result of its own, with its meaning on the
  // row, so "what is the pocket" is answered without opening anything.
  for (const guide of GUIDES) {
    guide.body.forEach((block, b) => {
      if (block.kind !== "terms") return;
      block.items.forEach((entry, i) => {
        items.push({
          key: `term:${guide.id}:${b}:${i}`,
          section: "terms",
          title: entry.term,
          subtitle: entry.text,
          // The term is often written "PAP, the positive axis point", and
          // either half is how a bowler would ask for it.
          terms: [entry.term, ...entry.term.split(/,\s*/).slice(1), ...(entry.aliases ?? [])],
          target: { kind: "guide", guideId: guide.id }
        });
      });
    });
    items.push({
      key: `guide:${guide.id}`,
      section: "guides",
      title: guide.title,
      subtitle: guide.summary,
      terms: [guide.title, guide.summary],
      target: { kind: "guide", guideId: guide.id }
    });
  }

  for (const screen of sources.screens) {
    items.push({
      key: `screen:${screen.screen}`,
      section: "screens",
      title: screen.title,
      terms: [screen.title, ...(screen.keywords ?? [])],
      target: { kind: "screen", screen: screen.screen }
    });
  }

  return items;
}

export interface SearchResults {
  /** The single best answer, when one stands out, shown first and on its own. */
  top: SearchItem | null;
  sections: Array<{ section: SearchSection; items: SearchItem[]; more: number }>;
  total: number;
}

/** How many rows a section shows before it says how many more it found. */
export const SECTION_LIMIT = 5;
/** A top hit has to be a real match, not the best of a poor lot: a name that
 *  starts with what was typed, at least. */
const TOP_HIT_SCORE = 70;

export function searchIndex(items: readonly SearchItem[], query: string, limit = SECTION_LIMIT): SearchResults {
  const scored = items
    .map((item) => ({ item, score: itemScore(item, query) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title));

  const top = scored.length > 0 && scored[0].score >= TOP_HIT_SCORE ? scored[0].item : null;

  const sections = SEARCH_SECTIONS.map((section) => {
    const all = scored.filter((s) => s.item.section === section && s.item !== top).map((s) => s.item);
    return { section, items: all.slice(0, limit), more: Math.max(0, all.length - limit) };
  }).filter((s) => s.items.length > 0);

  return { top, sections, total: scored.length };
}

/**
 * Where the query sits in a title, for drawing it bold: `[before, match,
 * after]`, or null when it is not in there as typed. Matched case-blind on the
 * string as written, never on `fold`, which can shift the positions.
 */
export function highlightParts(text: string, query: string): [string, string, string] | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const lower = text.toLowerCase();
  // A lowercase that changed the length (a few scripts) would put the bold in
  // the wrong place, so it draws none instead.
  if (lower.length !== text.length) return null;
  const at = lower.indexOf(q);
  if (at < 0) return null;
  return [text.slice(0, at), text.slice(at, at + q.length), text.slice(at + q.length)];
}

/**
 * What the search offers before anything is typed: the bowler's own most
 * bowled pattern and alley, then the guide words every bowler hears. Their
 * own come first because they are the likeliest search, and only appear once
 * there is history to take them from.
 */
export function searchSuggestions(
  sessions: readonly SessionSummary[],
  terms: readonly string[],
  max = 6
): string[] {
  const mostCommon = (valueOf: (s: SessionSummary) => string | null | undefined) =>
    countValues(sessions, valueOf).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))[0]?.value;
  const own = [mostCommon((s) => s.session.oil_pattern), mostCommon((s) => s.session.alley_name)].filter(
    (v): v is string => !!v
  );
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of [...own, ...terms]) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= max) break;
  }
  return out;
}
