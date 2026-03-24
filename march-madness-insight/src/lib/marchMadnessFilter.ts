import type { GameTeam, LiveGame } from "@/lib/espnApi";
import { resolveMenKaggleId } from "@/lib/espnTeamToKaggle";

/** NCAA tournament field uses seeds 1–16 (per region / bracket). */
export const NCAA_TOURNAMENT_SEED_MIN = 1;
export const NCAA_TOURNAMENT_SEED_MAX = 16;

/**
 * ESPN exposes tournament seed via `curatedRank` on scoreboard competitors.
 * Both teams must have a seed in 1–16 or we treat the game as non–March Madness (e.g. NIT, exhibitions).
 */
export function hasNcaaTournamentBracketSeed(team: GameTeam): boolean {
  const s = team.seed;
  if (typeof s !== "number" || !Number.isFinite(s)) return false;
  const rounded = Math.round(s);
  return rounded >= NCAA_TOURNAMENT_SEED_MIN && rounded <= NCAA_TOURNAMENT_SEED_MAX;
}

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** API row from GET /api/teams/2026?gender=W */
export type ApiTeamRow = { teamId: number; teamName?: string | null };

/**
 * Build a set of normalized school names for women's tournament field (from API list).
 */
export function buildWomenNameMatchers(rows: ApiTeamRow[] | undefined): {
  exact: Set<string>;
  rows: ApiTeamRow[];
} {
  const exact = new Set<string>();
  if (!rows?.length) return { exact, rows: [] };
  for (const r of rows) {
    const n = r.teamName;
    if (n) exact.add(normalizeName(n));
  }
  return { exact, rows };
}

function womenTeamInField(name: string, exact: Set<string>, rows: ApiTeamRow[]): boolean {
  return womenTeamIdForName(name, exact, rows) != null;
}

/** Resolve API `teamId` for women&apos;s tournament field (same matching rules as field filter). */
function womenTeamIdForName(name: string, exact: Set<string>, rows: ApiTeamRow[]): number | null {
  const n = normalizeName(name);
  if (exact.has(n)) {
    for (const r of rows) {
      if (r.teamName && normalizeName(r.teamName) === n) return r.teamId;
    }
  }
  const first = n.split(" ")[0] ?? "";
  for (const r of rows) {
    const tn = r.teamName ? normalizeName(r.teamName) : "";
    if (!tn) continue;
    if (n.includes(tn) || tn.includes(n)) return r.teamId;
    if (first.length >= 3 && tn.startsWith(first)) return r.teamId;
    if (first.length >= 3 && n.startsWith(tn.split(" ")[0])) return r.teamId;
  }
  return null;
}

export function womenTeamIdFromEspnTeam(rows: ApiTeamRow[] | undefined, displayName: string): number | null {
  if (!rows?.length) return null;
  const { exact, rows: rrows } = buildWomenNameMatchers(rows);
  return womenTeamIdForName(displayName, exact, rrows);
}

function bothTeamsHaveBracketSeeds(g: LiveGame): boolean {
  return hasNcaaTournamentBracketSeed(g.away) && hasNcaaTournamentBracketSeed(g.home);
}

/**
 * Keep only games where both teams are in the 2026 tournament field **and** both show an NCAA
 * tournament seed (1–16) on ESPN — excludes NIT, exhibitions, and regular-season boards without seeds.
 * Men's: abbreviation set from static bracket data.
 * Women's: pass API team list; until loaded, returns [] if gender is W.
 */
export function filterMarchMadnessGames(
  games: LiveGame[],
  gender: "M" | "W",
  womenTeams?: ApiTeamRow[],
): LiveGame[] {
  if (gender === "M") {
    return games.filter(
      (g) => resolveMenKaggleId(g.away) != null && resolveMenKaggleId(g.home) != null,
    );
  }

  if (!womenTeams?.length) return [];
  const { exact, rows } = buildWomenNameMatchers(womenTeams);
  return games.filter(
    (g) =>
      bothTeamsHaveBracketSeeds(g) &&
      womenTeamInField(g.away.name, exact, rows) &&
      womenTeamInField(g.home.name, exact, rows),
  );
}
