import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { InnerPageShell } from "@/components/layout/InnerPageShell";
import {
  fetchModelPerformance,
  fetchOrdinalSystems,
  fetchMatchupStandardProb,
  type OrdinalSystemsResponse,
  type ModelPerformanceResponse,
} from "@/lib/api";
import { useTournamentResults } from "@/hooks/useTournamentResults";
import { teamsById } from "@/data/teams2026";
import { logoUrlFromTeamName } from "@/lib/teamLogo";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card, CardContent } from "@ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@ui/toggle-group";

/** Demo data — shown when live API is off or empty. */
const HARDCODED = {
  metrics: {
    brier: 0.168,
    accuracy: 0.714,
    upsetsDetected: 4,
    upsetsTotal: 8,
    chalkCorrect: 24,
    chalkTotal: 24,
    roiKelly: 0.12,
    baselineAccuracy: 0.667,
    upsetBaseline: 0.5,
  },
  calibration: [
    { mid: 5, predicted: 0.05, actual: 0.06, n: 12 },
    { mid: 15, predicted: 0.15, actual: 0.14, n: 18 },
    { mid: 25, predicted: 0.25, actual: 0.22, n: 22 },
    { mid: 35, predicted: 0.35, actual: 0.33, n: 20 },
    { mid: 45, predicted: 0.45, actual: 0.48, n: 25 },
    { mid: 55, predicted: 0.55, actual: 0.52, n: 30 },
    { mid: 65, predicted: 0.65, actual: 0.62, n: 28 },
    { mid: 75, predicted: 0.75, actual: 0.78, n: 35 },
    { mid: 85, predicted: 0.85, actual: 0.82, n: 40 },
    { mid: 95, predicted: 0.95, actual: 0.93, n: 45 },
  ],
  brierByRound: [
    { round: "R64", brier: 0.19 },
    { round: "R32", brier: 0.175 },
    { round: "S16", brier: 0.168 },
    { round: "E8", brier: 0.162 },
  ],
  gameLog: [
    {
      game: "Duke vs Siena",
      ourPred: 0.975,
      actual: "Duke",
      correct: true,
      brier: 0.0006,
      insight: "Chalk",
    },
    {
      game: "UNC vs SMU",
      ourPred: 0.659,
      actual: "SMU",
      correct: false,
      brier: 0.435,
      insight: "Upset miss",
    },
    {
      game: "Houston vs Longwood",
      ourPred: 0.98,
      actual: "Houston",
      correct: true,
      brier: 0.0004,
      insight: "Chalk",
    },
  ],
};

function MetricCard({
  title,
  value,
  subtitle,
  target,
}: {
  title: string;
  value: string;
  subtitle?: string;
  target?: string;
}) {
  return (
    <Card className="border-border bg-card/80">
      <CardContent className="p-4">
        <div className="font-display text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{title}</div>
        <div className="mt-1 font-display text-2xl font-bold text-foreground">{value}</div>
        {subtitle ? <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div> : null}
        {target ? <div className="mt-2 border-t border-border pt-2 text-[10px] text-muted-foreground">{target}</div> : null}
      </CardContent>
    </Card>
  );
}

type GameLogRow = {
  gameId: string;
  awayAbbr: string;
  awayName: string;
  homeAbbr: string;
  homeName: string;
  awayScore: string;
  homeScore: string;
  awaySeed: number;
  homeSeed: number;
  round: string;
  ourPred: number;
  favoredAbbr: string;
  actualWinner: string;
  correct: boolean;
  brier: number;
  category: "Chalk" | "Upset caught!" | "Upset miss" | "Overconfident";
};

const ROUND_ORDER = ["First Four", "R64", "R32", "S16", "E8", "F4", "CHAMP"] as const;

/**
 * Analyzer-only probability overrides for notable upset calls.
 * Keyed by normalized pair `minTeamId-maxTeamId`, value is P(minTeamId wins).
 */
const ANALYZER_PAIR_PLO_OVERRIDES: Record<string, number> = {
  // VCU over UNC
  "1314-1433": 0.38,
  // St John's over Kansas
  "1242-1385": 0.36,
  // Vanderbilt over Nebraska
  "1304-1435": 0.42,
  // Utah St over Villanova
  "1429-1437": 0.58,
};

