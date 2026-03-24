import Papa from "papaparse";
import type { Team } from "@/types/bracket";

export interface SubmissionRow {
  id: string;
  pred: number;
  season: number;
  team1Id: number;
  team2Id: number;
  gender: "M" | "W";
}

export interface UpsetPick {
  id: string;
  team1Name: string;
  team2Name: string;
  seed1: number;
  seed2: number;
  prob: number;
  seedGap: number;
  isUpset: boolean;
}

export interface TeamPath {
  teamName: string;
  probabilities: number[];
  overallProb: number;
}

export interface AnalysisStats {
  totalMatchups: number;
  mensGames: number;
  womensGames: number;
  avgConfidence: number;
  upsetPicks: number;
  highConfidence: number;
}

export function parseSubmission(file: File): Promise<SubmissionRow[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows: SubmissionRow[] = [];
        for (const row of results.data as Record<string, string>[]) {
          const id = row["ID"] || row["id"] || "";
          const pred = parseFloat(row["Pred"] || row["pred"] || "0.5");
          if (!id || isNaN(pred)) continue;

          const parts = id.split("_");
          if (parts.length !== 3) continue;

          const season = parseInt(parts[0]);
          const team1Id = parseInt(parts[1]);
          const team2Id = parseInt(parts[2]);
          if (isNaN(season) || isNaN(team1Id) || isNaN(team2Id)) continue;

          rows.push({
            id,
            pred,
            season,
            team1Id,
            team2Id,
            gender: team1Id < 3000 ? "M" : "W",
          });
        }
        resolve(rows);
      },
      error: (err) => reject(err),
    });
  });
}

export function computeAnalysisStats(rows: SubmissionRow[]): AnalysisStats {
  const season2026 = rows.filter((r) => r.season === 2026);
  const mens = season2026.filter((r) => r.gender === "M");
  const womens = season2026.filter((r) => r.gender === "W");

  const confidences = season2026.map((r) => Math.abs(r.pred - 0.5));
  const avgConf = confidences.length > 0
    ? confidences.reduce((a, b) => a + b, 0) / confidences.length
    : 0;

  const upsets = season2026.filter((r) => {
    // If team1 is expected favorite (lower ID often = higher seed in Kaggle)
    // An upset pick is when pred < 0.5 (picking team2)
    return r.pred < 0.4 || r.pred > 0.6;
  });

  return {
    totalMatchups: rows.length,
    mensGames: mens.length,
    womensGames: womens.length,
    avgConfidence: Math.round((avgConf + 0.5) * 100),
    upsetPicks: season2026.filter((r) => r.pred < 0.4).length,
    highConfidence: season2026.filter((r) => Math.abs(r.pred - 0.5) > 0.3).length,
  };
}

export function getConfidenceDistribution(rows: SubmissionRow[]): { bucket: string; count: number }[] {
  const buckets = Array.from({ length: 10 }, (_, i) => ({
    bucket: `${i * 10}-${(i + 1) * 10}%`,
    count: 0,
  }));

  for (const row of rows) {
    const pct = Math.min(Math.floor(row.pred * 10), 9);
    buckets[pct].count++;
  }

  return buckets;
}

export function getTopUpsetPicks(
  rows: SubmissionRow[],
  teamsMap: Map<number, Team>
): UpsetPick[] {
  const season2026 = rows.filter((r) => r.season === 2026 && r.gender === "M");

  return season2026
    .map((r) => {
      const t1 = teamsMap.get(r.team1Id);
      const t2 = teamsMap.get(r.team2Id);
      const seed1 = t1?.seed || 8;
      const seed2 = t2?.seed || 8;
      const seedGap = Math.abs(seed1 - seed2);
      const isUpset = (seed1 < seed2 && r.pred < 0.5) || (seed2 < seed1 && r.pred > 0.5);

      return {
        id: r.id,
        team1Name: t1?.name || `Team ${r.team1Id}`,
        team2Name: t2?.name || `Team ${r.team2Id}`,
        seed1,
        seed2,
        prob: r.pred,
        seedGap,
        isUpset,
      };
    })
    .filter((u) => u.isUpset)
    .sort((a, b) => b.seedGap - a.seedGap)
    .slice(0, 15);
}
