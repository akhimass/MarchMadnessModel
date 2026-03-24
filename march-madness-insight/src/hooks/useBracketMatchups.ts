import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";

import { fetchFirstRoundMatchupsTyped, fetchRoundMatchups } from "@/lib/api";
import type { ApiBracketMatchupRow } from "@/lib/bracketApiTypes";

const POST_STAGES = ["R2", "R3", "R4", "R5", "R6"] as const;

/**
 * All first-through-final matchups resolved for a pick map (for scoring / analytics).
 */
export function useBracketMatchupsForPicks(picks: Record<string, number>, gender: "M" | "W") {
  const { data: first, isLoading: loadingFirst } = useQuery({
    queryKey: ["first-round", gender],
    queryFn: () => fetchFirstRoundMatchupsTyped(gender),
    staleTime: 5 * 60_000,   // First-round matchups are static — cache for 5 min
    refetchOnWindowFocus: false,
  });

  const postQueries = useQueries({
    queries: POST_STAGES.map((stage) => ({
      queryKey: ["round-matchups", stage, gender, picks],
      queryFn: () => fetchRoundMatchups(stage, gender, picks, 2026),
      enabled: Object.keys(picks).length > 0,
      staleTime: 2 * 60_000,
      refetchOnWindowFocus: false,
    })),
  });

  const allMatchups: ApiBracketMatchupRow[] = useMemo(() => {
    const r1: ApiBracketMatchupRow[] = [];
    if (first?.matchupsByRegion) {
      const { east, south, west, midwest } = first.matchupsByRegion;
      r1.push(...(east ?? []), ...(south ?? []), ...(west ?? []), ...(midwest ?? []));
    }
    const r2 = postQueries[0]?.data?.matchups ?? [];
    const r3 = postQueries[1]?.data?.matchups ?? [];
    const r4 = postQueries[2]?.data?.matchups ?? [];
    const r5 = postQueries[3]?.data?.matchups ?? [];
    const r6 = postQueries[4]?.data?.matchups ?? [];
    return [...r1, ...r2, ...r3, ...r4, ...r5, ...r6];
  }, [first, postQueries]);

  const loadingPosts = postQueries.some((q) => q.isPending);

  return {
    allMatchups,
    loading: loadingFirst || (Object.keys(picks).length > 0 && loadingPosts),
  };
}
