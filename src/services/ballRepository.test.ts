import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../db/bowlingDb";
import {
  addBall,
  addOilPattern,
  deleteBall,
  deleteOilPattern,
  deleteSpareLine,
  ensureDefaultSpareLines,
  getBalls,
  getOilPatterns,
  getSpareLinesAll,
  getSpareLineByPins,
  reorderSpareLines,
  updateBall,
  upsertSpareLine
} from "./ballRepository";

describe("ballRepository", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  // -------------------------------------------------------------------------
  // Balls
  // -------------------------------------------------------------------------

  describe("getBalls", () => {
    it("returns all balls sorted by name", async () => {
      await db.balls.bulkAdd([
        { name: "Zebra", is_spare_ball: false },
        { name: "Alpha", is_spare_ball: false },
        { name: "Mike", is_spare_ball: false }
      ]);

      const balls = await getBalls();
      expect(balls.map((b) => b.name)).toEqual(["Alpha", "Mike", "Zebra"]);
    });
  });

  describe("addBall", () => {
    it("adds a ball and returns an id", async () => {
      const id = await addBall({ name: "Storm Phaze II", is_spare_ball: false });
      expect(id).toBeTypeOf("number");
      expect(id).toBeGreaterThan(0);
    });

    it("clears is_spare_ball on all existing balls when adding a new spare ball", async () => {
      await addBall({ name: "Plastic", is_spare_ball: true });

      // Verify first ball is spare
      let balls = await getBalls();
      expect(balls[0].is_spare_ball).toBe(true);

      // Add a second spare ball
      await addBall({ name: "Columbia White Dot", is_spare_ball: true });

      balls = await getBalls();
      const spareBalls = balls.filter((b) => b.is_spare_ball);
      expect(spareBalls).toHaveLength(1);
      expect(spareBalls[0].name).toBe("Columbia White Dot");
    });
  });

  describe("updateBall", () => {
    it("enforces single-spare constraint when updating a ball to is_spare_ball: true", async () => {
      const idA = await addBall({ name: "Ball A", is_spare_ball: true });
      const idB = await addBall({ name: "Ball B", is_spare_ball: false });

      await updateBall(idB, { name: "Ball B", is_spare_ball: true });

      const balls = await getBalls();
      const spare = balls.filter((b) => b.is_spare_ball);
      expect(spare).toHaveLength(1);
      expect(spare[0].id).toBe(idB);

      const ballA = balls.find((b) => b.id === idA);
      expect(ballA?.is_spare_ball).toBe(false);
    });

    it("does not wipe spare flag on itself when updating its own spare status", async () => {
      const id = await addBall({ name: "Spare", is_spare_ball: true });
      await updateBall(id, { name: "Spare Updated", is_spare_ball: true });

      const balls = await getBalls();
      const spare = balls.filter((b) => b.is_spare_ball);
      expect(spare).toHaveLength(1);
      expect(spare[0].name).toBe("Spare Updated");
    });
  });

  describe("deleteBall", () => {
    it("removes the ball", async () => {
      const id = await addBall({ name: "To Delete", is_spare_ball: false });
      await deleteBall(id);
      const balls = await getBalls();
      expect(balls.find((b) => b.id === id)).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Oil Patterns
  // -------------------------------------------------------------------------

  describe("getOilPatterns", () => {
    it("returns all oil patterns sorted by name", async () => {
      await db.oil_patterns.bulkAdd([
        { name: "Scorpion" },
        { name: "Cheetah" },
        { name: "Shark" }
      ]);

      const patterns = await getOilPatterns();
      expect(patterns.map((p) => p.name)).toEqual(["Cheetah", "Scorpion", "Shark"]);
    });
  });

  describe("addOilPattern", () => {
    it("adds an oil pattern and returns an id", async () => {
      const id = await addOilPattern("Badger");
      expect(id).toBeTypeOf("number");
      expect(id).toBeGreaterThan(0);
    });

    it("trims whitespace and throws on empty name", async () => {
      await expect(addOilPattern("   ")).rejects.toThrow("Oil pattern name cannot be empty");
    });
  });

  describe("deleteOilPattern", () => {
    it("removes the oil pattern", async () => {
      const id = await addOilPattern("Viper");
      await deleteOilPattern(id);
      const patterns = await getOilPatterns();
      expect(patterns.find((p) => p.id === id)).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Spare Lines
  // -------------------------------------------------------------------------

  describe("ensureDefaultSpareLines", () => {
    it("seeds 9 default spare lines when table is empty", async () => {
      await ensureDefaultSpareLines();
      const lines = await getSpareLinesAll();
      expect(lines).toHaveLength(9);
    });

    it("is idempotent: calling twice still results in 9 lines", async () => {
      await ensureDefaultSpareLines();
      await ensureDefaultSpareLines();
      const lines = await getSpareLinesAll();
      expect(lines).toHaveLength(9);
    });

    it("does not overwrite when lines already exist", async () => {
      await upsertSpareLine([1, 2, 3]);
      await ensureDefaultSpareLines();
      const lines = await getSpareLinesAll();
      // Table was not empty so no seeding; only the manually-added line exists
      expect(lines).toHaveLength(1);
    });
  });

  describe("upsertSpareLine", () => {
    it("creates a new spare line", async () => {
      await upsertSpareLine([7]);
      const found = await getSpareLineByPins([7]);
      expect(found).toBeDefined();
      expect(found?.pins).toEqual([7]);
    });

    it("updates an existing spare line by pin identity", async () => {
      await upsertSpareLine([10]);
      await upsertSpareLine([10], { stance: 35, target: 10, breakpoint: 5 }, "Ten-pin");

      const lines = await getSpareLinesAll();
      // Only one record for [10]
      const tenPins = lines.filter((l) => l.pins.length === 1 && l.pins[0] === 10);
      expect(tenPins).toHaveLength(1);
      expect(tenPins[0].line?.stance).toBe(35);
      expect(tenPins[0].notes).toBe("Ten-pin");
    });

    it("sorts pins before storing and matches regardless of input order", async () => {
      await upsertSpareLine([10, 4, 6]);
      const found = await getSpareLineByPins([6, 10, 4]);
      expect(found).toBeDefined();
      expect(found?.pins).toEqual([4, 6, 10]);
    });
  });

  describe("getSpareLinesAll", () => {
    it("returns spare lines in custom sort_order (new adds appended)", async () => {
      await upsertSpareLine([10]);
      await upsertSpareLine([4]);
      await upsertSpareLine([7]);

      const lines = await getSpareLinesAll();
      expect(lines.map((l) => l.pins[0])).toEqual([10, 4, 7]);
    });

    it("reflects a reorder", async () => {
      await upsertSpareLine([10]);
      await upsertSpareLine([4]);
      await upsertSpareLine([7]);
      const before = await getSpareLinesAll();
      const ids = before.map((l) => l.id!);

      // Move the last item to the front.
      await reorderSpareLines([ids[2], ids[0], ids[1]]);

      const after = await getSpareLinesAll();
      expect(after.map((l) => l.pins[0])).toEqual([7, 10, 4]);
    });
  });

  describe("deleteSpareLine", () => {
    it("removes the spare line", async () => {
      await upsertSpareLine([6]);
      const line = await getSpareLineByPins([6]);
      expect(line).toBeDefined();

      await deleteSpareLine(line!.id!);
      const after = await getSpareLineByPins([6]);
      expect(after).toBeUndefined();
    });
  });
});
