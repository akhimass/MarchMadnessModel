import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ExternalLink, Radio } from "lucide-react";

import { InnerPageShell } from "@/components/layout/InnerPageShell";
import { LiveBracketPreview } from "@/components/live/LiveBracketPreview";
import { LiveGameCardWithModel } from "@/components/live/LiveGameCardWithModel";
import { useMarchMadnessCompletedHistory, useTournamentLiveScores } from "@/hooks/useLiveScores";
import {
  groupGamesByTournamentRound,
  sortGamesBySchedule,
  type RoundGroup,
} from "@/lib/tournamentRounds";
import type { LiveGame } from "@/lib/espnApi";
import { ToggleGroup, ToggleGroupItem } from "@ui/toggle-group";
import { ScrollArea } from "@ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@ui/alert";
import { Button } from "@ui/button";

type TabKey = "scores" | "predictions" | "live" | "bracket";

function partitionStates(games: LiveGame[]) {
  const live = games.filter((g) => g.state === "in");
  const upcoming = games.filter((g) => g.state === "pre");
  const completed = games.filter((g) => g.state === "post");
  return { live, upcoming, completed };
}

function RoundBlock({
  group,
  gender,
  completedInScroll,
  newestFirst,
}: {
  group: RoundGroup;
  gender: "M" | "W";
  completedInScroll: boolean;
  /** Completed / history lists: show latest games first */
  newestFirst?: boolean;
}) {
  const ordered = newestFirst
    ? [...sortGamesBySchedule(group.games)].reverse()
    : sortGamesBySchedule(group.games);
  const { live, upcoming, completed } = partitionStates(ordered);

  return (
    <section className="space-y-4">
      <h2 className="border-b border-border pb-2 font-sans text-sm font-semibold tracking-tight text-foreground">
        {group.label}
        <span className="ml-2 font-normal text-muted-foreground">({group.games.length})</span>
      </h2>

      {live.length > 0 ? (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
            </span>
            <h3 className="font-sans text-xs font-semibold uppercase tracking-wide text-foreground">Live</h3>
          </div>
          <div className="space-y-3">
            {live.map((g) => (
              <LiveGameCardWithModel key={g.espnId} game={g} gender={gender} />
            ))}
          </div>
        </div>
      ) : null}

      {upcoming.length > 0 ? (
        <div>
          <h3 className="mb-3 font-sans text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Upcoming
          </h3>
          <div className="space-y-3">
            {upcoming.map((g) => (
              <LiveGameCardWithModel key={g.espnId} game={g} gender={gender} />
            ))}
          </div>
        </div>
      ) : null}

      {completed.length > 0 ? (
        <div>
          <h3 className="mb-3 font-sans text-xs font-semibold uppercase tracking-wide text-muted-foreground">Final</h3>
          {completedInScroll ? (
            <ScrollArea className="max-h-[min(45vh,22rem)] pr-3">
              <div className="space-y-3 pb-4">
                {completed.map((g) => (
                  <LiveGameCardWithModel key={g.espnId} game={g} gender={gender} />
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="space-y-3">
              {completed.map((g) => (
                <LiveGameCardWithModel key={g.espnId} game={g} gender={gender} />
              ))}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

const LiveScoresPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const gender: "M" | "W" = searchParams.get("gender") === "W" ? "W" : "M";
  const tab = (searchParams.get("tab") as TabKey) || "scores";
  const safeTab: TabKey =
    tab === "predictions" || tab === "bracket" || tab === "live" ? tab : "scores";

  const setGender = (g: "M" | "W") => {
    const next = new URLSearchParams(searchParams);
    next.set("gender", g);
    next.set("tab", safeTab);
    setSearchParams(next);
  };

  const setTab = (t: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("gender", gender);
    next.set("tab", t);
    setSearchParams(next);
  };

  const { data: games, isLoading, dataUpdatedAt } = useTournamentLiveScores(gender);
  const {
    data: historyGames,
    isLoading: historyLoading,
    isError: historyError,
  } = useMarchMadnessCompletedHistory(gender);

  const roundGroups = useMemo(() => {
    if (!games?.length) return [];
    return groupGamesByTournamentRound(games);
  }, [games]);

  const todayIds = useMemo(() => new Set((games ?? []).map((g) => g.espnId)), [games]);

  const pastRoundGroups = useMemo(() => {
    if (!historyGames?.length) return [];
    const pastOnly = historyGames.filter((g) => !todayIds.has(g.espnId));
    if (!pastOnly.length) return [];
    return groupGamesByTournamentRound(pastOnly);
  }, [historyGames, todayIds]);

  const liveGamesOnly = useMemo(() => (games ?? []).filter((g) => g.state === "in"), [games]);

  const liveGamesForBracket = useMemo(() => (games ?? []).filter((g) => g.state === "in"), [games]);

  const lastUpdate = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : "";

  const genderToggle = (
    <ToggleGroup
      type="single"
      value={gender}
      variant="outline"
      size="sm"
      onValueChange={(v) => {
        if (v === "M" || v === "W") setGender(v);
      }}
      className="rounded-xl border border-border bg-muted/40 p-1 shadow-sm"
    >
      <ToggleGroupItem
        value="M"
        className="min-w-[5.5rem] rounded-lg px-4 font-sans text-sm font-medium data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
      >
        Men&apos;s
      </ToggleGroupItem>
      <ToggleGroupItem
        value="W"
        className="min-w-[5.5rem] rounded-lg px-4 font-sans text-sm font-medium data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
      >
        Women&apos;s
      </ToggleGroupItem>
    </ToggleGroup>
  );

  return (
    <InnerPageShell
      contextLabel="Live scores"
      contextDescription="March Madness ESPN data · model on every resolvable matchup"
      endSlot={genderToggle}
      crumbs={[{ label: "Live scores" }]}
    >
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-2 font-sans font-medium text-foreground">
            <Radio className="h-4 w-4 text-destructive" aria-hidden />
            March Madness live
          </span>
          {lastUpdate ? <span className="font-sans">Updated {lastUpdate}</span> : null}
        </div>

        <Alert className="border-border bg-muted/40">
          <AlertTitle className="font-sans text-sm font-semibold">What you see here</AlertTitle>
          <AlertDescription className="font-sans text-xs text-muted-foreground">
            The scoreboard only includes <strong className="text-foreground">March Madness</strong> games (2026 field,
            seeds 1–16 on ESPN). The ensemble scores <strong className="text-foreground">every</strong> matchup where
            both teams resolve to model IDs (men: Kaggle IDs; women: API team IDs). Below today&apos;s board,{" "}
            <strong className="text-foreground">earlier tournament finals</strong> load from all known bracket dates so
            you can scroll past results.
          </AlertDescription>
        </Alert>

        <Tabs value={safeTab} onValueChange={setTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 gap-1 font-sans sm:grid-cols-4">
            <TabsTrigger value="scores">Scoreboard</TabsTrigger>
            <TabsTrigger value="predictions">Model</TabsTrigger>
            <TabsTrigger value="live">Live AI</TabsTrigger>
            <TabsTrigger value="bracket">Bracket</TabsTrigger>
          </TabsList>

          <TabsContent value="scores" className="mt-6 space-y-10">
            {isLoading ? (
              <div className="py-12 text-center">
                <p className="font-sans text-sm text-muted-foreground animate-pulse">Loading scoreboard…</p>
              </div>
            ) : null}

            {!isLoading && roundGroups.length > 0 ? (
              <div className="space-y-8">
                {roundGroups.map((group) => (
                  <RoundBlock
                    key={group.key}
                    group={group}
                    gender={gender}
                    completedInScroll={group.key === "other" && group.games.filter((g) => g.state === "post").length > 6}
                  />
                ))}
              </div>
            ) : null}

            {!isLoading && games?.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/20 py-12 text-center">
                <p className="font-sans text-sm font-medium text-muted-foreground">No March Madness games on the board</p>
                <p className="mt-2 font-sans text-xs text-muted-foreground">
                  On game days you&apos;ll see matchups here. If the women&apos;s field list is still loading, try again in
                  a moment.
                </p>
              </div>
            ) : null}

            <section className="space-y-4 border-t border-border pt-8">
              <div>
                <h2 className="font-sans text-base font-semibold text-foreground">Earlier tournament results</h2>
                <p className="mt-1 font-sans text-xs text-muted-foreground">
                  Completed games from all known bracket dates (deduped with today&apos;s board). Newest activity first
                  within each round.
                </p>
              </div>
              {historyLoading ? (
                <p className="font-sans text-sm text-muted-foreground animate-pulse">Loading past scores…</p>
              ) : null}
              {historyError ? (
                <Alert variant="destructive">
                  <AlertTitle className="font-sans text-sm">Couldn&apos;t load history</AlertTitle>
                  <AlertDescription className="font-sans text-xs">Try refreshing the page.</AlertDescription>
                </Alert>
              ) : null}
              {!historyLoading && !historyError && pastRoundGroups.length > 0 ? (
                <div className="space-y-8">
                  {pastRoundGroups.map((group) => (
                    <RoundBlock
                      key={`past-${group.key}`}
                      group={group}
                      gender={gender}
                      completedInScroll={group.games.length > 8}
                      newestFirst
                    />
                  ))}
                </div>
              ) : null}
              {!historyLoading && !historyError && pastRoundGroups.length === 0 ? (
                <p className="font-sans text-sm text-muted-foreground">
                  No earlier finals in the archive yet — they appear as the tournament progresses.
                </p>
              ) : null}
            </section>
          </TabsContent>

          <TabsContent value="predictions" className="mt-6 space-y-4">
            <p className="font-sans text-sm text-muted-foreground">
              Ensemble win probability on <span className="font-medium text-foreground">every</span> March Madness game
              where both teams resolve to IDs. Expand live games on the scoreboard for the full live-adjusted breakdown,
              or open the <span className="font-medium text-foreground">Live AI</span> tab.
            </p>
            {gender === "W" ? (
              <Alert>
                <AlertTitle className="font-sans text-sm font-medium">Women&apos;s</AlertTitle>
                <AlertDescription className="font-sans text-xs">
                  Team IDs come from the women&apos;s field list; names must match closely enough for the resolver.
                </AlertDescription>
              </Alert>
            ) : null}
            <div className="space-y-3">
              {(games ?? []).map((g) => (
                <LiveGameCardWithModel key={`pred-${g.espnId}`} game={g} gender={gender} />
              ))}
            </div>
            {!isLoading && (games?.length ?? 0) === 0 ? (
              <p className="font-sans text-sm text-muted-foreground">No games to score.</p>
            ) : null}
          </TabsContent>

          <TabsContent value="live" className="mt-6 space-y-4">
            <Alert className="border-primary/30 bg-primary/[0.04]">
              <AlertTitle className="font-sans text-sm font-semibold">Live AI dashboard</AlertTitle>
              <AlertDescription className="font-sans text-xs text-muted-foreground">
                Only in-progress March Madness games appear here. Each row loads the full{" "}
                <span className="font-medium text-foreground">/api/matchup</span> breakdown, then re-blends every
                submodel toward the current scoreboard using a time-decay curve (simulation moves fastest; seed
                difference slowest). This is a <span className="font-medium text-foreground">live heuristic</span> layered
                on your pregame models — not a separate fitted in-game model.
              </AlertDescription>
            </Alert>
            {!isLoading && liveGamesOnly.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border py-12 text-center font-sans text-sm text-muted-foreground">
                No live games on the board right now.
              </div>
            ) : null}
            <div className="space-y-6">
              {liveGamesOnly.map((g) => (
                <LiveGameCardWithModel
                  key={`live-ai-${g.espnId}`}
                  game={g}
                  gender={gender}
                  defaultOpenLivePredictor
                />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="bracket" className="mt-6 space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-sans text-sm text-muted-foreground">
                Region grid uses the men&apos;s tournament field. Teams with a live March Madness game are highlighted.
              </p>
              <Button asChild variant="default" size="sm" className="shrink-0 gap-2 font-sans">
                <Link to={`/bracket?stage=R1&gender=M`}>
                  Full bracket picker
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </Button>
            </div>
            {gender === "W" ? (
              <Alert className="border-border">
                <AlertTitle className="font-sans text-sm font-medium">Men&apos;s bracket reference</AlertTitle>
                <AlertDescription className="font-sans text-xs">
                  The grid is the men&apos;s field for visual reference. Your live games are women&apos;s; use{" "}
                  <span className="font-medium text-foreground">Scoreboard</span> for those scores.
                </AlertDescription>
              </Alert>
            ) : null}
            <LiveBracketPreview liveGames={liveGamesForBracket} />
          </TabsContent>
        </Tabs>
      </main>
    </InnerPageShell>
  );
};

export default LiveScoresPage;
