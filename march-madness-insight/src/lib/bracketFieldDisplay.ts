/**
 * Single source of truth for **display** seed + school name on bracket UI, live cards, and scoreboard.
 * Prefer published field data (`teams2026` / `/api/teams/2026`) over raw pipeline/API tokens.
 */
import type { ApiBracketTeamRow } from "@/lib/bracketApiTypes";
import type { GameTeam } from "@/lib/espnApi";
import { teamsById } from "@/data/teams2026";
import { resolveMenKaggleId } from "@/lib/espnTeamToKaggle";

export type WomenFieldRow = { teamName?: string | null; seed?: number };

/**
 * Bracket API row → seed + name shown in picker / tree (matches `teams2026` for men).
 */
export function apiTeamDisplay(
  gender: "M" | "W",
  t: ApiBracketTeamRow | undefined,
  womenById?: Map<number, WomenFieldRow>,
): { seed: number; name: string } {
  const id = Number(t?.teamId ?? 0);
  const apiSeed = Number(t?.seed ?? 0);
  const apiName = String(t?.teamName ?? "TBD");
  if (gender === "M" && id > 0) {
    const m = teamsById.get(id);
    if (m) return { seed: m.seed, name: m.name };
  }
  if (gender === "W" && id > 0 && womenById) {
    const w = womenById.get(id);
    if (w) {
      return {
        seed: Number(w.seed ?? apiSeed),
        name: String(w.teamName ?? apiName),
      };
    }
  }
  return { seed: apiSeed, name: apiName };
}

/**
 * Live scoreboard `GameTeam` → seed + name (men: resolve Kaggle id → `teams2026`).
 */
export function liveGameTeamDisplay(team: GameTeam, gender: "M" | "W"): { seed: number; name: string } {
  if (gender === "M") {
    const k = resolveMenKaggleId(team);
    if (k && teamsById.has(k)) {
      const m = teamsById.get(k)!;
      return { seed: m.seed, name: m.name };
    }
  }
  const s = Number(team.seed ?? 0);
  const n = String(team.name ?? "").trim() || String(team.abbreviation ?? "TBD");
  return { seed: s, name: n };
}
