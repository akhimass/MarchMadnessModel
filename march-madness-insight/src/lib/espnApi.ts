// src/lib/espnApi.ts
// CONFIRMED WORKING endpoints — tested live March 19 2026
// No API key needed. No auth. Pure GET requests.

const ESPN_M = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball';
const ESPN_W = 'https://site.api.espn.com/apis/site/v2/sports/basketball/womens-college-basketball';

// ─── TYPES ───────────────────────────────────────────────────────────────────

export interface LiveGame {
  espnId: string;
  shortName: string;
  date: string;
  state: 'pre' | 'in' | 'post';
  statusText: string;
  completed: boolean;
  clock?: string;
  period?: number;
  away: GameTeam;
  home: GameTeam;
  venue?: string;
  city?: string;
  gender: 'M' | 'W';
}

export interface GameTeam {
  espnId: string;
  /** Set by `/api/scoreboard/live` for men's games when ESPN abbrev maps to our bracket TeamID */
  kaggleId?: number | null;
  name: string;
  abbreviation: string;
  seed: number;
  score: string;
  winner: boolean;
  record?: string;
  /** ESPN CDN logo when available */
  logoUrl?: string;
}

export interface GameSummary extends LiveGame {
  teamStats: TeamGameStats[];
  leaders: GameLeader[];
  spread?: number;
  overUnder?: number;
  awayWinProbability?: number;
  homeWinProbability?: number;
}

export interface TeamGameStats {
  abbreviation: string;
  fgm: string; fga: string; fgPct: string;
  threePm: string; threePA: string; threePct: string;
  ftm: string; fta: string; ftPct: string;
  rebounds: string;
  assists: string;
  turnovers: string;
  steals: string;
  blocks: string;
}

export interface GameLeader {
  team: string;
  points: { player: string; value: string };
  rebounds: { player: string; value: string };
  assists: { player: string; value: string };
}

// ─── SCOREBOARD (via backend proxy — avoids browser CORS on ESPN) ────────────

interface BackendScoreboardTeam {
  espnId: string;
  kaggleId?: number | null;
  name: string;
  shortName: string;
  abbreviation: string;
  score: number;
  winner: boolean;
  logo: string;
  seed: number;
}

interface BackendScoreboardGame {
  gameId: string;
  commenceTime: string;
  status: string;
  period: number;
  clock: string;
  completed: boolean;
  homeTeam: BackendScoreboardTeam;
  awayTeam: BackendScoreboardTeam;
  broadcast?: string;
  roundLabel?: string;
  venue?: string;
}

function mapBackendTeam(c: BackendScoreboardTeam): GameTeam {
  const logoHref = c.logo || undefined;
  const kid = c.kaggleId;
  return {
    espnId: String(c.espnId ?? ""),
    kaggleId: kid === undefined || kid === null ? undefined : Number(kid),
    name: c.name ?? "",
    abbreviation: c.abbreviation ?? "",
    seed: Number(c.seed ?? 0),
    score: String(c.score ?? 0),
    winner: Boolean(c.winner),
    logoUrl: logoHref,
  };
}

function mapBackendGame(g: BackendScoreboardGame, gender: "M" | "W"): LiveGame {
  const st = g.status;
  let state: LiveGame["state"] = "pre";
  if (st === "final") state = "post";
  else if (st === "live" || st === "halftime") state = "in";

  const statusText =
    st === "halftime"
      ? "Halftime"
      : st === "live" && g.clock
        ? `${g.period ? `P${g.period}` : ""} ${g.clock}`.trim()
        : st === "final"
          ? "Final"
          : "Scheduled";

  return {
    espnId: String(g.gameId),
    shortName: `${g.awayTeam.abbreviation} @ ${g.homeTeam.abbreviation}`,
    date: g.commenceTime,
    state,
    statusText,
    completed: g.completed,
    clock: g.clock,
    period: g.period,
    away: mapBackendTeam(g.awayTeam),
    home: mapBackendTeam(g.homeTeam),
    venue: g.venue,
    gender,
  };
}

/**
 * Live scoreboard proxied through FastAPI (`GET /api/scoreboard/live`).
 */
export async function fetchScoreboard(
  gender: "M" | "W",
  date?: string,
  opts?: { allowFallback?: boolean },
): Promise<LiveGame[]> {
  const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000";
  const params = new URLSearchParams({ gender });
  if (opts?.allowFallback === false) params.set("allow_fallback", "false");
  if (date) {
    const ymd = date.replace(/-/g, "");
    params.set("dates", ymd);
  }
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), 30_000);
  let res: Response;
  try {
    res = await fetch(`${apiBase}/api/scoreboard/live?${params}`, { signal: ctrl.signal });
  } finally {
    window.clearTimeout(t);
  }
  if (!res.ok) throw new Error(`Scoreboard proxy ${res.status}`);
  const data = (await res.json()) as { games?: BackendScoreboardGame[] };
  return (data.games || []).map((g) => mapBackendGame(g, gender));
}

