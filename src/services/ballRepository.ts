import { db } from "../db/bowlingDb";
import type { Ball, LaneNote, LineSpec, OilPass, OilPattern, PinNumber, SpareLine } from "../types/bowling";

// ---------------------------------------------------------------------------
// Balls
// ---------------------------------------------------------------------------

export async function getBalls(): Promise<Ball[]> {
  const all = await db.balls.toArray();
  return all.sort((a, b) => {
    const ao = a.sort_order ?? Number.MAX_SAFE_INTEGER;
    const bo = b.sort_order ?? Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    return a.name.localeCompare(b.name);
  });
}

export async function reorderBalls(orderedIds: number[]): Promise<void> {
  await db.transaction("rw", db.balls, async () => {
    await Promise.all(
      orderedIds.map((id, index) => db.balls.update(id, { sort_order: index }))
    );
  });
}

export async function addBall(input: Omit<Ball, "id">): Promise<number> {
  return db.transaction("rw", db.balls, async () => {
    if (input.is_spare_ball) {
      const existing = await db.balls.toArray();
      const spares = existing.filter((b) => b.is_spare_ball && b.id !== undefined);
      await Promise.all(spares.map((b) => db.balls.update(b.id!, { is_spare_ball: false })));
    }
    const all = await db.balls.toArray();
    const maxOrder = all.reduce((m, b) => Math.max(m, b.sort_order ?? -1), -1);
    const id = await db.balls.add({ ...input, sort_order: maxOrder + 1 } as Ball);
    return Number(id);
  });
}

export async function updateBall(id: number, input: Omit<Ball, "id">): Promise<void> {
  await db.transaction("rw", db.balls, async () => {
    if (input.is_spare_ball) {
      const existing = await db.balls.toArray();
      const spares = existing.filter((b) => b.is_spare_ball && b.id !== undefined && b.id !== id);
      await Promise.all(spares.map((b) => db.balls.update(b.id!, { is_spare_ball: false })));
    }
    await db.balls.update(id, input);
  });
}

export async function deleteBall(id: number): Promise<void> {
  await db.balls.delete(id);
}

// ---------------------------------------------------------------------------
// Oil Patterns
// ---------------------------------------------------------------------------

/**
 * Reject anything that isn't an http(s) URL, the value is rendered as a link,
 * so `javascript:` and `data:` must never make it into the DB.
 */
export function normalizeOilPatternUrl(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Enter a full link starting with http:// or https://");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Link must start with http:// or https://");
  }
  return trimmed;
}

/**
 * Clean a load table on its way into the DB (ADR-101). A pass that cannot be
 * drawn is a typo, not data: it is rejected by name rather than silently
 * dropped, because a pattern quietly missing a pass draws a shape the bowler
 * never entered and would trust anyway.
 */
export function normalizeOilPasses(passes: OilPass[] | undefined): OilPass[] | undefined {
  if (!passes || passes.length === 0) return undefined;
  return passes.map((p, i) => {
    const at = `Pass ${i + 1}`;
    const num = (v: number, label: string) => {
      if (!Number.isFinite(v)) throw new Error(`${at}: ${label} must be a number`);
      return v;
    };
    const start = num(p.start_distance, "start distance");
    const end = num(p.end_distance, "end distance");
    const left = Math.round(num(p.left_board, "left board"));
    const right = Math.round(num(p.right_board, "right board"));
    const loads = Math.round(num(p.loads, "loads"));
    const microliters = num(p.microliters, "microlitres");
    if (Math.min(start, end) < 0 || Math.max(start, end) > 70) {
      throw new Error(`${at}: distances must sit between 0 and 70 feet`);
    }
    // A reverse pass runs back toward the foul line, so its end is BEFORE its
    // start. Only a pass that goes nowhere is a typo.
    if (start === end) throw new Error(`${at}: the pass has to travel`);
    if (left < 1 || right > LANE_BOARDS_MAX || right < left) {
      throw new Error(`${at}: boards must run left to right, between 1 and ${LANE_BOARDS_MAX}`);
    }
    // Loads of zero is a buffer-only pass: it lays no oil, and it still counts,
    // because the pattern distance is how far the machine reached.
    if (loads < 0) throw new Error(`${at}: loads cannot be negative`);
    if (microliters < 0) throw new Error(`${at}: microlitres cannot be negative`);
    return {
      direction: p.direction === "reverse" ? "reverse" : "forward",
      left_board: left,
      right_board: right,
      loads,
      microliters,
      start_distance: start,
      end_distance: end,
      ...(Number.isFinite(p.speed as number) ? { speed: p.speed } : {}),
      ...(Number.isFinite(p.buffer as number) ? { buffer: p.buffer } : {}),
      ...(typeof p.tank === "string" && p.tank.trim() ? { tank: p.tank.trim() } : {}),
    } satisfies OilPass;
  });
}

