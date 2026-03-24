/**
 * JSON shapes from `/api/bracket/round-matchups` and related bracket endpoints.
 */
export interface ApiBracketTeamRow {
  teamId?: number;
  teamName?: string;
  seed?: number;
  region?: string;
}

export interface ApiBracketMatchupRow {
  id?: string | number;
  slot?: string;
  team1?: ApiBracketTeamRow;
  team2?: ApiBracketTeamRow;
  prob?: number;
  upsetFlag?: boolean;
  gameTime?: string;
}

export interface RoundMatchupsApiResponse {
  matchups?: ApiBracketMatchupRow[];
}
