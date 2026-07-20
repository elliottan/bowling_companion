/** Bowler drift model (ADR-030): splits the old single `laydown_offset`
 *  constant into two physically distinct concepts.
 *
 *    slide   = stance − drift(stance)     // drift varies by stance zone
 *    laydown = slide − release_offset     // constant per bowler
 *
 *  `drift(stance)` is looked up from one of three hard zones — outside,
 *  middle, inside — classified by the stance board. Board numbers are
 *  hand-relative everywhere in this app (ADR-028), so the same numeric zone
 *  boundaries and the same subtraction work for both left- and right-handed
 *  bowlers without any hand-mirroring logic.
 *
 *  Positive drift/offset values subtract toward lower board numbers, matching
 *  the pre-existing `stance − offset` direction (ADR-028). Out of the box
 *  (all drift = 0), `deriveLaydown` is bit-identical to the old
 *  `stance − laydown_offset` formula — this is a strict requirement, see the
 *  parity sweep in `driftModel.test.ts`. */

import type { Handedness } from "../types/bowling";

export interface DriftModel {
  v: 1;
  /** Boards between the slide foot and where the ball touches down. 0–15, half-board steps. */
  release_offset: number;
  /** stance <= outside_max -> "outside" zone. */
  outside_max: number;
  /** stance >= inside_min -> "inside" zone. Must be > outside_max. */
  inside_min: number;
  /** Boards of drift per zone (stance -> slide). Can be negative. */
  drift: { outside: number; middle: number; inside: number };
}

export const DEFAULT_DRIFT_MODEL: DriftModel = {
  v: 1,
  release_offset: 6,
  outside_max: 14,
  inside_min: 25,
  drift: { outside: 0, middle: 0, inside: 0 }
};

const clampBoard = (b: number): number => Math.max(1, Math.min(39, Math.round(b * 2) / 2));

/** Which drift zone a stance board falls in. */
export function zoneForStance(stance: number, model: DriftModel): "outside" | "middle" | "inside" {
  if (stance <= model.outside_max) return "outside";
  if (stance >= model.inside_min) return "inside";
  return "middle";
}

/** The configured drift (boards) for a stance's zone. */
export function driftForStance(stance: number, model: DriftModel): number {
  return model.drift[zoneForStance(stance, model)];
}

/** Which way, physically, a signed drift value moves the slide foot.
 *
 *  Positive drift subtracts toward *lower* board numbers. Boards are
 *  hand-relative (ADR-028): board 1 is the right edge for a right-hander and
 *  the left edge for a left-hander. So a positive drift walks a right-hander
 *  right and a left-hander left — the sign is the same, the direction mirrors.
 *  The settings UI shows this word instead of a bare +/− number. */
export function driftDirection(drift: number, hand: Handedness): "left" | "right" | "none" {
  if (drift === 0) return "none";
  const towardLowBoards = drift > 0;
  const lowBoardsAreRight = hand === "right";
  return towardLowBoards === lowBoardsAreRight ? "right" : "left";
}

/** Derived slide-foot board for a stance, snapped to half-boards on the lane. */
export function deriveSlide(stance: number, model: DriftModel): number {
  return clampBoard(stance - driftForStance(stance, model));
}

/** Derived laydown board for a stance, snapped to half-boards on the lane. */
export function deriveLaydown(stance: number, model: DriftModel): number {
  return clampBoard(deriveSlide(stance, model) - model.release_offset);
}

/** Inverse of deriveLaydown: the stance that produces a given laydown. Each
 *  zone's drift is a flat constant, so within a zone the transform inverts
 *  exactly (stance = laydown + release_offset + drift[zone]) — but the zone
 *  boundaries are defined in stance-space, so we try each zone's candidate
 *  and keep the one that's self-consistent (falls back in the zone that
 *  produced it). Tries outside/inside before middle, matching zoneForStance's
 *  own boundary bias. Falls back to the middle-zone candidate if no zone is
 *  self-consistent (an unusual drift config with gaps/overlaps at the seams). */
export function deriveStanceFromLaydown(laydown: number, model: DriftModel): number {
  for (const zone of ["outside", "inside", "middle"] as const) {
    const candidate = clampBoard(laydown + model.release_offset + model.drift[zone]);
    if (zoneForStance(candidate, model) === zone) return candidate;
  }
  return clampBoard(laydown + model.release_offset + model.drift.middle);
}

/** Parse + validate a stored drift model. Returns null on any parse error or
 *  invariant violation (never throws) — the caller falls back to
 *  DEFAULT_DRIFT_MODEL or the legacy migration path. */
export function parseDriftModel(raw: string | undefined): DriftModel | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const m = parsed as Partial<DriftModel>;
  if (m.v !== 1) return null;
  if (typeof m.release_offset !== "number" || !Number.isFinite(m.release_offset)) return null;
  if (m.release_offset < 0 || m.release_offset > 15) return null;
  if (typeof m.outside_max !== "number" || !Number.isFinite(m.outside_max)) return null;
  if (typeof m.inside_min !== "number" || !Number.isFinite(m.inside_min)) return null;
  if (m.outside_max < 1 || m.outside_max > 39) return null;
  if (m.inside_min < 1 || m.inside_min > 39) return null;
  if (m.outside_max >= m.inside_min) return null;
  if (typeof m.drift !== "object" || m.drift === null) return null;
  const { outside, middle, inside } = m.drift as Partial<DriftModel["drift"]>;
  if (
    typeof outside !== "number" || !Number.isFinite(outside) ||
    typeof middle !== "number" || !Number.isFinite(middle) ||
    typeof inside !== "number" || !Number.isFinite(inside)
  ) {
    return null;
  }
  return {
    v: 1,
    release_offset: m.release_offset,
    outside_max: m.outside_max,
    inside_min: m.inside_min,
    drift: { outside, middle, inside }
  };
}

/** Migrate the old single `laydown_offset` setting into a DriftModel, mirroring
 *  the old `getLaydownOffset()`'s clamping exactly. Never throws. */
export function migrateLegacyLaydownOffset(raw: string | undefined): DriftModel {
  const v = Number(raw);
  const release_offset = Number.isFinite(v) && v >= 0 && v <= 15 ? v : DEFAULT_DRIFT_MODEL.release_offset;
  return { ...DEFAULT_DRIFT_MODEL, release_offset };
}

export function serializeDriftModel(model: DriftModel): string {
  return JSON.stringify(model);
}
