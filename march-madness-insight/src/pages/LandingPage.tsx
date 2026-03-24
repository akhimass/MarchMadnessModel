import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { AppBrandBar } from "@/components/layout/AppBrandBar";
import { LiveScoresPreview } from "@/components/live/LiveScoresPreview";
import { fetchMatchupStandardProb, fetchModelPerformance, fetchTeams2026 } from "@/lib/api";
import { getLiveOdds, americanToImpliedProb, getConsensusOdds, matchTeamName } from "@/lib/oddsApi";
import { getDefaultDate, UPCOMING_GAME_PREVIEWS } from "@/lib/tournamentRounds";
import { useTournamentLiveScores } from "@/hooks/useLiveScores";
import { Button } from "@ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/card";
import { Skeleton } from "@ui/skeleton";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const LandingPage = () => {
  const today = todayIso();
  const nextDate = getDefaultDate(today);
  const todayScores = useTournamentLiveScores("M", today);

  const modelQ = useQuery({
    queryKey: ["landing-model-performance"],
    queryFn: fetchModelPerformance,
    staleTime: 300_000,
  });

  const topBetsQ = useQuery({
    queryKey: ["landing-top-bets"],
    queryFn: async () => {
      const [teams, oddsMeta] = await Promise.all([fetchTeams2026("M"), getLiveOdds()]);
      const odds = oddsMeta.games;
      const teamNames = teams.map((t) => t.teamName ?? "");
      const rows = await Promise.all(
        odds.slice(0, 12).map(async (game) => {
          const homeMatch = matchTeamName(game.home_team, teamNames);
          const awayMatch = matchTeamName(game.away_team, teamNames);
          const home = teams.find((t) => (t.teamName ?? "").toLowerCase() === (homeMatch ?? "").toLowerCase());
          const away = teams.find((t) => (t.teamName ?? "").toLowerCase() === (awayMatch ?? "").toLowerCase());
          if (!home?.teamId || !away?.teamId) return null;
          const lo = Math.min(home.teamId, away.teamId);
          const hi = Math.max(home.teamId, away.teamId);
          const pLo = await fetchMatchupStandardProb(lo, hi, "M");
          if (pLo == null) return null;
          const homeProb = home.teamId === lo ? pLo : 1 - pLo;
          const awayProb = 1 - homeProb;
          const homeOdds = getConsensusOdds(game, home.teamName ?? "", "h2h");
          const awayOdds = getConsensusOdds(game, away.teamName ?? "", "h2h");
          if (homeOdds == null || awayOdds == null) return null;
          const homeEdge = homeProb - americanToImpliedProb(homeOdds);
          const awayEdge = awayProb - americanToImpliedProb(awayOdds);
          if (homeEdge >= awayEdge) return { team: home.teamName ?? "", odds: homeOdds, edge: homeEdge };
          return { team: away.teamName ?? "", odds: awayOdds, edge: awayEdge };
        }),
      );
      return rows
        .filter((r): r is { team: string; odds: number; edge: number } => !!r)
        .sort((a, b) => b.edge - a.edge)
        .slice(0, 3);
    },
    staleTime: 120_000,
  });

  const nextPreview = useMemo(() => UPCOMING_GAME_PREVIEWS[nextDate] ?? [], [nextDate]);

  return (
    <div className="min-h-screen bg-muted/40">
      <AppBrandBar />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <section className="rounded-xl border border-border bg-card p-6 text-center">
          <p className="font-display text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">March Madness 2026</p>
          <h1 className="mt-1 font-display text-3xl font-bold uppercase text-foreground md:text-4xl">AI-Powered Bracket Intelligence</h1>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button asChild><Link to="/bracket?stage=R1&gender=M">Bracket Picker</Link></Button>
            <Button asChild variant="outline"><Link to="/bracket/live?gender=M">Live Bracket</Link></Button>
            <Button asChild variant="outline"><Link to="/betting">Betting Assistant</Link></Button>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">Live Now</h2>
          <LiveScoresPreview maxGames={3} />
          {(todayScores.data?.length ?? 0) === 0 ? (
            <Card className="border-border bg-card/70">
              <CardContent className="space-y-2 p-4 text-sm text-muted-foreground">
                <p>Next games: Sweet 16 on Thu Mar 27</p>
                <ul className="list-disc pl-5 text-xs">
                  {nextPreview.slice(0, 4).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </section>

        <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {modelQ.isLoading ? (
            <>
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </>
          ) : (
            <>
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Model Accuracy</p><p className="font-display text-2xl font-bold">{(((modelQ.data?.ensemble?.accuracy ?? 0.714) * 100)).toFixed(1)}%</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Brier Score</p><p className="font-display text-2xl font-bold">{(modelQ.data?.ensemble?.brier ?? 0.168).toFixed(3)}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Upsets Called</p><p className="font-display text-2xl font-bold">4/8</p></CardContent></Card>
            </>
          )}
        </section>

        <section>
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-sm font-bold uppercase">Top Value Picks for Sweet 16</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {topBetsQ.isLoading ? (
                <>
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </>
              ) : (
                (topBetsQ.data ?? []).map((b) => (
                  <div key={b.team} className="flex items-center justify-between rounded border border-border px-3 py-2 text-sm">
                    <span>{b.team} ML ({b.odds > 0 ? "+" : ""}{b.odds})</span>
                    <span className="text-emerald-400">Edge: +{(b.edge * 100).toFixed(1)}%</span>
                  </div>
                ))
              )}
              <Button asChild variant="secondary" className="w-full"><Link to="/betting">View All Picks →</Link></Button>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          <Card><CardContent className="p-4"><p className="font-display text-sm font-bold uppercase">Bracket Picker</p><p className="text-xs text-muted-foreground">Pick your winners</p><Button asChild variant="link" className="px-0"><Link to="/bracket?stage=R1&gender=M">Open →</Link></Button></CardContent></Card>
          <Card><CardContent className="p-4"><p className="font-display text-sm font-bold uppercase">Model Analyzer</p><p className="text-xs text-muted-foreground">Track accuracy</p><Button asChild variant="link" className="px-0"><Link to="/model">Open →</Link></Button></CardContent></Card>
          <Card><CardContent className="p-4"><p className="font-display text-sm font-bold uppercase">Kaggle Evaluator</p><p className="text-xs text-muted-foreground">Upload & score CSV</p><Button asChild variant="link" className="px-0"><Link to="/analyzer">Open →</Link></Button></CardContent></Card>
        </section>
      </main>
    </div>
  );
};

export default LandingPage;
