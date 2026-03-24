import type { UserPick } from "@/types/bracket";

/** Canonical key for bracket picks (matches `useBracketPicks`). */
export const BRACKET_PICKS_STORAGE_KEY = "mm2026_picks";
const LEGACY_KEY = "bracket-picks-2026";

export function loadBracketPicks(): UserPick {
  try {
    const raw =
      localStorage.getItem(BRACKET_PICKS_STORAGE_KEY) ?? localStorage.getItem(LEGACY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as UserPick;
    return {};
  } catch {
    return {};
  }
}

export function saveBracketPicks(picks: UserPick): void {
  try {
    localStorage.setItem(BRACKET_PICKS_STORAGE_KEY, JSON.stringify(picks ?? {}));
  } catch {
    // ignore quota / private mode
  }
}

export function bracketPickCount(picks: UserPick = loadBracketPicks()): number {
  return Object.keys(picks).length;
}
