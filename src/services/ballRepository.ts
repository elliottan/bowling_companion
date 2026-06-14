import { db } from "../db/bowlingDb";
import type { Ball, LaneNote, LineSpec, OilPattern, PinNumber, SpareLine } from "../types/bowling";

// ---------------------------------------------------------------------------
// Balls
// ---------------------------------------------------------------------------

export async function getBalls(): Promise<Ball[]> {
  return db.balls.orderBy("name").toArray();
}

export async function addBall(input: Omit<Ball, "id">): Promise<number> {
  return db.transaction("rw", db.balls, async () => {
    if (input.is_spare_ball) {
      const existing = await db.balls.toArray();
      const spares = existing.filter((b) => b.is_spare_ball && b.id !== undefined);
      await Promise.all(spares.map((b) => db.balls.update(b.id!, { is_spare_ball: false })));
    }
    const id = await db.balls.add(input as Ball);
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

export async function getOilPatterns(): Promise<OilPattern[]> {
  return db.oil_patterns.orderBy("name").toArray();
}

export async function addOilPattern(name: string): Promise<number> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Oil pattern name cannot be empty");
  const id = await db.oil_patterns.add({ name: trimmed });
  return Number(id);
}

export async function deleteOilPattern(id: number): Promise<void> {
  await db.oil_patterns.delete(id);
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

export async function getSpareLineByPins(pins: PinNumber[]): Promise<SpareLine | undefined> {
  const sorted = sortPins(pins);
  const all = await db.spare_lines.toArray();
  return all.find((sl) => pinsEqual(sortPins(sl.pins), sorted));
}

export async function upsertSpareLine(
  pins: PinNumber[],
  line?: LineSpec,
  notes?: string
): Promise<void> {
  const sorted = sortPins(pins);
  const existing = await getSpareLineByPins(sorted);
  if (existing?.id !== undefined) {
    await db.spare_lines.update(existing.id, { pins: sorted, line, notes });
  } else {
    // New leaves go to the end of the custom order.
    const all = await db.spare_lines.toArray();
    const maxOrder = all.reduce((m, sl) => Math.max(m, sl.sort_order ?? -1), -1);
    await db.spare_lines.add({ pins: sorted, line, notes, sort_order: maxOrder + 1 });
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
