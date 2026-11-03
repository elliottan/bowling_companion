import { plural, t } from "@lingui/core/macro";
import type { SessionSummary } from "../types/bowling";
import { formatShortDate } from "./dates";

/**
 * A session can be started with nothing filled in (ADR-080), so every place
 * that prints the alley needs one word for the alley that was never named.
 * "Unnamed session" rather than a blank: a row with no title reads as a
 * rendering fault, and the session is still perfectly real.
 */
export function unnamedAlley(): string {
  return t({ message: "Unnamed session", comment: "The title of a session whose alley was never named" });
}

/** The alley as it is shown on screen, for a session that may not name one. */
export function alleyLabel(alleyName: string | undefined): string {
  return alleyName?.trim() || unnamedAlley();
}

/** One game's lanes: "Lanes 9/10", or "Lane 5" when it was played on one. */
export function laneLabel(all: string[]): string {
  const played = all.filter(Boolean);
  if (!played.length) return "";
  const lanes = played.join("/");
  return plural(played.length, { one: `Lane ${lanes}`, other: `Lanes ${lanes}` });
}

// Lanes are per-game, so show each distinct lane PAIR bowled this session,
// e.g. "Lanes 9/10, 11/12" (or "Lane 5" for a single-lane game).
export function laneSummary(games: SessionSummary["games"]): string {
  const pairs: string[] = [];
  for (const g of games) {
    const lanes = (g.lanes ?? (g.lane_number ? [g.lane_number] : [])).filter(Boolean);
    if (!lanes.length) continue;
    const label = lanes.join("/");
    if (!pairs.includes(label)) pairs.push(label);
  }
  if (!pairs.length) return "";
  const lanes = pairs.join(", ");
  // One pair of lanes is plural too ("Lanes 9/10"); only a lone lane is singular.
  const count = pairs.length === 1 && !pairs[0].includes("/") ? 1 : 2;
  return plural(count, { one: `Lane ${lanes}`, other: `Lanes ${lanes}` });
}

/** The line under the alley: the event and a short date. The game count is
 *  gone: the chips under the bar already say it, and the bar has the score and
 *  its actions to fit beside this. */
export function sessionMetaLine(session: SessionSummary["session"]): string {
  return [session.description, formatShortDate(session.date)].filter(Boolean).join(" · ");
}
