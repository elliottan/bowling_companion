import type { AppSetting, Ball, BowlingBackup, Frame, Game, LaneNote, OilPattern, PinNumber, Session, SpareLine } from "../types/bowling";

const PIN_NUMBERS = new Set<PinNumber>([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

export interface BackupValidationResult {
  isValid: boolean;
  errors: string[];
  backup?: BowlingBackup;
}

export function validateBackup(value: unknown): BackupValidationResult {
  const errors: string[] = [];

  if (!isRecord(value)) {
    return { isValid: false, errors: ["Backup must be a JSON object."] };
  }

  // The stored value is the original codename and stays that way for ever: it
  // is what every backup already exported carries (see BowlingBackup.app). The
  // message says Headpin because the reader has never heard the other name.
  if (value.app !== "bowling-companion") {
    errors.push("That file is not a Headpin backup.");
  }

  if (value.version !== 1 && value.version !== 2 && value.version !== 3) {
    // A number above the newest version is a backup from a build this app has
    // not caught up with, so the way out is an update, not a different file.
    errors.push(
      typeof value.version === "number" && value.version > 3
        ? "This backup was made by a newer Headpin. Update the app, then try again."
        : "Backup version must be 1, 2, or 3."
    );
  }

  if (typeof value.exported_at !== "string" || value.exported_at.length === 0) {
    errors.push("Backup exported_at must be a string.");
  }

  if (!isRecord(value.tables)) {
    errors.push("Backup tables must be an object.");
  } else {
    validateArray(value.tables.sessions, "sessions", errors, validateSession);
    validateArray(value.tables.games, "games", errors, validateGame);
    validateArray(value.tables.frames, "frames", errors, validateFrame);
    validateArray(value.tables.balls ?? [], "balls", errors, validateBall);
    validateArray(value.tables.oil_patterns ?? [], "oil_patterns", errors, validateOilPattern);
    validateArray(value.tables.spare_lines ?? [], "spare_lines", errors, validateSpareLine);
    validateArray(value.tables.lane_notes ?? [], "lane_notes", errors, validateLaneNote);
    validateArray(value.tables.settings ?? [], "settings", errors, validateSetting);
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    errors: [],
    backup: value as unknown as BowlingBackup
  };
}

function validateArray<T>(
  value: unknown,
  name: string,
  errors: string[],
  validator: (value: unknown, index: number) => value is T
) {
  if (!Array.isArray(value)) {
    errors.push(`Backup table ${name} must be an array.`);
    return;
  }

  value.forEach((item, index) => {
    if (!validator(item, index)) {
      errors.push(`Backup table ${name} has an invalid record at index ${index}.`);
    }
  });
}

function validateSession(value: unknown): value is Session {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isOptionalNumber(value.id) &&
    typeof value.date === "string" &&
    value.date.length > 0 &&
    typeof value.alley_name === "string" &&
    value.alley_name.length > 0 &&
    // Pre-ADR-037 files carry the pattern name inline; import links it to a
    // pattern row rather than rejecting the file.
    isOptionalString(value.oil_pattern) &&
    isOptionalString(value.general_notes)
  );
}

function validateGame(value: unknown): value is Game {
  if (!isRecord(value)) return false;

  const finalScoreOk =
    value.final_score === undefined ||
    (typeof value.final_score === "number" &&
      value.final_score >= 0 &&
      value.final_score <= 300);

  return (
    isOptionalNumber(value.id) &&
    typeof value.session_id === "number" &&
    typeof value.game_number === "number" &&
    value.game_number > 0 &&
    value.game_number <= 99 &&
    isOptionalString(value.lane_number) &&
    isOptionalString(value.notes) &&
    finalScoreOk
  );
}

function validateFrame(value: unknown): value is Frame {
  if (!isRecord(value)) {
    return false;
  }

  const hasV2Shots = Array.isArray(value.shots) && value.shots.length >= 1 && value.shots.every(validateShot);
  const hasV1Flat = typeof value.shot_1_pins_standing !== "undefined"; // v1 format

  return (
    isOptionalNumber(value.id) &&
    typeof value.game_id === "number" &&
    typeof value.frame_number === "number" &&
    value.frame_number >= 1 &&
    value.frame_number <= 10 &&
    typeof value.is_strike === "boolean" &&
    typeof value.is_spare === "boolean" &&
    (hasV2Shots || hasV1Flat)
  );
}

function validateShot(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return validatePins(value.pins_standing);
}

function validatePins(value: unknown): value is PinNumber[] {
  return (
    Array.isArray(value) &&
    value.every((pin) => typeof pin === "number" && PIN_NUMBERS.has(pin as PinNumber)) &&
    new Set(value).size === value.length
  );
}

function validateBall(value: unknown): value is Ball {
  if (!isRecord(value)) return false;
  return (
    isOptionalNumber(value.id) &&
    typeof value.name === "string" && value.name.length > 0 &&
    typeof value.is_spare_ball === "boolean" &&
    isOptionalString(value.layout) &&
    isOptionalString(value.notes)
  );
}

function validateOilPattern(value: unknown): value is OilPattern {
  if (!isRecord(value)) return false;
  return (
    isOptionalNumber(value.id) &&
    typeof value.name === "string" && value.name.length > 0 &&
    isHttpUrlOrAbsent(value.url) &&
    (value.archived === undefined || typeof value.archived === "boolean")
  );
}

/** The URL is rendered as a link, so a backup file must not smuggle in a
 *  `javascript:` or `data:` scheme. */
function isHttpUrlOrAbsent(value: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value !== "string") return false;
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function validateSpareLine(value: unknown): value is SpareLine {
  if (!isRecord(value)) return false;
  return (
    isOptionalNumber(value.id) &&
    validatePins(value.pins)
  );
}

function validateLaneNote(value: unknown): value is LaneNote {
  if (!isRecord(value)) return false;
  return (
    isOptionalNumber(value.id) &&
    typeof value.alley === "string" && value.alley.length > 0 &&
    typeof value.lane === "string" && value.lane.length > 0 &&
    typeof value.notes === "string"
  );
}

function validateSetting(value: unknown): value is AppSetting {
  if (!isRecord(value)) return false;
  return (
    typeof value.key === "string" && value.key.length > 0 &&
    typeof value.value === "string"
  );
}

function isOptionalNumber(value: unknown) {
  return value === undefined || typeof value === "number";
}

function isOptionalString(value: unknown) {
  return value === undefined || typeof value === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
