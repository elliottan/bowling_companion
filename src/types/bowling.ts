export type PinNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface LineSpec {
  stance?: number;
  /** Slide-foot board at the foul line. The Actual line's foul-line input
   *  (ADR-032): observed directly, so it skips the stance→slide drift step and
   *  feeds `laydown = slide − release_offset`. Intended lines use `stance`. */
  slide?: number;
  laydown?: number;
  target?: number;
  /** Apex board, furthest point the ball reaches before recovering. Derived from
   *  the strike curve (the rail's furthest-out point); stored so it equals the
   *  drawn apex (ADR-024). A non-null value also flags a line as a strike line. */
  breakpoint?: number;
  /** Down-lane distance (feet) of the breakpoint apex. On a strike line this is the
   *  rail parameter: it drives how far down-lane the hook apex sits (ADR-024). */
  breakpoint_distance?: number;
  /** Spare hook start: down-lane distance (feet) where the straight skid ends and
   *  the hook begins. Defaults to HOOK_START_FT (38 ft). Spare lines only (ADR-024). */
  hook_start_distance?: number;
  /** Spare hook length: how many feet the hook phase spans before the straight roll.
   *  Defaults to HOOK_LENGTH_FT (14 ft). Spare lines only (ADR-024). */
  hook_length?: number;
  /** Board the ball crosses the pin deck on (60 ft). Defaults to the pocket (17.5). */
  final_board?: number;
  /** Down-lane distance (feet) of the final point. Defaults to 60 ft (head pin).
   *  Spare aim points sit deeper (back-row pins ~62.6 ft). */
  final_distance?: number;
}

export interface ShotMetadata {
  ball_id?: number;
  /** Pocket verdict for a fresh-rack first ball (ADR-046). Written at entry
   *  from the inference the bowler saw and could flip. Undefined means no
   *  verdict was ever recorded (pre-toggle history, imports), so read paths
   *  infer it from the leave instead. */
  pocket_hit?: boolean;
  /** The ball crossed the foul line (ADR-089). Pinfall is zero and the shot
   *  reads F on the card; the pins it carries are the ones left standing, which
   *  after a foul is everything that was available. */
  foul?: boolean;
  intended?: LineSpec;
  actual?: LineSpec;
  notes?: string;
}

export interface Shot {
  pins_standing: PinNumber[];
  ball_id?: number;
  /** See ShotMetadata.pocket_hit (ADR-046). */
  pocket_hit?: boolean;
  /** See ShotMetadata.foul (ADR-089). */
  foul?: boolean;
  intended?: LineSpec;
  actual?: LineSpec;
  notes?: string;
}

export interface BallCatalogSnapshot {
  brand: string;
  name: string;
  coverstockCategory: string | null;
  coreName: string | null;
  rg: number | null;
  diff: number | null;
  mbDiff: number | null;
  imageThumb: string | null;
}

/**
 * The two ways the same drilling is written: the Dual Angle Layout Technique
 * (drilling angle x pin to PAP x VAL angle) and Storm's VLS (pin to PAP x PSA
 * to PAP x pin buffer). One is a choice of notation, never a different layout,
 * which is why a ball stores which one it is read in rather than which numbers
 * it keeps.
 */
export type LayoutSystem = "dual" | "vls";

/**
 * A ball's drilling, stored the one way that cannot drift.
 *
 * The numbers are always the dual angle three, because that is the notation the
 * geometry in `lib/ballLayout.ts` is written in and every other notation is a
 * pure function of it plus the ball's own pin-to-PSA distance. Storing VLS
 * alongside would be storing the same fact twice, and two copies of one fact
 * are two chances to disagree.
 *
 * `symmetric` and `pinToCore` are part of the layout rather than of the ball's
 * catalog entry, because they are what the conversion needs and a hand-entered
 * ball has no catalog entry to ask. The same three numbers on two balls with
 * different pin-to-PSA distances are two different VLS layouts (ADR-095).
 */
export interface BallLayoutSpec {
  /** Degrees, vertex at the pin. */
  drillingAngle: number;
  /** Inches along the ball surface. */
  pinToPap: number;
  /** Degrees, vertex at the PAP. */
  valAngle: number;
  symmetric: boolean;
  /** Pin to core marker distance in inches, the ball's own number. */
  pinToCore: number;
  /** Which notation this ball is read in. Unset means "whatever the app-wide
   *  preference says", so changing that preference moves every ball that never
   *  asked for anything else. */
  system?: LayoutSystem;
}

