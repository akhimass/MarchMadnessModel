import type { LiveGame } from "@/lib/espnApi";
import { inferMenScoreboardRound, type ScoreboardRoundKey } from "@/data/ncaa2026MenMatchupRounds";
import { DATE_TO_ROUND, parseEspnDateToYyyymmdd } from "@/lib/tournamentRounds";

const MEN_KEY_TO_LABEL: Record<ScoreboardRoundKey, string> = {
  FF: "First Four",
  R64: "R64",
  R32: "R32",
  S16: "S16",
  E8: "E8",
  F4: "F4",
  CHAMP: "CHAMP",
};

/**
 * Classify a completed/live game for results sync and analytics.
 * Men's: matchup identity from `ncaa2026MenMatchupRounds` (plus E8/F4/CHAMP date fallback).
 * Women's: calendar date in ET vs `DATE_TO_ROUND`.
 */
export function classifyRoundFromGame(game: LiveGame, gender: "M" | "W"): string {
  if (gender === "M") {
    const r = inferMenScoreboardRound(game);
    if (r) return MEN_KEY_TO_LABEL[r];
    return "Unknown";
  }
  const ymd = parseEspnDateToYyyymmdd(game.date);
  if (ymd.length !== 8) return "Unknown";
  const key = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
  return DATE_TO_ROUND[key] ?? "Unknown";
}
