import type { Team2026Row } from "@/lib/api";
import { teamsById } from "@/data/teams2026";
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

const SELECTED_TO_ROUND_LABEL: Record<string, string> = {
  S16: "Sweet 16",
  E8: "Elite Eight",
  F4: "Final Four",
  CHAMP: "National Championship",
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

function team2026RowFromStaticId(teamId: number | null | undefined): Team2026Row | null {
  if (teamId == null || teamId <= 0) return null;
  const t = teamsById.get(teamId);
  if (!t) return null;
  return { teamId: t.id, teamName: t.name, seed: t.seed, region: t.region, gender: "M" };
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

function findOddsGameForPair(
  games: OddsGame[],
  teams: Team2026Row[],
  homeId: number,
  awayId: number,
): OddsGame | null {
  const want = pairKeyFromTeamIds(homeId, awayId);
  for (const game of games) {
    const res = resolveGameTeams(game, teams);
    if (!res) continue;
    const got = pairKeyFromTeamIds(res.home.teamId, res.away.teamId);
    if (got === want) return game;
  }
  return null;
}

export function syntheticOddsGameFromEspn(
  g: LiveGame,
  home: Team2026Row,
  away: Team2026Row,
  selectedRound: string,
): OddsGame {
  const roundLabel = SELECTED_TO_ROUND_LABEL[selectedRound] ?? "NCAA Tournament";
  return {
    id: `espn-${g.espnId}`,
    commence_time: g.date,
    home_team: home.teamName ?? "",
    away_team: away.teamName ?? "",
    roundLabel,
    bookmakers: [
      {
        key: "scoreboard",
        title: "Scoreboard",
        markets: [
          {
            key: "h2h",
            outcomes: [
              { name: home.teamName ?? "", price: -110 },
              { name: away.teamName ?? "", price: -110 },
            ],
          },
        ],
      },
    ],
  };
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
  const maxDay = todayEtYyyymmdd();
  const activeDays = dates.filter((d) => d <= maxDay);
  if (!activeDays.length) return [];

  const fetched = await Promise.allSettled(
    activeDays.map((d) => fetchScoreboard("M", toIsoDate(d), { allowFallback: false })),
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
  for (const g of dedup.values()) {
    const r = classifyRoundFromGame(g, "M");
    if (r !== expected) continue;
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
 * Prefer ESPN bracket order when games exist (correct matchups during/after the round).
 * Fall back to Odds API / canonical slate when ESPN has not published games yet.
 */
export function buildBettingCandidates(
  mergedOddsGames: OddsGame[],
  teams: Team2026Row[],
  espnRows: BracketScoreboardRow[],
  selectedRound: string,
): BettingCandidate[] {
  const seen = new Set<string>();
  const out: BettingCandidate[] = [];

  if (espnRows.length > 0) {
    for (const row of espnRows) {
      const key = pairKeyFromTeamIds(row.homeKaggleId, row.awayKaggleId);
      if (seen.has(key)) continue;
      const oddsGame = findOddsGameForPair(mergedOddsGames, teams, row.homeKaggleId, row.awayKaggleId);
      const home =
        teams.find((t) => t.teamId === row.homeKaggleId) ?? team2026RowFromStaticId(row.homeKaggleId);
      const away =
        teams.find((t) => t.teamId === row.awayKaggleId) ?? team2026RowFromStaticId(row.awayKaggleId);
      if (!home?.teamId || !away?.teamId) continue;
      const game = oddsGame ?? syntheticOddsGameFromEspn(row.espn, home, away, selectedRound);
      out.push({ game, home, away, espn: row.espn });
      seen.add(key);
    }
    return out;
  }

  for (const game of mergedOddsGames) {
    const res = resolveGameTeams(game, teams);
    if (!res) continue;
    out.push({ game, home: res.home, away: res.away, espn: null });
    if (out.length >= 24) break;
  }
  return out;
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
