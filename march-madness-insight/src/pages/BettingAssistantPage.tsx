import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { BetSlip } from "@/components/betting/BetSlip";
import { GameOddsCard } from "@/components/betting/GameOddsCard";
import { RoundPlanner } from "@/components/betting/RoundPlanner";
import { TopValuePicks } from "@/components/betting/TopValuePicks";
import type { Team2026Row } from "@/lib/api";
import { fetchMatchupStandardProb, fetchNarrative, fetchR64R32Accuracy, fetchTeams2026 } from "@/lib/api";
import {
  americanToImpliedProb,
  buildBettingOddsGameList,
  calculateEV,
  fullBankrollSuggestedByGameId,
  getConsensusOdds,
  getLiveOdds,
  inferNcaaRoundFromCommence,
  kellyBet,
  matchTeamName,
  team2026RowFromOddsName,
  type OddsGame,
  type PortfolioProbRow,
} from "@/lib/oddsApi";
import { bettingTeamLabel } from "@/lib/bettingDisplay";
import type { BetSlipItem, KellyStrategy } from "@/types/betting";
import type { NarrativeApiResponse } from "@/lib/api";
import { useTournamentResults } from "@/hooks/useTournamentResults";
import { teamsById } from "@/data/teams2026";
import { toast } from "sonner";

function team2026RowFromStaticId(teamId: number | null | undefined): Team2026Row | null {
  if (teamId == null || teamId <= 0) return null;
  const t = teamsById.get(teamId);
  if (!t) return null;
  return { teamId: t.id, teamName: t.name, seed: t.seed, region: t.region, gender: "M" };
}

import { Button } from "@ui/button";
import { Alert, AlertDescription, AlertTitle } from "@ui/alert";
import { ToggleGroup, ToggleGroupItem } from "@ui/toggle-group";
interface BoardRow {
  game: OddsGame;
  home: Team2026Row;
  away: Team2026Row;
  homeProb: number | null;
  awayProb: number | null;
}
interface CompletedBoardRow extends BoardRow {
  resultSummary: string;
}

