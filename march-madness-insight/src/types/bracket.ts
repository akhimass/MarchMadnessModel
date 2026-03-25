export interface Team {
  id: number;
  name: string;
  nickname: string;
  abbreviation: string;
  seed: number;
  region: 'East' | 'West' | 'South' | 'Midwest';
  record: string;
  conference: string;
  logoUrl?: string;
  color: string;
}

export interface TeamStats {
  netEff: number;
  offEff: number;
  defEff: number;
  efgOff: number;
  efgDef: number;
  toRate: number;
  orRate: number;
  ftRate: number;
  masseyRank: number;
  svi: number;
  sviClass: 'True Contender' | 'Statistically Stable' | 'Elevated Risk' | 'Critical Risk';
  /** National rank by net efficiency (among teams in model). */
  netEffRank?: number;
  /** Raw Massey composite rating. */
  masseyRating?: number;
  elo?: number;
  pace?: number;
  toRateDef?: number;
  drRate?: number;
  astRate?: number;
  blkRate?: number;
  stlRate?: number;
  threePRate?: number;
  threePARate?: number;
}

export interface InjuryImpact {
  adjustment: number;
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical';
  keyPlayerOut: string | null;
  reasoning: string;
}

export interface RecencyUpdate {
  description: string;
  impact: number;
}

export interface ModelBreakdown {
  decision_tree: number;
  power_ratings: number;
  similar_games: number;
  simulation: number;
  seed_difference: number;
  ensemble: number;
}

export interface MatchupPrediction {
  team1: Team;
  team2: Team;
  standardProb: number;
  chaosProb: number;
  modelBreakdown: ModelBreakdown;
  upsetAlert: boolean;
  giantKillerScore: number;
  team1Stats: TeamStats;
  team2Stats: TeamStats;
  team1Narrative: string;
  team2Narrative: string;
  injuryImpact?: InjuryImpact;
  recencyUpdate?: RecencyUpdate;
  /** Massey ordinal national ranks from `/api/matchup` when MMasseyOrdinals data is loaded. */
  ordinalRanks?: Record<string, { team1: number; team2: number }>;
  /** True when ensemble is not loaded — probabilities are seed/heuristic only. */
  degraded?: boolean;
}

export interface BracketMatchup {
  id: string;
  // Slot token in the bracket graph (e.g. "R1W1"). Used for true progression from picks.
  slot: string;
  team1: Team;
  team2: Team;
  prob: number;
  upsetFlag: boolean;
  gameTime?: string;
}

export type UserPick = Record<string, number>;

export interface PowerRanking {
  label: string;
  rank: number;
}

export interface OffensiveStat {
  label: string;
  value: string;
  rank: number;
}