function mapTeam(c: any): GameTeam {
  const logos = c?.team?.logos;
  const logoHref =
    typeof c?.team?.logo === "string"
      ? c.team.logo
      : Array.isArray(logos) && logos[0]?.href
        ? logos[0].href
        : undefined;
  return {
    espnId: String(c?.team?.id ?? ""),
    name: c?.team?.displayName ?? "",
    abbreviation: c?.team?.abbreviation ?? "",
    seed: c?.curatedRank?.current ?? 0,
    score: c?.score ?? "0",
    winner: c?.winner ?? false,
    record: c?.records?.[0]?.summary,
    logoUrl: logoHref,
  };
}

// ─── GAME SUMMARY ────────────────────────────────────────────────────────────

export async function fetchGameSummary(espnGameId: string, gender: 'M' | 'W'): Promise<GameSummary | null> {
  const base = gender === 'M' ? ESPN_M : ESPN_W;
  try {
    const res = await fetch(`${base}/summary?event=${espnGameId}`);
    if (!res.ok) return null;
    const data = await res.json();

    const comp = data.header?.competitions?.[0];
    const away = comp?.competitors?.find((c: any) => c.homeAway === 'away');
    const home = comp?.competitors?.find((c: any) => c.homeAway === 'home');

    const teamStats: TeamGameStats[] = (data.boxscore?.teams || []).map((t: any) => {
      const s = (name: string) =>
        t.statistics?.find((x: any) => x.name === name)?.displayValue ?? '0';
      return {
        abbreviation: t.team?.abbreviation,
        fgm: s('fieldGoalsMade-fieldGoalsAttempted').split('-')[0],
        fga: s('fieldGoalsMade-fieldGoalsAttempted').split('-')[1],
        fgPct: s('fieldGoalPct'),
        threePm: s('threePointFieldGoalsMade-threePointFieldGoalsAttempted').split('-')[0],
        threePA: s('threePointFieldGoalsMade-threePointFieldGoalsAttempted').split('-')[1],
        threePct: s('threePointFieldGoalPct'),
        ftm: s('freeThrowsMade-freeThrowsAttempted').split('-')[0],
        fta: s('freeThrowsMade-freeThrowsAttempted').split('-')[1],
        ftPct: s('freeThrowPct'),
        rebounds: s('totalRebounds'),
        assists: s('assists'),
        turnovers: s('turnovers'),
        steals: s('steals'),
        blocks: s('blocks'),
      };
    });

    const leaders: GameLeader[] = (data.leaders || []).map((l: any) => ({
      team: l.team?.abbreviation,
      points: {
        player: l.leaders?.find((x: any) => x.name === 'points')?.leaders?.[0]?.athlete?.shortName ?? '',
        value: l.leaders?.find((x: any) => x.name === 'points')?.leaders?.[0]?.displayValue ?? '',
      },
      rebounds: {
        player: l.leaders?.find((x: any) => x.name === 'rebounds')?.leaders?.[0]?.athlete?.shortName ?? '',
        value: l.leaders?.find((x: any) => x.name === 'rebounds')?.leaders?.[0]?.displayValue ?? '',
      },
      assists: {
        player: l.leaders?.find((x: any) => x.name === 'assists')?.leaders?.[0]?.athlete?.shortName ?? '',
        value: l.leaders?.find((x: any) => x.name === 'assists')?.leaders?.[0]?.displayValue ?? '',
      },
    }));

    const pick = data.pickcenter?.[0];

    const base_game: LiveGame = {
      espnId: comp?.id ?? espnGameId,
      shortName: data.header?.shortName ?? '',
      date: comp?.date ?? '',
      state: comp?.status?.type?.state,
      statusText: comp?.status?.type?.description,
      completed: comp?.status?.type?.completed ?? false,
      away: mapTeam(away),
      home: mapTeam(home),
      gender,
    };

    return {
      ...base_game,
      teamStats,
      leaders,
      spread: pick?.spread,
      overUnder: pick?.overUnder,
      awayWinProbability: pick?.awayTeamOdds?.winPercentage,
      homeWinProbability: pick?.homeTeamOdds?.winPercentage,
    };
  } catch {
    return null;
  }
}

// ─── TOURNAMENT DATES ────────────────────────────────────────────────────────
//
// Round buckets are **calendar days in US Eastern (ET)**, not ESPN's "round" metadata.
// (ESPN scoreboard JSON does not reliably expose NCAA round for every game; we map by schedule.)
// Must match `ROUND_TABS` on ScoreboardPage and `DATE_TO_ROUND` in tournamentRounds.ts.
// 2026 NCAA Men's (operator schedule): First Four Tue–Wed Mar 17–18; R64 Thu–Fri Mar 19–20;
// R32 Sat–Sun Mar 21–22; S16 Thu–Fri Mar 26–27; E8 Sat–Sun Mar 28–29; F4 Apr 4; title Apr 6.
// Round **labels** for men's live games use matchup table (`ncaa2026MenMatchupRounds.ts`), not these dates alone.
//
export const TOURNAMENT_DATES = {
  firstFour: ["20260317", "20260318"],
  roundOf64: ["20260319", "20260320"],
  /** R32 spans Sat–Sun + Monday (2026 schedule). */
  roundOf32: ["20260321", "20260322", "20260323"],
  sweet16: ["20260326", "20260327"],
  elite8: ["20260328", "20260329"],
  finalFour: ["20260404"],
  championship: ["20260406"],
};

