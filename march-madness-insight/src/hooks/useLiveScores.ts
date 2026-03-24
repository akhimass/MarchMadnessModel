import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  fetchScoreboard,
  fetchGameSummary,
  fetchAllTournamentResults,
  computeBrierScore,
  type LiveGame,
  type BrierResult,
} from "@/lib/espnApi";
import { filterMarchMadnessGames, type ApiTeamRow } from "@/lib/marchMadnessFilter";

export function useLiveScores(gender: 'M' | 'W', date?: string) {
  return useQuery({
    queryKey: ['scoreboard', gender, date],
    queryFn: async () => {
      try {
        return await fetchScoreboard(gender, date);
      } catch {
        // Keep UI alive even when backend is temporarily down.
        return [] as LiveGame[];
      }
    },
    refetchInterval: (query) => {
      const games = query.state.data;
      if (!games) return 30_000;
      const hasLive = games.some((g) => g.state === 'in');
      return hasLive ? 30_000 : 5 * 60_000;
    },
    staleTime: 10_000,
  });
}

/**
 * ESPN scoreboard filtered to 2026 tournament teams only (men: static field; women: API team list).
 */
export function useTournamentLiveScores(gender: 'M' | 'W', date?: string) {
  const raw = useLiveScores(gender, date);
  const wTeamsQuery = useQuery({
    queryKey: ['tournament-field-teams', 2026, 'W'],
    queryFn: async (): Promise<ApiTeamRow[]> => {
      const apiBase =
        (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8000';
      const res = await fetch(`${apiBase}/api/teams/2026?gender=W`);
      if (!res.ok) throw new Error(`teams W failed (${res.status})`);
      return res.json();
    },
    enabled: gender === 'W',
    staleTime: 60 * 60 * 1000,
  });

  const filtered = useMemo(() => {
    if (!raw.data) return undefined;
    // Keep women's strict field filter, but for men prefer showing all live board data
    // so the UI never looks empty when ESPN metadata is sparse.
    if (gender === "M") {
      const strict = filterMarchMadnessGames(raw.data, gender);
      return strict.length > 0 ? strict : raw.data;
    }
    return filterMarchMadnessGames(raw.data, gender, wTeamsQuery.data);
  }, [raw.data, gender, wTeamsQuery.data]);

  const womenPending = gender === 'W' && wTeamsQuery.isPending;

  return {
    ...raw,
    data: filtered,
    isLoading: raw.isLoading || womenPending,
  };
}

/**
 * All completed March Madness games across known tournament dates (deduped), after field + seed filters.
 * Used for “previous scores” on the live dashboard.
 */
export function useMarchMadnessCompletedHistory(gender: 'M' | 'W') {
  const apiBase =
    (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8000';

  return useQuery({
    queryKey: ['mm-completed-history', gender],
    queryFn: async () => {
      let womenTeams: ApiTeamRow[] | undefined;
      if (gender === 'W') {
        const res = await fetch(`${apiBase}/api/teams/2026?gender=W`);
        if (!res.ok) throw new Error(`teams W failed (${res.status})`);
        womenTeams = await res.json();
      }
      const raw = await fetchAllTournamentResults(gender);
      return filterMarchMadnessGames(raw, gender, womenTeams);
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

export function useGameSummary(espnId: string, gender: 'M' | 'W') {
  return useQuery({
    queryKey: ['game', espnId, gender],
    queryFn: () => fetchGameSummary(espnId, gender),
    enabled: !!espnId,
    refetchInterval: (query) => query.state.data?.state === 'in' ? 15_000 : false,
  });
}

export function useTournamentResults(gender: 'M' | 'W') {
  return useQuery({
    queryKey: ['tournament-results', gender],
    queryFn: () => fetchAllTournamentResults(gender),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useBrierScore(
  predictions: Map<string, number>,
  kaggleSeeds: Map<number, number>,
  gender: 'M' | 'W'
): { data: BrierResult | null; isLoading: boolean } {
  const { data: games, isLoading } = useTournamentResults(gender);

  const result = useMemo(() => {
    if (!games || !predictions.size) return null;
    return computeBrierScore(predictions, games, kaggleSeeds);
  }, [games, predictions, kaggleSeeds]);

  return { data: result, isLoading };
}
