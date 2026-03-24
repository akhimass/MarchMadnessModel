import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "mm2026_picks";

export type BracketPicksMap = Record<string, number>;

function loadPicks(): BracketPicksMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as BracketPicksMap;
    }
  } catch {
    /* ignore */
  }
  return {};
}

/**
 * Bracket slot → winning teamId (Kaggle / API id). Slot keys match backend tokens (e.g. R1W1).
 */
export function useBracketPicks() {
  const [picks, setPicks] = useState<BracketPicksMap>(loadPicks);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(picks));
  }, [picks]);

  const setPick = useCallback((slotKey: string, teamId: number) => {
    setPicks((prev) => {
      const roundMatch = slotKey.match(/^R(\d+)/);
      const roundNum = roundMatch ? parseInt(roundMatch[1], 10) : 0;
      const next: BracketPicksMap = { ...prev };
      for (const k of Object.keys(next)) {
        const m = k.match(/^R(\d+)/);
        const r = m ? parseInt(m[1], 10) : 0;
        if (r > roundNum) delete next[k];
      }
      next[slotKey] = teamId;
      return next;
    });
  }, []);

  const clearPicks = useCallback(() => setPicks({}), []);

  return { picks, setPick, setPicks, clearPicks };
}
