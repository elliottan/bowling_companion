import { db } from "../db/bowlingDb";
import type { Ball, LineSpec, OilPattern, PinNumber, SpareLine } from "../types/bowling";

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
  return all.sort((a, b) => (a.pins[0] ?? 0) - (b.pins[0] ?? 0));
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
    await db.spare_lines.add({ pins: sorted, line, notes });
  }
}

export async function deleteSpareLine(id: number): Promise<void> {
  await db.spare_lines.delete(id);
}

const DEFAULT_SPARE_LINES: PinNumber[][] = [
  [10],
  [7],
  [4],
  [6],
  [2, 4, 10],
  [3, 6, 10],
  [5, 7],
  [4, 6, 7, 10]
];

export async function ensureDefaultSpareLines(): Promise<void> {
  const count = await db.spare_lines.count();
  if (count > 0) return;

  await db.spare_lines.bulkAdd(
    DEFAULT_SPARE_LINES.map((pins) => ({ pins: sortPins(pins) }))
  );
}
