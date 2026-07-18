import { describe, expect, it } from "vitest";
import {
  DEFAULT_DRIFT_MODEL,
  deriveLaydown,
  deriveSlide,
  driftForStance,
  migrateLegacyLaydownOffset,
  parseDriftModel,
  serializeDriftModel,
  zoneForStance,
  type DriftModel
} from "./driftModel";

const oldDeriveLaydown = (stance: number, offset: number) =>
  Math.max(1, Math.min(39, Math.round((stance - offset) * 2) / 2));

describe("driftModel", () => {
  describe("zoneForStance", () => {
    it("classifies exact boundaries with the default model", () => {
      expect(zoneForStance(14, DEFAULT_DRIFT_MODEL)).toBe("outside");
      expect(zoneForStance(14.5, DEFAULT_DRIFT_MODEL)).toBe("middle");
      expect(zoneForStance(15, DEFAULT_DRIFT_MODEL)).toBe("middle");
      expect(zoneForStance(24, DEFAULT_DRIFT_MODEL)).toBe("middle");
      expect(zoneForStance(25, DEFAULT_DRIFT_MODEL)).toBe("inside");
      expect(zoneForStance(1, DEFAULT_DRIFT_MODEL)).toBe("outside");
      expect(zoneForStance(39, DEFAULT_DRIFT_MODEL)).toBe("inside");
    });

    it("respects custom boundaries", () => {
      const model: DriftModel = {
        ...DEFAULT_DRIFT_MODEL,
        outside_max: 10,
        inside_min: 30
      };
      expect(zoneForStance(10, model)).toBe("outside");
      expect(zoneForStance(11, model)).toBe("middle");
      expect(zoneForStance(29, model)).toBe("middle");
      expect(zoneForStance(30, model)).toBe("inside");
    });
  });

  describe("driftForStance", () => {
    it("returns the zone's configured drift", () => {
      const model: DriftModel = {
        ...DEFAULT_DRIFT_MODEL,
        drift: { outside: -1, middle: 0, inside: 2.5 }
      };
      expect(driftForStance(5, model)).toBe(-1);
      expect(driftForStance(20, model)).toBe(0);
      expect(driftForStance(30, model)).toBe(2.5);
    });
  });

  describe("deriveLaydown parity with the old single-offset formula", () => {
    it("matches stance - 6 exactly (drift = 0) across a full sweep, incl. clamp boundaries", () => {
      for (let s2 = 2; s2 <= 78; s2++) {
        const stance = s2 / 2; // 1..39 in 0.5 steps
        expect(deriveLaydown(stance, DEFAULT_DRIFT_MODEL)).toBe(oldDeriveLaydown(stance, 6));
      }
      // explicit clamp-boundary checks
      expect(deriveLaydown(1, DEFAULT_DRIFT_MODEL)).toBe(oldDeriveLaydown(1, 6));
      expect(deriveLaydown(39, DEFAULT_DRIFT_MODEL)).toBe(oldDeriveLaydown(39, 6));
    });
  });

  describe("deriveSlide / deriveLaydown with non-zero drift", () => {
    it("subtracts zone drift for slide, then release offset for laydown", () => {
      const model: DriftModel = {
        v: 1,
        release_offset: 6,
        outside_max: 14,
        inside_min: 25,
        drift: { outside: 2, middle: 0, inside: -3 }
      };
      // outside zone: stance 10 -> slide = 10 - 2 = 8; laydown = 8 - 6 = 2
      expect(deriveSlide(10, model)).toBe(8);
      expect(deriveLaydown(10, model)).toBe(2);
      // middle zone: stance 20 -> slide = 20 - 0 = 20; laydown = 14
      expect(deriveSlide(20, model)).toBe(20);
      expect(deriveLaydown(20, model)).toBe(14);
      // inside zone: stance 30 -> slide = 30 - (-3) = 33; laydown = 27
      expect(deriveSlide(30, model)).toBe(33);
      expect(deriveLaydown(30, model)).toBe(27);
    });

    it("clamps slide and laydown to [1, 39] when drift pushes past the edges", () => {
      const model: DriftModel = {
        v: 1,
        release_offset: 6,
        outside_max: 14,
        inside_min: 25,
        drift: { outside: -20, middle: 0, inside: 20 }
      };
      // outside stance 2 -> slide = 2 - (-20) = 22 -> fine, but push further
      expect(deriveSlide(1, model)).toBe(21); // 1 - (-20) = 21
      // inside stance 39 -> slide = 39 - 20 = 19, laydown = 13 (still in range)
      // push to clamp: inside stance 39 with huge drift
      const model2: DriftModel = { ...model, drift: { outside: 0, middle: 0, inside: 100 } };
      expect(deriveSlide(39, model2)).toBe(1); // clamped
      expect(deriveLaydown(39, model2)).toBe(1); // clamped
      const model3: DriftModel = { ...model, drift: { outside: -100, middle: 0, inside: 0 } };
      expect(deriveSlide(1, model3)).toBe(39); // clamped
    });

    it("snaps to half-boards", () => {
      const model: DriftModel = {
        v: 1,
        release_offset: 6,
        outside_max: 14,
        inside_min: 25,
        drift: { outside: 0.3, middle: 0, inside: 0 }
      };
      // stance 10, drift 0.3 -> slide raw 9.7 -> snapped to nearest half-board = 9.5
      expect(deriveSlide(10, model)).toBe(9.5);
    });
  });

  describe("parseDriftModel", () => {
    it("round-trips a valid model through serialize/parse", () => {
      const model: DriftModel = {
        v: 1,
        release_offset: 4.5,
        outside_max: 12,
        inside_min: 28,
        drift: { outside: 1, middle: -1, inside: 2 }
      };
      expect(parseDriftModel(serializeDriftModel(model))).toEqual(model);
    });

    it("returns null for garbage JSON", () => {
      expect(parseDriftModel("not json")).toBeNull();
      expect(parseDriftModel(undefined)).toBeNull();
      expect(parseDriftModel("")).toBeNull();
    });

    it("returns null for valid JSON with wrong shape", () => {
      expect(parseDriftModel(JSON.stringify({ v: 1 }))).toBeNull();
      expect(parseDriftModel(JSON.stringify({ ...DEFAULT_DRIFT_MODEL, v: 2 }))).toBeNull();
      expect(
        parseDriftModel(JSON.stringify({ ...DEFAULT_DRIFT_MODEL, release_offset: "6" }))
      ).toBeNull();
      expect(
        parseDriftModel(JSON.stringify({ ...DEFAULT_DRIFT_MODEL, drift: { outside: 0 } }))
      ).toBeNull();
    });

    it("returns null when release_offset is out of [0, 15]", () => {
      expect(
        parseDriftModel(JSON.stringify({ ...DEFAULT_DRIFT_MODEL, release_offset: -1 }))
      ).toBeNull();
      expect(
        parseDriftModel(JSON.stringify({ ...DEFAULT_DRIFT_MODEL, release_offset: 16 }))
      ).toBeNull();
    });

    it("returns null when outside_max >= inside_min (zone-ordering invariant)", () => {
      expect(
        parseDriftModel(
          JSON.stringify({ ...DEFAULT_DRIFT_MODEL, outside_max: 25, inside_min: 25 })
        )
      ).toBeNull();
      expect(
        parseDriftModel(
          JSON.stringify({ ...DEFAULT_DRIFT_MODEL, outside_max: 30, inside_min: 25 })
        )
      ).toBeNull();
    });
  });

  describe("migrateLegacyLaydownOffset", () => {
    it("carries a valid legacy value into release_offset", () => {
      expect(migrateLegacyLaydownOffset("6")).toEqual({
        ...DEFAULT_DRIFT_MODEL,
        release_offset: 6
      });
    });

    it("defaults when undefined", () => {
      expect(migrateLegacyLaydownOffset(undefined)).toEqual(DEFAULT_DRIFT_MODEL);
    });

    it("falls back to the default release_offset for out-of-range or non-numeric strings", () => {
      expect(migrateLegacyLaydownOffset("999")).toEqual(DEFAULT_DRIFT_MODEL);
      expect(migrateLegacyLaydownOffset("-5")).toEqual(DEFAULT_DRIFT_MODEL);
      expect(migrateLegacyLaydownOffset("abc")).toEqual(DEFAULT_DRIFT_MODEL);
    });
  });
});
