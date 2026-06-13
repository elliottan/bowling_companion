export type PinNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface LineSpec {
  stance: number;
  target: number;
  breakpoint: number;
}

export interface Shot {
  pins_standing: PinNumber[];
  ball_id?: number;
  intended?: LineSpec;
  actual?: LineSpec;
  notes?: string;
}

export interface Ball {
  id?: number;
  name: string;
  is_spare_ball: boolean;
  layout?: string;
  notes?: string;
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
}

export interface Session {
  id?: number;
  date: string;
  alley_name: string;
  oil_pattern?: string;
  oil_pattern_id?: number;
  general_notes?: string;
}

export interface Game {
  id?: number;
  session_id: number;
  game_number: number;
  lane_number?: string;
  final_score?: number;
  notes?: string;
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
  version: 1 | 2;
  exported_at: string;
  tables: {
    sessions: Session[];
    games: Game[];
    frames: Frame[];
    balls?: Ball[];
    oil_patterns?: OilPattern[];
    spare_lines?: SpareLine[];
  };
}
