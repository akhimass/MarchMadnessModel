import type { OddsGame } from "@/lib/oddsApi";

export interface BetSlipItem {
  id: string;
  teamName: string;
  teamId: number;
  opponentId: number;
  opponentName: string;
  americanOdds: number;
  stake: number;
  ourProb: number;
  impliedProb: number;
  edge: number;
  ev: number;
  adjustedProb?: number;
  stakeBand?: "low" | "medium" | "high";
  game: OddsGame;
  /** Inferred NCAA tournament round label for bankroll planning */
  round?: string;
}

export type BetSortKey = "edge" | "time" | "round";

export type KellyStrategy = "conservative" | "moderate" | "aggressive" | "flat";
