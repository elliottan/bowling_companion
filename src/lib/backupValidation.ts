import type { BowlingBackup, Frame, Game, PinNumber, Session } from "../types/bowling";

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

  if (value.app !== "bowling-companion") {
    errors.push("Backup app must be bowling-companion.");
  }

  if (value.version !== 1) {
    errors.push("Backup version must be 1.");
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

  return (
    isOptionalNumber(value.id) &&
    typeof value.game_id === "number" &&
    typeof value.frame_number === "number" &&
    value.frame_number >= 1 &&
    value.frame_number <= 10 &&
    typeof value.is_strike === "boolean" &&
    typeof value.is_spare === "boolean" &&
    Array.isArray(value.shots) &&
    value.shots.every(validateShot)
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

function isOptionalNumber(value: unknown) {
  return value === undefined || typeof value === "number";
}

function isOptionalString(value: unknown) {
  return value === undefined || typeof value === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