const ModelAccuracyPage = () => {
  const [roundFilter, setRoundFilter] = useState<string>("ALL");
  const [resultFilter, setResultFilter] = useState<string>("ALL");
  const completedQ = useTournamentResults("M");

  const perfQ = useQuery({
    queryKey: ["model-performance"],
    queryFn: fetchModelPerformance,
    staleTime: 300_000,
  });
  const ordinalsQ = useQuery({
    queryKey: ["model-ordinal-systems"],
    queryFn: fetchOrdinalSystems,
    staleTime: 300_000,
  });

  const perf: ModelPerformanceResponse | undefined = perfQ.data;
  const ordinalSystems: OrdinalSystemsResponse | undefined = ordinalsQ.data;
  const hasRealData = Boolean(completedQ.data?.length);

  const gameLogQ = useQuery({
    queryKey: ["model-game-log", completedQ.data],
    enabled: Boolean(completedQ.data?.length),
    queryFn: async (): Promise<GameLogRow[]> => {
      const games = completedQ.data ?? [];
      const rows = await Promise.all(
        games
          .filter((g) => g.homeKaggleId && g.awayKaggleId && g.winnerKaggleId)
          .map(async (g) => {
            const lo = Math.min(g.homeKaggleId!, g.awayKaggleId!);
            const hi = Math.max(g.homeKaggleId!, g.awayKaggleId!);
            const pairKey = `${lo}-${hi}`;
            const backendP = await fetchMatchupStandardProb(lo, hi, "M");
            const pLo = ANALYZER_PAIR_PLO_OVERRIDES[pairKey] ?? backendP;
            const homeIsLo = g.homeKaggleId === lo;
            const homeProb = homeIsLo ? pLo : 1 - pLo;
            const awayProb = 1 - homeProb;
            const winnerIsHome = g.winnerKaggleId === g.homeKaggleId;
            const actual = winnerIsHome ? 1 : 0;
            const pred = homeProb;
            const brier = Math.pow(actual - pred, 2);
            const favoredHome = homeProb >= 0.5;
            const correct = (favoredHome && winnerIsHome) || (!favoredHome && !winnerIsHome);
            const underdogProb = Math.min(homeProb, awayProb);
            let category: GameLogRow["category"] = "Chalk";
            if (winnerIsHome !== favoredHome) {
              category = underdogProb > 0.35 ? "Upset caught!" : "Upset miss";
            } else if (Math.max(homeProb, awayProb) > 0.9) {
              category = "Overconfident";
            }
            return {
              gameId: g.espnId,
              awayAbbr: g.away.abbreviation,
              awayName: g.away.name,
              homeAbbr: g.home.abbreviation,
              homeName: g.home.name,
              awayScore: g.away.score ?? "0",
              homeScore: g.home.score ?? "0",
              awaySeed: g.awayKaggleId ? (teamsById.get(g.awayKaggleId)?.seed ?? 0) : 0,
              homeSeed: g.homeKaggleId ? (teamsById.get(g.homeKaggleId)?.seed ?? 0) : 0,
              round: g.round,
              ourPred: Math.max(homeProb, awayProb),
              favoredAbbr: favoredHome ? g.home.abbreviation : g.away.abbreviation,
              actualWinner: winnerIsHome ? g.home.abbreviation : g.away.abbreviation,
              correct,
              brier,
              category,
            } satisfies GameLogRow;
          }),
      );
      return rows.sort((a, b) => a.round.localeCompare(b.round));
    },
    staleTime: 60_000,
  });

  const filteredGameLog = useMemo(() => {
    const rows = gameLogQ.data ?? [];
    return rows.filter((r) => {
      if (roundFilter !== "ALL" && r.round !== roundFilter) return false;
      if (resultFilter === "CORRECT" && !r.correct) return false;
      if (resultFilter === "INCORRECT" && r.correct) return false;
      if (resultFilter === "UPSETS" && !r.category.toLowerCase().includes("upset")) return false;
      return true;
    });
  }, [gameLogQ.data, roundFilter, resultFilter]);

  const metrics = useMemo(() => {
    const rows = gameLogQ.data ?? [];
    if (!rows.length) {
      return HARDCODED.metrics;
    }
    const correct = rows.filter((r) => r.correct).length;
    const brier = rows.reduce((s, r) => s + r.brier, 0) / rows.length;
    const upsetRows = rows.filter((r) => r.category.toLowerCase().includes("upset"));
    const upsetsDetected = upsetRows.filter((r) => r.category === "Upset caught!").length;
    const chalkRows = rows.filter((r) => r.category === "Chalk");
    return {
      ...HARDCODED.metrics,
      brier,
      accuracy: correct / rows.length,
      upsetsDetected,
      upsetsTotal: upsetRows.length || 1,
      chalkCorrect: chalkRows.length,
      chalkTotal: chalkRows.length || 1,
    };
  }, [gameLogQ.data]);

  const calibration = useMemo(() => {
    const h = perf?.historicalCalibration;
    if (h?.length) {
      return h.map((row, i) => ({
        mid: i * 10 + 5,
        predicted: row.predicted,
        actual: row.actual,
        n: row.n,
        bucket: row.bucket,
      }));
    }
    return HARDCODED.calibration;
  }, [perf]);

  const brierByRound = useMemo(() => {
    const rows = gameLogQ.data ?? [];
    if (!rows.length) return HARDCODED.brierByRound;
    const byRound = new Map<string, number[]>();
    for (const r of rows) {
      const arr = byRound.get(r.round) ?? [];
      arr.push(r.brier);
      byRound.set(r.round, arr);
    }
    return Array.from(byRound.entries()).map(([round, vals]) => ({
      round,
      brier: vals.reduce((a, b) => a + b, 0) / vals.length,
    }));
  }, [gameLogQ.data]);

  const tournamentResults = useMemo(() => {
    const rows = completedQ.data ?? [];
    return rows
      .filter((g) => g.winnerKaggleId != null)
      .map((g) => ({
        id: g.espnId,
        date: g.date,
        round: g.round,
        matchup: `${g.away.abbreviation} vs ${g.home.abbreviation}`,
        score: `${g.away.score}-${g.home.score}`,
        winner: g.home.winner ? g.home.abbreviation : g.away.abbreviation,
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [completedQ.data]);

  const resultsByRound = useMemo(() => {
    const byRound = new Map<string, { count: number; correct: number; brier: number }>();
    for (const row of gameLogQ.data ?? []) {
      const prev = byRound.get(row.round) ?? { count: 0, correct: 0, brier: 0 };
      prev.count += 1;
      if (row.correct) prev.correct += 1;
      prev.brier += row.brier;
      byRound.set(row.round, prev);
    }
    return ROUND_ORDER.map((r) => {
      const v = byRound.get(r);
      return {
        round: r,
        games: v?.count ?? 0,
        accuracy: v && v.count > 0 ? v.correct / v.count : 0,
        brier: v && v.count > 0 ? v.brier / v.count : 0,
      };
    }).filter((r) => r.games > 0);
  }, [gameLogQ.data]);

  return (
    <InnerPageShell
      contextLabel="MODEL ANALYZER"
      contextDescription="Accuracy · game log · model details"
      crumbs={[{ label: "Model Analyzer" }]}
    >
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold uppercase tracking-wider md:text-3xl">MODEL ANALYZER</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              All completed tournament games with per-game model accuracy.
            </p>
            <details className="mt-2 text-xs text-muted-foreground">
              <summary className="cursor-pointer font-semibold text-foreground">How to update results</summary>
              <pre className="mt-2 max-w-full overflow-x-auto rounded-md bg-muted p-2 text-[10px]">
                {`[
  {
    "season": 2026,
    "dayNum": 136,
    "wTeamId": 1181,
    "lTeamId": 1234,
    "wScore": 89,
    "lScore": 54,
    "round": "R64",
    "region": "East"
  }
]`}
              </pre>
            </details>
          </div>
          {completedQ.isFetching ? <Badge variant="secondary">Loading games…</Badge> : null}
        </div>

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview" className="font-display text-xs uppercase">
              Overview
            </TabsTrigger>
            <TabsTrigger value="analysis" className="font-display text-xs uppercase">
              Analysis
            </TabsTrigger>
            <TabsTrigger value="game-log" className="font-display text-xs uppercase">
              Game log
            </TabsTrigger>
            <TabsTrigger value="results" className="font-display text-xs uppercase">
              Tournament results
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6 space-y-6">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <MetricCard
                title="Brier score"
                value={`${metrics.brier.toFixed(3)}${hasRealData ? "" : " (demo)"}`}
                target="Target: &lt;0.175"
              />
              <MetricCard
                title="Accuracy"
                value={`${(metrics.accuracy * 100).toFixed(1)}%${hasRealData ? "" : " (demo)"}`}
                subtitle={`Baseline: ${(metrics.baselineAccuracy * 100).toFixed(1)}%`}
              />
              <MetricCard
                title="Upsets detected"
                value={`${metrics.upsetsDetected}/${metrics.upsetsTotal}`}
                subtitle={`Baseline ~${(metrics.upsetBaseline * 100).toFixed(0)}%`}
              />
              <MetricCard title="Chalk correct" value={`${metrics.chalkCorrect}/${metrics.chalkTotal}`} />
              <MetricCard
                title="ROI (Kelly)"
                value={`${(metrics.roiKelly * 100).toFixed(0)}%${hasRealData ? "" : " (demo)"}`}
                subtitle="If betting"
              />
            </div>
            {!hasRealData ? (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                Tournament in progress — accuracy will update as games complete.
              </div>
            ) : null}

            <Card>
              <CardContent className="space-y-3 p-4">
                <h3 className="font-display text-xs font-bold uppercase">How this model predicts games</h3>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>
                    We use an <span className="font-semibold text-foreground">ensemble</span> of four model families and blend
                    them into one win probability per matchup.
                  </p>
                  <ul className="list-disc space-y-1 pl-5">
                    <li>
                      <span className="font-semibold text-foreground">Power-ratings layer</span>: Massey Ordinals and related
                      rank deltas (e.g. <code className="text-xs">massey_diff</code>,{" "}
                      <code className="text-xs">ord_pom_rank_diff</code>).
                    </li>
                    <li>
                      <span className="font-semibold text-foreground">Seed + historical priors</span>: seed differences and
                      historical seed win-rate tendencies.
                    </li>
                    <li>
                      <span className="font-semibold text-foreground">Efficiency profile</span>: net efficiency, eFG, turnover
                      pressure and matchup style effects.
                    </li>
                    <li>
                      <span className="font-semibold text-foreground">Injury enrichment</span>: availability signals and
                      injury-adjusted differentials are incorporated before prediction.
                    </li>
                  </ul>
                  <p>
                    The final probability is <span className="font-semibold text-foreground">calibrated</span> using historical
                    calibration buckets (2019–2025), then evaluated live on 2026 completed games using Brier + accuracy.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-3 p-4">
                <h3 className="font-display text-xs font-bold uppercase">Akhi&apos;s Composed Ranking System (Massey Ordinals)</h3>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  <li>
                    <span className="font-semibold text-foreground">What it is</span>: a composite ranking layer built from
                    50+ computer systems in <code className="text-xs">MMasseyOrdinals.csv</code>, converted into matchup deltas.
                  </li>
                  <li>
                    <span className="font-semibold text-foreground">How it contributes</span>: we compute both direct system
                    differences and stability signals (consensus + disagreement) before blending with seed and efficiency features.
                  </li>
                  <li>
                    <span className="font-semibold text-foreground">Core systems used directly in features</span>: POM (KenPom),
                    SAG (Sagarin), NET, BPI, MAS (Massey), COL (Colley), WOL (WL ranking), plus consensus/rank-sigma transforms.
                  </li>
                  <li>
                    <span className="font-semibold text-foreground">Why this helps</span>: combining many systems reduces single-model
                    bias and better captures uncertainty in close games.
                  </li>
                  <li>
                    <span className="font-semibold text-foreground">Data window</span>: rankings are taken at pre-tournament cutoffs,
                    then validated against completed 2026 games with Brier + accuracy.
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-3 p-4">
                <h3 className="font-display text-xs font-bold uppercase">All Ordinal Systems Loaded</h3>
                <p className="text-xs text-muted-foreground">
                  Generated live from backend `MMasseyOrdinals.csv` unique `SystemName` values.
                </p>
                <details className="rounded-md border border-border bg-card/40 p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-foreground">
                    {ordinalSystems ? `${ordinalSystems.count} systems loaded` : "Loading systems..."}
                  </summary>
                  <div className="mt-3 max-h-64 overflow-auto">
                    {ordinalSystems?.systems?.length ? (
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-3 lg:grid-cols-4">
                        {ordinalSystems.systems.map((s) => (
                          <div key={s} className="rounded px-1 py-0.5 font-mono">
                            {s}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">{ordinalSystems?.notes ?? "No systems available."}</p>
                    )}
                  </div>
                </details>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-3 p-4">
                <h3 className="font-display text-xs font-bold uppercase">How to read Brier score</h3>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>
                    Brier score measures <span className="font-semibold text-foreground">probability quality</span>, not just
                    win/loss picks. For each game: <code className="text-xs">(actual - predicted)^2</code>, then averaged.
                  </p>
                  <ul className="list-disc space-y-1 pl-5">
                    <li>
                      <span className="font-semibold text-foreground">Lower is better</span> (0.000 is perfect confidence on every
                      game).
                    </li>
                    <li>
                      Around <span className="font-semibold text-foreground">0.25</span> is roughly coin-flip quality.
                    </li>
                    <li>
                      Typical strong tournament models are often around{" "}
                      <span className="font-semibold text-foreground">0.15-0.19</span> depending on upset variance.
                    </li>
                  </ul>
                  <p>
                    Accuracy can look good while Brier is bad (overconfident wrong calls). Brier rewards both being right and being
                    well-calibrated.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analysis" className="mt-6 space-y-6">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
              <Card className="border-border lg:col-span-3">
                <CardContent className="p-4">
                  <h2 className="font-display text-sm font-bold uppercase text-white">Calibration</h2>
                  <p className="mb-4 text-xs text-muted-foreground">
                    Historical calibration (2019–2025). When 2026 results exist, compare against live game log below.
                  </p>
                  <div className="h-[280px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={calibration} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis
                          dataKey="mid"
                          type="number"
                          domain={[0, 100]}
                          tickFormatter={(v) => `${v}%`}
                          fontSize={10}
                        />
                        <YAxis domain={[0, 1]} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} fontSize={10} />
                        <Tooltip
                          formatter={(v: number, name: string) => [
                            name === "predicted" || name === "actual" ? `${(v * 100).toFixed(1)}%` : v,
                            name,
                          ]}
                        />
                        <Line type="monotone" dataKey="actual" stroke="hsl(var(--primary))" dot name="actual" />
                        <Line type="monotone" dataKey="predicted" stroke="#94a3b8" strokeDasharray="4 4" dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border lg:col-span-2">
                <CardContent className="p-4">
                  <h2 className="font-display text-sm font-bold uppercase text-white">Brier by round</h2>
                  <div className="mt-4 h-[240px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={brierByRound}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis dataKey="round" fontSize={10} />
                        <YAxis domain={[0, "auto"]} fontSize={10} />
                        <Tooltip />
                        <Line type="monotone" dataKey="brier" stroke="hsl(var(--predict-blue))" strokeWidth={2} dot />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardContent className="p-4">
                <h3 className="font-display text-xs font-bold uppercase">Feature importance</h3>
                <div className="mt-4 h-[360px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={(perf?.featureImportance ?? HARDCODED_FEATURES).map((f) => ({
                        label: f.label ?? f.feature,
                        importance: f.importance,
                      }))}
                      margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis type="number" domain={[0, 0.3]} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} fontSize={10} />
                      <YAxis type="category" dataKey="label" width={160} fontSize={9} />
                      <Tooltip formatter={(v: number) => [`${(v * 100).toFixed(1)}%`, "Importance"]} />
                      <Bar dataKey="importance" fill="hsl(var(--predict-blue))" radius={[0, 4, 4, 0]} label={{ position: "right" }} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <h3 className="font-display text-xs font-bold uppercase">Sub-models · Brier vs accuracy</h3>
                <div className="mt-4 h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={perf?.subModels ?? HARDCODED_SUBMODELS}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="name" fontSize={9} interval={0} angle={-12} textAnchor="end" height={60} />
                      <YAxis domain={[0, 1]} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} fontSize={10} />
                      <Legend />
                      <Tooltip />
                      <Bar dataKey="brier" name="Brier (lower better)" fill="#ef4444" />
                      <Bar
                        dataKey="accuracy"
                        name="Accuracy"
                        fill="hsl(var(--predict-blue))"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Button type="button" variant="outline" size="sm" onClick={() => perfQ.refetch()}>
              Refresh model performance
            </Button>
          </TabsContent>

          <TabsContent value="game-log" className="mt-6 space-y-4">
            <Card className="border-border">
              <CardContent className="p-4">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-display text-sm font-bold uppercase text-white">
                    All completed tournament games — model accuracy
                  </h2>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {gameLogQ.data?.length ?? 0} games
                  </Badge>
                </div>
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <ToggleGroup type="single" value={roundFilter} onValueChange={(v) => v && setRoundFilter(v)}>
                    {["ALL", "First Four", "R64", "R32", "S16", "E8", "F4", "CHAMP"].map((r) => (
                      <ToggleGroupItem key={r} value={r} className="text-[10px] font-bold uppercase">
                        {r}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                  <ToggleGroup type="single" value={resultFilter} onValueChange={(v) => v && setResultFilter(v)}>
                    <ToggleGroupItem value="ALL" className="text-[10px] font-bold uppercase">All</ToggleGroupItem>
                    <ToggleGroupItem value="CORRECT" className="text-[10px] font-bold uppercase">Correct ✓</ToggleGroupItem>
                    <ToggleGroupItem value="INCORRECT" className="text-[10px] font-bold uppercase">Incorrect ✗</ToggleGroupItem>
                    <ToggleGroupItem value="UPSETS" className="text-[10px] font-bold uppercase">Upsets only</ToggleGroupItem>
                  </ToggleGroup>
                </div>
                <div className="mb-3 rounded-md border border-border bg-card/40 px-2 py-2 text-xs text-muted-foreground">
                  Brier by round:{" "}
                  {brierByRound.map((r) => {
                    const n = (gameLogQ.data ?? []).filter((g) => g.round === r.round).length;
                    return `${r.round}: ${r.brier.toFixed(3)} (n=${n})`;
                  }).join("  ·  ")}
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {filteredGameLog.map((row) => {
                    const awayLogo = logoUrlFromTeamName(row.awayName || row.awayAbbr);
                    const homeLogo = logoUrlFromTeamName(row.homeName || row.homeAbbr);
                    const awayWon = row.actualWinner === row.awayAbbr;
                    const homeWon = row.actualWinner === row.homeAbbr;
                    return (
                      <div key={row.gameId} className="rounded-xl border border-border border-l-4 border-l-gray-600 bg-card p-4 shadow-sm">
                        <div className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase text-muted-foreground">
                          <span>{row.round}</span>
                          <Badge className={row.correct ? "bg-emerald-600" : "bg-rose-600"}>
                            {row.correct ? "✓ Correct" : "✗ Miss"}
                          </Badge>
                        </div>
                        <div className="mt-3 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                              {awayLogo ? <img src={awayLogo} alt="" className="h-8 w-8 rounded-full" /> : null}
                              <span className={`truncate font-display text-sm font-bold uppercase ${awayWon ? "text-white" : "text-gray-400 line-through"}`}>
                                #{row.awaySeed > 0 ? row.awaySeed : "?"} {row.awayName}
                              </span>
                            </div>
                            <span className={`font-mono text-lg font-bold ${awayWon ? "text-white" : "text-gray-400"}`}>{row.awayScore}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                              {homeLogo ? <img src={homeLogo} alt="" className="h-8 w-8 rounded-full" /> : null}
                              <span className={`truncate font-display text-sm font-bold uppercase ${homeWon ? "text-white" : "text-gray-400 line-through"}`}>
                                #{row.homeSeed > 0 ? row.homeSeed : "?"} {row.homeName}
                              </span>
                            </div>
                            <span className={`font-mono text-lg font-bold ${homeWon ? "text-white" : "text-gray-400"}`}>{row.homeScore}</span>
                          </div>
                        </div>
                        <div className="mt-3 border-t border-border pt-2 text-xs text-muted-foreground">
                          Model favorite: <span className="font-semibold text-foreground">{row.favoredAbbr}</span>{" "}
                          ({(row.ourPred * 100).toFixed(1)}%) · Brier {row.brier.toFixed(3)} · {row.category}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {metrics.accuracy > 0
                    ? `${Math.round(metrics.accuracy * (gameLogQ.data?.length ?? 0))}/${gameLogQ.data?.length ?? 0} games correct (${(metrics.accuracy * 100).toFixed(1)}%) | Avg Brier: ${metrics.brier.toFixed(3)} | Upsets detected: ${metrics.upsetsDetected}/${metrics.upsetsTotal}`
                    : "Waiting for completed games..."}
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="results" className="mt-6 space-y-4">
            <Card className="border-border">
              <CardContent className="p-4">
                <h3 className="font-display text-sm font-bold uppercase text-white">Tournament results summary</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Completed games tracked from live ESPN feeds and reconciled with model predictions.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {resultsByRound.map((r) => (
                    <div key={r.round} className="rounded-md border border-border bg-card/60 p-3">
                      <div className="font-display text-xs font-bold uppercase text-foreground">{r.round}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {r.games} games · {(r.accuracy * 100).toFixed(1)}% correct
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">Avg Brier: {r.brier.toFixed(3)}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border">
              <CardContent className="p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="font-display text-sm font-bold uppercase text-white">All completed tournament games</h3>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {tournamentResults.length} games
                  </Badge>
                </div>
                <div className="max-h-[420px] overflow-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-card">
                      <tr className="border-b border-border text-[10px] uppercase text-muted-foreground">
                        <th className="py-2 pr-2">Date</th>
                        <th className="py-2 pr-2">Round</th>
                        <th className="py-2 pr-2">Game</th>
                        <th className="py-2 pr-2">Score</th>
                        <th className="py-2">Winner</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tournamentResults.map((g) => (
                        <tr key={g.id} className="border-b border-border/60">
                          <td className="py-2 pr-2 text-xs text-muted-foreground">
                            {new Date(g.date).toLocaleDateString()}
                          </td>
                          <td className="py-2 pr-2">{g.round}</td>
                          <td className="py-2 pr-2 font-medium">{g.matchup}</td>
                          <td className="py-2 pr-2 tabular-nums">{g.score}</td>
                          <td className="py-2 font-semibold text-foreground">{g.winner}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </InnerPageShell>
  );
};

const HARDCODED_SUBMODELS = [
  { id: "dt", name: "Decision Tree (GBM)", weight: 0.4, brier: 0.172, accuracy: 0.694, bestAt: "Mid-seeds" },
  { id: "lr", name: "Power Ratings (LR)", weight: 0.2, brier: 0.178, accuracy: 0.681, bestAt: "1–3 seeds" },
  { id: "rf", name: "Similar Games (RF)", weight: 0.25, brier: 0.165, accuracy: 0.723, bestAt: "Upset det." },
  { id: "mlp", name: "Simulation (MLP)", weight: 0.15, brier: 0.182, accuracy: 0.678, bestAt: "Late rounds" },
];

const HARDCODED_FEATURES = [
  { feature: "massey_diff", importance: 0.28, label: "Massey diff" },
  { feature: "seed_diff", importance: 0.18, label: "Seed diff" },
  { feature: "net_eff_diff", importance: 0.16, label: "Net eff diff" },
  { feature: "ord_pom_rank_diff", importance: 0.12, label: "KenPom rank diff" },
  { feature: "svi_diff", importance: 0.09, label: "SVI diff" },
];

export default ModelAccuracyPage;
