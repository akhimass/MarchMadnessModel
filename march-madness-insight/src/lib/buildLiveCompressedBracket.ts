import type { CompressedBracketModel, CompressedRegionData, Game, RegionName, Team } from "@/lib/compressedBracketTypes";
import { placeholderGame, TBD_TEAM } from "@/lib/compressedBracketTypes";

export type LiveMatchupLite = {
  slot?: string;
  team1?: { teamId?: number; teamName?: string; seed?: number };
  team2?: { teamId?: number; teamName?: string; seed?: number };
};

/**
 * Resolve display name / seed / abbr from the published tournament field (not pipeline `seeds_df`).
 * Men's: `teams2026.ts`. Women's: pass a resolver built from `/api/teams/2026?gender=W`.
 */
export type FieldTeamEnricher = (teamId: number) => Pick<Team, "name" | "abbreviation" | "seed"> | null;

function slotWinner(
  row: LiveMatchupLite | undefined,
  winnerByPair: Record<string, number>,
  picksBySlot: Record<string, number>,
): number | undefined {
  if (!row) return undefined;
  const slot = String(row.slot ?? "");
  const bySlot = picksBySlot[slot];
  if (bySlot) return bySlot;
  const a = Number(row.team1?.teamId ?? 0);
  const b = Number(row.team2?.teamId ?? 0);
  if (!a || !b) return undefined;
  return winnerByPair[`${Math.min(a, b)}-${Math.max(a, b)}`];
}

function teamFromLite(
  t: { teamId?: number; teamName?: string; seed?: number } | undefined,
  enrich?: FieldTeamEnricher,
): Team {
  if (!t?.teamId) return TBD_TEAM;
  const id = Number(t.teamId);
  const fromField = enrich?.(id);
  if (fromField) {
    return { id, name: fromField.name, abbreviation: fromField.abbreviation, seed: fromField.seed };
  }
  const name = String(t.teamName ?? "TBD");
  const seed = Number(t.seed ?? 0);
  const parts = name.trim().split(/\s+/);
  const last = parts[parts.length - 1] ?? "";
  const abbreviation = last.replace(/[^a-zA-Z]/g, "").slice(0, 3).toUpperCase() || "TBD";
  return { id, name, abbreviation, seed };
}

function toGame(
  id: string,
  row: LiveMatchupLite | undefined,
  winnerByPair: Record<string, number>,
  picksBySlot: Record<string, number>,
  enrich?: FieldTeamEnricher,
): Game {
  if (!row?.team1 && !row?.team2) return placeholderGame(id);
  const team1 = teamFromLite(row.team1, enrich);
  const team2 = teamFromLite(row.team2, enrich);
  const wid = slotWinner(row, winnerByPair, picksBySlot);
  let winner: 1 | 2 | undefined;
  if (wid != null && team1.id && wid === team1.id) winner = 1;
  else if (wid != null && team2.id && wid === team2.id) winner = 2;
  return {
    id,
    status: winner ? "final" : "scheduled",
    team1,
    team2,
    winner,
  };
}

function buildRegion(
  letter: string,
  prefix: string,
  name: RegionName,
  label: string,
  matchupsBySlot: Record<string, LiveMatchupLite | undefined>,
  winnerByPair: Record<string, number>,
  picksBySlot: Record<string, number>,
  enrich?: FieldTeamEnricher,
): CompressedRegionData {
  // Display order must match bracket pods:
  // R64: [1v16,8v9,5v12,4v13,6v11,3v14,7v10,2v15] -> slot indices [1,8,5,4,6,3,7,2]
  // R32: [pod1 winner,pod2 winner,pod3 winner,pod4 winner] -> [R2x1,R2x4,R2x3,R2x2]
  const r64Order = [1, 8, 5, 4, 6, 3, 7, 2];
  const r32Order = [1, 4, 3, 2];
  const r64 = r64Order.map((slotIndex, i) =>
    toGame(`${prefix}-r64-${i + 1}`, matchupsBySlot[`R1${letter}${slotIndex}`], winnerByPair, picksBySlot, enrich),
  );
  const r32 = r32Order.map((slotIndex, i) =>
    toGame(`${prefix}-r32-${i + 1}`, matchupsBySlot[`R2${letter}${slotIndex}`], winnerByPair, picksBySlot, enrich),
  );
  const s16 = Array.from({ length: 2 }, (_, i) =>
    toGame(`${prefix}-s16-${i + 1}`, matchupsBySlot[`R3${letter}${i + 1}`], winnerByPair, picksBySlot, enrich),
  );
  const e8 = toGame(`${prefix}-e8`, matchupsBySlot[`R4${letter}1`], winnerByPair, picksBySlot, enrich);
  return { name, label, r64, r32, s16, e8 };
}

/**
 * Build the same structure `CompressedBracket` expects, from live API slot keys
 * (R1W1…R6CH) used by `ArenaTemplateBracket`.
 *
 * `winnerByPair`: completed games from `/api/results` keyed `minId-maxId` → winnerId.
 * `picksBySlot`: same winners keyed by bracket slot when known (merged with pair lookup).
 * `enrichFieldTeam`: show seeds/names from the published field (`teams2026`), not pipeline-only seeds.
 */
export function buildCompressedBracketModelFromLive(
  matchupsBySlot: Record<string, LiveMatchupLite | undefined>,
  winnerByPair: Record<string, number>,
  picksBySlot: Record<string, number>,
  enrichFieldTeam?: FieldTeamEnricher,
): CompressedBracketModel {
  const enrich = enrichFieldTeam;
  // Kaggle letter: W=East, X=South, Y=Midwest, Z=West.
  const south = buildRegion("X", "s", "SOUTH", "South", matchupsBySlot, winnerByPair, picksBySlot, enrich);
  const west = buildRegion("Z", "w", "WEST", "West", matchupsBySlot, winnerByPair, picksBySlot, enrich);
  const east = buildRegion("W", "e", "EAST", "East", matchupsBySlot, winnerByPair, picksBySlot, enrich);
  const midwest = buildRegion("Y", "m", "MIDWEST", "Midwest", matchupsBySlot, winnerByPair, picksBySlot, enrich);

  const finalFourLeft = toGame("ff-compressed-l", matchupsBySlot.R5WX, winnerByPair, picksBySlot, enrich);
  const finalFourRight = toGame("ff-compressed-r", matchupsBySlot.R5YZ, winnerByPair, picksBySlot, enrich);
  const championship = toGame("champ-compressed", matchupsBySlot.R6CH, winnerByPair, picksBySlot, enrich);

  const firstFour: Game[] = [];

  return {
    south,
    west,
    east,
    midwest,
    firstFour,
    finalFourLeft,
    finalFourRight,
    championship,
    firstFourDate: "March 17–18, 2026",
    finalFourDate: "April 4, 2026",
    championshipDate: "April 6, 2026",
  };
}