function _todayEtYyyymmdd(): string {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const y = et.getFullYear();
  const m = String(et.getMonth() + 1).padStart(2, '0');
  const d = String(et.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

export async function fetchAllTournamentResults(gender: 'M' | 'W'): Promise<LiveGame[]> {
  // Only fetch dates up to today — future rounds have no games, no point hitting the backend
  const today = _todayEtYyyymmdd();
  const allDates = Object.values(TOURNAMENT_DATES).flat().filter(d => d <= today);
  const results = await Promise.allSettled(
    allDates.map(d => fetchScoreboard(gender, d))
  );
  const flat = results
    .filter((r): r is PromiseFulfilledResult<LiveGame[]> => r.status === 'fulfilled')
    .flatMap(r => r.value)
    .filter((g) => g.completed || g.state === 'post');
  const seen = new Set<string>();
  return flat.filter((g) => {
    if (seen.has(g.espnId)) return false;
    seen.add(g.espnId);
    return true;
  });
}

// ─── ESPN→KAGGLE MAPPING ─────────────────────────────────────────────────────

export const ESPN_TO_KAGGLE_M: Record<string, number> = {
  '57': 1181, '130': 1314, '2': 1301, '2250': 1243, '248': 1196,
  '12': 1211, '2509': 1400, '2579': 1153, '97': 1287, '333': 1104,
  '201': 1276, '26': 1420, '150': 1277, '2390': 1437, '251': 1222,
  '356': 1222, '158': 1234, '2055': 1163, '2483': 1346, '38': 1246,
  '96': 1323, '2628': 1359, '52': 1393, '2641': 1379, '8': 1270,
};

export function espnToKaggle(espnId: string, gender: 'M' | 'W'): number | null {
  if (gender === 'M') return ESPN_TO_KAGGLE_M[espnId] ?? null;
  return null;
}

// ─── BRIER SCORE ─────────────────────────────────────────────────────────────

export interface BrierResult {
  gamesScored: number;
  brierScore: number;
  accuracy: number;
  upsetCorrect: number;
  upsetTotal: number;
}

export function computeBrierScore(
  predictions: Map<string, number>,
  completedGames: LiveGame[],
  kaggleSeeds: Map<number, number>,
): BrierResult {
  let totalBrier = 0;
  let correctPicks = 0;
  let upsetCorrect = 0;
  let upsetTotal = 0;
  let gamesScored = 0;

  for (const game of completedGames) {
    if (!game.completed) continue;
    // Prefer kaggleId from game object (set by backend for all teams);
    // fall back to the static espnToKaggle map as a safety net.
    const awayKaggle = game.away.kaggleId ?? espnToKaggle(game.away.espnId, game.gender);
    const homeKaggle = game.home.kaggleId ?? espnToKaggle(game.home.espnId, game.gender);
    if (!awayKaggle || !homeKaggle) continue;

    const key1 = `2026_${Math.min(awayKaggle, homeKaggle)}_${Math.max(awayKaggle, homeKaggle)}`;
    const pred = predictions.get(key1);
    if (pred === undefined) continue;

    const team1Id = Math.min(awayKaggle, homeKaggle);
    const team1Won = awayKaggle === team1Id ? game.away.winner : game.home.winner;
    const actual = team1Won ? 1 : 0;

    totalBrier += Math.pow(pred - actual, 2);
    gamesScored++;

    const predictedWinner = pred >= 0.5 ? team1Id : Math.max(awayKaggle, homeKaggle);
    const actualWinner = team1Won ? team1Id : Math.max(awayKaggle, homeKaggle);
    if (predictedWinner === actualWinner) correctPicks++;

    const seed1 = kaggleSeeds.get(team1Id) ?? 8;
    const seed2 = kaggleSeeds.get(Math.max(awayKaggle, homeKaggle)) ?? 8;
    const higherSeedIsTeam1 = seed1 < seed2;
    const upsetPick = higherSeedIsTeam1 ? pred < 0.5 : pred > 0.5;
    if (upsetPick) {
      upsetTotal++;
      const upsetActuallyHappened = higherSeedIsTeam1 ? !team1Won : team1Won;
      if (upsetActuallyHappened) upsetCorrect++;
    }
  }

  return {
    gamesScored,
    brierScore: gamesScored > 0 ? totalBrier / gamesScored : 0,
    accuracy: gamesScored > 0 ? correctPicks / gamesScored : 0,
    upsetCorrect,
    upsetTotal,
  };
}
