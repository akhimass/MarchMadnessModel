import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueries, useQuery } from "@tanstack/react-query";

import { InnerPageShell } from "@/components/layout/InnerPageShell";
import { fetchMatchupStandardProb, fetchTournamentResults } from "@/lib/api";
import { fetchScoreboard, type LiveGame } from "@/lib/espnApi";
import { menTeams2026, teamsById } from "@/data/teams2026";
import { liveGameTeamDisplay } from "@/lib/bracketFieldDisplay";
import { resolveMenKaggleId } from "@/lib/espnTeamToKaggle";
import { logoUrlFromTeamName } from "@/lib/teamLogo";
import { LiveGameCardWithModel } from "@/components/live/LiveGameCardWithModel";
import { filterMarchMadnessGames, type ApiTeamRow } from "@/lib/marchMadnessFilter";
import { buildBettingOddsGameList, team2026RowFromOddsName } from "@/lib/oddsApi";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { ToggleGroup, ToggleGroupItem } from "@ui/toggle-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import {
  inferMenScoreboardRound,
  type ScoreboardRoundKey,
} from "@/data/ncaa2026MenMatchupRounds";
import { isMens2026TournamentPastChampionshipEt, parseEspnDateToYyyymmdd } from "@/lib/tournamentRounds";
import { TOURNAMENT_DATES } from "@/lib/espnApi";

/** Fetch windows per tab; men's games are **filtered** by matchup → `inferMenScoreboardRound`. */
const ROUND_TABS: Array<{ key: ScoreboardRoundKey; label: string; dates: string[] }> = [
  { key: "FF",    label: "First Four",   dates: ["2026-03-17", "2026-03-18"] },
  { key: "R64",   label: "Round of 64",  dates: ["2026-03-19", "2026-03-20"] },
  { key: "R32",   label: "Round of 32",  dates: ["2026-03-21", "2026-03-22", "2026-03-23"] },
  { key: "S16",   label: "Sweet 16",     dates: ["2026-03-26", "2026-03-27"] },
  { key: "E8",    label: "Elite 8",      dates: ["2026-03-28", "2026-03-29"] },
  { key: "F4",    label: "Final Four",   dates: ["2026-04-04"] },
  { key: "CHAMP", label: "Championship", dates: ["2026-04-06"] },
];

/**
 * Return the most recently started round based on today's date (ET).
 * On off-days between rounds this returns the round that most recently began,
 * so users see the last completed results rather than a future empty tab.
 */
function getActiveRound(): ScoreboardRoundKey {
  const today = new Date()
    .toLocaleDateString("en-CA", { timeZone: "America/New_York" })
    .replace(/-/g, ""); // "20260324"
  let active: ScoreboardRoundKey = ROUND_TABS[0].key;
  for (const { key, dates } of ROUND_TABS) {
    const start = dates[0].replace(/-/g, "");
    if (today >= start) active = key;
  }
  return active;
}

function womensRoundKey(g: { date: string }): ScoreboardRoundKey | null {
  const ymd = parseEspnDateToYyyymmdd(g.date);
  if (TOURNAMENT_DATES.firstFour.includes(ymd)) return "FF";
  if (TOURNAMENT_DATES.roundOf64.includes(ymd)) return "R64";
  if (TOURNAMENT_DATES.roundOf32.includes(ymd)) return "R32";
  if (TOURNAMENT_DATES.sweet16.includes(ymd)) return "S16";
  if (TOURNAMENT_DATES.elite8.includes(ymd)) return "E8";
  if (TOURNAMENT_DATES.finalFour.includes(ymd)) return "F4";
  if (TOURNAMENT_DATES.championship.includes(ymd)) return "CHAMP";
  return null;
}

