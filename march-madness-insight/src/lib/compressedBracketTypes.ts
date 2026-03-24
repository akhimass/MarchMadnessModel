/** Minimal types for ESPN-style compressed bracket (ported from march-arena-reference). */

export type RegionName = "SOUTH" | "EAST" | "WEST" | "MIDWEST";

export interface Team {
  id: number;
  name: string;
  abbreviation: string;
  seed: number;
}

export interface Game {
  id: string;
  status: "scheduled" | "in_progress" | "final";
  team1: Team;
  team2: Team;
  score1?: number;
  score2?: number;
  winner?: 1 | 2;
  statusLabel?: string;
}

export interface CompressedRegionData {
  name: RegionName;
  label: string;
  r64: Game[];
  r32: Game[];
  s16: Game[];
  e8: Game;
}

export interface CompressedBracketModel {
  south: CompressedRegionData;
  west: CompressedRegionData;
  east: CompressedRegionData;
  midwest: CompressedRegionData;
  firstFour: Game[];
  finalFourLeft: Game;
  finalFourRight: Game;
  championship: Game;
  firstFourDate: string;
  finalFourDate: string;
  championshipDate: string;
}

export const TBD_TEAM: Team = {
  id: 0,
  name: "TBD",
  abbreviation: "TBD",
  seed: 0,
};

export function placeholderGame(id: string): Game {
  return { id, status: "scheduled", team1: TBD_TEAM, team2: TBD_TEAM };
}
