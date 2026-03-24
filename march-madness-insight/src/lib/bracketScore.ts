import type { ApiBracketMatchupRow } from "@/lib/bracketApiTypes";
import type { TournamentResultRow } from "@/lib/api";

const ROUND_POINTS: Record<string, number> = {
  R1: 1,
  R2: 2,
  R3: 4,
  R4: 8,
  R5: 16,
  R6: 32,
};

/**
 * Standard bracket game scoring vs completed tournament results.
 * `matchups` should list every slot (R1…R6) with both team ids resolved.
 */
export function scoreBracketAgainstResults(
  picks: Record<string, number>,
  matchups: ApiBracketMatchupRow[],
  results: TournamentResultRow[],
): { correct: number; points: number; total: number } {
  const resultByPair = new Map<string, TournamentResultRow>();
  for (const r of results) {
    const lo = Math.min(r.wTeamId, r.lTeamId);
    const hi = Math.max(r.wTeamId, r.lTeamId);
    resultByPair.set(`${lo}-${hi}`, r);
  }

  let correct = 0;
  let points = 0;

  for (const m of matchups) {
    const slot = String(m.slot ?? "");
    const pick = picks[slot];
    const a = Number(m.team1?.teamId ?? 0);
    const b = Number(m.team2?.teamId ?? 0);
    if (!pick || !a || !b) continue;

    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const res = resultByPair.get(`${lo}-${hi}`);
    if (!res) continue;

    const rp = slot.slice(0, 2);
    if (res.wTeamId === pick) {
      correct++;
      points += ROUND_POINTS[rp] ?? 0;
    }
  }

  return { correct, points, total: Object.keys(picks).length };
}