/** Boards on a lane. Spelled here rather than imported from `laneGeometry`, so
 *  the service layer keeps its back to the drawing layer (ARCHITECTURE.md). */
const LANE_BOARDS_MAX = 39;

/** Active patterns only, archived ones stay out of pickers. */
export async function getOilPatterns(): Promise<OilPattern[]> {
  const all = await db.oil_patterns.orderBy("name").toArray();
  return all.filter((p) => !p.archived);
}

/** Every pattern including archived, for the settings page. */
export async function getAllOilPatterns(): Promise<OilPattern[]> {
  return db.oil_patterns.orderBy("name").toArray();
}

export async function getOilPattern(id: number): Promise<OilPattern | undefined> {
  return db.oil_patterns.get(id);
}

/** Names are the user's handle on a pattern and must stay unambiguous. */
async function assertNameFree(name: string, exceptId?: number): Promise<void> {
  const key = name.toLowerCase();
  const all = await db.oil_patterns.toArray();
  const clash = all.find((p) => p.name.trim().toLowerCase() === key && p.id !== exceptId);
  if (clash) throw new Error(`"${clash.name}" already exists`);
}

export async function addOilPattern(
  name: string,
  url?: string,
  passes?: OilPass[],
  distance?: number
): Promise<number> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Oil pattern name cannot be empty");
  const normalizedUrl = normalizeOilPatternUrl(url);
  const normalizedPasses = normalizeOilPasses(passes);

  return db.transaction("rw", db.oil_patterns, async () => {
    await assertNameFree(trimmed);
    const id = await db.oil_patterns.add({
      name: trimmed,
      url: normalizedUrl,
      passes: normalizedPasses,
      distance: normalizeDistance(distance),
    });
    return Number(id);
  });
}

/** A length only means anything for a pattern with no table, and a lane is not
 *  70 feet long. Anything outside that is a typo, not a pattern. */
function normalizeDistance(distance: number | undefined): number | undefined {
  if (distance == null || !Number.isFinite(distance)) return undefined;
  if (distance <= 0 || distance > 70) throw new Error("Pattern length must be between 1 and 70 feet");
  return Math.round(distance * 10) / 10;
}

export async function updateOilPattern(
  id: number,
  input: { name: string; url?: string; passes?: OilPass[]; distance?: number; catalog_id?: string }
): Promise<void> {
  const trimmed = input.name.trim();
  if (!trimmed) throw new Error("Oil pattern name cannot be empty");
  const normalizedUrl = normalizeOilPatternUrl(input.url);
  const normalizedPasses = normalizeOilPasses(input.passes);

  await db.transaction("rw", db.oil_patterns, async () => {
    await assertNameFree(trimmed, id);
    await db.oil_patterns.update(id, {
      name: trimmed,
      url: normalizedUrl,
      passes: normalizedPasses,
      distance: normalizeDistance(input.distance),
      // Never cleared: a link is one way (ADR-105).
      ...(input.catalog_id ? { catalog_id: input.catalog_id } : {}),
    });
  });
}

export async function setOilPatternArchived(id: number, archived: boolean): Promise<void> {
  await db.oil_patterns.update(id, { archived: archived || undefined });
}

export type RemoveOilPatternResult = { outcome: "deleted" } | { outcome: "archived"; sessions: number };

/**
 * Unreferenced patterns are deleted outright; referenced ones are archived so
 * the history that points at them keeps resolving a name.
 */
export async function removeOilPattern(id: number): Promise<RemoveOilPatternResult> {
  return db.transaction("rw", db.oil_patterns, db.sessions, async () => {
    const sessions = await db.sessions.where("oil_pattern_id").equals(id).count();
    if (sessions === 0) {
      await db.oil_patterns.delete(id);
      return { outcome: "deleted" as const };
    }
    await db.oil_patterns.update(id, { archived: true });
    return { outcome: "archived" as const, sessions };
  });
}

// ---------------------------------------------------------------------------
// Spare Lines
// ---------------------------------------------------------------------------

