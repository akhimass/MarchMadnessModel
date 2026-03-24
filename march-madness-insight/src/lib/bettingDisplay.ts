import type { Team2026Row } from "@/lib/api";

/** Canonical labels for betting UI (align with bracket / user expectations). */
export function bettingTeamLabel(team: Pick<Team2026Row, "teamId" | "teamName"> | null | undefined): string {
  if (team == null) return "TBD";
  if (team.teamId === 1163) return "UConn";
  if (team.teamId === 1277) return "Michigan St";
  const raw = (team.teamName ?? "").trim();
  if (!raw) return "TBD";
  const lower = raw.toLowerCase();
  if (lower === "connecticut") return "UConn";
  return raw;
}
