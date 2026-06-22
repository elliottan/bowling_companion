export type PinNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface LineSpec {
  stance?: number;
  laydown?: number;
  target?: number;
  breakpoint?: number;
  /** Down-lane distance (feet from foul line) where the ball reaches the
   *  breakpoint board. Used to draw the hook. Defaults to 42 ft when unset. */
  breakpoint_distance?: number;
}

export interface ShotMetadata {
  ball_id?: number;
  intended?: LineSpec;
  actual?: LineSpec;
  notes?: string;
}

export interface Shot {
  pins_standing: PinNumber[];
  ball_id?: number;
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

export interface Ball {
  id?: number;
  name: string;
  is_spare_ball: boolean;
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
}

export interface SpareLine {
  id?: number;
  pins: PinNumber[];
  line?: LineSpec;
  notes?: string;
  sort_order?: number;
}

export interface Session {
  id?: number;
  date: string;
  alley_name: string;
  description?: string;
  oil_pattern?: string;
  oil_pattern_id?: number;
  general_notes?: string;
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
  session: Session;
  games: Array<Game & { frames: Frame[] }>;
}

export interface BowlingBackup {
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
