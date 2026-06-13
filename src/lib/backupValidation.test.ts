import { describe, expect, it } from "vitest";
import { validateBackup } from "./backupValidation";
import type { BowlingBackup } from "../types/bowling";

const validBackup: BowlingBackup = {
  app: "bowling-companion",
  version: 1,
  exported_at: "2026-05-27T00:00:00.000Z",
  tables: {
    sessions: [{ id: 1, date: "2026-05-27", alley_name: "Test Lanes" }],
    games: [{ id: 1, session_id: 1, game_number: 1, lane_number: "4" }],
    frames: [
      {
        id: 1,
        game_id: 1,
        frame_number: 1,
        shots: [{ pins_standing: [] }],
        is_strike: true,
        is_spare: false
      }
    ]
  }
};

describe("validateBackup", () => {
  it("accepts a valid backup payload", () => {
    expect(validateBackup(validBackup).isValid).toBe(true);
  });

  it("rejects malformed app metadata", () => {
    const result = validateBackup({ ...validBackup, app: "other-app" });

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain("Backup app must be bowling-companion.");
  });

  it("rejects invalid pin arrays", () => {
    const result = validateBackup({
      ...validBackup,
      tables: {
        ...validBackup.tables,
        frames: [
          {
            ...validBackup.tables.frames[0],
            shots: [{ pins_standing: [1, 1, 12] }]
          }
        ]
      }
    });

    expect(result.isValid).toBe(false);
    expect(result.errors[0]).toContain("frames");
  });
});