function sortPins(pins: PinNumber[]): PinNumber[] {
  return [...pins].sort((a, b) => a - b) as PinNumber[];
}

function pinsEqual(a: PinNumber[], b: PinNumber[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((p, i) => p === b[i]);
}

export async function getSpareLinesAll(): Promise<SpareLine[]> {
  const all = await db.spare_lines.toArray();
  // Custom order via sort_order; rows without it (legacy) fall back to pin order.
  return all.sort((a, b) => {
    const ao = a.sort_order ?? Number.MAX_SAFE_INTEGER;
    const bo = b.sort_order ?? Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    return (a.pins[0] ?? 0) - (b.pins[0] ?? 0);
  });
}

export async function reorderSpareLines(orderedIds: number[]): Promise<void> {
  await db.transaction("rw", db.spare_lines, async () => {
    await Promise.all(
      orderedIds.map((id, index) => db.spare_lines.update(id, { sort_order: index }))
    );
  });
}

/** Match a leave against an already-loaded spare-line list (no DB round trip).
 *  Callers that hold the table in state use this so the lookup stays sync. */
export function findSpareLineByPins(
  lines: SpareLine[],
  pins: PinNumber[]
): SpareLine | undefined {
  const sorted = sortPins(pins);
  return lines.find((sl) => pinsEqual(sortPins(sl.pins), sorted));
}

export async function getSpareLineByPins(pins: PinNumber[]): Promise<SpareLine | undefined> {
  return findSpareLineByPins(await db.spare_lines.toArray(), pins);
}

export async function upsertSpareLine(
  pins: PinNumber[],
  line?: LineSpec,
  notes?: string,
  strike_offset?: SpareLine["strike_offset"]
): Promise<void> {
  const sorted = sortPins(pins);
  const existing = await getSpareLineByPins(sorted);
  if (existing?.id !== undefined) {
    // Written even when undefined, which is how the offset gets cleared: an
    // omitted key would leave the old move in place.
    await db.spare_lines.update(existing.id, { pins: sorted, line, notes, strike_offset });
  } else {
    // New leaves go to the end of the custom order.
    const all = await db.spare_lines.toArray();
    const maxOrder = all.reduce((m, sl) => Math.max(m, sl.sort_order ?? -1), -1);
    await db.spare_lines.add({ pins: sorted, line, notes, strike_offset, sort_order: maxOrder + 1 });
  }
}

export async function deleteSpareLine(id: number): Promise<void> {
  await db.spare_lines.delete(id);
}

const DEFAULT_SPARE_LINES: PinNumber[][] = [
  [10],
  [7],
  [6],
  [4],
  [3],
  [2],
  [9],
  [8],
  [5]
];

export async function ensureDefaultSpareLines(): Promise<void> {
  // Atomic check-then-seed: a transaction serializes concurrent callers
  // (e.g. React StrictMode double-invoking the mount effect) so the table
  // is seeded exactly once instead of duplicated.
  await db.transaction("rw", db.spare_lines, async () => {
    const count = await db.spare_lines.count();
    if (count > 0) return;

    await db.spare_lines.bulkAdd(
      DEFAULT_SPARE_LINES.map((pins, index) => ({ pins: sortPins(pins), sort_order: index }))
    );
  });
}

// ---------------------------------------------------------------------------
// Lane notes (keyed by alley + lane)
// ---------------------------------------------------------------------------

export async function getLaneNotes(): Promise<LaneNote[]> {
  const all = await db.lane_notes.toArray();
  return all.sort(
    (a, b) =>
      a.alley.localeCompare(b.alley) ||
      a.lane.localeCompare(b.lane, undefined, { numeric: true })
  );
}

export async function getLaneNote(alley: string, lane: string): Promise<LaneNote | undefined> {
  const a = alley.trim();
  const l = lane.trim();
  if (!a || !l) return undefined;
  const all = await db.lane_notes.toArray();
  return all.find((n) => n.alley === a && n.lane === l);
}

export async function upsertLaneNote(alley: string, lane: string, notes: string): Promise<void> {
  const a = alley.trim();
  const l = lane.trim();
  if (!a || !l) throw new Error("Alley and lane are required.");
  const existing = await getLaneNote(a, l);
  if (existing?.id !== undefined) {
    await db.lane_notes.update(existing.id, { notes });
  } else {
    await db.lane_notes.add({ alley: a, lane: l, notes });
  }
}

export async function deleteLaneNote(id: number): Promise<void> {
  await db.lane_notes.delete(id);
}