function clamp01(n: number): number {
  return Math.max(0.01, Math.min(0.99, n));
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

const BettingAssistantPage = () => {
  const ROUNDS = [
    { key: "R64", label: "Round of 64", status: "completed" as const },
    { key: "R32", label: "Round of 32", status: "completed" as const },
    { key: "S16", label: "Sweet 16", status: "next" as const },
    { key: "E8", label: "Elite 8", status: "upcoming" as const },
    { key: "F4", label: "Final Four", status: "upcoming" as const },
    { key: "CHAMP", label: "Championship", status: "upcoming" as const },
  ];
  const [selectedRound, setSelectedRound] = useState<string>("S16");
  const [bankroll, setBankroll] = useState<number>(() =>
    parseFloat(localStorage.getItem("mm2026_bankroll") || "500"),
  );
  useEffect(() => {
    localStorage.setItem("mm2026_bankroll", String(bankroll));
  }, [bankroll]);

  const [strategy, setStrategy] = useState<KellyStrategy>("conservative");
  const [slip, setSlip] = useState<BetSlipItem[]>([]);
  const [narratives, setNarratives] = useState<NarrativeApiResponse[]>([]);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [recentlyAdded, setRecentlyAdded] = useState<Record<string, boolean>>({});
  const slipRef = useRef<HTMLDivElement | null>(null);

  const hasOddsKey = Boolean(import.meta.env.VITE_ODDS_API_KEY);
  const completedQ = useTournamentResults("M");
  const r64r32AccuracyQ = useQuery({
    queryKey: ["model-r64-r32-accuracy"],
    queryFn: fetchR64R32Accuracy,
    staleTime: 60_000,
  });

  const teamsQ = useQuery({
    queryKey: ["teams-2026", "M"],
    queryFn: () => fetchTeams2026("M"),
    staleTime: 60 * 60 * 1000,
    retry: (failureCount, err) => {
      const s = String((err as Error)?.message ?? "");
      if (/\b(503|502|504)\b/.test(s)) return failureCount < 10;
      return failureCount < 3;
    },
    retryDelay: (attempt) => Math.min(1500 * 2 ** attempt, 30_000),
  });
  const { data: teams = [] } = teamsQ;

  const {
    data: oddsMeta,
    isLoading: oddsLoading,
    refetch,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ["odds-ncaab"],
    queryFn: getLiveOdds,
    staleTime: 5 * 60 * 1000,
  });
  const oddsGames = oddsMeta?.games ?? [];
  const mergedOddsGames = useMemo(() => buildBettingOddsGameList(oddsGames), [oddsGames]);
  const requestsRemaining = oddsMeta?.requestsRemaining != null ? parseInt(String(oddsMeta.requestsRemaining), 10) : null;

  const board = useQuery({
    queryKey: ["betting-board", teams, mergedOddsGames],
    queryFn: async () => {
      const list = mergedOddsGames;
      const candidates: Array<{ game: OddsGame; home: Team2026Row; away: Team2026Row }> = [];
      for (const game of list) {
        const res = resolveGameTeams(game, teams);
        if (!res) continue;
        candidates.push({ game, home: res.home, away: res.away });
        if (candidates.length >= 24) break;
      }
      return Promise.all(
        candidates.map(async ({ game, home, away }) => {
          const lo = Math.min(home.teamId, away.teamId);
          const hi = Math.max(home.teamId, away.teamId);
          const p = await fetchMatchupStandardProb(lo, hi, "M");
          const homeIsLo = home.teamId === lo;
          const homeProb = p == null ? null : homeIsLo ? p : 1 - p;
          const awayProb = p == null ? null : homeIsLo ? 1 - p : p;
          return { game, home, away, homeProb, awayProb };
        }),
      );
    },
    enabled: oddsMeta !== undefined,
  });

  const filteredBoard = useMemo(
    () =>
      (board.data ?? []).filter(
        (r) => inferNcaaRoundFromCommence(r.game.commence_time, r.game.roundLabel) === selectedRound,
      ),
    [board.data, selectedRound],
  );
  const completedRoundsBoardQ = useQuery({
    queryKey: ["completed-round-board", completedQ.data, teams, selectedRound],
    enabled: Boolean((selectedRound === "R64" || selectedRound === "R32") && completedQ.data?.length),
    queryFn: async (): Promise<CompletedBoardRow[]> => {
      const list = (completedQ.data ?? []).filter((g) => g.round === selectedRound && g.homeKaggleId && g.awayKaggleId);
      const rows = await Promise.all(
        list.map(async (g) => {
          const home =
            teams.find((t) => t.teamId === g.homeKaggleId) ?? team2026RowFromStaticId(g.homeKaggleId);
          const away =
            teams.find((t) => t.teamId === g.awayKaggleId) ?? team2026RowFromStaticId(g.awayKaggleId);
          if (!home || !away) return null;
          const lo = Math.min(home.teamId, away.teamId);
          const hi = Math.max(home.teamId, away.teamId);
          const p = await fetchMatchupStandardProb(lo, hi, "M");
          const homeProb = p == null ? null : home.teamId === lo ? p : 1 - p;
          const awayProb = homeProb == null ? null : 1 - homeProb;
          const game: OddsGame = {
            id: `completed-${g.espnId}`,
            commence_time: g.date,
            home_team: home.teamName ?? "",
            away_team: away.teamName ?? "",
            roundLabel: selectedRound === "R64" ? "Round of 64" : "Round of 32",
            bookmakers: [
              {
                key: "historical",
                title: "Historical",
                markets: [{
                  key: "h2h",
                  outcomes: [
                    { name: home.teamName ?? "", price: -110 },
                    { name: away.teamName ?? "", price: -110 },
                  ],
                }],
              },
            ],
          };
          const winner = g.home.winner ? home.teamName : away.teamName;
          return {
            game,
            home,
            away,
            homeProb,
            awayProb,
            resultSummary: `Final: ${winner} ${g.home.score}-${g.away.score}`,
          } satisfies CompletedBoardRow;
        }),
      );
      return rows.filter((r): r is CompletedBoardRow => Boolean(r));
    },
  });
  const boardToRender: Array<BoardRow | CompletedBoardRow> = useMemo(() => {
    if (selectedRound === "R64" || selectedRound === "R32") return completedRoundsBoardQ.data ?? [];
    return filteredBoard;
  }, [selectedRound, completedRoundsBoardQ.data, filteredBoard]);

  const portfolioRows = useMemo((): PortfolioProbRow[] => {
    return (boardToRender as BoardRow[]).filter(
      (r): r is PortfolioProbRow =>
        r.homeProb != null && r.awayProb != null && r.home.teamId != null && r.away.teamId != null,
    );
  }, [boardToRender]);

  const suggestedByGameId = useMemo(
    () => fullBankrollSuggestedByGameId(portfolioRows, bankroll),
    [portfolioRows, bankroll],
  );

  const suggestedPortfolioTotal = useMemo(() => {
    let s = 0;
    suggestedByGameId.forEach((v) => {
      s += v.home + v.away;
    });
    return s;
  }, [suggestedByGameId]);

  const trackRecordQ = useQuery({
    queryKey: ["betting-track-record", completedQ.data],
    enabled: Boolean(completedQ.data?.length),
    queryFn: async () => {
      const rows = await Promise.all(
        (completedQ.data ?? [])
          .filter((g) => g.round === "R64" || g.round === "R32")
          .filter((g) => g.homeKaggleId && g.awayKaggleId && g.winnerKaggleId)
          .map(async (g) => {
            const lo = Math.min(g.homeKaggleId!, g.awayKaggleId!);
            const hi = Math.max(g.homeKaggleId!, g.awayKaggleId!);
            const pLo = await fetchMatchupStandardProb(lo, hi, "M");
            if (pLo == null) return null;
            const homeIsLo = g.homeKaggleId === lo;
            const homeProb = homeIsLo ? pLo : 1 - pLo;
            const winnerIsHome = g.winnerKaggleId === g.homeKaggleId;
            const predHome = homeProb >= 0.5;
            const correct = predHome === winnerIsHome;
            const brier = Math.pow((winnerIsHome ? 1 : 0) - homeProb, 2);
            const edge = Math.max(homeProb, 1 - homeProb) - 0.5;
            const stake = edge > 0 ? Math.max(5, kellyBet(Math.max(homeProb, 1 - homeProb), -110, 100)) : 0;
            const ev = edge > 0 ? (correct ? stake * 0.91 : -stake) : 0;
            const winnerSeed = winnerIsHome ? (g.home.seed ?? 0) : (g.away.seed ?? 0);
            const loserSeed = winnerIsHome ? (g.away.seed ?? 0) : (g.home.seed ?? 0);
            const winner = winnerIsHome ? g.home.name : g.away.name;
            const loser = winnerIsHome ? g.away.name : g.home.name;
            const loserProb = winnerIsHome ? (1 - homeProb) : homeProb;
            return {
              round: g.round,
              correct,
              brier,
              ev,
              homeProb,
              winnerIsHome,
              game: g,
              winner,
              loser,
              winnerSeed,
              loserSeed,
              loserProb,
              marketImplied: 1 - loserProb,
            };
          }),
      );
      return rows.filter((r): r is NonNullable<typeof r> => Boolean(r));
    },
  });

  const trackSummary = useMemo(() => {
    const rows = trackRecordQ.data ?? [];
    const r64 = rows.filter((r) => r.round === "R64");
    const r32 = rows.filter((r) => r.round === "R32");
    const score = (arr: typeof rows) => ({
      correct: arr.filter((x) => x.correct).length,
      total: arr.length,
      brier: arr.length ? arr.reduce((s, x) => s + x.brier, 0) / arr.length : 0,
    });
    const s64 = score(r64);
    const s32 = score(r32);
    const roiStake = rows.reduce((s, r) => s + Math.abs(r.ev), 0);
    const roi = roiStake > 0 ? (rows.reduce((s, r) => s + r.ev, 0) / roiStake) * 100 : 0;
    const net = rows.reduce((s, r) => s + r.ev, 0);
    const upsets = rows.filter((r) => r.winnerSeed > r.loserSeed && r.winnerSeed - r.loserSeed >= 3);
    const biggestMiss = rows
      .filter((r) => !r.correct && Math.max(r.homeProb, 1 - r.homeProb) > 0.75)
      .sort((a, b) => Math.max(b.homeProb, 1 - b.homeProb) - Math.max(a.homeProb, 1 - a.homeProb))[0];
    return { s64, s32, roi, net, upsets, biggestMiss };
  }, [trackRecordQ.data]);

  const calibration = useMemo(() => {
    const rows = trackRecordQ.data ?? [];
    if (!rows.length) {
      return {
        overconfidence: 0,
        oneSeedOverconfidence: 0,
        hotTeams: [] as string[],
        luckTeams: [] as string[],
      };
    }
    const avgOverconfidence =
      rows.reduce((s, r) => {
        const predictedForWinner = r.winnerIsHome ? r.homeProb : 1 - r.homeProb;
        return s + (predictedForWinner - 1);
      }, 0) / rows.length;
    const oneSeedRows = rows.filter(
      (r) =>
        (r.game.home.seed === 1 || r.game.away.seed === 1) &&
        (r.round === "R64" || r.round === "R32"),
    );
    const oneSeedOverconfidence = oneSeedRows.length
      ? oneSeedRows.reduce((s, r) => s + (Math.max(r.homeProb, 1 - r.homeProb) - Number(r.correct)), 0) /
        oneSeedRows.length
      : 0;

    // Hot streak heuristic: 2+ wins, high average margin, low variance in margins.
    // Luck heuristic: small average margin OR repeated winner probs < 35%.
    const teamRows = new Map<string, { margins: number[]; lowProbWins: number; wins: number }>();
    for (const r of rows) {
      const margin = Math.abs((r.game.home.score ?? 0) - (r.game.away.score ?? 0));
      const key = r.winner;
      const entry = teamRows.get(key) ?? { margins: [], lowProbWins: 0, wins: 0 };
      entry.wins += 1;
      entry.margins.push(margin);
      const winnerProb = r.winnerIsHome ? r.homeProb : 1 - r.homeProb;
      if (winnerProb < 0.35) entry.lowProbWins += 1;
      teamRows.set(key, entry);
    }
    const hotTeams: string[] = [];
    const luckTeams: string[] = [];
    for (const [team, v] of teamRows.entries()) {
      if (v.wins < 1) continue;
      const avg = v.margins.reduce((s, x) => s + x, 0) / v.margins.length;
      const variance =
        v.margins.reduce((s, x) => s + Math.pow(x - avg, 2), 0) / Math.max(1, v.margins.length);
      if (v.wins >= 2 && avg >= 8 && variance <= 50) hotTeams.push(team);
      if (avg <= 3 || v.lowProbWins >= 1) luckTeams.push(team);
    }
    return {
      overconfidence: avgOverconfidence,
      oneSeedOverconfidence,
      hotTeams,
      luckTeams,
    };
  }, [trackRecordQ.data]);

  const valuePicks: BetSlipItem[] = useMemo(() => {
    const hot = new Set(calibration.hotTeams.map((x) => x.toLowerCase()));
    const luck = new Set(calibration.luckTeams.map((x) => x.toLowerCase()));
    const oneSeedShift = calibration.oneSeedOverconfidence > 0 ? -Math.min(0.03, calibration.oneSeedOverconfidence) : 0;
    const baseShift = calibration.overconfidence > 0 ? -Math.min(0.02, calibration.overconfidence) : 0;
    const items: BetSlipItem[] = [];
    for (const row of board.data ?? []) {
      const { game, home, away, homeProb, awayProb } = row;
      if (homeProb == null || awayProb == null) continue;
      let homeAdj = homeProb + baseShift;
      let awayAdj = awayProb + baseShift;
      if ((home.seed ?? 0) === 1) homeAdj += oneSeedShift;
      if ((away.seed ?? 0) === 1) awayAdj += oneSeedShift;
      if (hot.has((home.teamName ?? "").toLowerCase())) homeAdj += 0.015;
      if (luck.has((home.teamName ?? "").toLowerCase())) homeAdj -= 0.015;
      if (hot.has((away.teamName ?? "").toLowerCase())) awayAdj += 0.015;
      if (luck.has((away.teamName ?? "").toLowerCase())) awayAdj -= 0.015;
      homeAdj = clamp01(homeAdj);
      awayAdj = clamp01(awayAdj);
      const hOdds = getConsensusOdds(game, game.home_team, "h2h");
      const aOdds = getConsensusOdds(game, game.away_team, "h2h");
      if (hOdds != null) {
        const implied = americanToImpliedProb(hOdds);
        const edge = homeAdj - implied;
        const stake = 100;
        const ev = calculateEV(homeAdj, hOdds, stake);
        items.push({
          id: `${game.id}-h-${home.teamId}`,
          teamName: bettingTeamLabel(home),
          teamId: home.teamId,
          opponentId: away.teamId,
          opponentName: bettingTeamLabel(away),
          americanOdds: hOdds,
          stake,
          ourProb: homeAdj,
          adjustedProb: homeAdj,
          impliedProb: implied,
          edge,
          ev,
          game,
          round: inferNcaaRoundFromCommence(game.commence_time, game.roundLabel),
        });
      }
      if (aOdds != null) {
        const implied = americanToImpliedProb(aOdds);
        const edge = awayAdj - implied;
        const stake = 100;
        const ev = calculateEV(awayAdj, aOdds, stake);
        items.push({
          id: `${game.id}-a-${away.teamId}`,
          teamName: bettingTeamLabel(away),
          teamId: away.teamId,
          opponentId: home.teamId,
          opponentName: bettingTeamLabel(home),
          americanOdds: aOdds,
          stake,
          ourProb: awayAdj,
          adjustedProb: awayAdj,
          impliedProb: implied,
          edge,
          ev,
          game,
          round: inferNcaaRoundFromCommence(game.commence_time, game.roundLabel),
        });
      }
    }
    return items;
  }, [board.data, calibration]);

  const filteredValuePicks = useMemo(
    () => valuePicks.filter((p) => (p.round ?? "R64") === selectedRound),
    [valuePicks, selectedRound],
  );

  const addToSlip = useCallback(
    (row: BoardRow, side: "home" | "away") => {
      const team = side === "home" ? row.home : row.away;
      const opp = side === "home" ? row.away : row.home;
      const baseProb = side === "home" ? row.homeProb : row.awayProb;
      const oddsName = side === "home" ? row.game.home_team : row.game.away_team;
      if (baseProb == null) return;
      const american = getConsensusOdds(row.game, oddsName, "h2h");
      if (american == null) return;
      const adjustedFromValuePick = valuePicks.find(
        (v) =>
          v.game.id === row.game.id &&
          v.teamId === team.teamId &&
          v.opponentId === opp.teamId,
      )?.ourProb;
      const prob = adjustedFromValuePick ?? baseProb;
      const implied = americanToImpliedProb(american);
      const edge = prob - implied;
      const stake = Math.max(10, kellyBet(prob, american, bankroll));
      const ev = calculateEV(prob, american, stake);
      const pct = bankroll > 0 ? stake / bankroll : 0;
      const stakeBand: BetSlipItem["stakeBand"] = pct >= 0.06 ? "high" : pct >= 0.03 ? "medium" : "low";
      const item: BetSlipItem = {
        id: `${row.game.id}-${side}-${team.teamId}`,
        teamName: bettingTeamLabel(team),
        teamId: team.teamId,
        opponentId: opp.teamId,
        opponentName: bettingTeamLabel(opp),
        americanOdds: american,
        stake,
        ourProb: prob,
        impliedProb: implied,
        edge,
        ev,
        stakeBand,
        game: row.game,
        round: inferNcaaRoundFromCommence(row.game.commence_time, row.game.roundLabel),
      };
      setSlip((s) => [...s.filter((x) => x.id !== item.id), item]);
      const buttonKey = `${row.game.id}-${side}`;
      setRecentlyAdded((prev) => ({ ...prev, [buttonKey]: true }));
      window.setTimeout(() => {
        setRecentlyAdded((prev) => ({ ...prev, [buttonKey]: false }));
      }, 1500);
      toast.success(`Added ${item.teamName} ML to bet slip · $${Math.round(stake)} suggested`);
      slipRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [bankroll, valuePicks],
  );

  const buildAiSlip = useCallback(() => {
    const rows = portfolioRows;
    if (!rows.length || bankroll <= 0) return;
    const byGame = fullBankrollSuggestedByGameId(rows, bankroll);
    const items: BetSlipItem[] = [];
    for (const row of rows) {
      const st = byGame.get(row.game.id);
      if (!st) continue;
      const stake = st.home + st.away;
      if (stake <= 0) continue;
      const side = st.home > 0 ? "home" : "away";
      const team = side === "home" ? row.home : row.away;
      const opp = side === "home" ? row.away : row.home;
      const prob = side === "home" ? row.homeProb! : row.awayProb!;
      const oddsName = side === "home" ? row.game.home_team : row.game.away_team;
      const american = getConsensusOdds(row.game, oddsName, "h2h");
      if (american == null) continue;
      const implied = americanToImpliedProb(american);
      const edge = prob - implied;
      const pct = bankroll > 0 ? stake / bankroll : 0;
      const stakeBand: BetSlipItem["stakeBand"] = pct >= 0.06 ? "high" : pct >= 0.03 ? "medium" : "low";
      items.push({
        id: `ai-${row.game.id}-${side}-${team.teamId}`,
        teamName: bettingTeamLabel(team),
        teamId: team.teamId,
        opponentId: opp.teamId,
        opponentName: bettingTeamLabel(opp),
        americanOdds: american,
        stake,
        ourProb: prob,
        impliedProb: implied,
        edge,
        ev: calculateEV(prob, american, stake),
        adjustedProb: prob,
        stakeBand,
        game: row.game,
        round: inferNcaaRoundFromCommence(row.game.commence_time, row.game.roundLabel),
      });
    }
    setSlip(items);
    toast.success(`AI slip built: ${items.length} bets totaling $${items.reduce((s, x) => s + x.stake, 0).toFixed(0)}`);
  }, [portfolioRows, bankroll]);

  const updateStake = useCallback((id: string, stake: number) => {
    setSlip((prev) =>
      prev.map((it) =>
        it.id === id
          ? {
              ...it,
              stake,
              ev: calculateEV(it.ourProb, it.americanOdds, stake),
              stakeBand:
                bankroll > 0 && stake / bankroll >= 0.06
                  ? "high"
                  : bankroll > 0 && stake / bankroll >= 0.03
                    ? "medium"
                    : "low",
            }
          : it,
      ),
    );
  }, [bankroll]);

  const runAnalysis = async () => {
    setAnalyzing(true);
    setNarratives([]);
    setAnalysisError(null);
    try {
      const out = await Promise.all(
        slip.map((bet) => {
          const lo = Math.min(bet.teamId, bet.opponentId);
          const hi = Math.max(bet.teamId, bet.opponentId);
          return fetchNarrative(lo, hi, "M", {
            context: "betting",
            ourProb: bet.teamId === lo ? bet.ourProb : 1 - bet.ourProb,
            odds: bet.americanOdds,
          });
        }),
      );
      setNarratives(out);
    } catch {
      setAnalysisError("Could not load narratives. Add ANTHROPIC_API_KEY to .env for AI analysis (server-side).");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/40 pb-16">
      <div className="border-b border-border bg-[hsl(var(--bg-surface))] px-4 py-6">
        <div className="mx-auto max-w-6xl">
          <h1 className="font-display text-2xl font-bold uppercase tracking-tight text-white">BETTING ASSISTANT</h1>
          <p className="mt-1 text-sm text-muted-foreground">ML model win probabilities vs live markets · +EV finder</p>
          {requestsRemaining != null && !Number.isNaN(requestsRemaining) && requestsRemaining < 50 ? (
            <p className="mt-2 text-xs font-semibold text-amber-500">
              ⚠ Only {requestsRemaining} Odds API requests remaining this month
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap items-end gap-4">
            <div className="w-full">
              <ToggleGroup type="single" value={selectedRound} onValueChange={(v) => v && setSelectedRound(v)}>
                {ROUNDS.map((r) => (
                  <ToggleGroupItem
                    key={r.key}
                    value={r.key}
                    disabled={r.status === "upcoming"}
                    className={`text-[10px] font-bold uppercase ${r.status === "completed" ? "opacity-70" : ""}`}
                  >
                    {r.label} {r.status === "completed" ? "✓" : r.status === "upcoming" ? "🔒" : ""}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">My bankroll</label>
              <div className="mt-1 flex gap-2">
                <input
                  type="number"
                  className="flex h-9 w-32 rounded-md border border-input bg-background px-3 py-1 text-sm"
                  value={bankroll}
                  onChange={(e) => setBankroll(parseFloat(e.target.value) || 0)}
                />
                <Button type="button" variant="secondary" size="sm" onClick={() => localStorage.setItem("mm2026_bankroll", String(bankroll))}>
                  Update
                </Button>
              </div>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
              Refresh odds
            </Button>
            {dataUpdatedAt ? (
              <span className="text-[10px] text-muted-foreground">
                Odds loaded: {new Date(dataUpdatedAt).toLocaleTimeString()}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-2">
        <div className="space-y-4">
          <details className="rounded-lg border border-border bg-card/40 p-3">
            <summary className="cursor-pointer font-display text-xs font-bold uppercase text-foreground">
              Model track record (learn from R64 + R32)
            </summary>
            {trackRecordQ.isLoading ? (
              <div className="mt-3 space-y-2">
                <div className="h-3 w-full animate-pulse rounded bg-muted" />
                <div className="h-3 w-full animate-pulse rounded bg-muted" />
                <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
              </div>
            ) : (
            <div className="mt-3 space-y-1 text-xs text-muted-foreground">
              {(trackRecordQ.data?.length ?? 0) === 0 ? (
                <div>No completed games yet. Track record will populate as Sweet 16 games finish.</div>
              ) : null}
              <div>Round of 64: {trackSummary.s64.correct}/{trackSummary.s64.total} correct ({trackSummary.s64.total ? ((trackSummary.s64.correct / trackSummary.s64.total) * 100).toFixed(1) : "0"}%) · Avg Brier: {trackSummary.s64.brier.toFixed(3)}</div>
              <div>Round of 32: {trackSummary.s32.correct}/{trackSummary.s32.total} correct ({trackSummary.s32.total ? ((trackSummary.s32.correct / trackSummary.s32.total) * 100).toFixed(1) : "0"}%) · Avg Brier: {trackSummary.s32.brier.toFixed(3)}</div>
              <div>Overall R64+R32 edge: {trackSummary.net >= 0 ? "+" : ""}${trackSummary.net.toFixed(0)} · ROI {trackSummary.roi.toFixed(1)}%</div>
              {r64r32AccuracyQ.data?.summary.total ? (
                <div>
                  Engine audit: {r64r32AccuracyQ.data.summary.correct}/{r64r32AccuracyQ.data.summary.total} correct (
                  {(r64r32AccuracyQ.data.summary.accuracy * 100).toFixed(1)}%) · Avg Brier {r64r32AccuracyQ.data.summary.avgBrier.toFixed(3)}
                </div>
              ) : null}
              {r64r32AccuracyQ.data?.games?.length ? (
                <details className="rounded border border-border/70 bg-background/30 p-2">
                  <summary className="cursor-pointer font-semibold">Game-by-game prediction accuracy</summary>
                  <div className="mt-2 max-h-48 overflow-auto space-y-1">
                    {r64r32AccuracyQ.data.games.map((g, idx) => (
                      <div key={`${g.gameId ?? idx}-${g.wTeamId}-${g.lTeamId}`} className="text-[11px]">
                        {g.round}: W{g.wTeamId} vs L{g.lTeamId} · Winner prob {(g.predProbWinner * 100).toFixed(1)}% ·{" "}
                        {g.correct ? "✓" : "✗"}
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
              {r64r32AccuracyQ.data?.summary.total ? (
                <div className="text-[11px]">Context games loaded: {r64r32AccuracyQ.data.summary.total}/48 (R64+R32)</div>
              ) : null}
              {(trackRecordQ.data?.length ?? 0) > 0 ? (
              <div className="pt-1">
                Key insights from rounds 1-2:
                <ul className="list-disc pl-4">
                  {Math.abs(calibration.oneSeedOverconfidence) > 0.01 ? (
                    <li>
                      {calibration.oneSeedOverconfidence > 0
                        ? "1-seeds have underperformed their model confidence in R64/R32."
                        : "1-seeds have outperformed model confidence in R64/R32."}{" "}
                      Adjustment for Sweet 16 1-seeds:{" "}
                      {calibration.oneSeedOverconfidence > 0 ? "-" : "+"}
                      {(Math.abs(calibration.oneSeedOverconfidence) * 100).toFixed(1)}%
                    </li>
                  ) : null}
                  {calibration.hotTeams.length > 0 ? (
                    <li>Hot streak profile: {calibration.hotTeams.slice(0, 4).join(", ")}</li>
                  ) : null}
                  {calibration.luckTeams.length > 0 ? (
                    <li>Likely luck-driven wins (watch regression): {calibration.luckTeams.slice(0, 4).join(", ")}</li>
                  ) : null}
                  {trackSummary.upsets.map((u) => (
                    <li key={`${u.game.espnId}-upset`}>
                      {u.winner} ({u.winnerSeed}-seed) beat {u.loser} ({u.loserSeed}-seed) — our model had{" "}
                      {((1 - u.loserProb) * 100).toFixed(1)}% for {u.loser}, market implied {(u.marketImplied * 100).toFixed(1)}%
                    </li>
                  ))}
                  {trackSummary.biggestMiss ? (
                    <li>
                      Biggest miss: {trackSummary.biggestMiss.loser} (our model:{" "}
                      {(Math.max(trackSummary.biggestMiss.homeProb, 1 - trackSummary.biggestMiss.homeProb) * 100).toFixed(1)}%) lost to{" "}
                      {trackSummary.biggestMiss.winner} — adjust confidence on similar matchups
                    </li>
                  ) : null}
                </ul>
              </div>
              ) : null}
              <a href="/model" className="text-primary underline">View full game log →</a>
            </div>
            )}
          </details>
          {selectedRound === "S16" ? (
            <div className="rounded-lg border border-border bg-card/40 p-3 text-xs text-muted-foreground">
              <div className="font-display text-[11px] font-bold uppercase text-foreground">
                Sweet 16 factor adjustments
              </div>
              <div className="mt-1">
                Base calibration shift from R64/R32:{" "}
                {calibration.overconfidence > 0 ? "-" : "+"}
                {(Math.abs(calibration.overconfidence) * 100).toFixed(1)}% to favorite confidence.
              </div>
              <div>
                Hot teams get +1.5% win-prob boost; likely-luck teams get -1.5% (capped), then EV recalculates.
              </div>
            </div>
          ) : null}
          {teamsQ.isError ? (
            <Alert variant="destructive" className="border-red-500/40">
              <AlertTitle>Team list from API failed</AlertTitle>
              <AlertDescription className="text-xs">
                {(teamsQ.error as Error)?.message ?? "Unknown error"}. Using bundled 2026 team IDs for matchups. Check{" "}
                <code className="text-foreground">VITE_API_BASE_URL</code> and that the backend reports{" "}
                <code className="text-foreground">ready_m</code> on <code className="text-foreground">/api/health</code>.
              </AlertDescription>
            </Alert>
          ) : null}
          {!hasOddsKey ? (
            <Alert className="border-amber-500/40 bg-amber-500/10">
              <AlertTitle>Using mock odds</AlertTitle>
              <AlertDescription className="text-xs">
                Sweet 16 odds are projected. Add <code className="text-foreground">VITE_ODDS_API_KEY</code> to{" "}
                <code className="text-foreground">.env</code> for live DraftKings/FanDuel lines. Free tier: ~500
                requests/month.
              </AlertDescription>
            </Alert>
          ) : (
            <p className="text-[10px] text-muted-foreground">
              Odds API: free tier ~500 req/mo.
            </p>
          )}
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 className="font-display text-sm font-bold uppercase tracking-wider text-white">Live games + odds</h2>
            {portfolioRows.length > 0 && bankroll > 0 ? (
              <p className="text-[10px] text-muted-foreground">
                Suggested bet buttons split the full bankroll (${bankroll.toFixed(0)}) across this round — total ${suggestedPortfolioTotal} (same weights as AI slip).
              </p>
            ) : null}
          </div>
          {oddsLoading || board.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : null}
          <div className="space-y-4">
            {boardToRender.map((row) => (
              <GameOddsCard
                key={row.game.id}
                game={row.game}
                homeName={bettingTeamLabel(row.home)}
                awayName={bettingTeamLabel(row.away)}
                homeOddsName={row.game.home_team}
                awayOddsName={row.game.away_team}
                homeProb={row.homeProb}
                awayProb={row.awayProb}
                suggestedStake={suggestedByGameId.get(row.game.id) ?? { home: 0, away: 0 }}
                resultSummary={"resultSummary" in row ? row.resultSummary : undefined}
                homeTeamId={row.home.teamId}
                awayTeamId={row.away.teamId}
                onAdd={(side) => addToSlip(row, side)}
                addedState={recentlyAdded}
              />
            ))}
            {!oddsLoading && !board.isLoading && boardToRender.length === 0 ? (
              <p className="text-sm text-muted-foreground">No games available for {selectedRound}.</p>
            ) : null}
          </div>
        </div>

        <div className="space-y-6" ref={slipRef}>
          <TopValuePicks items={filteredValuePicks} selectedRound={selectedRound} />
          <Button type="button" variant="secondary" className="w-full font-display uppercase" onClick={buildAiSlip}>
            Build AI compiled bet slip (full bankroll)
          </Button>
          <BetSlip
            items={slip}
            bankroll={bankroll}
            narratives={narratives}
            analysisError={analysisError}
            onStakeChange={updateStake}
            onRemove={(id) => {
              setSlip((s) => s.filter((x) => x.id !== id));
              setNarratives([]);
            }}
            onAnalyze={runAnalysis}
            analyzing={analyzing}
          />
          <RoundPlanner
            bankroll={bankroll}
            strategy={strategy}
            onStrategyChange={setStrategy}
            opportunities={filteredValuePicks}
            selectedRound={selectedRound}
          />
        </div>
      </div>
    </div>
  );
};

export default BettingAssistantPage;
