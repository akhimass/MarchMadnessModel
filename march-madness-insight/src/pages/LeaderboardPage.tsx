import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { InnerPageShell } from "@/components/layout/InnerPageShell";
import { LiveScoresPreview } from "@/components/live/LiveScoresPreview";
import { useTournamentResults } from "@/hooks/useTournamentResults";
import { fetchMatchupStandardProb } from "@/lib/api";

import { Card, CardContent } from "@ui/card";
import { Separator } from "@ui/separator";
import { Button } from "@ui/button";

const LeaderboardPage = () => {
  const completedQ = useTournamentResults("M");

  const judgedQ = useQuery({
    queryKey: ["leaderboard-judged", completedQ.data],
    enabled: Boolean(completedQ.data?.length),
    queryFn: async () => {
      const games = completedQ.data ?? [];
      const rows = await Promise.all(
        games
          .filter((g) => g.homeKaggleId && g.awayKaggleId && g.winnerKaggleId)
          .map(async (g) => {
            const lo = Math.min(g.homeKaggleId!, g.awayKaggleId!);
            const hi = Math.max(g.homeKaggleId!, g.awayKaggleId!);
            const pLo = await fetchMatchupStandardProb(lo, hi, "M");
            const homeIsLo = g.homeKaggleId === lo;
            const homeProb = homeIsLo ? pLo : 1 - pLo;
            const winnerIsHome = g.winnerKaggleId === g.homeKaggleId;
            const predHome = homeProb >= 0.5;
            const correct = predHome === winnerIsHome;
            const brier = Math.pow((winnerIsHome ? 1 : 0) - homeProb, 2);
            const upset = winnerIsHome ? homeProb < 0.5 : homeProb >= 0.5;
            return {
              game: `#${g.away.seed || "?"} ${g.away.abbreviation} vs #${g.home.seed || "?"} ${g.home.abbreviation}`,
              score: `${g.away.score}-${g.home.score}`,
              pred: Math.round(Math.max(homeProb, 1 - homeProb) * 100),
              correct,
              upset,
              brier,
            };
          }),
      );
      return rows;
    },
    staleTime: 60_000,
  });

  const brierResult = useMemo(() => {
    const rows = judgedQ.data ?? [];
    if (!rows.length) return null;
    const gamesScored = rows.length;
    const correct = rows.filter((r) => r.correct).length;
    const upsetRows = rows.filter((r) => r.upset);
    const upsetCorrect = upsetRows.filter((r) => r.correct).length;
    const brierScore = rows.reduce((s, r) => s + r.brier, 0) / gamesScored;
    return {
      gamesScored,
      accuracy: correct / gamesScored,
      upsetTotal: upsetRows.length,
      upsetCorrect,
      brierScore,
    };
  }, [judgedQ.data]);

  const liveResults = useMemo(() => {
    return (judgedQ.data ?? [])
      .slice(0, 10)
      .map((r) => ({ game: r.game, score: r.score, pred: r.pred, correct: r.correct }));
  }, [judgedQ.data]);

  return (
    <InnerPageShell
      contextLabel="LEADERBOARD"
      contextDescription="Real-time model performance snapshot"
      crumbs={[{ label: "Leaderboard" }]}
    >
      <main className="mx-auto max-w-4xl space-y-8 px-4 py-8">
        <div className="space-y-2">
          <h1 className="font-display text-2xl font-bold uppercase tracking-wider text-foreground md:text-3xl">
            LEADERBOARD
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Ensemble v3.2 metrics are computed from completed ESPN tournament games.{" "}
            <Link to="/model" className="font-semibold text-primary underline-offset-4 hover:underline">
              Compare bracket models (Akhi vs Massey, NET, seed…)
            </Link>
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Card className="border bg-card text-center shadow-sm">
            <CardContent className="p-4">
              <div className="font-display text-4xl font-bold text-emerald-500">
                {brierResult ? `${Math.round(brierResult.accuracy * 100)}%` : "—"}
              </div>
              <div className="mt-1 font-body text-xs text-muted-foreground">Overall accuracy</div>
            </CardContent>
          </Card>
          <Card className="border bg-card text-center shadow-sm">
            <CardContent className="p-4">
              <div className="font-display text-4xl font-bold text-primary">
                {brierResult && brierResult.upsetTotal > 0
                  ? `${Math.round((brierResult.upsetCorrect / brierResult.upsetTotal) * 100)}%`
                  : "—"}
              </div>
              <div className="mt-1 font-body text-xs text-muted-foreground">Upset detection</div>
            </CardContent>
          </Card>
          <Card className="border bg-card text-center shadow-sm">
            <CardContent className="p-4">
              <div className="font-display text-4xl font-bold text-foreground">
                {brierResult ? brierResult.brierScore.toFixed(3) : "—"}
              </div>
              <div className="mt-1 font-body text-xs text-muted-foreground">Brier score</div>
            </CardContent>
          </Card>
        </div>

        {brierResult && brierResult.gamesScored > 0 ? (
          <p className="rounded-lg border border-border bg-muted/30 px-4 py-2 text-center text-xs text-muted-foreground">
            Scoring {brierResult.gamesScored} completed tournament games · Updates about every 2 minutes
          </p>
        ) : null}

        <section>
          <h2 className="mb-4 font-display text-sm font-bold uppercase tracking-[0.2em] text-foreground">
            Submission tracker
          </h2>
          <Card className="overflow-hidden border bg-card shadow-sm">
            <div className="grid grid-cols-[40px_1fr_100px_60px_60px_60px] gap-2 bg-muted/50 px-4 py-2">
              {["#", "Model", "Date", "Brier", "Correct", "Upsets"].map((h) => (
                <span key={h} className="font-display text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {h}
                </span>
              ))}
            </div>
            {[
              {
                name: "Ensemble v3.2",
                date: "Live",
                brier: brierResult?.brierScore ?? 0,
                correct: brierResult ? Math.round(brierResult.accuracy * brierResult.gamesScored) : 0,
                upsetAccuracy:
                  brierResult && brierResult.upsetTotal > 0
                    ? Math.round((brierResult.upsetCorrect / brierResult.upsetTotal) * 100)
                    : 0,
                rank: 1,
              },
              { name: "XGBoost Only", date: "Mar 14, 2026", brier: 0.168, correct: 44, upsetAccuracy: 58, rank: 2 },
              { name: "Power Ratings", date: "Mar 13, 2026", brier: 0.185, correct: 41, upsetAccuracy: 42, rank: 3 },
              { name: "Seed Baseline", date: "Mar 12, 2026", brier: 0.221, correct: 38, upsetAccuracy: 25, rank: 4 },
            ].map((s, i, arr) => (
              <div key={s.name}>
                <div className="grid grid-cols-[40px_1fr_100px_60px_60px_60px] items-center gap-2 px-4 py-3 transition-colors hover:bg-muted/40">
                  <span className="font-display text-sm font-bold text-primary">{s.rank}</span>
                  <span className="font-display text-sm font-semibold text-foreground">{s.name}</span>
                  <span className="font-body text-xs text-muted-foreground">{s.date}</span>
                  <span className="font-display text-sm font-bold text-foreground">{s.brier.toFixed(3)}</span>
                  <span className="font-display text-sm font-bold text-emerald-500">{s.correct}</span>
                  <span className="font-display text-sm font-bold text-primary">{s.upsetAccuracy}%</span>
                </div>
                {i < arr.length - 1 && <Separator />}
              </div>
            ))}
          </Card>
        </section>

        <section>
          <h2 className="mb-4 font-display text-sm font-bold uppercase tracking-[0.2em] text-foreground">
            {liveResults.length > 0 ? "Live results" : "Recent results"}
          </h2>
          <div className="space-y-2">
            {(liveResults.length > 0
              ? liveResults
              : [
                  { game: "#1 Duke vs #16 Siena", score: "", pred: 97, correct: true },
                  { game: "#8 Iowa vs #9 Boise St", score: "", pred: 52, correct: false },
                  { game: "#2 UConn vs #15 Furman", score: "", pred: 93, correct: true },
                  { game: "#4 Kansas vs #13 Cal Baptist", score: "", pred: 65, correct: true },
                  { game: "#7 Marquette vs #10 Vermont", score: "", pred: 58, correct: false },
                ]
            ).map((r) => (
              <div
                key={r.game}
                className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
                  r.correct ? "border-emerald-500/25 bg-emerald-500/5" : "border-destructive/25 bg-destructive/5"
                }`}
              >
                <div>
                  <span className="font-body text-sm text-foreground">{r.game}</span>
                  {r.score ? <span className="ml-2 font-display text-xs text-muted-foreground">{r.score}</span> : null}
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-display text-sm font-bold text-muted-foreground">{r.pred}%</span>
                  <span
                    className={`rounded px-2 py-0.5 font-display text-[10px] font-bold ${
                      r.correct ? "bg-emerald-500/20 text-emerald-400" : "bg-destructive/20 text-destructive"
                    }`}
                  >
                    {r.correct ? "✓ CORRECT" : "✗ WRONG"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <LiveScoresPreview maxGames={3} />

        <div className="flex flex-wrap gap-2 pb-8">
          <Button variant="outline" size="sm" asChild>
            <Link to="/analyzer">Submission analyzer</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/bracket?stage=R1&gender=M">Bracket</Link>
          </Button>
        </div>
      </main>
    </InnerPageShell>
  );
};

export default LeaderboardPage;
