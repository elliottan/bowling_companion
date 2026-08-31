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
    expect(result.errors).toContain("That file is not a Headpin backup.");
  });

  it("still accepts the stored identifier under its original name", () => {
    // The rename to Headpin did NOT change the value written into the file,
    // because every backup already exported carries the old one. If this test
    // ever fails, someone has made every existing backup un-importable.
    expect(validateBackup({ ...validBackup, app: "bowling-companion" }).isValid).toBe(true);
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

  it("rejects a payload that is not an object at all", () => {
    const result = validateBackup("[]");

    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual(["Backup must be a JSON object."]);
  });

  it("names every table that is not an array", () => {
    const result = validateBackup({ ...validBackup, tables: { sessions: {}, games: 3, frames: null } });

    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual([
      "Backup table sessions must be an array.",
      "Backup table games must be an array.",
      "Backup table frames must be an array."
    ]);
  });

  it("accepts the optional tables a v1 file leaves out", () => {
    expect(validateBackup({ ...validBackup, tables: { ...validBackup.tables } }).isValid).toBe(true);
  });

  it("accepts the optional tables when they are filled in", () => {
    const result = validateBackup({
      ...validBackup,
      version: 3,
      tables: {
        ...validBackup.tables,
        balls: [{ id: 1, name: "Phaze II", is_spare_ball: false, layout: "45 x 4 x 35" }],
        oil_patterns: [{ id: 1, name: "Main Street", url: "https://kegel.net/main.pdf" }],
        spare_lines: [{ id: 1, pins: [10] }],
        lane_notes: [{ id: 1, alley: "Orchid Bowl", lane: "12", notes: "Tight" }],
        settings: [{ key: "handedness", value: "right" }]
      }
    });

    expect(result.errors).toEqual([]);
    expect(result.isValid).toBe(true);
  });

  // The URL is rendered as a link, so a file that smuggles in a script scheme
  // has to be refused at the door rather than on the click.
  it.each(["javascript:alert(1)", "data:text/html,<script>", "not a url", 12])(
    "rejects an oil pattern URL of %p",
    (url) => {
      const result = validateBackup({
        ...validBackup,
        tables: { ...validBackup.tables, oil_patterns: [{ name: "Bad", url }] }
      });

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain("oil_patterns");
    }
  );

  it("rejects a ball with no name and a lane note with no lane", () => {
    const result = validateBackup({
      ...validBackup,
      tables: {
        ...validBackup.tables,
        balls: [{ name: "", is_spare_ball: false }],
        lane_notes: [{ alley: "Orchid Bowl", lane: "", notes: "" }]
      }
    });

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain("Backup table balls has an invalid record at index 0.");
    expect(result.errors).toContain("Backup table lane_notes has an invalid record at index 0.");
  });

  it("rejects a spare line whose pins repeat, and a setting with no key", () => {
    const result = validateBackup({
      ...validBackup,
      tables: {
        ...validBackup.tables,
        spare_lines: [{ pins: [7, 7] }],
        settings: [{ key: "", value: "x" }]
      }
    });

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain("Backup table spare_lines has an invalid record at index 0.");
    expect(result.errors).toContain("Backup table settings has an invalid record at index 0.");
  });

  it("rejects a version it cannot read", () => {
    const result = validateBackup({ ...validBackup, version: 4 });

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain("Backup version must be 1, 2, or 3.");
  });
});
