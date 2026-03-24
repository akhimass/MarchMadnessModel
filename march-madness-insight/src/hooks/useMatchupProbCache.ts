import { useCallback, useRef } from "react";

import { fetchMatchupStandardProb } from "@/lib/api";

/**
 * Lazy-fetch P(team1 wins) for ordered pair (minId, maxId); caches in memory.
 */
export function useMatchupProbCache(gender: "M" | "W") {
  const cache = useRef<Map<string, number>>(new Map());

  const getProb = useCallback(
    async (a: number, b: number): Promise<number | null> => {
      if (!a || !b) return null;
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      const key = `${lo}-${hi}`;
      const hit = cache.current.get(key);
      if (hit !== undefined) return hit;
      const p = await fetchMatchupStandardProb(lo, hi, gender);
      if (p != null) cache.current.set(key, p);
      return p;
    },
    [gender],
  );

  return { getProb, cache: cache.current };
}