function isUpsetWatch(
  game: LiveGame,
  homeK: number | null,
  awayK: number | null,
  seeds: Map<number, number>,
): boolean {
  if (game.state !== "in") return false;
  if (!homeK || !awayK) return false;
  const homeSeed = seeds.get(homeK);
  const awaySeed = seeds.get(awayK);
  if (!homeSeed || !awaySeed) return false;
  const dogTeam = homeSeed > awaySeed ? game.home : game.away;
  const favTeam = homeSeed < awaySeed ? game.home : game.away;
  const seedGap = Math.abs(homeSeed - awaySeed);
  const dogLeading = Number(dogTeam.score) > Number(favTeam.score);
  const margin = Math.abs(Number(dogTeam.score) - Number(favTeam.score));
  return dogLeading && margin >= 5 && seedGap >= 4;
}

const ScoreboardPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const gender: "M" | "W" = searchParams.get("gender") === "W" ? "W" : "M";
  const [selectedRound, setSelectedRound] = useState<ScoreboardRoundKey>(getActiveRound);
  const tab = searchParams.get("tab") === "live-ai" ? "live-ai" : "scoreboard";
  const roundDates = ROUND_TABS.find((r) => r.key === selectedRound)?.dates ?? [];
  const womenTeamsQ = useQuery({
    queryKey: ["scoreboard-w-field", gender],
    queryFn: async (): Promise<ApiTeamRow[]> => {
      const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000";
      const res = await fetch(`${apiBase}/api/teams/2026?gender=W`);
      if (!res.ok) throw new Error(`teams W failed (${res.status})`);
      return res.json();
    },
    enabled: gender === "W",
    staleTime: 60 * 60 * 1000,
  });
  const roundQueries = useQueries({
    queries: roundDates.map((d) => ({
      queryKey: ["scoreboard-round-date", gender, d],
      queryFn: () => fetchScoreboard(gender, d),
      staleTime: 15_000,
    })),
  });

  const { data: apiResults = [] } = useQuery({
    queryKey: ["results", 2026, gender],
    queryFn: () => fetchTournamentResults(2026, gender),
    staleTime: 60_000,
  });

  const seedByKaggle = useMemo(() => {
    const m = new Map<number, number>();
    for (const t of menTeams2026) {
      m.set(t.id, t.seed);
    }
    return m;
  }, []);

  const winnerByPair = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of apiResults) {
      const lo = Math.min(g.wTeamId, g.lTeamId);
      const hi = Math.max(g.wTeamId, g.lTeamId);
      m.set(`${lo}-${hi}`, g.wTeamId);
    }
    return m;
  }, [apiResults]);

  const games = useMemo(() => {
    const flat = roundQueries.flatMap((q) => q.data ?? []);
    const strict = filterMarchMadnessGames(flat, gender, womenTeamsQ.data);
    const selected = gender === "M" ? (strict.length > 0 ? strict : flat) : strict;
    const seen = new Set<string>();
    const deduped = selected.filter((g) => {
      if (seen.has(g.espnId)) return false;
      seen.add(g.espnId);
      return true;
    });
    const selectedDateSet = new Set((ROUND_TABS.find((r) => r.key === selectedRound)?.dates ?? []).map((d) => d.replace(/-/g, "")));
    return deduped.filter((g) => {
      const rk = gender === "M" ? inferMenScoreboardRound(g) : womensRoundKey(g);
      if (rk === selectedRound) return true;
      if (gender === "M") {
        const ymd = parseEspnDateToYyyymmdd(g.date);
        return selectedDateSet.has(ymd);
      }
      return false;
    });
  }, [roundQueries, gender, womenTeamsQ.data, selectedRound]);
  const fallbackByRound = useMemo(() => {
    const map: Partial<Record<ScoreboardRoundKey, number[]>> = {
      FF: [134, 135],
      R64: [136, 137],
      R32: [138, 139],
      S16: [143, 144],
      E8: [145, 146],
      F4: [152],
      CHAMP: [154],
    };
    const days = map[selectedRound];
    if (!days?.length) return [];
    return apiResults.filter((r) => days.includes(r.dayNum));
  }, [apiResults, selectedRound]);
  const demoS16Fallback = useMemo(() => {
    if (gender !== "M" || selectedRound !== "S16") return [];
    return buildBettingOddsGameList([])
      .map((g) => {
        const home = team2026RowFromOddsName(g.home_team);
        const away = team2026RowFromOddsName(g.away_team);
        if (!home || !away) return null;
        return {
          id: `demo-${g.id}`,
          homeSeed: home.seed ?? 0,
          awaySeed: away.seed ?? 0,
          homeAbbr: menTeams2026.find((t) => t.id === home.teamId)?.abbreviation ?? home.teamName ?? "HOME",
          awayAbbr: menTeams2026.find((t) => t.id === away.teamId)?.abbreviation ?? away.teamName ?? "AWAY",
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
  }, [gender, selectedRound]);
  const liveGamesOnly = useMemo(() => games.filter((g) => g.state === "in"), [games]);
  const roundLoading = roundQueries.some((q) => q.isLoading);
  const roundFetching = roundQueries.some((q) => q.isFetching);
  const refreshRound = () => roundQueries.forEach((q) => q.refetch());
  const setTab = (v: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", v === "live-ai" ? "live-ai" : "scoreboard");
    setSearchParams(next);
  };

  return (
    <InnerPageShell
      contextLabel="SCOREBOARD"
      contextDescription="Tournament games + live AI"
      crumbs={[{ label: "Scoreboard" }]}
    >
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold uppercase tracking-wider md:text-3xl">SCOREBOARD</h1>
            <p className="text-sm text-muted-foreground">Live ESPN games + model projections + Live AI view</p>
            {gender === "M" && isMens2026TournamentPastChampionshipEt() ? (
              <p className="mt-2 rounded-md border border-border bg-card/60 px-3 py-2 text-xs text-muted-foreground">
                2026 men&apos;s tournament is complete. Use the <span className="font-semibold text-foreground">Championship</span>{" "}
                tab for the title game; earlier rounds stay available for final scores.
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup
              type="single"
              value={gender}
              onValueChange={(v) => {
                if (v === "M" || v === "W") {
                  const next = new URLSearchParams(searchParams);
                  next.set("gender", v);
                  setSearchParams(next);
                }
              }}
            >
              <ToggleGroupItem value="M" className="text-xs font-bold uppercase">
                Men&apos;s
              </ToggleGroupItem>
              <ToggleGroupItem value="W" className="text-xs font-bold uppercase">
                Women&apos;s
              </ToggleGroupItem>
            </ToggleGroup>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={refreshRound}
              className="font-display text-xs uppercase"
            >
              Refresh
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {ROUND_TABS.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setSelectedRound(r.key)}
              className={`rounded-md border px-3 py-1 text-left font-display text-[10px] font-bold uppercase ${
                selectedRound === r.key
                  ? "border-primary bg-primary/15 text-white"
                  : "border-border text-muted-foreground"
              }`}
            >
              <div>{r.label}</div>
              <div className="text-[10px] normal-case opacity-80">{r.dates.join(" · ")}</div>
            </button>
          ))}
          <span className="text-xs text-muted-foreground">
            {selectedRound} · {roundFetching ? "…" : "Updated"}
          </span>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="scoreboard">Scoreboard</TabsTrigger>
            <TabsTrigger value="live-ai">Live AI</TabsTrigger>
          </TabsList>
          <TabsContent value="scoreboard" className="mt-4">
            {roundLoading ? (
              <p className="text-sm text-muted-foreground">Loading scoreboard…</p>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {games.map((g) => (
                  <ScoreboardCard
                    key={g.espnId}
                    game={g}
                    gender={gender}
                    resultWinner={winnerByPair}
                    seedByKaggle={seedByKaggle}
                    onPredictor={(lo, hi) => navigate(`/predictor/${lo}/${hi}`)}
                  />
                ))}
              </div>
            )}

            {games.length === 0 && !roundLoading ? (
              fallbackByRound.length > 0 ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {fallbackByRound.map((r, idx) => {
                    const w = menTeams2026.find((t) => t.id === r.wTeamId);
                    const l = menTeams2026.find((t) => t.id === r.lTeamId);
                    return (
                      <div key={`${r.wTeamId}-${r.lTeamId}-${idx}`} className="rounded-xl border border-border border-l-4 border-l-gray-600 bg-card p-4">
                        <div className="text-[10px] font-bold uppercase text-gray-500">Final · {r.round ?? "R64"}</div>
                        <div className="mt-3 flex items-center justify-between">
                          <span className="font-display text-sm font-bold uppercase">#{w?.seed ?? "?"} {w?.abbreviation ?? r.wTeamId}</span>
                          <span className="font-mono text-lg font-bold">{r.wScore}</span>
                        </div>
                        <div className="mt-2 flex items-center justify-between opacity-70">
                          <span className="font-display text-sm font-bold uppercase line-through">#{l?.seed ?? "?"} {l?.abbreviation ?? r.lTeamId}</span>
                          <span className="font-mono text-lg">{r.lScore}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                demoS16Fallback.length > 0 ? (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {demoS16Fallback.map((r) => (
                      <div key={r.id} className="rounded-xl border border-border border-l-4 border-l-blue-500 bg-card p-4">
                        <div className="text-[10px] font-bold uppercase text-blue-400">Demo fallback · Sweet 16</div>
                        <div className="mt-3 flex items-center justify-between">
                          <span className="font-display text-sm font-bold uppercase">#{r.awaySeed} {r.awayAbbr}</span>
                          <span className="font-mono text-lg font-bold">—</span>
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          <span className="font-display text-sm font-bold uppercase">#{r.homeSeed} {r.homeAbbr}</span>
                          <span className="font-mono text-lg">—</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No games for this round yet.</p>
                )
              )
            ) : null}
          </TabsContent>
          <TabsContent value="live-ai" className="mt-4 space-y-4">
            <p className="text-xs text-muted-foreground">
              Live AI only shows in-progress games with live-adjusted model context.
            </p>
            {liveGamesOnly.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
                {gender === "M" && isMens2026TournamentPastChampionshipEt()
                  ? "No live games — tournament complete. Switch to the Scoreboard tab and browse rounds for final scores."
                  : "No live games on the board right now."}
              </div>
            ) : (
              <div className="space-y-4">
                {liveGamesOnly.map((g) => (
                  <LiveGameCardWithModel key={`live-ai-${g.espnId}`} game={g} gender={gender} defaultOpenLivePredictor />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </InnerPageShell>
  );
};

function ScoreboardCard({
  game,
  gender,
  resultWinner,
  seedByKaggle,
  onPredictor,
}: {
  game: LiveGame;
  gender: "M" | "W";
  resultWinner: Map<string, number>;
  seedByKaggle: Map<number, number>;
  onPredictor: (lo: number, hi: number) => void;
}) {
  const [prob, setProb] = useState<number | null>(null);

  const awayK = gender === "M" ? resolveMenKaggleId(game.away) : null;
  const homeK = gender === "M" ? resolveMenKaggleId(game.home) : null;

  const lo = awayK && homeK ? Math.min(awayK, homeK) : 0;
  const hi = awayK && homeK ? Math.max(awayK, homeK) : 0;
  const pairKey = lo && hi ? `${lo}-${hi}` : "";
  const apiW = pairKey ? resultWinner.get(pairKey) : undefined;

  useEffect(() => {
    if (!lo || !hi) {
      setProb(null);
      return;
    }
    let cancelled = false;
    fetchMatchupStandardProb(lo, hi, gender).then((p) => {
      if (!cancelled) setProb(p);
    });
    return () => {
      cancelled = true;
    };
  }, [lo, hi, gender]);

  const live = game.state === "in";
  const final = game.state === "post";
  const awayWon = final && game.away.winner;
  const homeWon = final && game.home.winner;

  const awayDisp = liveGameTeamDisplay(game.away, gender);
  const homeDisp = liveGameTeamDisplay(game.home, gender);

  const awayLogo = logoUrlFromTeamName(awayDisp.name || game.away.abbreviation);
  const homeLogo = logoUrlFromTeamName(homeDisp.name || game.home.abbreviation);

  const upsetWatch = gender === "M" ? isUpsetWatch(game, homeK, awayK, seedByKaggle) : false;

  const favPct =
    prob != null && awayK && homeK
      ? (awayK === lo ? prob * 100 : (1 - prob) * 100)
      : null;
  const favAbbr =
    prob != null && awayK && homeK
      ? (() => {
          const favK = awayK === lo ? awayK : homeK;
          if (gender === "M" && teamsById.has(favK)) return teamsById.get(favK)!.abbreviation;
          return awayK === lo ? game.away.abbreviation : game.home.abbreviation;
        })()
      : "";

  const borderAccent = final ? "border-l-gray-600" : live ? "border-l-red-500 ring-1 ring-red-500/30" : "border-l-blue-800";

  return (
    <div className={`rounded-xl border border-border border-l-4 ${borderAccent} bg-card p-4 shadow-sm`}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-bold uppercase text-muted-foreground">
        {live ? (
          <span className="flex items-center gap-1 text-red-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            LIVE · {game.statusText ?? "In progress"}
          </span>
        ) : final ? (
          <span className="text-gray-500">FINAL</span>
        ) : (
          <span className="text-blue-400">Scheduled · {game.statusText ?? "—"}</span>
        )}
        {live ? <Badge className="animate-pulse bg-red-600 font-display text-[9px] uppercase">● Live</Badge> : null}
      </div>
      {upsetWatch ? (
        <div className="mt-1 text-xs font-bold text-orange-400">⚠ UPSET WATCH</div>
      ) : null}
      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {awayLogo ? (
              <img
                src={awayLogo}
                alt=""
                className="h-8 w-8 rounded-full"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            ) : null}
            <span
              className={`truncate font-display text-sm font-bold uppercase ${
                final && awayWon ? "font-bold text-white" : final ? "text-gray-500 line-through" : ""
              }`}
            >
              #{awayDisp.seed > 0 ? awayDisp.seed : "?"} {awayDisp.name}
            </span>
          </div>
          <span
            className={`font-mono text-lg font-bold ${final && awayWon ? "font-bold text-white" : final ? "text-gray-500" : ""}`}
          >
            {game.away.score ?? "—"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {homeLogo ? (
              <img
                src={homeLogo}
                alt=""
                className="h-8 w-8 rounded-full"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            ) : null}
            <span
              className={`truncate font-display text-sm font-bold uppercase ${
                final && homeWon ? "font-bold text-white" : final ? "text-gray-500 line-through" : ""
              }`}
            >
              #{homeDisp.seed > 0 ? homeDisp.seed : "?"} {homeDisp.name}
            </span>
          </div>
          <span
            className={`font-mono text-lg font-bold ${final && homeWon ? "font-bold text-white" : final ? "text-gray-500" : ""}`}
          >
            {game.home.score ?? "—"}
          </span>
        </div>
      </div>
      <div className="mt-3 border-t border-border pt-2 text-xs text-muted-foreground">
        {favPct != null ? (
          <span>
            Our model: {favPct.toFixed(1)}% {favAbbr}
          </span>
        ) : gender === "W" ? (
          <span>Women&apos;s Kaggle mapping — predictor optional</span>
        ) : (
          <span>Model odds…</span>
        )}
        {apiW != null ? <span className="ml-2 text-emerald-600">✓ In /api/results</span> : null}
      </div>
      {awayK && homeK ? (
        <button
          type="button"
          className="mt-2 inline-block font-display text-[10px] font-bold uppercase text-primary hover:underline"
          onClick={() => onPredictor(lo, hi)}
        >
          View predictor →
        </button>
      ) : null}
    </div>
  );
}

export default ScoreboardPage;
