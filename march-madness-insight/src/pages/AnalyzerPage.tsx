import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { UploadZone } from "@/components/UploadZone";
import { InnerPageShell } from "@/components/layout/InnerPageShell";
import { LiveScoresPreview } from "@/components/live/LiveScoresPreview";
import {
  parseSubmission,
  computeAnalysisStats,
  getConfidenceDistribution,
  getTopUpsetPicks,
  type SubmissionRow,
  type AnalysisStats,
  type UpsetPick,
} from "@/lib/csvParser";
import { teamsById, menTeams2026 } from "@/data/teams2026";
import { useTournamentResults } from "@/hooks/useLiveScores";
import { computeBrierScore, espnToKaggle, type BrierResult } from "@/lib/espnApi";
import { Separator } from "@ui/separator";
import { Card, CardContent } from "@ui/card";
import { Button } from "@ui/button";

const AnalyzerPage = () => {
  const [rows, setRows] = useState<SubmissionRow[]>([]);
  const [stats, setStats] = useState<AnalysisStats | null>(null);
  const [distribution, setDistribution] = useState<{ bucket: string; count: number }[]>([]);
  const [upsets, setUpsets] = useState<UpsetPick[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [autoLoadMsg, setAutoLoadMsg] = useState<string | null>(null);

  const { data: completedGames } = useTournamentResults('M');
  const submissionStatsQ = useQuery({
    queryKey: ["submission-stats"],
    queryFn: async () => {
      const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000";
      const res = await fetch(`${apiBase}/api/analyzer/submission-stats`);
      if (!res.ok) throw new Error(`submission stats failed (${res.status})`);
      return res.json() as Promise<{
        available: boolean;
        rows?: number;
        pred_min?: number;
        pred_max?: number;
      }>;
    },
    staleTime: 60_000,
  });

  // Build predictions map and seeds map from uploaded rows
  const predictionsMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      map.set(r.id, r.pred);
    }
    return map;
  }, [rows]);

  const seedsMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const t of menTeams2026) {
      map.set(t.id, t.seed);
    }
    return map;
  }, []);

  // Compute live Brier score
  const brierResult: BrierResult | null = useMemo(() => {
    if (!completedGames || !predictionsMap.size) return null;
    return computeBrierScore(predictionsMap, completedGames, seedsMap);
  }, [completedGames, predictionsMap, seedsMap]);

  // Match completed games to predictions for live results panel
  const liveResults = useMemo(() => {
    if (!completedGames || !predictionsMap.size) return [];
    return completedGames.slice(0, 20).map(game => {
      // Prefer kaggleId from the game object (populated by backend for all teams);
      // fall back to the static 25-team espnToKaggle map as a safety net.
      const awayK = game.away.kaggleId ?? espnToKaggle(game.away.espnId, 'M');
      const homeK = game.home.kaggleId ?? espnToKaggle(game.home.espnId, 'M');
      if (!awayK || !homeK) return null;
      const key = `2026_${Math.min(awayK, homeK)}_${Math.max(awayK, homeK)}`;
      const pred = predictionsMap.get(key);
      if (pred === undefined) return null;

      const team1Id = Math.min(awayK, homeK);
      const team1Won = awayK === team1Id ? game.away.winner : game.home.winner;
      const predictedTeam1 = pred >= 0.5;
      const correct = predictedTeam1 === team1Won;

      return {
        game: `${game.away.abbreviation} vs ${game.home.abbreviation}`,
        score: `${game.away.score}-${game.home.score}`,
        pred: Math.round(Math.max(pred, 1 - pred) * 100),
        correct,
      };
    }).filter(Boolean) as { game: string; score: string; pred: number; correct: boolean }[];
  }, [completedGames, predictionsMap]);

  const handleFile = async (file: File) => {
    setIsLoading(true);
    try {
      const parsed = await parseSubmission(file);
      setRows(parsed);
      setStats(computeAnalysisStats(parsed));
      setDistribution(getConfidenceDistribution(parsed));
      setUpsets(getTopUpsetPicks(parsed, teamsById));
    } catch (e) {
      console.error("Parse error:", e);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <InnerPageShell
      contextLabel="KAGGLE EVALUATOR"
      contextDescription="Kaggle CSV · confidence & Brier"
      crumbs={[{ label: "Kaggle Evaluator" }]}
    >
      <main className="mx-auto max-w-4xl space-y-8 px-4 py-8">
        <div className="space-y-2">
          <h1 className="font-display text-2xl font-bold uppercase tracking-wider text-foreground md:text-3xl">
            KAGGLE EVALUATOR
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Upload your competition CSV to inspect confidence, upset picks, and how your probabilities score against finished games (Brier).
          </p>
        </div>

        <UploadZone
          onFileSelected={handleFile}
          isLoading={isLoading}
          rowCount={rows.length || undefined}
        />
        {submissionStatsQ.data?.available ? (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
              <div>
                Your submission.csv is ready ({submissionStatsQ.data.rows?.toLocaleString()} rows, Pred range{" "}
                {(submissionStatsQ.data.pred_min ?? 0).toFixed(3)}–{(submissionStatsQ.data.pred_max ?? 1).toFixed(3)}).
              </div>
              <Button
                type="button"
                size="sm"
                onClick={() => setAutoLoadMsg("Current submission detected. Upload that CSV in this page to run full analysis.")}
              >
                Load Current Submission
              </Button>
            </CardContent>
          </Card>
        ) : null}
        {autoLoadMsg ? <p className="text-xs text-muted-foreground">{autoLoadMsg}</p> : null}

        {stats && (
          <>
            {/* Stat Cards */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {[
                { label: "Total Matchups", value: stats.totalMatchups.toLocaleString() },
                { label: "Men's Games", value: String(stats.mensGames) },
                { label: "Women's Games", value: String(stats.womensGames) },
                { label: "Avg Confidence", value: `${stats.avgConfidence}%` },
                { label: "Upset Picks", value: String(stats.upsetPicks) },
                { label: "High Confidence", value: String(stats.highConfidence) },
              ].map(({ label, value }) => (
                <Card key={label} className="border bg-card shadow-sm">
                  <CardContent className="p-4">
                    <div className="font-display text-3xl font-bold text-foreground">{value}</div>
                    <div className="mt-1 font-body text-xs text-muted-foreground">{label}</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Live Brier Score Panel */}
            {brierResult && brierResult.gamesScored > 0 && (
              <section>
                <h2 className="mb-4 font-display text-sm font-bold uppercase tracking-[0.2em] text-foreground">Live Brier score</h2>
                <Card className="border border-primary/25 bg-card shadow-sm">
                  <CardContent className="grid grid-cols-2 gap-4 p-4 md:grid-cols-4">
                    <div className="text-center">
                      <div className="font-display text-3xl font-bold text-primary">{brierResult.brierScore.toFixed(3)}</div>
                      <div className="mt-1 font-body text-xs text-muted-foreground">Brier score</div>
                    </div>
                    <div className="text-center">
                      <div className="font-display text-3xl font-bold text-emerald-500">{Math.round(brierResult.accuracy * 100)}%</div>
                      <div className="mt-1 font-body text-xs text-muted-foreground">Accuracy</div>
                    </div>
                    <div className="text-center">
                      <div className="font-display text-3xl font-bold text-foreground">{brierResult.gamesScored}</div>
                      <div className="mt-1 font-body text-xs text-muted-foreground">Games scored</div>
                    </div>
                    <div className="text-center">
                      <div className="font-display text-3xl font-bold text-primary">
                        {brierResult.upsetCorrect}/{brierResult.upsetTotal}
                      </div>
                      <div className="mt-1 font-body text-xs text-muted-foreground">Upsets hit</div>
                    </div>
                  </CardContent>
                </Card>
              </section>
            )}

            {/* Live Results Panel */}
            {liveResults.length > 0 && (
              <section>
                <h2 className="mb-4 font-display text-sm font-bold uppercase tracking-[0.2em] text-foreground">Live results</h2>
                <div className="space-y-2">
                  {liveResults.map((r) => (
                    <div
                      key={r.game}
                      className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
                        r.correct ? "border-emerald-500/25 bg-emerald-500/5" : "border-destructive/25 bg-destructive/5"
                      }`}
                    >
                      <div>
                        <span className="font-body text-sm text-foreground">{r.game}</span>
                        <span className="ml-2 font-display text-xs text-muted-foreground">{r.score}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-display text-sm font-bold text-muted-foreground">{r.pred}%</span>
                        <span
                          className={`rounded px-2 py-0.5 font-display text-xs font-bold ${
                            r.correct ? "bg-emerald-500/20 text-emerald-400" : "bg-destructive/20 text-destructive"
                          }`}
                        >
                          {r.correct ? "✓" : "✗"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Confidence Distribution */}
            <section>
              <h2 className="mb-4 font-display text-sm font-bold uppercase tracking-[0.2em] text-foreground">
                Confidence distribution
              </h2>
              <Card className="border bg-card p-4 shadow-sm">
                <div className="flex items-end gap-1 h-40">
                  {distribution.map((d) => {
                    const maxCount = Math.max(...distribution.map((x) => x.count), 1);
                    const height = (d.count / maxCount) * 100;
                    return (
                      <div key={d.bucket} className="flex-1 flex flex-col items-center gap-1">
                        <span className="font-display text-[10px] text-muted-foreground">
                          {d.count > 0 ? d.count : ""}
                        </span>
                        <div
                          className="w-full rounded-t bg-primary animate-bar"
                          style={{ height: `${height}%` }}
                        />
                        <span className="font-body text-[8px] leading-none text-muted-foreground">
                          {d.bucket.split("-")[0]}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </section>

            {/* Top Upset Picks */}
            {upsets.length > 0 && (
              <section>
                <h2 className="mb-4 font-display text-sm font-bold uppercase tracking-[0.2em] text-foreground">
                  Top upset picks
                </h2>
                <Card className="overflow-hidden border bg-card shadow-sm">
                  <div className="grid grid-cols-[1fr_60px_60px_80px] gap-2 bg-muted/50 px-4 py-2">
                    {["Matchup", "Seeds", "Prob", "Gap"].map((h) => (
                      <span
                        key={h}
                        className="text-center font-display text-[10px] font-bold uppercase tracking-wider text-muted-foreground first:text-left"
                      >
                        {h}
                      </span>
                    ))}
                  </div>
                  {upsets.map((u, i) => (
                    <div key={u.id}>
                      <div className="grid grid-cols-[1fr_60px_60px_80px] items-center gap-2 px-4 py-3 transition-colors hover:bg-muted/40">
                        <span className="truncate font-body text-sm text-foreground">
                          {u.team1Name} vs {u.team2Name}
                        </span>
                        <span className="text-center font-display text-sm font-bold text-muted-foreground">
                          {u.seed1}-{u.seed2}
                        </span>
                        <span className="text-center font-display text-sm font-bold text-destructive">
                          {Math.round(u.prob * 100)}%
                        </span>
                        <span className="text-center font-display text-sm font-bold text-primary">+{u.seedGap}</span>
                      </div>
                      {i < upsets.length - 1 && <Separator />}
                    </div>
                  ))}
                </Card>
              </section>
            )}

            {/* Seed Performance */}
            <section>
              <h2 className="mb-4 font-display text-sm font-bold uppercase tracking-[0.2em] text-foreground">
                Seed performance (illustrative)
              </h2>
              <Card className="overflow-hidden border bg-card shadow-sm">
                <div className="grid grid-cols-[60px_1fr_1fr_80px] gap-2 bg-muted/50 px-4 py-2">
                  {["Seed", "Expected", "Model", "Delta"].map((h) => (
                    <span
                      key={h}
                      className="font-display text-[10px] font-bold uppercase tracking-wider text-muted-foreground last:text-right"
                    >
                      {h}
                    </span>
                  ))}
                </div>
                {[
                  { seed: 1, expected: 99, model: 97 },
                  { seed: 2, expected: 93, model: 91 },
                  { seed: 3, expected: 85, model: 88 },
                  { seed: 4, expected: 79, model: 76 },
                  { seed: 5, expected: 64, model: 68 },
                  { seed: 6, expected: 63, model: 60 },
                  { seed: 7, expected: 60, model: 57 },
                  { seed: 8, expected: 50, model: 52 },
                ].map((s) => {
                  const delta = s.model - s.expected;
                  return (
                    <div key={s.seed} className="grid grid-cols-[60px_1fr_1fr_80px] items-center gap-2 border-t border-border px-4 py-3">
                      <span className="font-display text-sm font-bold text-foreground">#{s.seed}</span>
                      <span className="font-body text-sm text-muted-foreground">{s.expected}%</span>
                      <span className="font-body text-sm text-foreground">{s.model}%</span>
                      <span
                        className={`text-right font-display text-sm font-bold ${delta >= 0 ? "text-emerald-500" : "text-destructive"}`}
                      >
                        {delta >= 0 ? "+" : ""}
                        {delta}%
                      </span>
                    </div>
                  );
                })}
              </Card>
            </section>
          </>
        )}

        <LiveScoresPreview maxGames={3} className="border-dashed" />

        <div className="flex flex-wrap gap-2 pb-8">
          <Button variant="outline" size="sm" asChild>
            <Link to="/bracket?stage=R1&gender=M">Bracket picker</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/live?tab=scores">Full live board</Link>
          </Button>
        </div>
      </main>
    </InnerPageShell>
  );
};

export default AnalyzerPage;
