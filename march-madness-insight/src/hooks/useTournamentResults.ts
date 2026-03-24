import { useQuery } from "@tanstack/react-query";

import { fetchTournamentResults, type TournamentResultRow } from "@/lib/api";
import { getTeamById } from "@/data/teams2026";
import { fetchScoreboard, type GameTeam, type LiveGame } from "@/lib/espnApi";
import { espnIdToKaggleId } from "@/lib/espnIds";
import { kaggleIdFromEspnTeam } from "@/lib/espnTeamToKaggle";
import { filterMarchMadnessGames } from "@/lib/marchMadnessFilter";
import { classifyRoundFromGame } from "@/lib/roundClassification";
import { parseEspnDateToYyyymmdd } from "@/lib/tournamentRounds";

/** All days we poll for completed games — aligned with `TOURNAMENT_DATES` in espnApi.ts */
const TOURNAMENT_DAYS = [
  "20260317",
  "20260318",
  "20260319",
  "20260320",
  "20260321",
  "20260322",
  "20260323", // R32 Day 2
  "20260326",
  "20260327",
  "20260328",
  "20260329",
  "20260404",
  "20260406",
];

function todayEtYyyymmdd(): string {
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const y = et.getFullYear();
  const m = String(et.getMonth() + 1).padStart(2, "0");
  const d = String(et.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

export type CompletedGameRow = LiveGame & {
  round: string;
  homeKaggleId: number | null;
  awayKaggleId: number | null;
  winnerKaggleId: number | null;
};

function mapTeamToKaggleId(
  gender: "M" | "W",
  team: Pick<LiveGame["away"], "kaggleId" | "espnId" | "abbreviation" | "name">,
): number | null {
  if (gender !== "M") return null;
  const k = team.kaggleId;
  if (k != null && k > 0) return k;
  return espnIdToKaggleId(team.espnId) ?? kaggleIdFromEspnTeam(team.abbreviation, team.name);
}

function toIsoDate(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

/** Maps YYYYMMDD tournament dates to Kaggle-style dayNum values (days since Nov 5). */
const DATE_TO_DAYNUM: Record<string, number> = {
  "20260317": 133, // First Four Day 1
  "20260318": 134, // First Four Day 2
  "20260319": 135, // R64 Day 1
  "20260320": 136, // R64 Day 2
  "20260321": 137, // R32 Day 1
  "20260322": 138, // R32 Day 2
  "20260323": 139, // R32 Day 3
  "20260326": 143, // S16 Day 1
  "20260327": 144, // S16 Day 2
  "20260328": 145, // E8 Day 1
  "20260329": 146, // E8 Day 2
  "20260404": 152, // Final Four
  "20260406": 154, // Championship
};

/** Matches `classifyRoundFromGame` men's labels for API-only rows. */
const DAYNUM_TO_MEN_ROUND: Record<number, string> = {
  133: "First Four",
  134: "First Four",
  135: "R64",
  136: "R64",
  137: "R32",
  138: "R32",
  139: "R32",
  143: "S16",
  144: "S16",
  145: "E8",
  146: "E8",
  152: "F4",
  154: "CHAMP",
};

function menRoundFromApiRow(r: TournamentResultRow): string {
  const raw = r.round;
  if (typeof raw === "string" && raw.trim()) {
    const s = raw.trim();
    if (
      s === "R64" ||
      s === "R32" ||
      s === "S16" ||
      s === "E8" ||
      s === "F4" ||
      s === "CHAMP" ||
      s === "First Four"
    ) {
      return s;
    }
  }
  const dn = Number(r.dayNum) || 0;
  return DAYNUM_TO_MEN_ROUND[dn] ?? "Unknown";
}

function isoDateFromDayNum(dn: number): string {
  const entry = Object.entries(DATE_TO_DAYNUM).find(([, v]) => v === dn);
  if (!entry) return "2026-03-20T12:00:00.000Z";
  return `${toIsoDate(entry[0])}T12:00:00.000Z`;
}

function pairKeyFromCompleted(g: CompletedGameRow): string {
  const hk = g.homeKaggleId;
  const ak = g.awayKaggleId;
  if (hk == null || ak == null || hk <= 0 || ak <= 0) return g.espnId;
  const lo = Math.min(hk, ak);
  const hi = Math.max(hk, ak);
  const ymd = parseEspnDateToYyyymmdd(g.date);
  const dn = DATE_TO_DAYNUM[ymd] ?? 0;
  return `${lo}-${hi}-${dn}`;
}

function pairKeyFromApi(r: TournamentResultRow): string {
  const w = r.wTeamId;
  const l = r.lTeamId;
  const lo = Math.min(w, l);
  const hi = Math.max(w, l);
  const dn = Number(r.dayNum) || 0;
  return `${lo}-${hi}-${dn}`;
}

function completedRowFromMenApiResult(r: TournamentResultRow): CompletedGameRow | null {
  const w = r.wTeamId;
  const l = r.lTeamId;
  if (!w || !l) return null;
  const lo = Math.min(w, l);
  const hi = Math.max(w, l);
  const homeLo = lo;
  const awayHi = hi;
  const homeTeam = getTeamById(homeLo);
  const awayTeam = getTeamById(awayHi);
  if (!homeTeam || !awayTeam) return null;

  const homeWins = w === homeLo;
  const homeScore = homeWins ? r.wScore : r.lScore;
  const awayScore = homeWins ? r.lScore : r.wScore;

  const home: GameTeam = {
    espnId: "",
    kaggleId: homeLo,
    name: homeTeam.name,
    abbreviation: homeTeam.abbreviation,
    seed: homeTeam.seed,
    score: String(homeScore),
    winner: homeWins,
  };
  const away: GameTeam = {
    espnId: "",
    kaggleId: awayHi,
    name: awayTeam.name,
    abbreviation: awayTeam.abbreviation,
    seed: awayTeam.seed,
    score: String(awayScore),
    winner: !homeWins,
  };

  const dn = Number(r.dayNum) || 0;
  const dateIso = isoDateFromDayNum(dn);

  return {
    espnId: `api-${dn}-${lo}-${hi}`,
    shortName: `${away.abbreviation} @ ${home.abbreviation}`,
    date: dateIso,
    state: "post",
    statusText: "Final",
    completed: true,
    away,
    home,
    gender: "M",
    round: menRoundFromApiRow(r),
    homeKaggleId: homeLo,
    awayKaggleId: awayHi,
    winnerKaggleId: w,
  };
}

async function mergeMenApiResultsWithEspn(
  espnGames: CompletedGameRow[],
  apiRowsHint?: TournamentResultRow[],
): Promise<CompletedGameRow[]> {
  let apiRows: TournamentResultRow[];
  if (apiRowsHint !== undefined) {
    apiRows = apiRowsHint;
  } else {
    try {
      apiRows = await fetchTournamentResults(2026, "M");
    } catch {
      return espnGames;
    }
  }

  const seen = new Set<string>();
  for (const g of espnGames) {
    seen.add(pairKeyFromCompleted(g));
  }

  const extra: CompletedGameRow[] = [];
  for (const r of apiRows) {
    const g = String(r.gender ?? "M").toUpperCase();
    if (g !== "M") continue;
    const key = pairKeyFromApi(r);
    if (seen.has(key)) continue;
    const row = completedRowFromMenApiResult(r);
    if (!row) continue;
    extra.push(row);
    seen.add(key);
  }

  return [...espnGames, ...extra].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

async function fetchEspnCompletedTournamentGames(gender: "M" | "W"): Promise<CompletedGameRow[]> {
  // Only ingest results through "today" (ET) so future rounds don't pre-populate.
  const maxDay = todayEtYyyymmdd();
  const activeDays = TOURNAMENT_DAYS.filter((d) => d <= maxDay);
  const fetched = await Promise.allSettled(
    activeDays.map((d) => fetchScoreboard(gender, toIsoDate(d), { allowFallback: false })),
  );
  const games = fetched
    .filter((r): r is PromiseFulfilledResult<LiveGame[]> => r.status === "fulfilled")
    .flatMap((r) => r.value)
    .filter((g) => g.state === "post" || g.completed);

  const filtered = filterMarchMadnessGames(games, gender);
  const dedup = new Map<string, CompletedGameRow>();
  for (const g of filtered) {
    const homeK = mapTeamToKaggleId(gender, g.home);
    const awayK = mapTeamToKaggleId(gender, g.away);
    const winnerK = g.home.winner ? homeK : g.away.winner ? awayK : null;
    dedup.set(g.espnId, {
      ...g,
      round: classifyRoundFromGame(g, gender),
      homeKaggleId: homeK,
      awayKaggleId: awayK,
      winnerKaggleId: winnerK,
    });
  }
  return Array.from(dedup.values()).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

async function syncResultsCache(games: CompletedGameRow[]): Promise<void> {
  const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000";
  const payload = games
    .filter((g) => g.homeKaggleId && g.awayKaggleId && g.winnerKaggleId)
    .map((g) => {
      const homeScore = Number(g.home.score ?? 0);
      const awayScore = Number(g.away.score ?? 0);
      const winnerIsHome = g.winnerKaggleId === g.homeKaggleId;
      const ymd = parseEspnDateToYyyymmdd(g.date);
      const dayNum = DATE_TO_DAYNUM[ymd] ?? 0;
      return {
        gameId: g.espnId,
        season: 2026,
        dayNum,
        wTeamId: winnerIsHome ? g.homeKaggleId : g.awayKaggleId,
        lTeamId: winnerIsHome ? g.awayKaggleId : g.homeKaggleId,
        wScore: winnerIsHome ? homeScore : awayScore,
        lScore: winnerIsHome ? awayScore : homeScore,
        round: g.round,
      };
    });
  if (!payload.length) return;
  await fetch(`${apiBase}/api/results/2026`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => undefined);
}

export function useTournamentResults(gender: "M" | "W") {
  return useQuery({
    queryKey: ["all-tournament-completed", gender],
    queryFn: async () => {
      if (gender === "M") {
        const [espnGames, apiRows] = await Promise.all([
          fetchEspnCompletedTournamentGames("M"),
          fetchTournamentResults(2026, "M").catch(() => [] as TournamentResultRow[]),
        ]);
        await syncResultsCache(espnGames);
        return mergeMenApiResultsWithEspn(espnGames, apiRows);
      }
      const espnGames = await fetchEspnCompletedTournamentGames(gender);
      await syncResultsCache(espnGames);
      return espnGames;
    },
    // Historical completed games rarely change — long stale keeps request count low
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    refetchOnWindowFocus: false,
  });
}
