import type { Team2026Row } from "@/lib/api";
import { TOURNAMENT_DATES, type LiveGame, fetchScoreboard } from "@/lib/espnApi";
import { espnIdToKaggleId } from "@/lib/espnIds";
import { kaggleIdFromEspnTeam } from "@/lib/espnTeamToKaggle";
import { filterMarchMadnessGames } from "@/lib/marchMadnessFilter";
import {
  matchTeamName,
  team2026RowFromOddsName,
  type OddsGame,
} from "@/lib/oddsApi";
import { classifyRoundFromGame } from "@/lib/roundClassification";
import { parseEspnDateToYyyymmdd } from "@/lib/tournamentRounds";

const SELECTED_TO_TOURNAMENT_KEY: Record<string, keyof typeof TOURNAMENT_DATES> = {
  S16: "sweet16",
  E8: "elite8",
  F4: "finalFour",
  CHAMP: "championship",
};

const SELECTED_TO_CLASSIFY: Record<string, string> = {
  S16: "S16",
  E8: "E8",
  F4: "F4",
  CHAMP: "CHAMP",
};

export type BracketScoreboardRow = {
  espn: LiveGame;
  homeKaggleId: number;
  awayKaggleId: number;
};

function todayEtYyyymmdd(): string {
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const y = et.getFullYear();
  const m = String(et.getMonth() + 1).padStart(2, "0");
  const d = String(et.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function toIsoDate(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

function mapTeamToKaggleId(
  team: Pick<LiveGame["away"], "kaggleId" | "espnId" | "abbreviation" | "name">,
): number | null {
  const k = team.kaggleId;
  if (k != null && k > 0) return k;
  return espnIdToKaggleId(team.espnId) ?? kaggleIdFromEspnTeam(team.abbreviation, team.name);
}

function findTeamByOurName(teams: Team2026Row[], ourName: string): Team2026Row | undefined {
  return teams.find((t) => (t.teamName ?? "").toLowerCase() === ourName.toLowerCase());
}

function resolveGameTeams(
  game: OddsGame,
  teams: Team2026Row[],
): { home: Team2026Row; away: Team2026Row } | null {
  const names = teams.map((t) => t.teamName).filter(Boolean) as string[];
  if (names.length > 0) {
    const homeMatch = matchTeamName(game.home_team, names);
    const awayMatch = matchTeamName(game.away_team, names);
    if (homeMatch && awayMatch) {
      const home = findTeamByOurName(teams, homeMatch);
      const away = findTeamByOurName(teams, awayMatch);
      if (home?.teamId && away?.teamId) return { home, away };
    }
  }
  const home = team2026RowFromOddsName(game.home_team);
  const away = team2026RowFromOddsName(game.away_team);
  if (home?.teamId && away?.teamId) return { home, away };
  return null;
}

export function pairKeyFromTeamIds(a: number, b: number): string {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return `${lo}-${hi}`;
}

/**
 * Men's bracket games for a tab (S16 / E8 / F4 / CHAMP): pre, in-progress, and final.
 * Used so the betting assistant still lists matchups while games are live and after they finish.
 */
export async function fetchMenBracketScoreboardForRound(selectedRound: string): Promise<BracketScoreboardRow[]> {
  const datesKey = SELECTED_TO_TOURNAMENT_KEY[selectedRound];
  const expected = SELECTED_TO_CLASSIFY[selectedRound];
  if (!datesKey || !expected) return [];

  const dates = TOURNAMENT_DATES[datesKey];
  // Fetch every calendar day in this round (Thu/Fri for S16, etc.) so we don't miss games
  // before "today" in ET crosses the next day; backend may still return empty for future dates.
  const maxDay = todayEtYyyymmdd();
  const activeDays = dates.filter((d) => d <= maxDay);
  const daysToQuery = activeDays.length > 0 ? activeDays : dates;

  const fetched = await Promise.allSettled(
    daysToQuery.map((d) => fetchScoreboard("M", toIsoDate(d), { allowFallback: true })),
  );
  const games = fetched
    .filter((r): r is PromiseFulfilledResult<LiveGame[]> => r.status === "fulfilled")
    .flatMap((r) => r.value);

  const filtered = filterMarchMadnessGames(games, "M");
  const dedup = new Map<string, LiveGame>();
  for (const g of filtered) {
    dedup.set(g.espnId, g);
  }

  const out: BracketScoreboardRow[] = [];
  const expectedDateSet = new Set(dates);
  for (const g of dedup.values()) {
    const r = classifyRoundFromGame(g, "M");
    const ymd = parseEspnDateToYyyymmdd(g.date);
    // Be tolerant during live updates: if matchup mapping/classification is stale, still include
    // games whose ET date is within the selected round window.
    if (r !== expected && !expectedDateSet.has(ymd)) continue;
    const homeK = mapTeamToKaggleId(g.home);
    const awayK = mapTeamToKaggleId(g.away);
    if (homeK == null || awayK == null || homeK <= 0 || awayK <= 0) continue;
    out.push({ espn: g, homeKaggleId: homeK, awayKaggleId: awayK });
  }
  return out.sort((a, b) => new Date(a.espn.date).getTime() - new Date(b.espn.date).getTime());
}

export type BettingCandidate = {
  game: OddsGame;
  home: Team2026Row;
  away: Team2026Row;
  espn: LiveGame | null;
};

/**
 * Build the betting board from the Odds API + canonical mock slate only.
 * ESPN scoreboard rows are **optional enrichment** (live score / final line) when pair keys match;
 * we never replace the slate with ESPN matchups when games go live.
 */
function bettingCandidatesFromOddsOnly(
  mergedOddsGames: OddsGame[],
  teams: Team2026Row[],
): BettingCandidate[] {
  const out: BettingCandidate[] = [];
  for (const game of mergedOddsGames) {
    const res = resolveGameTeams(game, teams);
    if (!res) continue;
    out.push({ game, home: res.home, away: res.away, espn: null });
    if (out.length >= 24) break;
  }
  return out;
}

function enrichCandidatesWithEspn(
  candidates: BettingCandidate[],
  espnRows: BracketScoreboardRow[],
): BettingCandidate[] {
  const byPair = new Map<string, LiveGame>();
  for (const row of espnRows) {
    const k = pairKeyFromTeamIds(row.homeKaggleId, row.awayKaggleId);
    if (!byPair.has(k)) byPair.set(k, row.espn);
  }
  return candidates.map((c) => {
    const k = pairKeyFromTeamIds(c.home.teamId, c.away.teamId);
    const espn = byPair.get(k) ?? null;
    return { ...c, espn };
  });
}

export function buildBettingCandidates(
  mergedOddsGames: OddsGame[],
  teams: Team2026Row[],
  espnRows: BracketScoreboardRow[],
): BettingCandidate[] {
  const base = bettingCandidatesFromOddsOnly(mergedOddsGames, teams);
  return enrichCandidatesWithEspn(base, espnRows);
}

export function scoreboardMetaForRow(
  espn: LiveGame | null,
  home: Team2026Row,
  away: Team2026Row,
): { resultSummary?: string; resultsOnly: boolean } {
  if (!espn) return { resultsOnly: false };
  const homeIsEspnHome = mapTeamToKaggleId(espn.home) === home.teamId;
  const awayPts = homeIsEspnHome ? Number(espn.away.score ?? 0) : Number(espn.home.score ?? 0);
  const homePts = homeIsEspnHome ? Number(espn.home.score ?? 0) : Number(espn.away.score ?? 0);

  if (espn.state === "post") {
    const winnerName = homeIsEspnHome
      ? espn.home.winner
        ? home.teamName ?? espn.home.name
        : away.teamName ?? espn.away.name
      : espn.home.winner
        ? away.teamName ?? espn.away.name
        : home.teamName ?? espn.home.name;
    return {
      resultsOnly: true,
      resultSummary: `Final: ${winnerName} — ${awayPts}-${homePts}`,
    };
  }
  if (espn.state === "in") {
    return {
      resultsOnly: false,
      resultSummary: `Live · ${awayPts}-${homePts} · ${espn.statusText}`,
    };
  }
  return { resultsOnly: false };
}
