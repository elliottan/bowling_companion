export type PinNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface Session {
  id?: number;
  date: string;
  alley_name: string;
  oil_pattern?: string;
  general_notes?: string;
}

export interface Game {
  id?: number;
  session_id: number;
  game_number: number;
  lane_number?: string;
  final_score?: number;
}

export interface Frame {
  id?: number;
  game_id: number;
  frame_number: number;
  shot_1_pins_standing: PinNumber[];
  shot_2_pins_standing?: PinNumber[];
  shot_3_pins_standing?: PinNumber[];
  is_strike: boolean;
  is_spare: boolean;
  shot_1_notes?: string;
  shot_2_notes?: string;
}

export interface SessionSummary {
  session: Session;
  games: Array<Game & { frames: Frame[] }>;
}

export interface BowlingBackup {
  app: "bowling-companion";
  version: 1;
  exported_at: string;
  tables: {
    sessions: Session[];
    games: Game[];
    frames: Frame[];
  };
}