export interface Ball {
  id?: number;
  name: string;
  is_spare_ball: boolean;
  /** The drilling as numbers. Absent on a ball drilled before the arsenal could
   *  hold them, and on one whose layout nobody has entered. */
  layout_spec?: BallLayoutSpec;
  /** The free text layout this screen used to take, kept so a ball entered
   *  before `layout_spec` existed still shows what was typed (ADR-095). Nothing
   *  writes it any more. */
  layout?: string;
  notes?: string;
  sort_order?: number;
  catalog_ref_id?: string;
  catalog_snapshot?: BallCatalogSnapshot;
  weight?: number;
  colorway_sku?: string;   // chosen colorway from the catalog ball's colorways[]
}

export interface OilPattern {
  id?: number;
  name: string;
  /** Link to the pattern sheet, usually a PDF. http/https only. */
  url?: string;
  /** Archived patterns stay resolvable for history but are not offered for new sessions. */
  archived?: boolean;
}

export interface SpareLine {
  id?: number;
  pins: PinNumber[];
  /** The absolute line, as thrown with a spare ball: real boards. */
  line?: LineSpec;
  /** How far to move off a strike ball's OWN strike line to shoot this leave
   *  with it, in signed boards (ADR-053). Kept as a move rather than boards
   *  because the answer is "two right of wherever you are playing", which
   *  stays true as the lane changes and follows you across strike balls.
   *  Either field may stand alone: some leaves move the feet only. */
  strike_offset?: { stance?: number; target?: number };
  notes?: string;
  sort_order?: number;
}

export interface Session {
  id?: number;
  date: string;
  alley_name: string;
  description?: string;
  oil_pattern_id?: number;
  general_notes?: string;
}

/**
 * A session as read back for display (ADR-037). `oil_patterns` is the sole
 * source of truth for the name, so read paths resolve `oil_pattern_id` and
 * attach the pattern here rather than the DB storing a copy of the name.
 */
export interface HydratedSession extends Session {
  oil_pattern?: string;
  oil_pattern_url?: string;
}

export interface Game {
  id?: number;
  session_id: number;
  game_number: number;
  lane_number?: string;       // legacy single-lane display (back-compat)
  lanes?: string[];           // 1 or 2 lanes for this game
  start_lane?: string;        // which of `lanes` frame 1 is bowled on
  final_score?: number;
  notes?: string;
}

export interface LaneNote {
  id?: number;
  alley: string;
  lane: string;
  notes: string;
}

export type Handedness = "right" | "left";

/**
 * How the bowler holds the ball: one hand with a thumb, or two-handed with the
 * thumb out.
 *
 * A preference rather than a field on a ball, for the same reason the PAP is
 * one: it belongs to the bowler and every ball they own is drilled for it. It
 * is stored, and carried in a shared layout, from the phase that added the
 * toggle; what a two-handed grip does to the layout geometry and the motion
 * reading is deliberately left to the phase after it, so nothing here pretends
 * to a calculation it has not made yet.
 */
export type GripStyle = "1h" | "2h";

/** Key-value app preferences (e.g. handedness). One row per key. */
export interface AppSetting {
  key: string;
  value: string;
}

export interface Frame {
  id?: number;
  game_id: number;
  frame_number: number;
  shots: Shot[];        // index = shot order: 0=shot1, 1=shot2, 2=shot3
  is_strike: boolean;   // computed
  is_spare: boolean;    // computed
}

export interface SessionSummary {
  session: HydratedSession;
  games: Array<Game & { frames: Frame[] }>;
}

export interface BowlingBackup {
  /**
   * Format identifier, NOT a display name. It stays `bowling-companion` after
   * the rename to Headpin on purpose: every backup ever exported carries this
   * string, `backupValidation` rejects a file without it, and changing it
   * would make every existing backup un-importable. The app was renamed; the
   * file format was not.
   */
  app: "bowling-companion";
  version: 1 | 2 | 3;
  exported_at: string;
  tables: {
    sessions: Session[];
    games: Game[];
    frames: Frame[];
    balls?: Ball[];
    oil_patterns?: OilPattern[];
    spare_lines?: SpareLine[];
    lane_notes?: LaneNote[];
    settings?: AppSetting[];
  };
}
