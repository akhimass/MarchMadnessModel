import { useQuery } from "@tanstack/react-query";

import { fetchMatchup } from "@/lib/api";
import { ModelBreakdownTable } from "@/components/predictor/ModelBreakdownTable";
import { PredictionGauge } from "@/components/predictor/PredictionGauge";

/**
 * Full matchup view aligned with PredictorPage: gauge + sub-model breakdown from `/api/matchup`.
 * Team order follows API (lower TeamID = team1).
 */
export function MatchupBreakdownPanel({
  homeTeamId,
  awayTeamId,
}: {
  homeTeamId: number;
  awayTeamId: number;
}) {
  const lo = Math.min(homeTeamId, awayTeamId);
  const hi = Math.max(homeTeamId, awayTeamId);
  const matchId = `${lo}-${hi}`;

  const q = useQuery({
    queryKey: ["betting-matchup-breakdown", matchId],
    queryFn: () => fetchMatchup(matchId),
    enabled: Number.isFinite(lo) && Number.isFinite(hi) && lo > 0 && hi > 0 && lo !== hi,
    staleTime: 120_000,
  });

  if (q.isLoading) {
    return (
      <div className="space-y-2 py-2">
        <div className="h-3 w-full animate-pulse rounded bg-muted" />
        <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
        <div className="h-24 w-full animate-pulse rounded bg-muted/60" />
      </div>
    );
  }

  if (q.isError || !q.data) {
    return <p className="py-2 text-[11px] text-muted-foreground">Full model breakdown isn&apos;t available for this matchup.</p>;
  }

  const d = q.data;

  return (
    <div className="space-y-4 pt-2">
      <PredictionGauge
        prob={d.standardProb}
        team1={d.team1.name}
        team2={d.team2.name}
        team1Abbrev={d.team1.abbreviation}
        team2Abbrev={d.team2.abbreviation}
        team1Color={d.team1.color}
      />
      <div className="max-h-[min(420px,55vh)] overflow-y-auto rounded-md border border-border/60">
        <ModelBreakdownTable
          breakdown={d.modelBreakdown}
          team1Abbrev={d.team1.abbreviation}
          team2Abbrev={d.team2.abbreviation}
          team1Color={d.team1.color}
        />
      </div>
    </div>
  );
}
